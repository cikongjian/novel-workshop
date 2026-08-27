import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ComicAdapter,
  type ComicPage,
  type ComicPanel,
  type ComicStoryboardPayload,
} from '../adaptation/comic-adapter.js';
import { buildComicPanelAnchorWithDNA } from './comic-character-anchor.js';
import {
  COMIC_PANEL_THROTTLE_MS,
  COMIC_STYLES,
  DEFAULT_COMIC_PANELS_PER_CHAPTER,
} from './comic-config.js';
import { CharacterDNAStore } from './comic-dna-store.js';
import type { CharacterDNA } from './comic-dna-types.js';
import type { ImageGenerationClient } from '../models/image-client.js';
import type { ReferenceImage } from '../models/image-request-options.js';
import type { CharacterProfile, SceneCard } from '../novel/types.js';
import type { ComicRenderedPrompt, ComicScene } from './comic-types.js';
import { getNovelsDir } from '../config/index.js';
import { assertSafeImageUrl } from '../utils/url-safety.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { now } from '../utils/text.js';

const DEFAULT_COMIC_SIZE = '1024x1024';
const DEFAULT_COMIC_QUALITY = 'medium';
const COMIC_PANEL_EXT = '.png';

/** 每次生图批次生成一个 8 位唯一 id，确保文件名永不重复，浏览器缓存不会残留旧图 */
function generateBatchId(): string {
  return crypto.randomBytes(4).toString('hex');
}

function panelFileName(panelIndex: number, batchId: string): string {
  return `panel-${panelIndex}-${batchId}${COMIC_PANEL_EXT}`;
}

export type ComicGenerationInput = {
  novelId: string;
  chapterNumber: number;
  sceneCards: SceneCard[];
  characters: CharacterProfile[];
  /** 输出尺寸，默认 1024x1024 */
  size?: string;
  /** 单章最多渲染多少格（默认 3，高潮精选以控成本） */
  maxPanels?: number;
  /** 进度回调（每格开始/完成/失败） */
  onProgress?: (progress: ComicPanelProgress) => void;
};

export type ComicPanelProgress = {
  panelIndex: number;
  total: number;
  status: 'rendering' | 'done' | 'failed';
  imagePath?: string;
  error?: string;
};

export type ComicPanelResult = {
  panelIndex: number;
  /** 对应的分镜场景 id；用于单格原位重试 */
  sceneId?: string;
  /** embedded=文字直接生成在图片中；overlay=前端叠加气泡/音效 */
  textRenderMode?: 'embedded' | 'overlay';
  /** 漫画页序号；旧数据为空时前端按每 3 格兜底分组 */
  pageIndex?: number;
  /** 页内格序 */
  panelIndexInPage?: number;
  /** 本格叙事职能 */
  panelRole?: string;
  /** 本页移动端组版模板 */
  layoutTemplate?: string;
  /** 与上一格的衔接方式 */
  transitionFromPrevious?: string;
  /** 对话气泡建议位置 */
  bubblePlacement?: string;
  /** 前端叠加的简短音效字 */
  sfx?: string;
  /** 分镜情绪标签 */
  emotion?: string;
  /** 相对 novel 目录的图片路径；失败时为空串 */
  imagePath: string;
  /** 实际下发给模型的 prompt（含角色锚点块） */
  prompt: string;
  /** 本格实际使用的参考图角色 id（已截断+排序） */
  referenceCharacterIds: string[];
  truncated: boolean;
  failed?: string;
  /** 参考图出图失败，已降级为纯文生图（无锁脸，一致性较低） */
  degraded?: boolean;
  /** 旁白/动作描述（前端作为图注） */
  narration?: string;
  /** 角色台词（前端叠加为对话气泡） */
  dialogue?: string;
};

export type ComicManifest = {
  novelId: string;
  chapterNumber: number;
  generatedAt: string;
  model: string;
  size: string;
  /** 相对 novel 目录的漫画产物目录 */
  panelDir: string;
  /** draft=草稿（未发布，定期清理）；published=已发布（保留供书城读者） */
  status: 'draft' | 'published';
  panels: ComicPanelResult[];
};

/**
 * 章节漫画出图编排服务。
 *
 * 职责：SceneCard[] → comic-adapter 分镜 → 逐格注入角色立绘参考图 →
 * imageClient.edit() 出图 → 落盘 png + manifest.json。
 *
 * 角色一致性策略（见 docs/章节漫画开发计划.md §5.4）：立绘参考图锁脸 +
 * 文本锚点锁服饰/发型/画风，双保险。无立绘的角色降级为纯文生图。
 */
export class ComicImageService {
  constructor(
    private readonly imageClient: ImageGenerationClient,
    private readonly comicAdapter: ComicAdapter,
    private readonly novelsDir: string = getNovelsDir(),
    private readonly logger: Logger = createLogger('comic-image-service'),
  ) {}

  async generateChapter(input: ComicGenerationInput): Promise<ComicManifest> {
    const { novelId, chapterNumber, sceneCards, characters } = input;
    const size = input.size?.trim() || DEFAULT_COMIC_SIZE;
    const maxPanels = Math.max(1, input.maxPanels ?? DEFAULT_COMIC_PANELS_PER_CHAPTER);
    const chapterDir = `comics/chapter-${chapterNumber}`;

    // 选情绪强度最高（高潮）的场景卡，让 3 格聚焦同一高潮场景、叙事连贯，
    // 而非取第一个碎场景卡导致画面跳跃
    const climaxCard = pickClimaxSceneCard(sceneCards);
    const selectedCards = climaxCard ? [climaxCard] : sceneCards;

    // 1. comic-adapter 构造分镜（落盘 comic_storyboard.json + comic_prompts.md）
    const storyboard = await this.comicAdapter.generate({
      novelId,
      chapterNumberStart: chapterNumber,
      chapterNumberEnd: chapterNumber,
      outputDirRelative: chapterDir,
      sceneCardsByChapter: { [chapterNumber]: selectedCards },
    });

    // 2. 读回分镜结构（含 referenceCharacterIds）
    const payloadPath = path.join(this.novelsDir, novelId, storyboard.payloadPath);
    const payload = JSON.parse(await fs.readFile(payloadPath, 'utf-8')) as ComicStoryboardPayload;

    // 3. 扁平化 + 高潮精选（只画前 maxPanels 格）
    const flatPanels = payload.pages.flatMap((page: ComicPage) =>
      page.panels.map((panel: ComicPanel) => ({ page: page.page, panel })),
    );
    const selected = flatPanels.slice(0, maxPanels);
    const total = selected.length;

    if (total === 0) {
      throw new Error('本章无可用的漫画分镜（场景卡为空）');
    }

    // 4. 角色查找表
    const characterMap = new Map<string, CharacterProfile>(
      characters.map((c) => [c.id, c]),
    );

    // 5. 逐格出图（串行 + 限速，避免触发图像供应商限流）
    const batchId = generateBatchId();
    const panels: ComicPanelResult[] = [];
    for (let i = 0; i < selected.length; i++) {
      const { panel } = selected[i];
      if (i > 0) await sleep(COMIC_PANEL_THROTTLE_MS);
      const result = await this.renderPanel({
        novelId,
        chapterNumber,
        chapterDir,
        panel,
        size,
        characterMap,
        index: i,
        total,
        batchId,
        onProgress: input.onProgress,
      });
      panels.push(result);
    }

    // 6. 写 manifest
    const manifest: ComicManifest = {
      novelId,
      chapterNumber,
      generatedAt: now(),
      model: this.imageClient.model,
      size,
      panelDir: chapterDir,
      status: 'draft',
      panels,
    };
    const manifestPath = path.join(this.novelsDir, novelId, chapterDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    this.logger.info('章节漫画生成完成', {
      novelId,
      chapterNumber,
      panelCount: panels.length,
      failed: panels.filter((p) => p.failed).length,
    });

    return manifest;
  }

  private async renderPanel(params: {
    novelId: string;
    chapterNumber: number;
    chapterDir: string;
    panel: ComicPanel;
    size: string;
    characterMap: Map<string, CharacterProfile>;
    index: number;
    total: number;
    batchId: string;
    onProgress?: (progress: ComicPanelProgress) => void;
  }): Promise<ComicPanelResult> {
    const { novelId, chapterNumber, chapterDir, panel, size, characterMap, index, total, batchId, onProgress } = params;
    const progressBase = { panelIndex: panel.panelIndex, total };

    // 出场角色 → CharacterProfile（仅取有立绘的作为参考图来源）
    const panelCharacters = panel.referenceCharacterIds
      .map((id) => characterMap.get(id))
      .filter((c): c is CharacterProfile => Boolean(c));

    // 锚点 + 参考图（仅立绘存在的角色参与锁脸）
    const charactersWithPortrait = panelCharacters.filter((c) => Boolean(c.portraitImagePath));
    const dnaMap = await this.loadDNAMap(novelId, charactersWithPortrait);
    const { anchorText, referenceCharacterIds, truncated } = buildComicPanelAnchorWithDNA(charactersWithPortrait, dnaMap);

    // 读立绘 → ReferenceImage[]
    const referenceImages = await this.loadReferenceImages(novelId, referenceCharacterIds, characterMap);
    const prompt = [panel.promptEn, anchorText].filter(Boolean).join('\n\n');

    onProgress?.({ ...progressBase, status: 'rendering' });

    let degraded = false;
    try {
      let generated;
      if (referenceImages.length > 0) {
        try {
          generated = await tryEditWithRetry(
            () => this.imageClient.edit(prompt, { referenceImages, size, quality: DEFAULT_COMIC_QUALITY }),
            { novelId, chapterNumber, panelIndex: panel.panelIndex, logger: this.logger },
          );
        } catch (editErr) {
          // 打印完整诊断（即使降级也记录），便于排查中转对 edits 端点的兼容性问题
          this.logger.warn('参考图 edit 调用失败（已重试）', {
            novelId, chapterNumber, panelIndex: panel.panelIndex,
            ...describeImageError(editErr),
          });
          if (isEditEndpointUnsupported(editErr)) {
            degraded = true;
            // 降级到纯文生图时必须包含完整锚点，否则角色一致性全丢
            generated = await this.imageClient.generate(prompt, { size });
          } else {
            throw editErr;
          }
        }
      } else {
        generated = await this.imageClient.generate(prompt, { size });
      }
      const bytes = await resolveImageBytes(generated);

      const fileName = panelFileName(panel.panelIndex, batchId);
      const imagePath = `${chapterDir}/${fileName}`;
      await fs.writeFile(path.join(this.novelsDir, novelId, imagePath), bytes);

      onProgress?.({ ...progressBase, status: 'done', imagePath });
      return {
        panelIndex: panel.panelIndex,
        imagePath,
        prompt,
        referenceCharacterIds,
        truncated,
        narration: panel.narration,
        dialogue: panel.dialogue,
        ...(degraded ? { degraded: true } : {}),
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.warn('漫画单格出图失败', { novelId, chapterNumber, panelIndex: panel.panelIndex, error });
      onProgress?.({ ...progressBase, status: 'failed', error });
      return { panelIndex: panel.panelIndex, imagePath: '', prompt, referenceCharacterIds, truncated, narration: panel.narration, dialogue: panel.dialogue, failed: error };
    }
  }

  /** 批量读取角色 DNA（有则用 DNA 锚点，无则降级到自由文本） */
  private async loadDNAMap(
    novelId: string,
    characters: CharacterProfile[],
  ): Promise<Map<string, CharacterDNA>> {
    const ids = characters.map((c) => c.id).filter(Boolean);
    if (ids.length === 0) return new Map();
    const store = new CharacterDNAStore(this.novelsDir);
    return store.getBatch(novelId, ids);
  }

  private async loadReferenceImages(
    novelId: string,
    characterIds: string[],
    characterMap: Map<string, CharacterProfile>,
  ): Promise<ReferenceImage[]> {
    const images: ReferenceImage[] = [];
    for (const id of characterIds) {
      const character = characterMap.get(id);
      if (!character?.portraitImagePath) continue;
      try {
        const buffer = await fs.readFile(path.join(this.novelsDir, novelId, character.portraitImagePath));
        images.push({
          buffer,
          mimeType: inferMimeFromPath(character.portraitImagePath),
          filename: path.basename(character.portraitImagePath),
        });
      } catch (err) {
        // 单张立绘读失败不阻断整格，降级为剩余参考图
        this.logger.warn('参考立绘读取失败，跳过', {
          novelId,
          characterId: id,
          path: character.portraitImagePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return images;
  }

  /**
   * 从作者选中的分镜场景出图（generate-selected 流程）。
   * 输入：选中场景 + prompt工程师产出的 finalPrompt + 角色档案。
   * 输出：manifest（draft）。复用 edit/降级/落盘逻辑（与 renderPanel 同策略）。
   */
  async renderFromScenes(input: {
    novelId: string;
    chapterNumber: number;
    scenes: ComicScene[];
    prompts: ComicRenderedPrompt[];
    characters: CharacterProfile[];
    size?: string;
    onProgress?: (progress: ComicPanelProgress) => void;
    /** 漫画风格预设 key（见 COMIC_STYLES），注入所有出图 prompt 保证风格统一 */
    comicStyle?: string;
    /** 每格完成（含失败）后触发，用于发通知中心消息 */
    onPanelComplete?: (panel: ComicPanelResult) => void;
  }): Promise<ComicManifest> {
    const { novelId, chapterNumber, scenes, characters } = input;
    const size = input.size?.trim() || DEFAULT_COMIC_SIZE;
    const chapterDir = `comics/chapter-${chapterNumber}`;

    const characterMap = new Map<string, CharacterProfile>(characters.map((c) => [c.id, c]));
    const characterByName = new Map<string, CharacterProfile>(characters.map((c) => [c.name, c]));
    const promptMap = new Map(input.prompts.map((p) => [p.sceneId, p.finalPrompt]));

    const manifestPath = path.join(this.novelsDir, novelId, chapterDir, 'manifest.json');

    // 读已有 manifest，保留之前生成的 panel（支持分多次生成，慢慢把一章做齐全，不覆盖）
    const loadExisting = async (): Promise<ComicPanelResult[]> => {
      try {
        const existing = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as ComicManifest;
        return existing.panels ?? [];
      } catch {
        return [];
      }
    };

    let existingPanels = await loadExisting();

    const manifest: ComicManifest = {
      novelId,
      chapterNumber,
      generatedAt: now(),
      model: this.imageClient.model,
      size,
      panelDir: chapterDir,
      status: 'draft',
      panels: [...existingPanels],
    };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    const startIndex = existingPanels.length;
    const batchId = generateBatchId();
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (i > 0) await sleep(COMIC_PANEL_THROTTLE_MS);
      const result = await this.renderSceneCell({
        novelId,
        chapterNumber,
        chapterDir,
        scene,
        size,
        comicStyle: input.comicStyle,
        finalPrompt: promptMap.get(scene.sceneId) ?? scene.promptDraft,
        characterByName,
        characterMap,
        index: startIndex + i,
        total: startIndex + scenes.length,
        batchId,
        onProgress: input.onProgress,
      });
      // 写盘前重读 manifest，防止覆盖用户在生成期间删除的 panel（并发安全）
      const diskPanels = await loadExisting();
      diskPanels.push(result);
      manifest.panels = diskPanels;
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      input.onPanelComplete?.(result);
    }

    this.logger.info('章节漫画（场景选择）生成完成', {
      novelId,
      chapterNumber,
      panelCount: manifest.panels.length,
      failed: manifest.panels.filter((p) => p.failed).length,
    });
    return manifest;
  }

  async renderSceneReplacement(input: {
    novelId: string;
    chapterNumber: number;
    scene: ComicScene;
    finalPrompt: string;
    characters: CharacterProfile[];
    panelIndex: number;
    total: number;
    size?: string;
    comicStyle?: string;
  }): Promise<ComicPanelResult> {
    const { novelId, chapterNumber, scene, finalPrompt, characters, panelIndex, total } = input;
    const chapterDir = `comics/chapter-${chapterNumber}`;
    const characterMap = new Map<string, CharacterProfile>(characters.map((c) => [c.id, c]));
    const characterByName = new Map<string, CharacterProfile>(characters.map((c) => [c.name, c]));
    return this.renderSceneCell({
      novelId,
      chapterNumber,
      chapterDir,
      scene,
      size: input.size?.trim() || DEFAULT_COMIC_SIZE,
      comicStyle: input.comicStyle,
      finalPrompt,
      characterByName,
      characterMap,
      index: panelIndex - 1,
      total,
      batchId: generateBatchId(),
    });
  }

  private async renderSceneCell(params: {
    novelId: string;
    chapterNumber: number;
    chapterDir: string;
    scene: ComicScene;
    size: string;
    comicStyle?: string;
    finalPrompt: string;
    characterByName: Map<string, CharacterProfile>;
    characterMap: Map<string, CharacterProfile>;
    index: number;
    total: number;
    batchId: string;
    onProgress?: (progress: ComicPanelProgress) => void;
  }): Promise<ComicPanelResult> {
    const { novelId, chapterNumber, chapterDir, scene, size, finalPrompt, characterByName, characterMap, index, total, batchId, onProgress } = params;
    const panelIndex = index + 1;
    const progressBase = { panelIndex, total };
    const panelMeta = buildScenePanelMeta(scene, panelIndex);

    // 场景里的角色名 → CharacterProfile（仅取有立绘的作为参考图来源）
    const panelCharacters = scene.characters
      .map((c) => characterByName.get(c.name))
      .filter((c): c is CharacterProfile => Boolean(c));
    const charactersWithPortrait = panelCharacters.filter((c) => Boolean(c.portraitImagePath));
    const dnaMap = await this.loadDNAMap(novelId, charactersWithPortrait);
    const { anchorText, referenceCharacterIds, truncated } = buildComicPanelAnchorWithDNA(charactersWithPortrait, dnaMap);
    const referenceImages = await this.loadReferenceImages(novelId, referenceCharacterIds, characterMap);
    const stylePrompt = params.comicStyle ? (COMIC_STYLES[params.comicStyle]?.prompt ?? '') : '';
    const textRenderMode = supportsEmbeddedComicText(this.imageClient.model) ? 'embedded' : 'overlay';
    const textPrompt = buildComicTextPrompt(scene, textRenderMode);
    const prompt = [stylePrompt, finalPrompt, textPrompt, anchorText].filter(Boolean).join('\n\n');

    onProgress?.({ ...progressBase, status: 'rendering' });

    let degraded = false;
    try {
      let generated;
      if (referenceImages.length > 0) {
        try {
          generated = await tryEditWithRetry(
            () => this.imageClient.edit(prompt, { referenceImages, size, quality: DEFAULT_COMIC_QUALITY }),
            { novelId, chapterNumber, panelIndex, logger: this.logger },
          );
        } catch (editErr) {
          this.logger.warn('参考图 edit 调用失败（已重试）', {
            novelId,
            chapterNumber,
            panelIndex,
            ...describeImageError(editErr),
          });
          if (isEditEndpointUnsupported(editErr)) {
            degraded = true;
            // 降级到纯文生图时必须包含完整锚点（stylePrompt + finalPrompt + anchorText），否则角色一致性全丢
            generated = await this.imageClient.generate(prompt, { size });
          } else {
            throw editErr;
          }
        }
      } else {
        generated = await this.imageClient.generate(prompt, { size });
      }
      const bytes = await resolveImageBytes(generated);
      const fileName = panelFileName(panelIndex, batchId);
      const imagePath = `${chapterDir}/${fileName}`;
      await fs.writeFile(path.join(this.novelsDir, novelId, imagePath), bytes);

      onProgress?.({ ...progressBase, status: 'done', imagePath });
      return {
        panelIndex,
        sceneId: scene.sceneId,
        textRenderMode,
        ...panelMeta,
        emotion: scene.emotion,
        imagePath,
        prompt,
        referenceCharacterIds,
        truncated,
        narration: scene.narration,
        dialogue: scene.dialogue,
        ...(degraded ? { degraded: true } : {}),
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.warn('漫画单格出图失败', { novelId, chapterNumber, panelIndex, error });
      onProgress?.({ ...progressBase, status: 'failed', error });
      return {
        panelIndex,
        sceneId: scene.sceneId,
        textRenderMode,
        ...panelMeta,
        emotion: scene.emotion,
        imagePath: '',
        prompt,
        referenceCharacterIds,
        truncated,
        narration: scene.narration,
        dialogue: scene.dialogue,
        failed: error,
      };
    }
  }
}

/**
 * 对 edit 调用做最多 2 次重试（间隔 15s），应对上游代理 nginx 504 超时。
 * 504/502/timeout 可重试；其他错误直接抛。
 */
async function tryEditWithRetry<T>(
  fn: () => Promise<T>,
  ctx: { novelId: string; chapterNumber: number; panelIndex: number; logger: Logger },
): Promise<T> {
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 15_000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = Number((err as { status?: unknown })?.status ?? 0);
      const isRetryable = status === 504 || status === 502 || (err as { code?: string })?.code === 'ECONNABORTED';
      if (attempt < MAX_RETRIES && isRetryable) {
        ctx.logger.warn('edit 调用可重试错误，等待后重试', {
          ...ctx, attempt: attempt + 1, status, delayMs: RETRY_DELAY_MS,
        });
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * 判断 edit() 失败是否属于「edits 端点不被供应商支持」。
 * 常见表现：404/405，或错误信息含 not found / unsupported / endpoint 等。
 * 命中时降级为纯文生图（generate）。
 *
 * 注意：401 可能是端点不支持（部分中转对未知路径返回 401），也可能是
 * API Key 过期/鉴权失败。通过检查响应体中的 auth 关键词来区分：
 * - 含 "登录"/"login"/"token"/"auth"/"key" → 鉴权失败，重新抛出
 * - 无特定关键词 → 视为端点不支持
 */
function isEditEndpointUnsupported(err: unknown): boolean {
  const e = err as { status?: unknown; statusCode?: unknown; message?: string; error?: string; supplierBody?: string };
  const status = Number(e?.status ?? e?.statusCode);
  // 404/405 → 明确不支持
  if (status === 404 || status === 405) return true;
  // 401 需区分：鉴权失败 vs 端点不支持
  if (status === 401) {
    const body = String(e?.error ?? e?.supplierBody ?? '').toLowerCase();
    // 鉴权相关 → 不是端点问题，重新抛出让用户修复
    if (/登录|login|token|auth|key|expired|过期|certificate/i.test(body)) return false;
    return true;
  }
  const msg = String(e?.message ?? e?.error ?? '').toLowerCase();
  return /not found|unsupported|does not support|endpoint|unknown path|no such route|model does not exist/i.test(msg);
}

/** 提取图像 API 错误的诊断信息（status/message/供应商 body），用于排查 edit 失败的兼容性原因 */
function describeImageError(err: unknown): Record<string, unknown> {
  const e = err as Record<string, unknown> & {
    response?: { status?: unknown; data?: unknown };
    error?: Record<string, unknown>;
  };
  const body = e.error ?? e.response?.data;
  return {
    status: e.status ?? e.statusCode ?? e.response?.status,
    message: err instanceof Error ? err.message : String(err),
    code: e.code ?? e.error?.code,
    supplierBody: typeof body === 'string' ? body.slice(0, 800) : body,
  };
}

/** 把生成结果（b64 或 url）解析为字节；url 分支走 SSRF 防护 */
async function resolveImageBytes(result: {
  b64Data?: string;
  imageUrl?: string;
}): Promise<Buffer> {
  if (result.b64Data) {
    return Buffer.from(result.b64Data, 'base64');
  }
  if (!result.imageUrl) {
    throw new Error('图像生成失败：未返回图像内容');
  }
  assertSafeImageUrl(result.imageUrl);
  const response = await fetch(result.imageUrl);
  if (!response.ok) {
    throw new Error(`下载生成图像失败: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function inferMimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'image/png';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildScenePanelMeta(scene: ComicScene, panelIndex: number): Pick<
  ComicPanelResult,
  'pageIndex' | 'panelIndexInPage' | 'panelRole' | 'layoutTemplate' | 'transitionFromPrevious' | 'bubblePlacement' | 'sfx'
> {
  const pageIndex = scene.pageIndex && scene.pageIndex > 0 ? scene.pageIndex : Math.ceil(panelIndex / 3);
  const panelIndexInPage = scene.panelIndexInPage && scene.panelIndexInPage > 0
    ? scene.panelIndexInPage
    : ((panelIndex - 1) % 3) + 1;
  return {
    pageIndex,
    panelIndexInPage,
    panelRole: scene.panelRole ?? inferPanelRole(pageIndex, panelIndexInPage),
    layoutTemplate: scene.layoutTemplate ?? (pageIndex === 1 ? 'hero-plus-2' : 'mobile-3'),
    transitionFromPrevious: scene.transitionFromPrevious ?? (panelIndex === 1 ? 'cut' : 'reaction'),
    bubblePlacement: scene.bubblePlacement ?? inferBubblePlacement(panelIndexInPage),
    sfx: scene.sfx ?? '',
  };
}

function inferPanelRole(pageIndex: number, panelIndexInPage: number): string {
  if (pageIndex === 1 && panelIndexInPage === 1) return 'establish';
  if (panelIndexInPage === 1) return 'action';
  if (panelIndexInPage === 2) return 'reaction';
  return pageIndex >= 2 ? 'cliffhanger' : 'reveal';
}

function inferBubblePlacement(panelIndexInPage: number): string {
  if (panelIndexInPage === 1) return 'bottom-right';
  if (panelIndexInPage === 2) return 'top-left';
  return 'bottom-left';
}

function supportsEmbeddedComicText(model: string): boolean {
  return model.trim().toLowerCase().includes('gpt-image-2');
}

function buildComicTextPrompt(scene: ComicScene, mode: 'embedded' | 'overlay'): string {
  const dialogue = normalizeComicText(scene.dialogue, 28);
  const sfx = normalizeComicText(scene.sfx ?? '', 6);
  if (mode === 'overlay') {
    return [
      'TEXT POLICY: Do not render any text inside the image.',
      'No captions, no speech bubbles, no sound effect letters, no watermark, no logo.',
      scene.bubblePlacement
        ? `Leave a clean non-critical area near ${scene.bubblePlacement.replace('-', ' ')} for UI overlay text.`
        : '',
    ].filter(Boolean).join(' ');
  }

  const parts = [
    'MANGA TEXT POLICY: render comic lettering directly inside the artwork.',
    'Use clean, legible Simplified Chinese characters only for the specified dialogue and sound effect.',
    'Do not add any extra text, captions, title, page number, logo, signature, or watermark.',
  ];
  if (dialogue) {
    parts.push(`Place one speech bubble near ${formatBubblePlacement(scene.bubblePlacement)} with exactly this text: "${dialogue}".`);
  }
  if (sfx) {
    parts.push(`Add one stylized comic sound effect text with exactly these characters: "${sfx}".`);
  }
  if (!dialogue && !sfx) {
    parts.push('Do not add speech bubbles or sound effect text unless explicitly specified.');
  }
  return parts.join(' ');
}

function normalizeComicText(value: string | undefined, maxLength: number): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function formatBubblePlacement(placement: string | undefined): string {
  return placement ? placement.replace('-', ' ') : 'the cleanest open area';
}

/** 场景卡的平均情绪强度（0-10），用于挑选本章高潮场景 */
function avgSceneEmotion(card: SceneCard): number {
  if (card.emotionCurve.length === 0) return 5;
  const total = card.emotionCurve.reduce((sum, beat) => sum + beat.intensity, 0);
  return total / card.emotionCurve.length;
}

/** 挑选情绪强度最高的场景卡作为本章高潮（多张同强度时取靠后的，通常冲突更激烈） */
function pickClimaxSceneCard(cards: SceneCard[]): SceneCard | undefined {
  if (cards.length <= 1) return cards[0];
  return [...cards].sort((a, b) => avgSceneEmotion(a) - avgSceneEmotion(b))[0];
}

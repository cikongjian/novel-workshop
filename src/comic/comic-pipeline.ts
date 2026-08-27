import fs from 'node:fs/promises';
import path from 'node:path';
import type { ModelClient } from '../models/types.js';
import type { AgentContext } from '../agents/types.js';
import { ComicBeatExtractorAgent } from '../agents/comic-beat-extractor.js';
import { ComicStoryboardDesignerAgent } from '../agents/comic-storyboard-designer.js';
import { ComicPromptEngineerAgent } from '../agents/comic-prompt-engineer.js';
import type { NovelManager } from '../novel/novel-manager.js';
import { getNovelsDir } from '../config/index.js';
import { now } from '../utils/text.js';
import { createLogger, type Logger } from '../utils/logger.js';
import type { ComicBeat, ComicRenderedPrompt, ComicScene, ComicSceneList } from './comic-types.js';

/**
 * 漫画生成管线（3 Agent 串行）。
 *
 * designScenes：跑①剧情挖掘 → ②分镜设计，产出场景列表（落盘 scene-list.json）。
 * 作者在场景列表上勾选后，由路由层调③prompt 工程师 + comic-image-service 出图。
 *
 * 详见 docs/漫画生成管线设计.md。
 */
export class ComicPipeline {
  constructor(
    private readonly beatExtractor: ComicBeatExtractorAgent,
    private readonly storyboardDesigner: ComicStoryboardDesignerAgent,
    private readonly promptEngineer: ComicPromptEngineerAgent,
    private readonly novelManager: NovelManager,
    private readonly novelsDir: string = getNovelsDir(),
    private readonly logger: Logger = createLogger('comic-pipeline'),
  ) {}

  /** 跑①②，产出场景列表并落盘 scene-list.json */
  async designScenes(
    novelId: string,
    chapterNumber: number,
    model: ModelClient,
    mode: 'replace' | 'append' = 'replace',
  ): Promise<ComicSceneList> {
    const novel = await this.novelManager.getNovel(novelId);
    const chapter = await this.novelManager.getChapter(novelId, chapterNumber);
    if (!chapter?.content?.trim()) {
      throw new Error('章节内容为空，无法设计漫画场景');
    }
    const characters = await this.novelManager.getCharacters(novelId);

    const baseContext = {
      novelId,
      genre: novel.genre ?? '',
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis ?? '',
      chapterNumber,
    };

    // ① 剧情挖掘
    this.logger.info('漫画剧情挖掘开始', { novelId, chapterNumber });
    const beatContext: AgentContext = {
      ...baseContext,
      inputText: chapter.content,
      characters: characters.map((c) => ({ name: c.name, role: c.role ?? '角色' })),
    };
    const beatOutput = await this.beatExtractor.execute(beatContext, model);
    let beats: ComicBeat[];
    try {
      beats = parseAgentJsonArray<ComicBeat>(beatOutput.content);
    } catch (err) {
      this.logger.error('剧情挖掘师输出解析失败', {
        novelId,
        chapterNumber,
        rawLength: beatOutput.content.length,
        rawPrefix: beatOutput.content.slice(0, 800),
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error(`剧情挖掘师输出不是合法 JSON。原始输出（前500字）：${beatOutput.content.slice(0, 500)}`);
    }
    this.logger.info('漫画剧情挖掘完成', { novelId, chapterNumber, beatCount: beats.length });

    // ② 分镜设计（处理连续 6 个剧情节拍，形成 2 页 × 3 格；不足时按实际节拍生成）
    this.logger.info('漫画分镜设计开始', { novelId, chapterNumber });
    const topBeats = beats.slice(0, 6);
    const characterContext = characters
      .map((c) => `${c.name}（${c.role ?? ''}）${c.appearance ? '：' + c.appearance : ''}`)
      .join('\n');
    const storyboardContext: AgentContext = {
      ...baseContext,
      inputText: JSON.stringify(topBeats, null, 2),
      characterContext,
    };
    const sceneOutput = await this.storyboardDesigner.execute(storyboardContext, model);
    let scenes: ComicScene[];
    try {
      scenes = parseAgentJsonArray<ComicScene>(sceneOutput.content);
    } catch (err) {
      this.logger.error('漫画分镜师输出解析失败', {
        novelId,
        chapterNumber,
        rawLength: sceneOutput.content.length,
        rawPrefix: sceneOutput.content.slice(0, 800),
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error(`漫画分镜师输出不是合法 JSON。原始输出（前500字）：${sceneOutput.content.slice(0, 500)}`);
    }
    scenes = normalizeStoryboardScenes(scenes);
    this.logger.info('漫画分镜设计完成', { novelId, chapterNumber, sceneCount: scenes.length });

    // 追加模式：合并已有场景，并重新编号新 sceneId 避免冲突
    let finalBeats = beats;
    let finalScenes = scenes;
    if (mode === 'append') {
      const existingPath = path.join(this.novelsDir, novelId, `comics/chapter-${chapterNumber}`, 'scene-list.json');
      try {
        const existing = JSON.parse(await fs.readFile(existingPath, 'utf-8')) as ComicSceneList;
        const offset = existing.scenes.length;
        scenes.forEach((s, i) => { s.sceneId = `s${offset + i + 1}`; });
        finalBeats = [...existing.beats, ...beats];
        finalScenes = [...existing.scenes, ...scenes];
        this.logger.info('追加候选场景', { novelId, chapterNumber, existing: existing.scenes.length, appended: scenes.length });
      } catch (err) {
        this.logger.warn('追加模式读取已有场景列表失败，改为覆盖', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    finalScenes = normalizeStoryboardScenes(finalScenes);

    const sceneList: ComicSceneList = {
      novelId,
      chapterNumber,
      generatedAt: now(),
      beats: finalBeats,
      scenes: finalScenes,
    };

    const chapterDir = path.join(this.novelsDir, novelId, `comics/chapter-${chapterNumber}`);
    await fs.mkdir(chapterDir, { recursive: true });
    await fs.writeFile(path.join(chapterDir, 'scene-list.json'), JSON.stringify(sceneList, null, 2), 'utf-8');

    return sceneList;
  }

  /** 跑③，为作者选中的场景产出最终出图 prompt（不含角色锚点，锚点由出图时注入） */
  async generatePrompts(
    scenes: ComicScene[],
    model: ModelClient,
    characterContext?: string,
  ): Promise<ComicRenderedPrompt[]> {
    if (scenes.length === 0) return [];
    this.logger.info('漫画 prompt 工程开始', { sceneCount: scenes.length });
    const context: AgentContext = {
      novelId: '',
      genre: '',
      novelTitle: '',
      novelSynopsis: '',
      inputText: JSON.stringify(scenes, null, 2),
      characterContext: characterContext ?? '',
    };
    const output = await this.promptEngineer.execute(context, model);
    const prompts = parseAgentJsonArray<ComicRenderedPrompt>(output.content);
    this.logger.info('漫画 prompt 工程完成', { promptCount: prompts.length });
    return prompts;
  }
}

/** 解析 Agent 输出的 JSON 数组（容忍 markdown 包裹、前导文字、DeepSeek 常见尾逗号/注释/截断） */
function parseAgentJsonArray<T>(content: string): T[] {
  const cleaned = extractJsonBlock(content);
  const candidates = [cleaned, repairJson(cleaned)];
  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed as T[];
      lastErr = new Error('输出不是 JSON 数组');
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`JSON 解析失败（已尝试容错）：${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

function extractJsonBlock(content: string): string {
  // 去 markdown 代码块（```json ... ``` 或 ``` ... ```）
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // 找第一个 [ 到最后一个 ]（容忍前导寒暄文字）
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start >= 0 && end > start) return content.slice(start, end + 1).trim();
  // 截断兜底：有 [ 但没找到 ]（输出被 maxTokens 截断），取 [ 之后交给 repairJson 尝试补全
  if (start >= 0) return content.slice(start).trim();
  return content.trim();
}

/** 容错修复非严格 JSON（DeepSeek 等）：去注释、尾随逗号、补全截断的括号 */
function repairJson(json: string): string {
  let repaired = json;
  repaired = repaired.replace(/\/\*[\s\S]*?\*\//g, ''); // 多行注释
  repaired = repaired.replace(/(^|[^:])\/\/[^\n\r]*/g, '$1'); // 单行注释（避开 http://）
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1'); // 尾随逗号

  // 统计未闭合的括号（在字符串外）
  let openBrackets = 0;
  let openBraces = 0;
  let inString = false;
  let escape = false;
  for (const ch of repaired) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '[') openBrackets += 1;
    else if (ch === ']') openBrackets -= 1;
    else if (ch === '{') openBraces += 1;
    else if (ch === '}') openBraces -= 1;
  }
  if (openBrackets > 0 || openBraces > 0) {
    // 截断到最后一个完整元素，去掉半截，再补全括号
    const lastComplete = Math.max(repaired.lastIndexOf('}'), repaired.lastIndexOf(']'));
    if (lastComplete > 0) {
      repaired = repaired.slice(0, lastComplete + 1).replace(/,(\s*)$/, '$1');
    }
    repaired += '}'.repeat(Math.max(0, openBraces)) + ']'.repeat(Math.max(0, openBrackets));
  }
  return repaired.trim();
}

function normalizeStoryboardScenes(scenes: ComicScene[]): ComicScene[] {
  return scenes.map((scene, index) => {
    const ordinal = index + 1;
    const pageIndex = scene.pageIndex && scene.pageIndex > 0 ? scene.pageIndex : Math.ceil(ordinal / 3);
    const panelIndexInPage = scene.panelIndexInPage && scene.panelIndexInPage > 0
      ? scene.panelIndexInPage
      : ((ordinal - 1) % 3) + 1;
    return {
      ...scene,
      sceneId: scene.sceneId || `s${ordinal}`,
      pageIndex,
      panelIndexInPage,
      panelRole: scene.panelRole ?? inferPanelRole(pageIndex, panelIndexInPage),
      layoutTemplate: scene.layoutTemplate ?? inferLayoutTemplate(pageIndex),
      transitionFromPrevious: scene.transitionFromPrevious ?? (ordinal === 1 ? 'cut' : 'reaction'),
      bubblePlacement: scene.bubblePlacement ?? inferBubblePlacement(panelIndexInPage),
      sfx: scene.sfx ?? '',
    };
  });
}

function inferPanelRole(pageIndex: number, panelIndexInPage: number): ComicScene['panelRole'] {
  if (pageIndex === 1 && panelIndexInPage === 1) return 'establish';
  if (panelIndexInPage === 1) return 'action';
  if (panelIndexInPage === 2) return 'reaction';
  return pageIndex >= 2 ? 'cliffhanger' : 'reveal';
}

function inferLayoutTemplate(pageIndex: number): ComicScene['layoutTemplate'] {
  return pageIndex === 1 ? 'hero-plus-2' : 'mobile-3';
}

function inferBubblePlacement(panelIndexInPage: number): ComicScene['bubblePlacement'] {
  if (panelIndexInPage === 1) return 'bottom-right';
  if (panelIndexInPage === 2) return 'top-left';
  return 'bottom-left';
}

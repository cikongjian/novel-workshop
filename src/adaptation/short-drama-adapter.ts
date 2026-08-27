import fs from 'node:fs/promises';
import path from 'node:path';
import type { CharacterProfile, SceneCard } from '../novel/types.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { now } from '../utils/text.js';
import { getNovelsDir } from '../config/index.js';
import { resolveNovelStorageDir } from '../novel/data-root.js';
import { resolvePathWithin } from '../utils/path-safety.js';
import {
  buildDefaultComplianceMetadata,
  type AdaptationComplianceMetadata,
} from './compliance-metadata.js';

export type ShortDramaAdapterParams = {
  novelId: string;
  chapterNumberStart: number;
  chapterNumberEnd: number;
  outputDirRelative: string;
  sceneCardsByChapter: Record<number, SceneCard[]>;
  characterProfiles?: Pick<
    CharacterProfile,
    'id' | 'name' | 'aliases' | 'appearance' | 'personality' | 'speechStyle'
  >[];
};

type DramaScene = {
  sceneNo: number;
  chapterNumber: number;
  sceneCardId: string;
  title: string;
  durationSec: number;
  hook3s: string;
  conflict15s: string;
  twist45s: string;
  cta: string;
  cast: string[];
  location: string;
  props: string[];
  cameraPlan: string[];
  dialogueLines: string[];
};

type MovieShotPrompt = {
  shotId: string;
  chapterNumber: number;
  sceneNo: number;
  title: string;
  durationSec: number;
  camera: string;
  movement: string;
  composition: string;
  mood: string;
  dialogue: string;
  visualPromptZh: string;
  visualPromptEn: string;
};

type ChapterStoryboard = {
  chapterNumber: number;
  chapterTitle: string;
  shotPrompts: MovieShotPrompt[];
};

type ChapterCharacterRef = {
  chapterNumber: number;
  names: string[];
};

type CharacterPromptView = {
  view: 'front' | 'left-45' | 'right-45' | 'back' | 'expression-closeup';
  promptZh: string;
  promptEn: string;
};

type CostumeVariantPrompt = {
  code: 'default' | 'battle' | 'casual' | 'ceremony';
  label: string;
  promptZh: string;
  promptEn: string;
};

type CharacterPromptPack = {
  characterId: string;
  name: string;
  styleAnchor: string;
  styleSeed: number;
  negativePrompt: string;
  costumeVariants: CostumeVariantPrompt[];
  multiViews: CharacterPromptView[];
};

type ShortDramaPayload = {
  novelId: string;
  mode: 'short-drama';
  chapterNumberStart: number;
  chapterNumberEnd: number;
  generatedAt: string;
  guidePath: string;
  storyboardPromptPath: string;
  characterPromptPath: string;
  compliance: AdaptationComplianceMetadata;
  scenes: DramaScene[];
  chapterStoryboards: ChapterStoryboard[];
  chapterCharacterRefs: ChapterCharacterRef[];
  characterPrompts: CharacterPromptPack[];
  warnings: string[];
};

export type ShortDramaAdapterResult = {
  payloadPath: string;
  guidePath: string;
  storyboardPromptPath: string;
  characterPromptPath: string;
  sceneCount: number;
  chapterCount: number;
  characterPromptCount: number;
  warnings: string[];
};

export class ShortDramaAdapter {
  private readonly novelsDir: string;
  private readonly logger: Logger;

  constructor(
    novelsDir: string = getNovelsDir(),
    logger: Logger = createLogger('short-drama-adapter'),
  ) {
    this.novelsDir = novelsDir;
    this.logger = logger;
  }

  async generate(params: ShortDramaAdapterParams): Promise<ShortDramaAdapterResult> {
    const novelDir = resolveNovelStorageDir(this.novelsDir, params.novelId);
    const outputDirAbsolute = resolvePathWithin(novelDir, params.outputDirRelative);
    await fs.mkdir(outputDirAbsolute, { recursive: true });

    const scenes: DramaScene[] = [];
    const warnings: string[] = [];
    let sceneNo = 1;

    for (let chapter = params.chapterNumberStart; chapter <= params.chapterNumberEnd; chapter++) {
      const cards = params.sceneCardsByChapter[chapter] ?? [];
      if (cards.length === 0) {
        warnings.push(`第${chapter}章缺少场景卡，已跳过短剧脚本生成`);
        continue;
      }

      for (const card of cards) {
        scenes.push(buildDramaScene(sceneNo++, chapter, card));
      }
    }

    if (scenes.length === 0) {
      throw new Error('短剧改编失败：无可用场景卡');
    }

    const chapterStoryboards = buildChapterStoryboards(scenes);
    const chapterCharacterRefs = buildChapterCharacterRefs(scenes);
    const characterPrompts = buildCharacterPromptPacks(
      scenes,
      params.characterProfiles ?? [],
      warnings,
    );

    const generatedAt = now();
    const guidePathRelative = toPosix(path.join(params.outputDirRelative, 'shooting_guide.md'));
    const storyboardPromptPathRelative = toPosix(
      path.join(params.outputDirRelative, 'movie_storyboard_prompts.md'),
    );
    const characterPromptPathRelative = toPosix(
      path.join(params.outputDirRelative, 'character_multiview_prompts.md'),
    );
    const payload: ShortDramaPayload = {
      novelId: params.novelId,
      mode: 'short-drama',
      chapterNumberStart: params.chapterNumberStart,
      chapterNumberEnd: params.chapterNumberEnd,
      generatedAt,
      guidePath: guidePathRelative,
      storyboardPromptPath: storyboardPromptPathRelative,
      characterPromptPath: characterPromptPathRelative,
      compliance: buildDefaultComplianceMetadata({
        novelId: params.novelId,
        mode: 'short-drama',
        generatedAt,
      }),
      scenes,
      chapterStoryboards,
      chapterCharacterRefs,
      characterPrompts,
      warnings,
    };

    const payloadPathRelative = toPosix(path.join(params.outputDirRelative, 'short_drama_script.json'));
    const payloadPathAbsolute = path.join(outputDirAbsolute, 'short_drama_script.json');
    const guidePathAbsolute = path.join(outputDirAbsolute, 'shooting_guide.md');
    const storyboardPromptPathAbsolute = path.join(outputDirAbsolute, 'movie_storyboard_prompts.md');
    const characterPromptPathAbsolute = path.join(outputDirAbsolute, 'character_multiview_prompts.md');

    await fs.writeFile(payloadPathAbsolute, JSON.stringify(payload, null, 2), 'utf-8');
    await fs.writeFile(guidePathAbsolute, buildShootingGuide(payload), 'utf-8');
    await fs.writeFile(
      storyboardPromptPathAbsolute,
      buildMovieStoryboardPromptMarkdown(payload.chapterStoryboards),
      'utf-8',
    );
    await fs.writeFile(
      characterPromptPathAbsolute,
      buildCharacterPromptMarkdown(payload.characterPrompts),
      'utf-8',
    );

    this.logger.info('短剧脚本产物已生成', {
      novelId: params.novelId,
      sceneCount: scenes.length,
      chapterCount: chapterStoryboards.length,
      characterPromptCount: characterPrompts.length,
      payloadPath: payloadPathRelative,
    });

    return {
      payloadPath: payloadPathRelative,
      guidePath: guidePathRelative,
      storyboardPromptPath: storyboardPromptPathRelative,
      characterPromptPath: characterPromptPathRelative,
      sceneCount: scenes.length,
      chapterCount: chapterStoryboards.length,
      characterPromptCount: characterPrompts.length,
      warnings,
    };
  }
}

function buildDramaScene(sceneNo: number, chapterNumber: number, card: SceneCard): DramaScene {
  const cast = (card.characters ?? []).slice(0, 3).map((c) => c.name);
  const primaryCast = cast.length > 0 ? cast : ['主角'];
  const conflictText = normalizeLine(card.conflict || card.rawExcerpt);
  const turningText = normalizeLine(card.turningPoint || card.outcome || card.rawExcerpt);
  const outcomeText = normalizeLine(card.outcome || card.rawExcerpt);

  const durationSec = 60;
  const hook3s = truncateTo24(`${primaryCast[0]}当场愣住：${conflictText}`);
  const conflict15s = truncateTo24(`矛盾升级：${conflictText}`);
  const twist45s = truncateTo24(`反转抛出：${turningText}`);
  const cta = truncateTo24(`下一场更危险，马上追更`);

  const dialogueLines = [
    truncateTo24(`${primaryCast[0]}：${conflictText}`),
    truncateTo24(`${primaryCast[Math.min(1, primaryCast.length - 1)]}：${turningText}`),
    truncateTo24(`${primaryCast[0]}：${outcomeText}`),
  ];

  return {
    sceneNo,
    chapterNumber,
    sceneCardId: card.id,
    title: card.title,
    durationSec,
    hook3s,
    conflict15s,
    twist45s,
    cta,
    cast: primaryCast,
    location: card.location || '未命名场景',
    props: ['手机', '文件', '门禁卡'],
    cameraPlan: [
      '开场特写（3秒）',
      '双人中景对峙（15秒）',
      '反打镜头+推近（45秒）',
    ],
    dialogueLines,
  };
}

function buildShootingGuide(payload: ShortDramaPayload): string {
  const lines: string[] = [];
  lines.push('# Shooting Guide');
  lines.push('');
  lines.push(`- Novel: ${payload.novelId}`);
  lines.push(`- Range: ${payload.chapterNumberStart}-${payload.chapterNumberEnd}`);
  lines.push(`- Generated At: ${payload.generatedAt}`);
  lines.push('');

  for (const scene of payload.scenes) {
    lines.push(`## Scene ${scene.sceneNo} - 第${scene.chapterNumber}章 / ${scene.title}`);
    lines.push(`- Duration: ${scene.durationSec}s`);
    lines.push(`- Cast: ${scene.cast.join('、')}`);
    lines.push(`- Location: ${scene.location}`);
    lines.push(`- Props: ${scene.props.join('、')}`);
    lines.push(`- Hook(3s): ${scene.hook3s}`);
    lines.push(`- Conflict(15s): ${scene.conflict15s}`);
    lines.push(`- Twist(45s): ${scene.twist45s}`);
    lines.push(`- CTA: ${scene.cta}`);
    lines.push('- Camera Plan:');
    for (const camera of scene.cameraPlan) {
      lines.push(`  - ${camera}`);
    }
    lines.push('- Dialogue:');
    for (const line of scene.dialogueLines) {
      lines.push(`  - ${line}`);
    }
    lines.push('');
  }

  lines.push('## Chapter Storyboards');
  for (const chapter of payload.chapterStoryboards) {
    lines.push(`### 第${chapter.chapterNumber}章（${chapter.shotPrompts.length}个镜头）`);
    for (const shot of chapter.shotPrompts) {
      lines.push(`- ${shot.shotId} / ${shot.camera} / ${shot.composition} / ${shot.durationSec}s`);
      lines.push(`  - 提示词：${shot.visualPromptZh}`);
    }
    lines.push('');
  }

  lines.push('## Character Multi-View Prompts');
  for (const character of payload.characterPrompts) {
    lines.push(`### ${character.name}`);
    lines.push(`- 风格锚点：${character.styleAnchor}`);
    lines.push(`- 风格种子：${character.styleSeed}`);
    for (const view of character.multiViews) {
      lines.push(`- ${view.view}: ${view.promptZh}`);
    }
    lines.push('- 服装变体：');
    for (const variant of character.costumeVariants) {
      lines.push(`  - ${variant.label}: ${variant.promptZh}`);
    }
    lines.push('');
  }

  if (payload.warnings.length > 0) {
    lines.push('## Warnings');
    for (const warning of payload.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function normalizeLine(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[。！？]+$/g, '').trim();
}

function truncateTo24(text: string): string {
  if (text.length <= 24) return text;
  return `${text.slice(0, 23)}…`;
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

function buildChapterStoryboards(scenes: DramaScene[]): ChapterStoryboard[] {
  const chapterMap = new Map<number, ChapterStoryboard>();
  for (const scene of scenes) {
    const chapter = chapterMap.get(scene.chapterNumber) ?? {
      chapterNumber: scene.chapterNumber,
      chapterTitle: scene.title,
      shotPrompts: [],
    };
    chapter.shotPrompts.push(...buildSceneShotPrompts(scene));
    chapterMap.set(scene.chapterNumber, chapter);
  }
  return Array.from(chapterMap.values()).sort((a, b) => a.chapterNumber - b.chapterNumber);
}

function buildChapterCharacterRefs(scenes: DramaScene[]): ChapterCharacterRef[] {
  const chapterMap = new Map<number, Set<string>>();
  for (const scene of scenes) {
    const refs = chapterMap.get(scene.chapterNumber) ?? new Set<string>();
    for (const name of scene.cast) {
      if (name.trim().length > 0) {
        refs.add(name);
      }
    }
    chapterMap.set(scene.chapterNumber, refs);
  }

  return Array.from(chapterMap.entries())
    .map(([chapterNumber, names]) => ({
      chapterNumber,
      names: Array.from(names),
    }))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
}

function buildSceneShotPrompts(scene: DramaScene): MovieShotPrompt[] {
  const shotDefs: Array<{
    suffix: string;
    durationSec: number;
    camera: string;
    movement: string;
    composition: string;
    mood: string;
    visualHint: string;
    dialogue: string;
  }> = [
    {
      suffix: 'A',
      durationSec: 3,
      camera: '特写',
      movement: '快速推进',
      composition: '中心构图',
      mood: '悬疑',
      visualHint: scene.hook3s,
      dialogue: scene.dialogueLines[0] ?? scene.hook3s,
    },
    {
      suffix: 'B',
      durationSec: 12,
      camera: '中景',
      movement: '平移跟拍',
      composition: '对角线构图',
      mood: '冲突升级',
      visualHint: scene.conflict15s,
      dialogue: scene.dialogueLines[1] ?? scene.conflict15s,
    },
    {
      suffix: 'C',
      durationSec: 20,
      camera: '近景反打',
      movement: '推进+轻手持',
      composition: '三分法',
      mood: '反转',
      visualHint: scene.twist45s,
      dialogue: scene.dialogueLines[2] ?? scene.twist45s,
    },
  ];

  return shotDefs.map((def) => {
    const shotId = `C${String(scene.chapterNumber).padStart(2, '0')}-S${String(scene.sceneNo).padStart(2, '0')}-${def.suffix}`;
    const castText = scene.cast.join('、');
    const visualPromptZh = joinPromptSegments([
      `电影分镜 ${shotId}`,
      `场景：${scene.title}`,
      `角色：${castText}`,
      `地点：${scene.location}`,
      `机位：${def.camera}`,
      `运镜：${def.movement}`,
      `构图：${def.composition}`,
      `氛围：${def.mood}`,
      `关键动作：${clipPrompt(def.visualHint, 26)}`,
      '电影级写实，角色脸型与服装保持一致，光影层次明确，细节清晰',
    ]);

    const visualPromptEn = [
      `cinematic storyboard shot ${shotId}`,
      `scene ${scene.title}`,
      `cast ${scene.cast.join(', ')}`,
      `location ${scene.location}`,
      `camera ${def.camera}`,
      `movement ${def.movement}`,
      `composition ${def.composition}`,
      `mood ${def.mood}`,
      `action ${clipPrompt(def.visualHint, 40)}`,
      'film realism, consistent character identity, layered lighting, high detail',
    ].join(', ');

    return {
      shotId,
      chapterNumber: scene.chapterNumber,
      sceneNo: scene.sceneNo,
      title: scene.title,
      durationSec: def.durationSec,
      camera: def.camera,
      movement: def.movement,
      composition: def.composition,
      mood: def.mood,
      dialogue: def.dialogue,
      visualPromptZh,
      visualPromptEn,
    };
  });
}

function buildCharacterPromptPacks(
  scenes: DramaScene[],
  profiles: Pick<CharacterProfile, 'id' | 'name' | 'aliases' | 'appearance' | 'personality' | 'speechStyle'>[],
  warnings: string[],
): CharacterPromptPack[] {
  const profileMap = new Map<string, Pick<CharacterProfile, 'id' | 'name' | 'aliases' | 'appearance' | 'personality' | 'speechStyle'>>();
  for (const profile of profiles) {
    profileMap.set(profile.name, profile);
    for (const alias of profile.aliases ?? []) {
      profileMap.set(alias, profile);
    }
  }

  const usedCharacterNames = new Set<string>();
  for (const scene of scenes) {
    for (const name of scene.cast) {
      usedCharacterNames.add(name);
    }
  }

  const promptPacks: CharacterPromptPack[] = [];
  let fallbackIndex = 1;
  for (const name of usedCharacterNames) {
    const profile = profileMap.get(name);
    if (!profile) {
      warnings.push(`角色“${name}”缺少角色档案，已使用默认外观模板`);
    }

    const characterId = profile?.id ?? `fallback-${fallbackIndex++}`;
    const appearance = clipPrompt(normalizePromptField(profile?.appearance, '年轻东亚角色，五官清晰，服饰有辨识度'), 30);
    const personality = clipPrompt(normalizePromptField(profile?.personality, '冷静但有压迫感'), 22);
    const speechStyle = clipPrompt(normalizePromptField(profile?.speechStyle, '短句、克制、直接'), 20);
    const styleAnchor = joinPromptSegments([
      `${name}`,
      `外观：${appearance}`,
      `气质：${personality}`,
      `台词风格：${speechStyle}`,
    ]);
    const styleSeed = generateStyleSeed(`${characterId}:${name}`);
    const negativePrompt = '低清, 崩坏五官, 多人脸混叠, 畸形手指, 文字水印, 过曝';

    promptPacks.push({
      characterId,
      name,
      styleAnchor,
      styleSeed,
      negativePrompt,
      costumeVariants: buildCharacterCostumeVariants(name, styleAnchor),
      multiViews: buildCharacterMultiViews(name, styleAnchor),
    });
  }

  return promptPacks;
}

function buildCharacterMultiViews(
  name: string,
  styleAnchor: string,
): CharacterPromptView[] {
  const viewDefs: Array<{ view: CharacterPromptView['view']; zh: string; en: string; framing: string }> = [
    { view: 'front', zh: '正面全身站姿', en: 'front full body standing', framing: '35mm，全身，直视镜头' },
    { view: 'left-45', zh: '左前45度半身', en: 'left 45 degree half body', framing: '50mm，半身，左侧主光' },
    { view: 'right-45', zh: '右前45度半身', en: 'right 45 degree half body', framing: '50mm，半身，右侧主光' },
    { view: 'back', zh: '背面全身', en: 'back full body', framing: '35mm，全身，背身回头' },
    { view: 'expression-closeup', zh: '面部特写（紧张情绪）', en: 'facial closeup with tension', framing: '85mm，面部特写，浅景深' },
  ];

  return viewDefs.map((def) => {
    const promptZh = joinPromptSegments([
      `角色多视图：${name}`,
      `视角：${def.zh}`,
      `镜头：${def.framing}`,
      `角色锚点：${styleAnchor}`,
      '电影写实，保持同一张脸、同一发型、同一体型，皮肤与材质细节清晰',
    ]);
    const promptEn = [
      `character multiview of ${name}`,
      `view ${def.en}`,
      `framing ${def.framing}`,
      `style anchor ${styleAnchor}`,
      'film realism, same face identity, same hairstyle, same body shape, clear material details',
    ].join(', ');

    return {
      view: def.view,
      promptZh,
      promptEn,
    };
  });
}

function buildMovieStoryboardPromptMarkdown(chapters: ChapterStoryboard[]): string {
  const lines: string[] = [];
  lines.push('# Movie Storyboard Prompts');
  lines.push('');
  for (const chapter of chapters) {
    lines.push(`## 第${chapter.chapterNumber}章`);
    for (const shot of chapter.shotPrompts) {
      lines.push(`### ${shot.shotId} (${shot.durationSec}s)`);
      lines.push(`- 中文提示词：${shot.visualPromptZh}`);
      lines.push(`- English Prompt: ${shot.visualPromptEn}`);
      lines.push(`- 台词：${shot.dialogue}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

function buildCharacterPromptMarkdown(characters: CharacterPromptPack[]): string {
  const lines: string[] = [];
  lines.push('# Character Multi-View Prompts');
  lines.push('');
  for (const character of characters) {
    lines.push(`## ${character.name}`);
    lines.push(`- 角色锚点：${character.styleAnchor}`);
    lines.push(`- 角色种子：${character.styleSeed}`);
    lines.push(`- 负面词：${character.negativePrompt}`);
    lines.push('- 服装变体：');
    for (const variant of character.costumeVariants) {
      lines.push(`  - ${variant.label}`);
      lines.push(`    - 中文提示词：${variant.promptZh}`);
      lines.push(`    - English Prompt: ${variant.promptEn}`);
    }
    for (const view of character.multiViews) {
      lines.push(`### ${view.view}`);
      lines.push(`- 中文提示词：${view.promptZh}`);
      lines.push(`- English Prompt: ${view.promptEn}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function normalizePromptField(input: string | undefined, fallback: string): string {
  const normalized = (input ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return fallback;
  }
  return normalized;
}

function clipPrompt(text: string, maxLength: number): string {
  const normalized = text.replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function joinPromptSegments(segments: string[]): string {
  const seen = new Set<string>();
  const compact = segments
    .map((segment) => segment.replace(/[；;]+/g, '，').replace(/\s+/g, ' ').trim())
    .filter((segment) => segment.length > 0)
    .filter((segment) => {
      if (seen.has(segment)) return false;
      seen.add(segment);
      return true;
    });
  return compact.join('；');
}

function buildCharacterCostumeVariants(
  name: string,
  styleAnchor: string,
): CostumeVariantPrompt[] {
  const variants: Array<{ code: CostumeVariantPrompt['code']; label: string; outfit: string; framing: string }> = [
    { code: 'default', label: '常服', outfit: '日常常服，利落剪裁，低饱和配色', framing: '35mm，全身站姿' },
    { code: 'battle', label: '战斗装', outfit: '机动战斗服，轻甲层次，耐磨材质', framing: '35mm，全身动态站姿' },
    { code: 'casual', label: '便装', outfit: '休闲便装，柔和面料，生活化细节', framing: '50mm，半身' },
    { code: 'ceremony', label: '礼服', outfit: '仪式礼服，结构化廓形，精致配饰', framing: '50mm，半身正侧切换' },
  ];

  return variants.map((variant) => {
    const promptZh = joinPromptSegments([
      `角色服装变体：${name}`,
      `变体：${variant.label}`,
      `服装：${variant.outfit}`,
      `镜头：${variant.framing}`,
      `角色锚点：${styleAnchor}`,
      '电影写实，保持同一张脸与体型，服装纹理清晰，边缘干净',
    ]);
    const promptEn = [
      `character outfit variant of ${name}`,
      `variant ${variant.label}`,
      `outfit ${variant.outfit}`,
      `framing ${variant.framing}`,
      `style anchor ${styleAnchor}`,
      'film realism, same face identity and body shape, clean edges, clear fabric texture',
    ].join(', ');

    return {
      code: variant.code,
      label: variant.label,
      promptZh,
      promptEn,
    };
  });
}

function generateStyleSeed(source: string): number {
  const hash = hashText(source);
  return (Math.abs(hash) % 900000) + 100000;
}

function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

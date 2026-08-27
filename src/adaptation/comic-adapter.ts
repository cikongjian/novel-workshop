import fs from 'node:fs/promises';
import path from 'node:path';
import type { SceneCard } from '../novel/types.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { now } from '../utils/text.js';
import { getNovelsDir } from '../config/index.js';
import { resolveNovelStorageDir } from '../novel/data-root.js';
import { resolvePathWithin } from '../utils/path-safety.js';
import {
  buildDefaultComplianceMetadata,
  type AdaptationComplianceMetadata,
} from './compliance-metadata.js';

export type ComicAdapterParams = {
  novelId: string;
  chapterNumberStart: number;
  chapterNumberEnd: number;
  outputDirRelative: string;
  sceneCardsByChapter: Record<number, SceneCard[]>;
};

export type ComicPanel = {
  panelIndex: number;
  shotType: 'wide' | 'medium' | 'closeup';
  cameraAngle: 'eye-level' | 'low-angle' | 'high-angle';
  composition: 'rule-of-thirds' | 'diagonal' | 'center';
  characterStates: string[];
  sceneElements: string[];
  narration: string;
  dialogue: string;
  promptZh: string;
  promptEn: string;
  /** 出场角色 id 列表（来自 SceneCard，出图服务据此取立绘作为参考图） */
  referenceCharacterIds: string[];
};

export type ComicPage = {
  page: number;
  chapterNumber: number;
  sceneCardId: string;
  title: string;
  panels: ComicPanel[];
};

export type ComicStoryboardPayload = {
  novelId: string;
  mode: 'comic';
  chapterNumberStart: number;
  chapterNumberEnd: number;
  generatedAt: string;
  promptPath: string;
  compliance: AdaptationComplianceMetadata;
  pages: ComicPage[];
  warnings: string[];
};

export type ComicAdapterResult = {
  payloadPath: string;
  promptPath: string;
  pageCount: number;
  panelCount: number;
  warnings: string[];
};

const SHOT_TYPES: ComicPanel['shotType'][] = ['wide', 'medium', 'closeup'];
const CAMERA_ANGLES: ComicPanel['cameraAngle'][] = ['eye-level', 'low-angle', 'high-angle'];
const COMPOSITIONS: ComicPanel['composition'][] = ['rule-of-thirds', 'diagonal', 'center'];

export class ComicAdapter {
  private readonly novelsDir: string;
  private readonly logger: Logger;

  constructor(
    novelsDir: string = getNovelsDir(),
    logger: Logger = createLogger('comic-adapter'),
  ) {
    this.novelsDir = novelsDir;
    this.logger = logger;
  }

  async generate(params: ComicAdapterParams): Promise<ComicAdapterResult> {
    const novelDir = resolveNovelStorageDir(this.novelsDir, params.novelId);
    const outputDirAbsolute = resolvePathWithin(novelDir, params.outputDirRelative);
    await fs.mkdir(outputDirAbsolute, { recursive: true });

    const pages: ComicPage[] = [];
    const warnings: string[] = [];
    let panelCount = 0;
    let pageNo = 1;

    for (let chapter = params.chapterNumberStart; chapter <= params.chapterNumberEnd; chapter++) {
      const sceneCards = params.sceneCardsByChapter[chapter] ?? [];
      if (sceneCards.length === 0) {
        warnings.push(`第${chapter}章缺少场景卡，已跳过漫画分镜`);
        continue;
      }

      for (const card of sceneCards) {
        const panels = buildPanels(card);
        panelCount += panels.length;
        pages.push({
          page: pageNo++,
          chapterNumber: chapter,
          sceneCardId: card.id,
          title: card.title,
          panels,
        });
      }
    }

    if (pages.length === 0) {
      throw new Error('漫画改编失败：无可用场景卡');
    }

    const generatedAt = now();
    const promptPathRelative = toPosix(path.join(params.outputDirRelative, 'comic_prompts.md'));
    const storyboard: ComicStoryboardPayload = {
      novelId: params.novelId,
      mode: 'comic',
      chapterNumberStart: params.chapterNumberStart,
      chapterNumberEnd: params.chapterNumberEnd,
      generatedAt,
      promptPath: promptPathRelative,
      compliance: buildDefaultComplianceMetadata({
        novelId: params.novelId,
        mode: 'comic',
        generatedAt,
      }),
      pages,
      warnings,
    };

    const payloadPathRelative = toPosix(path.join(params.outputDirRelative, 'comic_storyboard.json'));
    const payloadPathAbsolute = path.join(outputDirAbsolute, 'comic_storyboard.json');
    const promptPathAbsolute = path.join(outputDirAbsolute, 'comic_prompts.md');

    await fs.writeFile(payloadPathAbsolute, JSON.stringify(storyboard, null, 2), 'utf-8');
    await fs.writeFile(promptPathAbsolute, buildPromptMarkdown(storyboard), 'utf-8');

    this.logger.info('漫画分镜产物已生成', {
      novelId: params.novelId,
      pageCount: pages.length,
      panelCount,
      payloadPath: payloadPathRelative,
    });

    return {
      payloadPath: payloadPathRelative,
      promptPath: promptPathRelative,
      pageCount: pages.length,
      panelCount,
      warnings,
    };
  }
}

function buildPanels(card: SceneCard): ComicPanel[] {
  const characters = card.characters;
  const sceneElements = [card.location, card.time].filter(Boolean);
  const baseDialog = card.conflict || card.turningPoint || card.outcome;

  const panels: ComicPanel[] = [
    createPanel(1, card, sceneElements, characters, baseDialog, '建立场景与冲突'),
    createPanel(2, card, sceneElements, characters, card.turningPoint || baseDialog, '推进转折'),
    createPanel(3, card, sceneElements, characters, card.outcome || baseDialog, '收束与留钩子'),
  ];

  return panels;
}

function createPanel(
  panelIndex: number,
  card: SceneCard,
  sceneElements: string[],
  characters: SceneCard['characters'],
  dialogueText: string,
  narrativeHint: string,
): ComicPanel {
  const characterNames = characters.map((c) => c.name);
  const referenceCharacterIds = characters.map((c) => c.id);
  const shotType = SHOT_TYPES[(panelIndex - 1) % SHOT_TYPES.length];
  const cameraAngle = CAMERA_ANGLES[(panelIndex - 1) % CAMERA_ANGLES.length];
  const composition = COMPOSITIONS[(panelIndex - 1) % COMPOSITIONS.length];
  const castText = characterNames.length > 0 ? characterNames.join('、') : '主角';
  const locationText = card.location || '未命名场景';
  const timeText = card.time || '不限定时间';

  const promptZh = [
    `漫画分镜，第${panelIndex}格`,
    `镜头=${shotType}，机位=${cameraAngle}，构图=${composition}`,
    `地点=${locationText}，时间=${timeText}`,
    `角色=${castText}`,
    `情绪强度=${Math.round(averageEmotion(card))}/10`,
    `关键动作=${narrativeHint}`,
    `画面细节：服饰统一、角色脸部一致、背景连续`,
  ].join('；');

  const promptEn = [
    `Comic storyboard panel ${panelIndex}`,
    `shot=${shotType}, camera=${cameraAngle}, composition=${composition}`,
    `location=${locationText}, time=${timeText}`,
    `characters=${castText}`,
    `emotion=${Math.round(averageEmotion(card))}/10`,
    `key_action=${narrativeHint}`,
    'consistent character design, cinematic framing, clean line art',
  ].join(', ');

  return {
    panelIndex,
    shotType,
    cameraAngle,
    composition,
    characterStates: characterNames.length > 0 ? characterNames.map((n) => `${n}:紧张`) : ['主角:紧张'],
    sceneElements,
    narration: narrativeHint,
    dialogue: dialogueText,
    promptZh,
    promptEn,
    referenceCharacterIds,
  };
}

function averageEmotion(card: SceneCard): number {
  if (card.emotionCurve.length === 0) return 5;
  const total = card.emotionCurve.reduce((sum, beat) => sum + beat.intensity, 0);
  return total / card.emotionCurve.length;
}

function buildPromptMarkdown(payload: ComicStoryboardPayload): string {
  const lines: string[] = [];
  lines.push('# Comic Prompts');
  lines.push('');
  lines.push(`- Novel: ${payload.novelId}`);
  lines.push(`- Range: ${payload.chapterNumberStart}-${payload.chapterNumberEnd}`);
  lines.push(`- Generated At: ${payload.generatedAt}`);
  lines.push('');

  for (const page of payload.pages) {
    lines.push(`## Page ${page.page} - 第${page.chapterNumber}章 / ${page.title}`);
    lines.push('');
    for (const panel of page.panels) {
      lines.push(`### Panel ${panel.panelIndex}`);
      lines.push(`- 中文提示词: ${panel.promptZh}`);
      lines.push(`- English Prompt: ${panel.promptEn}`);
      lines.push(`- Narration: ${panel.narration}`);
      lines.push(`- Dialogue: ${panel.dialogue}`);
      lines.push('');
    }
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

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

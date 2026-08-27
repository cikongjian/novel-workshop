import { randomUUID } from 'node:crypto';
import { SceneCard as SceneCardSchema } from '../novel/types.js';
import type { SceneCard } from '../novel/types.js';

export type SceneCardExtractorCharacterRef = {
  id: string;
  name: string;
};

export type ExtractSceneCardsInput = {
  chapterNumber: number;
  chapterTitle?: string;
  chapterContent: string;
  characters?: SceneCardExtractorCharacterRef[];
};

type SceneBlock = {
  title: string;
  content: string;
};

const TIME_KEYWORDS = ['清晨', '早晨', '上午', '中午', '下午', '黄昏', '傍晚', '夜里', '深夜', '凌晨'];
const TURNING_POINT_KEYWORDS = ['突然', '然而', '却', '但', '没想到', '转瞬', '反而'];

export class SceneCardExtractor {
  extract(input: ExtractSceneCardsInput): SceneCard[] {
    const blocks = splitSceneBlocks(input.chapterContent, input.chapterTitle);
    const cards = blocks
      .map((block, idx) => this.blockToSceneCard(block, idx, input))
      .filter((card): card is SceneCard => card !== null);

    if (cards.length > 0) return cards;

    return [this.fallbackCard(input)];
  }

  private blockToSceneCard(
    block: SceneBlock,
    sceneIndex: number,
    input: ExtractSceneCardsInput,
  ): SceneCard | null {
    const content = block.content.trim();
    if (!content) return null;

    const sentences = splitSentences(content);
    const firstSentence = sentences[0] ?? content.slice(0, 60);
    const turningPoint = sentences.find((s) => TURNING_POINT_KEYWORDS.some((k) => s.includes(k))) ?? '';
    const outcome = sentences[sentences.length - 1] ?? firstSentence;
    const excerpt = content.slice(0, 220).trim();

    const characters = (input.characters ?? [])
      .filter((char) => content.includes(char.name))
      .map((char) => ({
        id: char.id,
        name: char.name,
        objective: '',
      }));

    const emotionCurve = buildEmotionCurve(sentences);

    const card = SceneCardSchema.safeParse({
      id: randomUUID(),
      chapterNumber: input.chapterNumber,
      sceneIndex,
      title: block.title || `场景${sceneIndex + 1}`,
      time: inferTime(content),
      location: inferLocation(content),
      characters,
      conflict: firstSentence,
      turningPoint,
      outcome,
      emotionCurve,
      continuityRefs: [],
      rawExcerpt: excerpt || content,
    });

    return card.success ? card.data : null;
  }

  private fallbackCard(input: ExtractSceneCardsInput): SceneCard {
    const content = input.chapterContent.trim();
    const sentences = splitSentences(content);
    const firstSentence = (sentences[0] ?? content.slice(0, 60)) || '章节内容待补充';
    const outcome = sentences[sentences.length - 1] ?? firstSentence;

    return SceneCardSchema.parse({
      id: randomUUID(),
      chapterNumber: input.chapterNumber,
      sceneIndex: 0,
      title: input.chapterTitle?.trim() || `第${input.chapterNumber}章`,
      time: inferTime(content),
      location: inferLocation(content),
      characters: [],
      conflict: firstSentence,
      turningPoint: '',
      outcome,
      emotionCurve: buildEmotionCurve(sentences),
      continuityRefs: [],
      rawExcerpt: (content.slice(0, 220).trim() || firstSentence),
    });
  }
}

function splitSceneBlocks(content: string, chapterTitle?: string): SceneBlock[] {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [{
      title: chapterTitle?.trim() || '场景1',
      content: '',
    }];
  }

  const headingPattern = /^#{1,6}\s*场景\s*\d+[：:.\-]?\s*(.*)$/gim;
  const matches = Array.from(normalized.matchAll(headingPattern));

  if (matches.length === 0) {
    const paragraphBlocks = normalized
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0);

    if (paragraphBlocks.length <= 1) {
      return [{ title: chapterTitle?.trim() || '场景1', content: normalized }];
    }

    return paragraphBlocks.map((block, idx) => ({
      title: `${chapterTitle?.trim() || '场景'}-${idx + 1}`,
      content: block,
    }));
  }

  const blocks: SceneBlock[] = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    const start = (current.index ?? 0) + current[0].length;
    const end = next?.index ?? normalized.length;
    const title = (current[1] ?? '').trim() || `场景${i + 1}`;
    const sceneContent = normalized.slice(start, end).trim();

    blocks.push({
      title,
      content: sceneContent,
    });
  }

  return blocks.filter((block) => block.content.length > 0);
}

function splitSentences(content: string): string[] {
  return content
    .split(/(?<=[。！？!?])/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function inferTime(content: string): string {
  for (const keyword of TIME_KEYWORDS) {
    if (content.includes(keyword)) return keyword;
  }
  return '';
}

function inferLocation(content: string): string {
  const match = content.match(/(?:在|于)([^，。！？\n]{2,24})(?:里|中|上|内|外|旁|前|后)?/);
  return match?.[1]?.trim() ?? '';
}

function buildEmotionCurve(sentences: string[]): Array<{ beat: string; intensity: number }> {
  if (sentences.length === 0) {
    return [{ beat: '开场', intensity: 0 }];
  }

  const start = sentences[0] ?? '';
  const middle = sentences[Math.floor(sentences.length / 2)] ?? start;
  const end = sentences[sentences.length - 1] ?? start;

  return [
    { beat: '开场', intensity: scoreIntensity(start) },
    { beat: '推进', intensity: scoreIntensity(middle) },
    { beat: '收束', intensity: scoreIntensity(end) },
  ];
}

function scoreIntensity(text: string): number {
  let score = 2;
  const strongWords = ['杀', '怒', '崩溃', '震惊', '危险', '血', '爆炸', '失控', '恐惧', '绝望'];
  const mediumWords = ['紧张', '犹豫', '冲突', '争执', '怀疑', '焦虑', '压迫'];

  for (const word of strongWords) {
    if (text.includes(word)) score += 3;
  }
  for (const word of mediumWords) {
    if (text.includes(word)) score += 1;
  }

  const exclamationCount = (text.match(/[!?！？]/g) ?? []).length;
  score += Math.min(exclamationCount, 2);

  return Math.max(0, Math.min(10, score));
}

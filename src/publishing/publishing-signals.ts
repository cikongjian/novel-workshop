import type { NovelGenre } from '../novel/types.js';
import type { DraftPublishingRecommendationBody, PublishingAudience, PublishingNovelSignals, PublishingPace } from './publishing-types.js';

const FEMALE_KEYWORDS = ['言情', '先婚后爱', '追妻', '破镜重圆', '暗恋', '豪门', '马甲', '团宠', '女主', '耽美', '双男主', '宫斗'];
const MALE_KEYWORDS = ['系统', '升级', '修仙', '宗门', '争霸', '末世', '诸天', '机甲', '领主', '神豪', '打脸', '逆袭'];
const FAST_PACE_KEYWORDS = ['重生', '复仇', '离婚', '打脸', '逆袭', '马甲', '直播', '系统', '悬疑', '怪谈', '无限', '追杀'];
const SLOW_PACE_KEYWORDS = ['群像', '成长', '史诗', '家族', '朝堂', '群像剧', '年代', '治愈', '日常'];

const TAG_KEYWORDS: Array<{ tag: string; keywords: string[] }> = [
  { tag: 'cp', keywords: ['恋爱', 'CP', '双男主', '耽美', '先婚后爱', '追妻', '暗恋', '青梅竹马'] },
  { tag: 'female-emotion', keywords: ['言情', '婚恋', '女主', '豪门', '团宠', '宫斗', '宅斗', '情感'] },
  { tag: 'male-upgrade', keywords: ['系统', '升级', '修仙', '争霸', '宗门', '末世', '神豪', '逆袭'] },
  { tag: 'short-drama', keywords: ['重生', '复仇', '离婚', '追妻', '豪门', '马甲', '真假千金', '火葬场'] },
  { tag: 'free-commercial', keywords: ['爽文', '反转', '逆袭', '高能', '打脸', '上头'] },
  { tag: 'worldbuilding', keywords: ['世界观', '仙侠', '王朝', '帝国', '文明', '史诗', '家族', '宗门'] },
  { tag: 'suspense', keywords: ['悬疑', '推理', '怪谈', '规则', '无限', '谜案', '凶案'] },
  { tag: 'literary', keywords: ['治愈', '群像', '现实', '成长', '命运', '诗意'] },
];

function normalizeText(input?: string): string {
  return (input ?? '').trim().toLowerCase();
}

function countKeywordHits(text: string, keywords: string[]): number {
  return keywords.reduce((count, keyword) => count + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

function inferAudience(genre: NovelGenre, text: string): PublishingAudience {
  if (genre === 'romance') return 'female';
  const femaleHits = countKeywordHits(text, FEMALE_KEYWORDS);
  const maleHits = countKeywordHits(text, MALE_KEYWORDS);
  if (femaleHits >= maleHits + 2) return 'female';
  if (maleHits >= femaleHits + 2) return 'male';
  return 'general';
}

function inferPace(text: string): PublishingPace {
  const fastHits = countKeywordHits(text, FAST_PACE_KEYWORDS);
  const slowHits = countKeywordHits(text, SLOW_PACE_KEYWORDS);
  if (fastHits >= slowHits + 2) return 'fast';
  if (slowHits >= fastHits + 2) return 'slow';
  return 'medium';
}

function inferGenreTags(genre: NovelGenre): string[] {
  switch (genre) {
    case 'romance':
      return ['cp', 'female-emotion'];
    case 'fantasy':
      return ['worldbuilding', 'male-upgrade'];
    case 'scifi':
      return ['worldbuilding'];
    case 'mystery':
      return ['suspense'];
    case 'historical':
      return ['worldbuilding'];
    default:
      return [];
  }
}

function inferTextTags(text: string): string[] {
  return TAG_KEYWORDS
    .filter((item) => item.keywords.some((keyword) => text.includes(keyword.toLowerCase())))
    .map((item) => item.tag);
}

export function buildPublishingSignals(input: DraftPublishingRecommendationBody): PublishingNovelSignals {
  const combined = `${normalizeText(input.title)} ${normalizeText(input.synopsis)}`.trim();
  const tags = new Set<string>([...inferGenreTags(input.genre), ...inferTextTags(combined)]);

  return {
    genre: input.genre,
    audience: inferAudience(input.genre, combined),
    pace: inferPace(combined),
    chapterCount: input.chapterCount ?? 0,
    targetChapters: input.targetChapters,
    tags: [...tags],
  };
}

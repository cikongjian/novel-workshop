/**
 * 章节事实提取器
 *
 * 从章节正文中提取时间、地点、天气、角色位置、物品等事实信息，
 * 用于跨章节连贯性检查。
 */
import type { CharacterProfile, WorldEntry, ChapterFact } from './types.js';

// ==================== 关键词表 ====================

const TIME_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /清晨|拂晓|天刚亮|晨曦|破晓/, label: '清晨' },
  { pattern: /黎明|天蒙蒙亮/, label: '黎明' },
  { pattern: /上午|午前/, label: '上午' },
  { pattern: /正午|中午|日正当空/, label: '正午' },
  { pattern: /午后|下午/, label: '午后' },
  { pattern: /傍晚|黄昏|日落|夕阳/, label: '傍晚' },
  { pattern: /夜晚|入夜|夜幕|月色|星光|夜色/, label: '夜晚' },
  { pattern: /深夜|半夜|子时|午夜|三更/, label: '深夜' },
  { pattern: /卯时/, label: '卯时（清晨）' },
  { pattern: /辰时/, label: '辰时（上午）' },
  { pattern: /巳时/, label: '巳时（上午）' },
  { pattern: /午时/, label: '午时（正午）' },
  { pattern: /未时/, label: '未时（午后）' },
  { pattern: /申时/, label: '申时（下午）' },
  { pattern: /酉时/, label: '酉时（傍晚）' },
  { pattern: /戌时/, label: '戌时（夜晚）' },
  { pattern: /亥时/, label: '亥时（深夜）' },
  { pattern: /子时/, label: '子时（深夜）' },
  { pattern: /丑时/, label: '丑时（凌晨）' },
  { pattern: /寅时/, label: '寅时（凌晨）' },
];

const WEATHER_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /大雨|暴雨|倾盆大雨|雨幕/, label: '大雨' },
  { pattern: /小雨|细雨|毛毛雨|淅沥/, label: '小雨' },
  { pattern: /雨/, label: '雨' },
  { pattern: /大雪|暴雪|鹅毛大雪/, label: '大雪' },
  { pattern: /雪|飘雪/, label: '雪' },
  { pattern: /狂风|大风|飓风/, label: '大风' },
  { pattern: /风/, label: '风' },
  { pattern: /浓雾|大雾|迷雾/, label: '雾' },
  { pattern: /阴天|阴沉|乌云/, label: '阴' },
  { pattern: /晴朗|万里无云|艳阳/, label: '晴' },
];

const TIMELINE_PATTERNS: RegExp[] = [
  /第[一二三四五六七八九十百千\d]+天/,
  /[一二三四五六七八九十\d]+日[后之]?/,
  /翌日|次日|第二天|隔天/,
  /三天后|数日后|几天后|半月后|一月后/,
  /[一二三四五六七八九十\d]+个?月[后之]/,
  /[一二三四五六七八九十\d]+年[后之]/,
];

const ITEM_OBTAIN_VERBS = ['获得', '得到', '拿到', '取出', '拔出', '捡起', '接过', '收到'];
const ITEM_LOSE_VERBS = ['失去', '丢失', '遗落', '被夺', '交出', '放下', '丢弃'];
const ITEM_DESTROY_VERBS = ['毁灭', '碎裂', '断裂', '损毁', '粉碎', '焚毁', '炸毁'];

// ==================== 提取函数 ====================

export function extractChapterFacts(params: {
  chapterContent: string;
  characters: CharacterProfile[];
  worldEntries: WorldEntry[];
}): ChapterFact {
  const { chapterContent, characters, worldEntries } = params;
  if (!chapterContent.trim()) {
    return { timeOfDay: '', weather: '', locations: [], characterPositions: [], items: [], timelineMarker: '' };
  }

  const paragraphs = chapterContent.split(/\n{2,}|\r?\n/).filter(p => p.trim());
  const lastThird = paragraphs.slice(Math.floor(paragraphs.length * 2 / 3));
  const fullText = chapterContent;
  const endText = lastThird.join('\n');

  return {
    timeOfDay: extractTimeOfDay(endText) || extractTimeOfDay(fullText),
    weather: extractWeather(fullText),
    locations: extractLocations(fullText, worldEntries),
    characterPositions: extractCharacterPositions(endText, characters, worldEntries),
    items: extractItems(fullText),
    timelineMarker: extractTimelineMarker(fullText),
  };
}

function extractTimeOfDay(text: string): string {
  // 从后往前匹配，取最后出现的时间
  for (const { pattern, label } of TIME_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return '';
}

function extractWeather(text: string): string {
  for (const { pattern, label } of WEATHER_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return '';
}

function extractLocations(text: string, worldEntries: WorldEntry[]): string[] {
  const geoEntries = worldEntries.filter(e => e.category === 'geography');
  const locations: string[] = [];
  for (const entry of geoEntries) {
    const names = [entry.name, ...(entry.aliases ?? [])].filter(Boolean);
    if (names.some(n => text.includes(n))) {
      locations.push(entry.name);
    }
  }
  return [...new Set(locations)];
}

function extractCharacterPositions(
  endText: string,
  characters: CharacterProfile[],
  worldEntries: WorldEntry[],
): ChapterFact['characterPositions'] {
  const geoEntries = worldEntries.filter(e => e.category === 'geography');
  const positions: ChapterFact['characterPositions'] = [];

  for (const character of characters) {
    const names = [character.name, ...character.aliases].filter(Boolean);
    if (!names.some(n => endText.includes(n))) continue;

    // 在末尾文本中查找角色名和地点共现的句子
    const sentences = endText.split(/[。！？…]+/);
    for (let i = sentences.length - 1; i >= 0; i--) {
      const s = sentences[i];
      if (!names.some(n => s.includes(n))) continue;

      for (const entry of geoEntries) {
        const geoNames = [entry.name, ...(entry.aliases ?? [])].filter(Boolean);
        if (geoNames.some(n => s.includes(n))) {
          positions.push({
            characterId: character.id,
            characterName: character.name,
            location: entry.name,
          });
          break;
        }
      }
      if (positions.some(p => p.characterId === character.id)) break;
    }
  }
  return positions;
}

function extractItems(text: string): ChapterFact['items'] {
  const items: ChapterFact['items'] = [];
  const sentences = text.split(/[。！？…]+/);

  // 简单的物品提取：匹配"动词 + 名词"模式
  for (const sentence of sentences) {
    for (const verb of ITEM_OBTAIN_VERBS) {
      const match = sentence.match(new RegExp(`${verb}[了]?[「『""]?([^「『""，。！？\\s]{2,8})[」』""]?`));
      if (match && !items.some(i => i.name === match[1])) {
        items.push({ name: match[1], status: 'obtained' });
      }
    }
    for (const verb of ITEM_DESTROY_VERBS) {
      const match = sentence.match(new RegExp(`([^，。！？\\s]{2,8})[被]?${verb}`));
      if (match && !items.some(i => i.name === match[1])) {
        items.push({ name: match[1], status: 'destroyed' });
      }
    }
    for (const verb of ITEM_LOSE_VERBS) {
      const match = sentence.match(new RegExp(`${verb}[了]?[「『""]?([^「『""，。！？\\s]{2,8})`));
      if (match && !items.some(i => i.name === match[1])) {
        items.push({ name: match[1], status: 'lost' });
      }
    }
  }
  return items.slice(0, 10);
}

function extractTimelineMarker(text: string): string {
  for (const pattern of TIMELINE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return '';
}

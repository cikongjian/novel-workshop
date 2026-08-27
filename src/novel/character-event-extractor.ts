/**
 * 角色事件提取器
 *
 * 从章节正文和 Agent 输出中提取角色关键事件，
 * 构建角色事件时间线。
 */
import { randomUUID } from 'node:crypto';
import type { CharacterProfile, CharacterEvent, CharacterEventType } from './types.js';

/** 事件关键词映射 */
const EVENT_PATTERNS: Record<CharacterEventType, string[]> = {
  action: ['出手', '决定', '选择', '出发', '离开', '加入', '拒绝', '接受', '挑战', '宣布', '命令'],
  encounter: ['遭遇', '遇到', '被困', '被捕', '受伤', '中毒', '被追', '陷入', '遭到', '被围'],
  relationship: ['结盟', '反目', '重逢', '分离', '背叛', '拜师', '收徒', '订婚', '决裂', '和解'],
  revelation: ['发现', '得知', '意识到', '真相', '秘密', '身世', '揭露', '领悟', '明白', '察觉'],
  achievement: ['突破', '成功', '获得', '掌握', '晋升', '胜利', '解锁', '觉醒', '进阶', '炼成'],
  loss: ['失去', '死亡', '毁灭', '失败', '牺牲', '破碎', '陨落', '丧失', '被夺', '崩溃'],
};

/** 高重要性关键词（出现即标记为 importance >= 4） */
const HIGH_IMPORTANCE_KEYWORDS = [
  '死亡', '牺牲', '背叛', '突破', '觉醒', '真相', '身世', '决裂',
  '重逢', '陨落', '毁灭', '秘密', '进阶', '拜师',
];

const MAX_EVENTS_PER_CHARACTER = 3;

export function extractCharacterEvents(params: {
  novelId: string;
  chapterNumber: number;
  chapterContent: string;
  characters: CharacterProfile[];
  charMergerOutput?: string;
  plotAnalystOutput?: string;
  timestamp?: string;
}): CharacterEvent[] {
  const { novelId: _novelId, chapterNumber, chapterContent, characters, charMergerOutput, plotAnalystOutput } = params;
  const ts = params.timestamp ?? new Date().toISOString();
  const events: CharacterEvent[] = [];

  if (!chapterContent.trim() || characters.length === 0) return events;

  const paragraphs = chapterContent.split(/\n{2,}|\r?\n/).filter(p => p.trim());

  for (const character of characters) {
    const charEvents: CharacterEvent[] = [];
    const namePatterns = [character.name, ...character.aliases].filter(Boolean);
    if (namePatterns.length === 0) continue;

    // 1. 从 charMergerOutput 提取 currentState 变更
    if (charMergerOutput) {
      const stateEvent = extractFromMergerOutput(charMergerOutput, character, chapterNumber, ts);
      if (stateEvent) charEvents.push(stateEvent);
    }

    // 2. 从 plotAnalystOutput 提取与角色相关的情节事件
    if (plotAnalystOutput) {
      const plotEvents = extractFromPlotOutput(plotAnalystOutput, character, chapterNumber, ts);
      charEvents.push(...plotEvents);
    }

    // 3. 关键词扫描章节正文
    const textEvents = extractFromContent(paragraphs, character, characters, chapterNumber, ts);
    charEvents.push(...textEvents);

    // 去重（按 summary 前 20 字符）并取 top N
    const seen = new Set<string>();
    const unique: CharacterEvent[] = [];
    for (const e of charEvents) {
      const key = e.summary.slice(0, 20);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(e);
      }
    }

    // 按重要性排序，取前 N 个
    unique.sort((a, b) => b.importance - a.importance);
    events.push(...unique.slice(0, MAX_EVENTS_PER_CHARACTER));
  }

  return events;
}

// ==================== 辅助函数 ====================

function characterMentioned(text: string, character: CharacterProfile): boolean {
  const names = [character.name, ...character.aliases].filter(Boolean);
  return names.some(n => text.includes(n));
}

function extractFromMergerOutput(
  output: string,
  character: CharacterProfile,
  chapterNumber: number,
  ts: string,
): CharacterEvent | null {
  if (!characterMentioned(output, character)) return null;

  // 尝试从 JSON 结果中提取 currentState 更新
  const sepIdx = output.indexOf('---MERGE_RESULT---');
  const analysisText = sepIdx !== -1 ? output.slice(0, sepIdx) : output;

  // 在分析文本中查找与角色相关的状态描述
  const lines = analysisText.split('\n');
  for (const line of lines) {
    if (!characterMentioned(line, character)) continue;
    // 匹配"角色名 + 动作描述"模式
    for (const [type, keywords] of Object.entries(EVENT_PATTERNS) as [CharacterEventType, string[]][]) {
      for (const kw of keywords) {
        if (line.includes(kw)) {
          const summary = buildSummary(line, character.name, kw);
          if (summary) {
            return {
              id: randomUUID(),
              characterId: character.id,
              chapterNumber,
              summary,
              type,
              relatedCharacterIds: [],
              importance: HIGH_IMPORTANCE_KEYWORDS.includes(kw) ? 4 : 3,
              createdAt: ts,
            };
          }
        }
      }
    }
  }
  return null;
}

function extractFromPlotOutput(
  output: string,
  character: CharacterProfile,
  chapterNumber: number,
  ts: string,
): CharacterEvent[] {
  const events: CharacterEvent[] = [];
  if (!characterMentioned(output, character)) return events;

  const sepIdx = output.indexOf('---MERGE_RESULT---');
  const analysisText = sepIdx !== -1 ? output.slice(0, sepIdx) : output;

  const lines = analysisText.split('\n');
  for (const line of lines) {
    if (!characterMentioned(line, character)) continue;
    if (line.length < 8 || line.length > 200) continue;

    for (const [type, keywords] of Object.entries(EVENT_PATTERNS) as [CharacterEventType, string[]][]) {
      for (const kw of keywords) {
        if (line.includes(kw)) {
          const summary = buildSummary(line, character.name, kw);
          if (summary) {
            events.push({
              id: randomUUID(),
              characterId: character.id,
              chapterNumber,
              summary,
              type,
              relatedCharacterIds: [],
              importance: HIGH_IMPORTANCE_KEYWORDS.includes(kw) ? 4 : 3,
              createdAt: ts,
            });
            break; // 每行只取一个事件
          }
        }
      }
      if (events.length >= 2) break;
    }
  }
  return events;
}

function extractFromContent(
  paragraphs: string[],
  character: CharacterProfile,
  allCharacters: CharacterProfile[],
  chapterNumber: number,
  ts: string,
): CharacterEvent[] {
  const events: CharacterEvent[] = [];
  const names = [character.name, ...character.aliases].filter(Boolean);

  for (const para of paragraphs) {
    if (!names.some(n => para.includes(n))) continue;

    for (const [type, keywords] of Object.entries(EVENT_PATTERNS) as [CharacterEventType, string[]][]) {
      for (const kw of keywords) {
        if (!para.includes(kw)) continue;

        // 提取包含关键词的句子
        const sentences = para.split(/[。！？…]+/).filter(s => s.includes(kw) && names.some(n => s.includes(n)));
        if (sentences.length === 0) continue;

        const sentence = sentences[0].trim();
        const summary = sentence.length > 50 ? sentence.slice(0, 50) + '…' : sentence;
        if (summary.length < 4) continue;

        // 检测相关角色
        const relatedIds = allCharacters
          .filter(c => c.id !== character.id && [c.name, ...c.aliases].some(n => para.includes(n)))
          .map(c => c.id);

        events.push({
          id: randomUUID(),
          characterId: character.id,
          chapterNumber,
          summary,
          type,
          relatedCharacterIds: relatedIds,
          importance: HIGH_IMPORTANCE_KEYWORDS.includes(kw) ? 5 : 3,
          createdAt: ts,
        });
        break; // 每个关键词类型只取一个
      }
      if (events.length >= 3) break;
    }
    if (events.length >= 3) break;
  }
  return events;
}

function buildSummary(line: string, characterName: string, keyword: string): string {
  // 清理 markdown 标记
  let clean = line.replace(/[#*\-_>]/g, '').trim();
  // 截取合理长度
  if (clean.length > 60) {
    // 尝试截取包含关键词的部分
    const kwIdx = clean.indexOf(keyword);
    if (kwIdx > 30) {
      clean = '…' + clean.slice(kwIdx - 15, kwIdx + 45);
    } else {
      clean = clean.slice(0, 60) + '…';
    }
  }
  // 如果摘要不包含角色名，前缀添加
  if (!clean.includes(characterName)) {
    clean = `${characterName}${clean}`;
  }
  return clean;
}

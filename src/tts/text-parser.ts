/**
 * 章节文本解析器
 *
 * 将章节正文拆分为有序的 segments（旁白 / 对话），
 * 识别说话人并匹配角色档案，同时从上下文推断性别提示。
 */

export interface TextSegment {
  type: 'narration' | 'dialogue';
  text: string;
  /** 从“XXX说道”或 (#角色名) 提取出的说话人名称 */
  speaker?: string;
  /** 匹配到的角色 ID */
  characterId?: string;
  /** 性别提示（用于未知角色音色兜底） */
  genderHint?: 'male' | 'female';
  /** 说话动词（如“怒道”“轻声道”） */
  speakerVerb?: string;
  /** 原文段落索引（前端高亮用） */
  paragraphIndex: number;
}

interface CharacterRef {
  id: string;
  name: string;
  aliases: string[];
}

const OPEN_QUOTES = ['“', '「', '『', '"'] as const;
const CLOSE_QUOTES = ['”', '」', '』', '"'] as const;

/** 对话抽取：支持中英引号，避免跨段匹配 */
const DIALOGUE_RE = /([“「『"])(.{1,}?)([”」』"])/g;

/** 说话人标记：兼容半角/全角括号 */
const SPEAKER_MARKER_RE = /[\(\uFF08]\s*[#\uFF03]\s*([^()\uFF08\uFF09\n]+?)\s*[\)\uFF09]/g;
const SPEAKER_MARKER_BEFORE_RE = /[\(\uFF08]\s*[#\uFF03]\s*([^()\uFF08\uFF09\n]+?)\s*[\)\uFF09]\s*$/;

const SPEECH_VERBS = [
  '说道', '说', '道', '问道', '答道', '回道', '回应',
  '喊道', '叫道', '喝道', '怒道', '叹道', '笑道', '冷笑道', '苦笑道',
  '低声道', '轻声道', '沉声道', '冷声道', '厉声道', '高声道', '哽咽道', '颤声道',
  '嘀咕道', '咕哝道', '呢喃道', '耳语道', '低语道',
  '解释道', '补充道', '反驳道', '争辩道', '追问道', '反问道', '质问道',
  '命令道', '吩咐道', '提醒道', '警告道', '安慰道', '鼓励道',
  '开口', '接话', '插嘴',
] as const;

const SPEAKER_BEFORE_RE = new RegExp(
  `([^\\s，。！？、“”「」『』（）()]{1,12}?)(${SPEECH_VERBS.join('|')})[：:，,]?\\s*$`
);

const SPEAKER_AFTER_RE = new RegExp(
  `^[\\s，,。！？!?、…—-]*([^\\s，。！？、“”「」『』（）()]{1,12}?)(?:${SPEECH_VERBS.join('|')})`
);

const TITLE_PREFIXES = [
  '大元帅', '元帅', '将军', '统领', '总兵', '都督',
  '皇帝', '国王', '太子', '王子', '王爷', '公主', '皇后', '太后', '贵妃',
  '少年', '青年', '老年',
  '丞相', '宰相', '太师', '太傅', '尚书', '侍郎',
  '先生', '女士', '夫人', '小姐', '师兄', '师姐', '师弟', '师妹',
] as const;

const SOUND_EFFECT_RE = /^(啊|呀|哇|呃|嗯|唔|哈|嘿|嗬|哼|啪|砰|轰|咚|咔嚓|嗡|呼|沙沙|滴答|叮咚|嘶|吱|喵|汪|嘎|嗖|嘭|咻)+$/;
const BASIC_NON_HUMAN_SPEAKERS = new Set([
  '\u65c1\u767d', '\u7cfb\u7edf', '\u7cfb\u7edf\u63d0\u793a', '\u63d0\u793a\u97f3',
  '\u5e7f\u64ad', '\u673a\u68b0\u97f3', '\u7535\u5b50\u97f3',
  '\u98ce\u58f0', '\u96e8\u58f0', '\u96f7\u58f0', '\u6c34\u58f0',
  '\u811a\u6b65\u58f0', '\u949f\u58f0', '\u95e8\u94c3', '\u67aa\u58f0', '\u7206\u70b8\u58f0',
]);
const BASIC_SOUND_EFFECT_RE = /^(?:[\u554a\u5440\u54ce\u545f\u55ef\u54fc\u54c8\u5636\u549a\u8f70\u556a\u5494\u55e1]{1,4}|\u6ef4\u7b54|\u6c99\u6c99|\u547c\u547c|\u545c\u545c|\u53ee|\u94db|\u5484\u5693|\u8f70\u9686|\u5486\u549a|\u7800|\u5667|\u54d7\u5566|\u7c0c\u7c0c)$/u;
const DIALOGUE_CONTENT_HINT_RE = /(?:\u6211\u4eec|\u4f60\u4eec|\u4ed6\u4eec|[\u6211\u4f60\u4ed6\u5979\u5b83\u54b1]|\u5417|\u5427|\u5462|\u554a|\u5440|\u54fc|\u54c8|\u54e6|[?!\uFF1F\uFF01])/;
const NON_DIALOGUE_SHORT_TERM_RE = /^[\u4e00-\u9fa5A-Za-z0-9\u00B7\-_.]{1,16}$/;
const NON_DIALOGUE_QUOTE_CONTEXT_RE = /(牌匾|匾额|招牌|牌子|店名|门头|店铺|字号|名为|称为|叫做|名号|称号|头衔|代号|绰号|外号|组织|势力|门派|帮会|宗门|法器|兵器|令牌|符文|咒文|口令|咒语|信中|信里|信上|书信|信笺|纸条|纸上|手札|手记|日记|遗书|标题|篇名|章节|章名|段名|字样|措辞|用词|一词|一字|二字|两字|三字|四字|这句话|这两个字|这几个字|这个词|这个字|招式|招数|绝技|秘技|秘法|功法|心法|法诀|术式|术语|概念|内心|心里|心声|心念|心想|暗想|想着|脑海|念头|独白|默念|默想|风声|雨声|雷声|回声|铃声|钟声|脚步声|爆炸声|轰鸣|嗡鸣|滴答|沙沙)/;
const NON_DIALOGUE_QUOTE_BEFORE_RE = /(这|那|所谓|所谓的)\s*$/;
const NON_DIALOGUE_QUOTE_AFTER_RE = /^\s*(?:二字|两字|两个字|这两个字|三个字|四个字|这几个字|这句话|这个词|一词|这个字|字样|称号|名号|头衔|标题|篇名|章节|章名|招式|绝技|秘技|秘法|功法|心法|法诀|术式)/;
const TEXTUAL_CHAR_RE = /[\p{L}\p{N}\u4e00-\u9fff]/u;

const STANDALONE_NOISE_RE = /^[，,。！？!?、…—\-；;：:\u3000\s“”「」『』"'()（）《》【】\[\]·.]+$/;
const STANDALONE_TAIL_TOKEN_RE = /^(?:吧|呢|啊|呀|嘛|哼|唔|呃|嗯)$/;
const STANDALONE_QUOTED_TERM_RE = /^[“「『"]([^”」』"]{1,16})[”」』"]$/;

function mergeStandaloneNoiseSegments(segments: TextSegment[]): TextSegment[] {
  const merged: TextSegment[] = [];
  let pendingPrefix = '';

  const isNoise = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return true;
    if (STANDALONE_NOISE_RE.test(trimmed)) return true;
    if (trimmed.length <= 2 && STANDALONE_TAIL_TOKEN_RE.test(trimmed)) return true;

    // “看” / “太后” / “内务府” 这类强调性引用，如果单独成段会让旁白朗读断裂；合并回相邻旁白更自然
    const quoted = trimmed.match(STANDALONE_QUOTED_TERM_RE);
    if (quoted?.[1]) {
      const inner = quoted[1].trim();
      if (inner.length <= 6 && NON_DIALOGUE_SHORT_TERM_RE.test(inner) && !DIALOGUE_CONTENT_HINT_RE.test(inner)) {
        return true;
      }
    }
    return false;
  };

  for (const seg of segments) {
    const trimmed = seg.text.trim();
    if (!trimmed) continue;

    if (isNoise(trimmed)) {
      if (merged.length > 0) {
        merged[merged.length - 1].text += trimmed;
      } else {
        pendingPrefix += trimmed;
      }
      continue;
    }

    const nextText = pendingPrefix ? `${pendingPrefix}${trimmed}` : trimmed;
    pendingPrefix = '';
    merged.push({ ...seg, text: nextText });
  }

  return merged;
}

function mergeConsecutiveNarrations(segments: TextSegment[]): TextSegment[] {
  const merged: TextSegment[] = [];
  for (const seg of segments) {
    const last = merged.length > 0 ? merged[merged.length - 1] : undefined;
    if (
      last
      && last.type === 'narration'
      && seg.type === 'narration'
      && last.paragraphIndex === seg.paragraphIndex
    ) {
      last.text += seg.text;
      continue;
    }
    merged.push({ ...seg });
  }
  return merged;
}

const FEMALE_HINTS = [
  '她', '姑娘', '小姐', '夫人', '太后', '皇后', '公主', '娘娘', '姐姐', '妹妹', '阿姨', '妈妈',
];
const MALE_HINTS = [
  '他', '公子', '将军', '元帅', '皇帝', '王爷', '哥哥', '弟弟', '叔', '伯', '父亲', '爸爸',
];

function normalizeName(name: string): string {
  let result = name.trim();
  for (const prefix of TITLE_PREFIXES) {
    if (result.startsWith(prefix) && result.length > prefix.length) {
      result = result.slice(prefix.length);
      break;
    }
  }
  return result.trim();
}

function isInvalidSpeakerToken(name: string): boolean {
  const trimmed = name.trim();
  const normalized = trimmed.replace(/\s+/g, '');
  if (!trimmed) return true;
  if (trimmed.length > 20) return true;
  if (BASIC_NON_HUMAN_SPEAKERS.has(normalized)) return true;
  if (BASIC_SOUND_EFFECT_RE.test(normalized)) return true;
  if (/^[\p{P}\p{S}_]+$/u.test(trimmed)) return true;
  if (/^\d+$/.test(trimmed)) return true;
  if (/^[A-Za-z]{1,2}$/.test(trimmed)) return true;
  return false;
}

function isLikelySoundEffect(text: string): boolean {
  const normalized = text
    .replace(/[，。！？!?、…—\-\s]/g, '')
    .trim();
  if (!normalized) return false;
  if (normalized.length <= 4 && SOUND_EFFECT_RE.test(normalized)) return true;
  if (/^(轰|砰|啪|咚|咔嚓|嗡|沙沙|滴答|叮咚|嘶|呼|咻|嘭)+$/.test(normalized)) return true;
  return false;
}

function isLikelyDialogueContentV2(inner: string): boolean {
  const text = inner.trim();
  if (!text) return false;
  // 台词通常会包含句末标点（短台词也一样）
  if (/[。！？!?…]/.test(text)) return true;
  if (DIALOGUE_CONTENT_HINT_RE.test(text)) return true;
  if (text.length >= 20) return true;
  if (/[，,。；：:]/.test(text) && text.length >= 8) return true;
  return false;
}

function isLikelyNonDialogueQuoteV2(
  inner: string,
  before: string,
  after: string,
  hasExplicitSpeakerEvidence: boolean,
  inferredFromParagraphSpeaker: boolean,
): boolean {
  const context = `${before}${after}`;
  if (NON_DIALOGUE_QUOTE_CONTEXT_RE.test(context)) return true;

  if (NON_DIALOGUE_QUOTE_BEFORE_RE.test(before.trimEnd())) return true;
  if (NON_DIALOGUE_QUOTE_AFTER_RE.test(after.trimStart())) return true;

  const normalizedInner = inner.trim();
  if (!normalizedInner) return true;
  if (isLikelySoundEffect(normalizedInner)) return true;

  if (hasExplicitSpeakerEvidence) return false;

  const looksLikeDialogue = isLikelyDialogueContentV2(normalizedInner);
  const isShortTerm = normalizedInner.length <= 12 && NON_DIALOGUE_SHORT_TERM_RE.test(normalizedInner);
  const containsPronoun = /[我你他她它咱]/.test(normalizedInner);

  // 处理“上一句台词已确定说话人 → 下一段/下一句用引号强调一个词”的场景：
  // 例如：他皱眉。这“看”东西，果然耗神。
  // 这种不应继承为对话，否则会导致对话/旁白分段断裂。
  if (inferredFromParagraphSpeaker) {
    if (
      normalizedInner.length <= 6
      && NON_DIALOGUE_SHORT_TERM_RE.test(normalizedInner)
      && !DIALOGUE_CONTENT_HINT_RE.test(normalizedInner)
    ) {
      return true;
    }
  }

  // AI 常用：用引号强调单词/短语（非“说话”），容易被误判为对话，导致 TTS 旁白被打断
  // 仅在“嵌在叙述句中”且没有明显的“冒号引出说话”时，激进一些把短引号内容按旁白处理
  //
  // 例如：这“看”东西，果然耗神。 / 他把“无敌！”二字咬得很重。
  const hasColonBeforeQuote = /[：:]\s*$/.test(before);
  const isEmbeddedInNarration = TEXTUAL_CHAR_RE.test(before.slice(-10)) && TEXTUAL_CHAR_RE.test(after.slice(0, 10));
  if (!hasColonBeforeQuote && isEmbeddedInNarration) {
    if (isShortTerm && !containsPronoun) return true;
    if (looksLikeDialogue && normalizedInner.length <= 10 && !containsPronoun) return true;
  }

  if (looksLikeDialogue) return false;
  if (NON_DIALOGUE_SHORT_TERM_RE.test(normalizedInner)) return true;
  if (normalizedInner.length <= 18) return true;

  return false;
}

function inferGenderFromContext(context: string, speaker?: string): 'male' | 'female' | undefined {
  const text = `${context}${speaker ?? ''}`;
  if (FEMALE_HINTS.some(h => text.includes(h))) return 'female';
  if (MALE_HINTS.some(h => text.includes(h))) return 'male';
  return undefined;
}

function findCharacterId(speakerName: string, characters: CharacterRef[]): string | undefined {
  const target = speakerName.trim();
  if (!target) return undefined;
  const normalizedTarget = normalizeName(target);

  // 1) 精确名称 / 别名匹配
  for (const char of characters) {
    if (char.name === target) return char.id;
    if (char.aliases.includes(target)) return char.id;
  }

  // 2) 标准化后匹配
  for (const char of characters) {
    if (normalizeName(char.name) === normalizedTarget) return char.id;
    if (char.aliases.some(alias => normalizeName(alias) === normalizedTarget)) return char.id;
  }

  // 3) 模糊匹配（长度差最小）
  let best: { id: string; diff: number } | undefined;
  for (const char of characters) {
    const candidates = [char.name, ...char.aliases];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (candidate.includes(target) || target.includes(candidate)) {
        const diff = Math.abs(candidate.length - target.length);
        if (!best || diff < best.diff) best = { id: char.id, diff };
      }
      const n = normalizeName(candidate);
      if (n && (n.includes(normalizedTarget) || normalizedTarget.includes(n))) {
        const diff = Math.abs(n.length - normalizedTarget.length);
        if (!best || diff < best.diff) best = { id: char.id, diff };
      }
    }
  }
  return best?.id;
}

function extractSpeakerBefore(beforeText: string): { speaker?: string; verb?: string } {
  const match = beforeText.match(SPEAKER_BEFORE_RE);
  if (!match) return {};
  const speaker = match[1]?.trim() ?? '';
  if (!speaker || isInvalidSpeakerToken(speaker)) return {};
  return { speaker, verb: match[2] };
}

function extractSpeakerAfter(afterText: string): { speaker?: string } {
  const match = afterText.match(SPEAKER_AFTER_RE);
  if (!match) return {};
  const speaker = match[1]?.trim() ?? '';
  if (!speaker || isInvalidSpeakerToken(speaker)) return {};
  return { speaker };
}

/** 清理 Markdown 标记，避免 TTS 朗读出格式符号 */
function sanitizeTextForTTS(text: string): string {
  let result = text;
  result = result.replace(/!\[([^\]]*?)\]\([^)]+?\)/g, '$1');
  result = result.replace(/\[([^\]]+?)\]\([^)]+?\)/g, '$1');
  result = result.replace(/`{1,3}([^`]+?)`{1,3}/g, '$1');
  result = result.replace(/~~([^~]+?)~~/g, '$1');
  result = result.replace(/\*\*([^*]+?)\*\*/g, '$1');
  result = result.replace(/__([^_]+?)__/g, '$1');
  result = result.replace(/\*([^*\n]+?)\*/g, '$1');
  result = result.replace(/_([^_\n]+?)_/g, '$1');
  result = result.replace(/\*{2,}/g, '');
  result = result.replace(/_{2,}/g, '');
  return result.replace(/ {2,}/g, ' ').trim();
}

/**
 * 预处理：确保 (#角色名) 标记与其对应的对话处于同一段落。
 *
 * 处理三种常见 AI 生成格式：
 * 1. 标记独立成行：  `(#角色)\n"对话"` → 合并到下一段开头
 * 2. 标记在段尾：    `他说：(#角色)\n"对话"` → 提取标记，移到下一段开头
 * 3. 标记在段中间：  `(#角色)"对话"` → 已在同一段，无需处理
 */
function mergeStandaloneSpeakerMarkers(paragraphs: string[]): string[] {
  const STANDALONE_MARKER_RE = /^[\s]*[\(\uFF08]\s*#\s*[^()\uFF08\uFF09\n]+?\s*[\)\uFF09][\s]*$/;
  /** 匹配段落末尾的 (#角色名) 标记（可能前面有正文） */
  const TRAILING_MARKER_RE = /^(.+?)\s*([\(\uFF08]\s*#\s*[^()\uFF08\uFF09\n]+?\s*[\)\uFF09])\s*$/;
  const merged: string[] = [];
  let pendingMarker = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // 情况 1：整行只有标记
    if (STANDALONE_MARKER_RE.test(trimmed)) {
      pendingMarker += (pendingMarker ? ' ' : '') + trimmed;
      continue;
    }

    // 情况 2：段落末尾有标记，前面是正文
    // 例如 "他看向陈五：(#赵大海)" → 正文 "他看向陈五：" + 标记 "(#赵大海)"
    const trailingMatch = trimmed.match(TRAILING_MARKER_RE);
    if (trailingMatch) {
      const textPart = trailingMatch[1].trim();
      const markerPart = trailingMatch[2];

      // 检查这段正文本身是否包含对话引号 — 如果有，标记是给本段对话用的，不要拆走
      DIALOGUE_RE.lastIndex = 0;
      const hasDialogue = DIALOGUE_RE.test(textPart);
      DIALOGUE_RE.lastIndex = 0;

      if (!hasDialogue) {
        // 正文部分作为独立段落
        if (pendingMarker) {
          merged.push(`${pendingMarker} ${textPart}`);
          pendingMarker = '';
        } else {
          merged.push(textPart);
        }
        // 标记暂存，等待与下一段合并
        pendingMarker += (pendingMarker ? ' ' : '') + markerPart;
        continue;
      }
    }

    if (pendingMarker) {
      merged.push(`${pendingMarker} ${trimmed}`);
      pendingMarker = '';
    } else {
      merged.push(trimmed);
    }
  }

  // 尾部残留的孤立标记（后面没有段落了），丢弃即可
  return merged;
}

/**
 * 解析章节正文，拆分为旁白和对话 segments。
 */
export function parseChapterText(content: string, characters: CharacterRef[]): TextSegment[] {
  const segments: TextSegment[] = [];
  const paragraphs = mergeStandaloneSpeakerMarkers(content.split(/\n+/));

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx].trim();
    if (!para) continue;
    if (/^[\s*\-—=·.。]+$/.test(para)) continue;

    const dialogueMatches: Array<{
      start: number;
      end: number;
      inner: string;
      raw: string;
    }> = [];

    DIALOGUE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = DIALOGUE_RE.exec(para)) !== null) {
      const open = match[1];
      const close = match[3];
      if (!OPEN_QUOTES.includes(open as (typeof OPEN_QUOTES)[number])) continue;
      if (!CLOSE_QUOTES.includes(close as (typeof CLOSE_QUOTES)[number])) continue;
      dialogueMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        inner: match[2],
        raw: match[0],
      });
    }

    if (dialogueMatches.length === 0) {
      segments.push({ type: 'narration', text: para, paragraphIndex: pIdx });
      continue;
    }

    let lastIndex = 0;
    let paragraphSpeaker: string | undefined;

    for (const dm of dialogueMatches) {
      if (dm.start > lastIndex) {
        const narration = para.slice(lastIndex, dm.start).trim();
        if (narration) {
          segments.push({ type: 'narration', text: narration, paragraphIndex: pIdx });
        }
      }

      const beforeDialogue = para.slice(Math.max(0, dm.start - 48), dm.start);
      const afterDialogue = para.slice(dm.end, Math.min(para.length, dm.end + 40));

      let speaker: string | undefined;
      let speakerVerb: string | undefined;
      let hasExplicitSpeakerEvidence = false;

      const marker = beforeDialogue.match(SPEAKER_MARKER_BEFORE_RE);
      if (marker) {
        const candidate = marker[1]?.trim() ?? '';
        if (!isInvalidSpeakerToken(candidate)) {
          speaker = candidate;
          hasExplicitSpeakerEvidence = true;
        }
      }

      // 兜底：如果标记不在引号前紧贴位置，取窗口内最后一个有效标记
      if (!speaker) {
        let markerMatch: RegExpExecArray | null;
        let lastMarker: string | undefined;
        const markerRe = /[\(\uFF08]\s*#\s*([^()\uFF08\uFF09\n]+?)\s*[\)\uFF09]/g;
        while ((markerMatch = markerRe.exec(beforeDialogue)) !== null) {
          const candidate = markerMatch[1]?.trim() ?? '';
          if (!isInvalidSpeakerToken(candidate)) {
            lastMarker = candidate;
          }
        }
        if (lastMarker) {
          speaker = lastMarker;
          hasExplicitSpeakerEvidence = true;
        }
      }

      if (!speaker) {
        const before = extractSpeakerBefore(beforeDialogue);
        speaker = before.speaker;
        speakerVerb = before.verb;
        if (before.speaker) hasExplicitSpeakerEvidence = true;
      }

      if (!speaker) {
        const after = extractSpeakerAfter(afterDialogue);
        speaker = after.speaker;
        if (after.speaker) hasExplicitSpeakerEvidence = true;
      }

      if (!speaker && paragraphSpeaker) {
        speaker = paragraphSpeaker;
      }

      let characterId = speaker ? findCharacterId(speaker, characters) : undefined;
      if (!characterId && speaker) {
        const normalized = normalizeName(speaker);
        if (normalized !== speaker) {
          characterId = findCharacterId(normalized, characters);
          if (characterId) speaker = normalized;
        }
      }

      const genderHint = inferGenderFromContext(`${beforeDialogue}${afterDialogue}`, speaker);
      const inferredFromParagraphSpeaker = Boolean(speaker)
        && !hasExplicitSpeakerEvidence
        && Boolean(paragraphSpeaker)
        && speaker === paragraphSpeaker;
      const nonDialogueQuote = isLikelyNonDialogueQuoteV2(
        dm.inner,
        beforeDialogue,
        afterDialogue,
        hasExplicitSpeakerEvidence,
        inferredFromParagraphSpeaker,
      );

      // 非人物发言场景降级为旁白，避免被 TTS 当成对话
      if (
        nonDialogueQuote
        || (!characterId && !hasExplicitSpeakerEvidence && isLikelySoundEffect(dm.inner))
      ) {
        segments.push({
          type: 'narration',
          text: dm.raw,
          paragraphIndex: pIdx,
        });
      } else {
        segments.push({
          type: 'dialogue',
          text: dm.inner,
          speaker,
          characterId,
          genderHint,
          speakerVerb,
          paragraphIndex: pIdx,
        });
        if (speaker) paragraphSpeaker = speaker;
      }

      lastIndex = dm.end;
    }

    if (lastIndex < para.length) {
      const tail = para.slice(lastIndex).trim();
      if (tail) {
        segments.push({ type: 'narration', text: tail, paragraphIndex: pIdx });
      }
    }
  }

  // 清理残留说话人标记，避免 TTS 朗读标记符号
  for (const seg of segments) {
    seg.text = sanitizeTextForTTS(seg.text.replace(SPEAKER_MARKER_RE, '').trim());
  }

  // 合并“标点/语气词单独成段”的噪音段落，避免 TTS 生成大量 0 信息片段导致播放队列异常
  const cleaned = mergeStandaloneNoiseSegments(segments);
  const compact = mergeConsecutiveNarrations(cleaned);
  return compact.filter(seg => seg.text.length > 0);
}

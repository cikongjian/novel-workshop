import type { SpeakerBackfillCharacter } from './speaker-backfill-character-support.js';

export function createMarkerNormalizers(
  characters: SpeakerBackfillCharacter[],
  nameNormMap: Map<string, string>,
  hasCharacterProfiles: boolean,
): {
  normalizeMarkers: (text: string) => string;
  fillMissingMarkers: (text: string) => string;
} {
  function normalizeMarkers(text: string): string {
    return text.replace(/[\(\uFF08]\s*#\s*([^()\uFF08\uFF09\n]+?)\s*[\)\uFF09]/g, (_match: string, name: string) => {
      const trimmedName = name.trim();
      if (characters.some(character => character.name === trimmedName)) {
        return `(#${trimmedName})`;
      }
      const canonical = nameNormMap.get(trimmedName);
      if (canonical) {
        return `(#${canonical})`;
      }
      const fuzzyMatch = characters.find(character => character.name.includes(trimmedName));
      if (fuzzyMatch) {
        return `(#${fuzzyMatch.name})`;
      }
      return `(#${trimmedName})`;
    });
  }

  function fillMissingMarkers(text: string): string {
    const SPEAKER_VERB =
      '(说道|说|道|喊道|低声道|冷笑道|问道|答道|叫道|笑道|怒道|叹道|嘀咕道|沉声道|轻声道|大声道|冷声道|淡淡道|微笑道|苦笑道|惊呼道|呢喃道|咆哮道|嘲讽道|感叹道|追问道|反问道|质问道|回答道|解释道|提议道|建议道|命令道|吩咐道|央求道|恳求道|威胁道|警告道|安慰道|鼓励道|赞叹道|惊叹道|附和道|插嘴道|补充道|纠正道|反驳道|争辩道|嘟囔道|咕哝道|低语道|耳语道|高声道|厉声道|柔声道|哽咽道|颤声道|嗤笑道|讥讽道|调侃道|打趣道|开口|接话|应道|回应|插嘴)';
    const SPEAKER_VERB_RE = new RegExp(`([\\u4e00-\\u9fa5A-Za-z0-9\u00B7]{1,16})${SPEAKER_VERB}[\uFF1A:，,]?\\s*$`);
    const AFTER_SPEAKER_RE = new RegExp(`^\\s*([\\u4e00-\\u9fa5A-Za-z0-9\u00B7]{1,16})${SPEAKER_VERB}[\uFF1A:，,]?`);
    const AFTER_ACTION_RE = /^\s*([\u4e00-\u9fa5A-Za-z0-9\u00B7]{1,16})(?:[，,、]?(?:微微一笑|轻笑|苦笑|点头|摇头|沉默|抬手|抬眸|叹气|皱眉|眯眼|冷哼))/;
    const OPEN_QUOTE_RE = /["\u300C\u300E\u201C]/g;
    const CLOSE_QUOTE_MAP: Record<string, string> = {
      '\u201C': '\u201D',
      '\u300C': '\u300D',
      '\u300E': '\u300F',
      '"': '\u201D',
    };
    const NON_HUMAN_RE = /(风声|雨声|雷声|水声|脚步声|钟声|门响|枪声|刀鸣|剑鸣|铃声|笑声|哭声|叹息|低吼|咆哮|回声|掌声|轰鸣|爆炸声|提示音|广播声|机械音|电子音|警报声)/;
    const INVALID_SPEAKERS = new Set([
      '他', '她', '它', '他们', '她们', '众人', '所有人', '有人', '声音', '旁白', '系统',
    ]);
    const allowOpenSpeakerMode = !hasCharacterProfiles;

    function resolveCharName(raw: string): string | undefined {
      const trimmed = raw.trim();
      const exact = characters.find(character => character.name === trimmed);
      if (exact) return exact.name;
      const canonical = nameNormMap.get(trimmed);
      if (canonical) return canonical;
      const fuzzy = characters.find(character => character.name.includes(trimmed) || trimmed.includes(character.name));
      if (fuzzy) return fuzzy.name;
      for (const character of characters) {
        if (character.aliases.includes(trimmed)) return character.name;
      }
      return undefined;
    }

    function isValidSpeakerToken(token: string): boolean {
      const normalized = token.trim();
      if (!normalized) return false;
      if (INVALID_SPEAKERS.has(normalized)) return false;
      if (/^[\d\p{P}\p{S}]+$/u.test(normalized)) return false;
      if (NON_HUMAN_RE.test(normalized)) return false;
      return true;
    }

    function resolveSpeaker(raw: string | undefined): string | undefined {
      if (!raw || !isValidSpeakerToken(raw)) return undefined;
      const canonical = resolveCharName(raw);
      if (canonical) return canonical;
      if (!allowOpenSpeakerMode) return undefined;
      return raw.trim();
    }

    function findCloseQuoteIndex(line: string, openIdx: number, openChar: string): number {
      const closeChar = CLOSE_QUOTE_MAP[openChar] ?? '\u201D';
      return line.indexOf(closeChar, openIdx + 1);
    }

    function pickNearestSpeaker(
      lineMarkers: Array<{ pos: number; speaker: string }>,
      quoteIdx: number,
    ): string | undefined {
      const beforeMarkers = lineMarkers.filter(marker => marker.pos <= quoteIdx);
      if (beforeMarkers.length > 0) {
        return beforeMarkers[beforeMarkers.length - 1].speaker;
      }
      if (lineMarkers.length > 0) {
        return lineMarkers[0].speaker;
      }
      return undefined;
    }

    const lines = text.split('\n');
    const result: string[] = [];
    for (const line of lines) {
      OPEN_QUOTE_RE.lastIndex = 0;
      if (!OPEN_QUOTE_RE.test(line)) {
        result.push(line);
        continue;
      }
      OPEN_QUOTE_RE.lastIndex = 0;

      let processed = '';
      let lastIdx = 0;
      let lastKnownSpeaker: string | undefined;

      const existingMarkerRe = /[\(\uFF08]\s*#\s*([^()\uFF08\uFF09\n]+?)\s*[\)\uFF09]/g;
      let markerMatch: RegExpExecArray | null;
      const lineMarkers: Array<{ pos: number; speaker: string }> = [];
      while ((markerMatch = existingMarkerRe.exec(line)) !== null) {
        const resolved = resolveSpeaker(markerMatch[1]);
        if (resolved) {
          lineMarkers.push({ pos: markerMatch.index, speaker: resolved });
        }
      }

      let quoteMatch: RegExpExecArray | null;
      while ((quoteMatch = OPEN_QUOTE_RE.exec(line)) !== null) {
        const quoteIdx = quoteMatch.index;
        const openQuoteChar = quoteMatch[0];
        const beforeQuote = line.slice(Math.max(0, quoteIdx - 60), quoteIdx);
        const hasMarker = /[\(\uFF08]\s*#\s*[^()\uFF08\uFF09\n]+?\s*[\)\uFF09]\s*$/.test(beforeQuote);

        if (hasMarker) {
          const existingMatch = beforeQuote.match(/[\(\uFF08]\s*#\s*([^()\uFF08\uFF09\n]+?)\s*[\)\uFF09]\s*$/);
          if (existingMatch) {
            const resolved = resolveSpeaker(existingMatch[1]);
            if (resolved) lastKnownSpeaker = resolved;
          }
          processed += line.slice(lastIdx, quoteIdx + 1);
        } else {
          let speaker: string | undefined;
          const beforeMatch = beforeQuote.match(SPEAKER_VERB_RE);
          if (beforeMatch) {
            speaker = resolveSpeaker(beforeMatch[1]);
          }

          if (!speaker) {
            const closeQuoteIdx = findCloseQuoteIndex(line, quoteIdx, openQuoteChar);
            if (closeQuoteIdx > quoteIdx) {
              const afterQuote = line.slice(closeQuoteIdx + 1, closeQuoteIdx + 80);
              const afterMatch = afterQuote.match(AFTER_SPEAKER_RE) ?? afterQuote.match(AFTER_ACTION_RE);
              if (afterMatch) {
                speaker = resolveSpeaker(afterMatch[1]);
              }
            }
          }

          if (!speaker) {
            speaker = pickNearestSpeaker(lineMarkers, quoteIdx) ?? lastKnownSpeaker;
          }

          if (speaker) {
            lastKnownSpeaker = speaker;
            processed += line.slice(lastIdx, quoteIdx) + `(#${speaker})${openQuoteChar}`;
          } else {
            processed += line.slice(lastIdx, quoteIdx + 1);
          }
        }

        lastIdx = quoteIdx + 1;
      }

      processed += line.slice(lastIdx);
      result.push(processed);
    }
    return result.join('\n');
  }

  return { normalizeMarkers, fillMissingMarkers };
}

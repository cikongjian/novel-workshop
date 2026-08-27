type PatternState = {
  openingTypes: string[];
  hookTypes: string[];
};

const MAX_CACHE_ITEMS = 8;

function inferOpeningType(content: string): string {
  const head = content.slice(0, 180);
  if (/^[^\n]{0,20}(阳光|月光|晨光|暮色|夜色|天色|风|雨|雪|雾|云|霞|星|清晨|黄昏|傍晚|深夜)/.test(head)) {
    return '环境开头';
  }
  if (/^[^\n]{0,15}(猛地|一把|飞身|拔出|冲|扑|闪|挡|砸|踢|抓)/.test(head)) {
    return '动作开头';
  }
  if (/^[^\n]{0,8}(?:\(#.+?\))?[“"]/.test(head)) {
    return '对话开头';
  }
  if (/^[^\n]{0,20}(刺痛|灼热|冰冷|腥味|恶臭|轰鸣|尖啸|刺耳)/.test(head)) {
    return '感官开头';
  }
  return '叙述开头';
}

function inferHookType(content: string): string {
  const tail = content.slice(-220);
  if (/悬念|秘密|真相|谜|线索|未解/.test(tail)) return '悬念钩子';
  if (/反转|竟然|没想到|原来|出乎意料/.test(tail)) return '反转钩子';
  if (/威胁|危机|危险|追杀|倒计时|失控/.test(tail)) return '危机钩子';
  if (/选择|抉择|取舍|站队|必须决定/.test(tail)) return '抉择钩子';
  return '叙述钩子';
}

function pushLimited(list: string[], item: string): string[] {
  const next = [...list, item];
  if (next.length <= MAX_CACHE_ITEMS) return next;
  return next.slice(next.length - MAX_CACHE_ITEMS);
}

export class NarrativePatternCache {
  private states = new Map<string, PatternState>();

  recordChapter(novelId: string, chapterContent: string): void {
    if (!novelId || !chapterContent.trim()) return;
    const prev = this.states.get(novelId) ?? { openingTypes: [], hookTypes: [] };
    const openingType = inferOpeningType(chapterContent);
    const hookType = inferHookType(chapterContent);
    this.states.set(novelId, {
      openingTypes: pushLimited(prev.openingTypes, openingType),
      hookTypes: pushLimited(prev.hookTypes, hookType),
    });
  }

  buildHints(novelId: string): { openingHint: string; hookHint: string } {
    const state = this.states.get(novelId);
    if (!state) return { openingHint: '', hookHint: '' };

    const recentOpenings = state.openingTypes.slice(-3);
    const recentHooks = state.hookTypes.slice(-3);
    const openingHint = recentOpenings.length >= 2 && recentOpenings.every(item => item === recentOpenings[0])
      ? `轮换缓存提示：你最近连续使用「${recentOpenings[0]}」，本章开头请换型。`
      : '';
    const hookHint = recentHooks.length >= 2 && recentHooks.every(item => item === recentHooks[0])
      ? `轮换缓存提示：你最近连续使用「${recentHooks[0]}」，本章章末请改用不同钩子。`
      : '';

    return { openingHint, hookHint };
  }
}


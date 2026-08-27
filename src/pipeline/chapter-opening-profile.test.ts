import { describe, expect, it } from 'vitest';

import { buildUnifiedOpeningDirection, DEFAULT_OPENING_CHAPTER_WORD_COUNT, resolveChapterOneOpeningProfile } from './chapter-opening-profile.js';
import type { ShuangwenBlueprint } from './shuangwen-types.js';

const blueprint: ShuangwenBlueprint = {
  audience: 'female',
  genre: 'romance',
  identifiedSellingPoint: '协议婚姻里的身份反差与先婚后爱拉扯',
  titleCandidates: ['和死对头协议结婚后，他先动心了'],
  logline: '协议婚姻，先婚后爱。',
  synopsis: '商业对手被迫联姻，关系持续升温。',
  tags: ['先婚后爱'],
  hook: {
    openingScene: '在俱乐部当面递上婚姻协议',
    incitingIncident: '家族信托要求立刻结婚',
    firstPayoff: '男主当场签字，关系正式绑定',
    chapterEndHookRule: '章末要落到具体同居或公开绑定场景',
  },
  protagonist: {
    name: '沈知微',
    archetype: '清醒女总裁',
    goal: '保住公司',
    flaw: '过度控制',
  },
  antagonist: {
    name: '陆景珩',
    archetype: '冷面资本对手',
    threat: '掌控资源',
  },
  engine: {
    cycleFormula: '压迫-交易-绑定-心动',
    escalationRule: '每次绑定后都抬高关系成本',
    constraints: ['先交易后情感'],
  },
  styleGuide: '短句，强对话，绑定要快。',
  forbidden: ['长时间误会拖延'],
};

describe('resolveChapterOneOpeningProfile', () => {
  it('applies the unified chapter-one opening profile when blueprint exists', () => {
    const profile = resolveChapterOneOpeningProfile({
      chapterNumber: 1,
      blueprint,
      userDirection: '保留女主先提出协议这件事。',
    });

    expect(profile.applied).toBe(true);
    expect(profile.maxWordCount).toBe(DEFAULT_OPENING_CHAPTER_WORD_COUNT);
    expect(profile.styleNotes).toContain(blueprint.styleGuide);
    expect(profile.userDirection).toContain('保留女主先提出协议这件事。');
    expect(profile.userDirection).toContain(blueprint.hook.firstPayoff);
    expect(profile.userDirection).toContain('前 65%-75% 篇幅内');
  });

  it('keeps explicit limits and skips non-chapter-one requests', () => {
    const profile = resolveChapterOneOpeningProfile({
      chapterNumber: 2,
      blueprint,
      userDirection: '继续推进同居磨合。',
      styleNotes: '控制在轻喜风。',
      maxWordCount: 2600,
    });

    expect(profile.applied).toBe(false);
    expect(profile.userDirection).toBe('继续推进同居磨合。');
    expect(profile.styleNotes).toBe('控制在轻喜风。');
    expect(profile.maxWordCount).toBe(2600);
  });

  it('uses the platform chapter target instead of the legacy short opening target', () => {
    expect(DEFAULT_OPENING_CHAPTER_WORD_COUNT).toBe(3000);
  });
});

describe('buildUnifiedOpeningDirection', () => {
  it('requires a concrete hook instead of a vague ending mood', () => {
    const direction = buildUnifiedOpeningDirection({ blueprint });

    expect(direction).toContain('具体的人、事、任务、到来、选择或新结果');
    expect(direction).toContain('新增内容必须换一个维度推进');
    expect(direction).toContain('只完成一轮主目标推进');
  });
});

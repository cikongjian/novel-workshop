import { describe, expect, it } from 'vitest';
import { CharacterProfile, type Chapter } from '../novel/types.js';
import {
  applyCharacterStatusReconciliation,
  findCharacterResurrectionConflicts,
  planCharacterStatusReconciliation,
} from './character-status-reconciliation.js';

function character(tags = ['auto-extracted', 'auto-core']): CharacterProfile {
  return CharacterProfile.parse({
    id: '11111111-1111-4111-8111-111111111111',
    name: '王厉',
    aliases: [],
    role: 'deuteragonist',
    tags,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
  });
}

function chapter(content: string, chapterNumber = 1): Chapter {
  return {
    novelId: 'novel-1',
    chapterNumber,
    title: '反杀',
    summary: '',
    content,
    wordCount: content.length,
    status: 'finalized',
    agentComments: [],
    revisionCount: 0,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
  };
}

describe('character status reconciliation', () => {
  it('backfills confirmed deaths after the character has been auto-created', () => {
    const plans = planCharacterStatusReconciliation({
      characters: [character()],
      chapters: [chapter('王厉倒在地上不动了。围观者喊道：“王厉死了！”')],
    });

    expect(plans).toEqual([
      expect.objectContaining({ name: '王厉', nextStatus: 'dead', nextRole: 'minor' }),
    ]);
  });

  it('does not blindly mark a character dead when a later chapter actively resurrects them', () => {
    const plans = planCharacterStatusReconciliation({
      characters: [character()],
      chapters: [
        chapter('王厉瞪大眼睛，踉跄着后退。身体抽搐两下便不动了。', 1),
        chapter('王厉推门走进账房，伸手向周元讨要欠款。', 10),
      ],
    });

    expect(plans).toEqual([]);
    expect(findCharacterResurrectionConflicts({
      characters: [character()],
      chapters: [
        chapter('王厉瞪大眼睛，踉跄着后退。身体抽搐两下便不动了。', 1),
        chapter('王厉推门走进账房，伸手向周元讨要欠款。', 10),
      ],
    })).toEqual([
      expect.objectContaining({
        name: '王厉',
        deathChapterNumber: 1,
        appearanceChapterNumber: 10,
      }),
    ]);
  });

  it('still marks a dead character when later chapters only remember them', () => {
    const plans = planCharacterStatusReconciliation({
      characters: [character()],
      chapters: [
        chapter('王厉瞪大眼睛，踉跄着后退。身体抽搐两下便不动了。', 1),
        chapter('周元回忆起王厉当年的威胁，心中再无波澜。', 10),
      ],
    });

    expect(plans).toHaveLength(1);
  });

  it('does not report a resurrection conflict after an explicit revival', () => {
    const chapters = [
      chapter('王厉瞪大眼睛，踉跄着后退。身体抽搐两下便不动了。', 1),
      chapter('王厉被灵丹救活，重新苏醒后推门走出静室。', 5),
      chapter('王厉走进账房，伸手取回旧账册。', 6),
    ];

    expect(findCharacterResurrectionConflicts({ characters: [character()], chapters })).toEqual([]);
    expect(planCharacterStatusReconciliation({ characters: [character()], chapters })).toEqual([]);
  });

  it('restores a dead profile after a later confirmed revival', () => {
    const dead = CharacterProfile.parse({
      ...character(),
      status: 'dead',
      currentState: '[第1章] 正文确认：已死亡。【状态：已死亡】',
    });
    const plans = planCharacterStatusReconciliation({
      characters: [dead],
      chapters: [chapter('王厉被灵丹救活，重新苏醒后推门走出静室。', 5)],
    });

    expect(plans).toEqual([
      expect.objectContaining({ name: '王厉', nextStatus: 'active', chapterNumber: 5 }),
    ]);
  });

  it('uses the later state when death and revival happen in the same chapter', () => {
    const dead = CharacterProfile.parse({
      ...character(),
      status: 'dead',
      currentState: '[第1章] 正文确认：已死亡。【状态：已死亡】',
    });
    const plans = planCharacterStatusReconciliation({
      characters: [dead],
      chapters: [chapter('王厉当场身亡。片刻后，王厉被灵丹救活，重新苏醒。', 5)],
    });

    expect(plans).toEqual([
      expect.objectContaining({ name: '王厉', nextStatus: 'active', chapterNumber: 5 }),
    ]);
  });

  it('removes the active death marker when applying a revival', async () => {
    const dead = CharacterProfile.parse({
      ...character(),
      status: 'dead',
      currentState: '[第1章] 正文确认：已死亡。【状态：已死亡】',
    });
    let saved: CharacterProfile | undefined;
    const novelManager = {
      getCharacters: async () => [dead],
      saveCharacter: async (_novelId: string, next: CharacterProfile) => { saved = next; },
    };

    await applyCharacterStatusReconciliation({
      novelManager: novelManager as never,
      novelId: 'novel-1',
      plans: [{
        characterId: dead.id,
        name: dead.name,
        chapterNumber: 5,
        nextStatus: 'active',
        nextRole: dead.role,
        evidence: '王厉被灵丹救活。',
      }],
    });

    expect(saved?.status).toBe('active');
    expect(saved?.currentState).not.toContain('【状态：已死亡】');
    expect(saved?.currentState).toContain('已复活并恢复活动');
  });

  it('keeps a curated deuteragonist role when the character dies', () => {
    const plans = planCharacterStatusReconciliation({
      characters: [character(['user-curated'])],
      chapters: [chapter('王厉当场身亡。')],
    });

    expect(plans[0]).toEqual(expect.objectContaining({ nextStatus: 'dead', nextRole: 'deuteragonist' }));
  });

  it('does not treat rumored deaths as confirmed state', () => {
    expect(planCharacterStatusReconciliation({
      characters: [character()],
      chapters: [chapter('有人说王厉已经死了，但尸体始终没有找到。')],
    })).toEqual([]);
  });

  it('does not treat a conditional last wish as a confirmed death', () => {
    const chapters = [
      chapter('他写完信后说：“王厉，如果我死了，你替我守三年凉州。”', 1),
      chapter('王厉从队伍前列走出来，抬头回答主帅。', 2),
    ];

    expect(planCharacterStatusReconciliation({ characters: [character()], chapters })).toEqual([]);
    expect(findCharacterResurrectionConflicts({ characters: [character()], chapters })).toEqual([]);
  });

  it('does not report a remembered recording as a resurrection', () => {
    const chapters = [
      chapter('王厉已经死了。', 1),
      chapter('残像转过身来，动作和他记忆里王厉坐在灯下写信时完全一样。', 2),
      chapter('她没有回头：“但你王厉日记第十七页上写了一段话。”', 3),
      chapter('意识回到身体时，他站在王厉的石头房子门口。', 4),
      chapter('他开口，说了一句在王厉和陈冬林的指令中都未出现的话。', 5),
      chapter('她是王厉在十六年前带出来的，那是王厉第一次进入裂隙时发现的回声。', 6),
      chapter('光色和王厉在网吧最后一条消息中出现的红印完全一致。', 7),
    ];

    expect(findCharacterResurrectionConflicts({ characters: [character()], chapters })).toEqual([]);
  });

  it('does not plan deaths from unrelated targets or lexical compounds', () => {
    expect(planCharacterStatusReconciliation({
      characters: [character()],
      chapters: [
        chapter('王厉一拳轰在狼头侧面。年轻狼四肢抽搐两下不动了。', 1),
        chapter('王厉说矿难埋死了两个矿工，又让人封死东路。', 2),
      ],
    })).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import {
  assembleSceneContents,
  buildStartupFunctionalScenePlan,
} from './startup-functional-blocks.js';
import type { Scene } from '../novel/types.js';
import type { ChapterPromiseCard } from './chapter-promise-card.js';
import type { PromiseContract } from './promise-contract.js';

function createScene(sceneNumber: number, content: string): Scene {
  const now = new Date('2026-03-18T00:00:00.000Z').toISOString();
  return {
    id: `scene-${sceneNumber}`,
    sceneNumber,
    title: `scene-${sceneNumber}`,
    summary: '',
    characters: [],
    location: '',
    tension: 5,
    wordTarget: 500,
    wordCount: content.length,
    content,
    status: 'edited',
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

describe('assembleSceneContents', () => {
  it('removes repeated leading paragraphs from later startup scenes', () => {
    const firstScene = createScene(
      1,
      [
        '陆景珩在包厢里放下酒杯，看着沈知微把婚姻协议推到自己面前。',
        '他没有立刻接话，只是抬眼把她从头到脚扫了一遍。',
      ].join('\n\n'),
    );
    const secondScene = createScene(
      2,
      [
        '陆景珩在包厢里放下酒杯，看着沈知微把婚姻协议推到自己面前。',
        '协议签下后，两人直接转去民政局。门口记者已经堵住台阶，闪光灯一片接一片。',
      ].join('\n\n'),
    );

    const assembled = assembleSceneContents([firstScene, secondScene]);

    expect(assembled.match(/婚姻协议推到自己面前/g)?.length ?? 0).toBe(1);
    expect(assembled).toContain('协议签下后，两人直接转去民政局');
  });

  it('removes a later scene that restarts an earlier non-tail beat', () => {
    const firstScene = createScene(
      1,
      [
        '陆景川接过话筒，当众宣布婚礼全网直播。',
        '录音一放出来，全场立刻炸开，陆振华脸色瞬间失去血色。',
        '他冷声问，需要不要现在就去查酒店前台和急性心肌炎的诊断证明。',
        '周董在最关键的时候走进宴会厅，站到了陆景川这一边。',
      ].join('\n\n'),
    );
    const secondScene = createScene(
      2,
      [
        '陆景川冷声问，需要不要现在就去查酒店前台和急性心肌炎的诊断证明。',
        '陆振华的脸色随着每一句话褪去一层血色。',
        '他转而抛出新的审计报告，直接追到三千七百万美元的异常资金。',
      ].join('\n\n'),
    );

    const assembled = assembleSceneContents([firstScene, secondScene]);

    expect(assembled.match(/查酒店前台和急性心肌炎的诊断证明/g)?.length ?? 0).toBe(1);
    expect(assembled).toContain('他转而抛出新的审计报告');
  });
});

describe('buildStartupFunctionalScenePlan', () => {
  function createPromiseContract(): PromiseContract {
    return {
      profileId: 'generic',
      constitutionSignals: ['sweet'],
      mainPromise: '甜宠关系推进',
      secondaryPromises: ['关系拉扯'],
      requiredPayoffKeywords: ['心动', '护短', '靠近'],
      requiredSceneKeywords: ['当面', '同框', '并肩'],
      suspenseDriftKeywords: ['真相', '调查'],
      maxSuspenseShare: 0.3,
      summary: '题材宪法：主承诺=甜宠关系推进。',
    };
  }

  function createRomanceCard(): ChapterPromiseCard {
    return {
      source: 'promise-contract',
      chapterNumber: 1,
      phase: 'startup',
      genreFocus: 'romance',
      mainPromise: '甜宠关系推进',
      chapterMission: '先让男女主同场碰撞，再落一次关系回报。',
      requiredPayoff: {
        label: '心动 / 护短',
        keywords: ['心动', '护短'],
      },
      requiredScene: {
        label: '当面 / 同框',
        keywords: ['当面', '同框'],
      },
      forbiddenSubstitutions: [],
      allowedHookTypes: ['关系型'],
      preferredEndingFocus: ['关系推进的下一步'],
      startupMustLandResult: true,
      summary: 'romance startup card',
      gateSummary: 'gate',
    };
  }

  it('uses relationship-first romance startup blocks instead of business-first defaults', () => {
    const plan = buildStartupFunctionalScenePlan({
      chapterNumber: 1,
      outlineText: '场景1：两人在宴会上正面碰撞\n场景2：被迫同框\n场景3：回到私下关系升温',
      novelTitle: '和死对头同居后，我先动心了',
      novelSynopsis: '两人被迫同居，在日常相处中一路互怼互撩。',
      promiseContract: createPromiseContract(),
      chapterPromiseCard: createRomanceCard(),
      maxWordCount: 2400,
    });

    expect(plan).not.toBeNull();
    expect(plan!.scenes[0]?.summary).toContain('尽快碰撞');
    expect(plan!.scenes[1]?.summary).toContain('公开同框、被迫合作、同居规则确认、签字领证都可以');
    expect(plan!.scenes[1]?.notes).toContain('不要无条件滑向项目谈判');
    expect(plan!.scenes[0]?.location).not.toContain('会议室');
  });
});

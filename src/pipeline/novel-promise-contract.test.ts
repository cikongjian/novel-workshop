import { describe, expect, it } from 'vitest';
import type { NovelConstitution } from '../novel/constitution-types.js';
import { auditGenreDrift } from './genre-drift-audit.js';
import { buildNovelPromiseContract } from './novel-promise-contract.js';

function buildCivilizationConstitution(): NovelConstitution {
  return {
    version: 1,
    sourceDigest: 'civilization-test',
    mainPromise: '教知识获得能力，带领蛮荒部落文明升级并对抗神罚。',
    secondaryPromises: ['教学闭环', '部落进步', '神罚对抗'],
    clauses: [],
    keywords: {
      payoffKeywords: ['教学', '获得能力', '土系异能', '文明升级', '部落进步'],
      sceneKeywords: ['河边制陶', '神兽降临', '部落广场'],
      suspenseDriftKeywords: ['调查', '真相', '秘密', '线索', '幕后'],
      maxSuspenseShare: 0.36,
    },
    generatedAt: '2026-03-17T00:00:00.000Z',
    updatedAt: '2026-03-17T00:00:00.000Z',
  };
}

describe('buildNovelPromiseContract', () => {
  it('uses novel constitution keywords instead of rebuilding from genre only', () => {
    const contract = buildNovelPromiseContract({
      title: '我在蛮荒建了个文明',
      synopsis: '秦墨穿越到蛮荒，教土著知识就能获得力量，并带领部落对抗神罚。',
      tags: [],
      constitutionTags: [],
      genre: 'fantasy',
      startupPlatformProfile: 'auto',
      constitution: buildCivilizationConstitution(),
    });

    expect(contract.profileId).toBe('constitution');
    expect(contract.requiredPayoffKeywords).toContain('教学');
    expect(contract.requiredPayoffKeywords).toContain('土系异能');
    expect(contract.requiredSceneKeywords).toContain('河边制陶');
  });

  it('lets readability drift audit see civilization-upgrade payoff from constitution data', () => {
    const contract = buildNovelPromiseContract({
      title: '我在蛮荒建了个文明',
      synopsis: '秦墨穿越到蛮荒，教土著知识就能获得力量，并带领部落对抗神罚。',
      tags: [],
      constitutionTags: [],
      genre: 'fantasy',
      startupPlatformProfile: 'auto',
      constitution: buildCivilizationConstitution(),
    });

    const report = auditGenreDrift({
      chapterContent: [
        '秦墨在河滩边教学，让阿骨把泥条盘成碗胚，失败三次后终于做成第一只陶碗。',
        '系统提示土系异能增强，部落把清水和肉汤盛进陶碗，第一次不用再把水捧在手里。',
        '灰犬神兽在下游咆哮，秦墨用新掌握的土层感知带人绕开塌陷地，把神罚压力挡在洞外。',
      ].join('\n\n'),
      title: '我在蛮荒建了个文明',
      synopsis: '秦墨穿越到蛮荒，教土著知识就能获得力量，并带领部落对抗神罚。',
      genre: 'fantasy',
      promiseContract: contract,
    });

    expect(report.promiseDrift.promiseHits + report.promiseDrift.sceneHits).toBeGreaterThan(0);
    expect(report.qualityFloorPassed).toBe(true);
  });

  it('keeps food-business card signals when a constitution is present', () => {
    const contract = buildNovelPromiseContract({
      title: '荒年小饭摊，开局一锅酸汤面',
      synopsis: '破庙口支起饭摊，靠酸汤面、试吃反馈、铜板成交、排队复购和小摊升级翻身。',
      tags: [],
      constitutionTags: [],
      genre: 'modern',
      startupPlatformProfile: 'auto',
      constitution: {
        version: 1,
        sourceDigest: 'food-test',
        mainPromise: '美食经营，做菜成交，靠复购升级小摊。',
        secondaryPromises: ['香味反馈', '交易回报'],
        clauses: [],
        keywords: {
          payoffKeywords: ['做菜', '香味', '掏钱'],
          sceneKeywords: ['破庙', '摊位', '灶台'],
          suspenseDriftKeywords: ['真相', '秘密', '线索', '调查'],
          maxSuspenseShare: 0.3,
        },
        generatedAt: '2026-03-17T00:00:00.000Z',
        updatedAt: '2026-03-17T00:00:00.000Z',
      },
    });

    expect(contract.profileId).toBe('constitution');
    expect(contract.constitutionSignals).toContain('food-business');
    expect(contract.requiredPayoffKeywords).toEqual(expect.arrayContaining(['铜板', '试吃', '排队', '复购']));
    expect(contract.requiredSceneKeywords).toEqual(expect.arrayContaining(['锅边', '摊子', '酸汤']));
  });

  it('recognizes campus club comedy scene signals instead of treating modern prose as generic', () => {
    const contract = buildNovelPromiseContract({
      title: '废柴社团今天也要招满人',
      synopsis: '校园轻喜剧，大一新生在招新期接手濒临废社的手作模型社，靠误会笑点、模型技能和同学报名保住社团。',
      tags: [],
      constitutionTags: [],
      genre: 'modern',
      startupPlatformProfile: 'auto',
    });

    expect(contract.constitutionSignals).toContain('campus-club-comedy');
    expect(contract.requiredPayoffKeywords).toEqual(expect.arrayContaining(['招新', '报名', '误会', '保住社团']));
    expect(contract.requiredSceneKeywords).toEqual(expect.arrayContaining(['摊位', '活动室', '登记表', '模型']));

    const report = auditGenreDrift({
      chapterContent: [
        '许知夏站在社团招新摊位前，传单被风吹到桌角，手作模型社没人报名。',
        '她把断掉天线的模型修好，路过的林浅笑出声，误会她已经是社长。',
        '两人进了活动室，林浅在登记表上签名，说明天再帮她拉一个同学加入。',
      ].join('\n\n'),
      title: '废柴社团今天也要招满人',
      synopsis: '校园轻喜剧，大一新生在招新期接手濒临废社的手作模型社，靠误会笑点、模型技能和同学报名保住社团。',
      genre: 'modern',
      promiseContract: contract,
    });

    expect(report.promiseDrift.promiseHits).toBeGreaterThanOrEqual(4);
    expect(report.promiseDrift.sceneHits).toBeGreaterThanOrEqual(3);
    expect(report.qualityFloorPassed).toBe(true);
  });

  it('recognizes sports competition loops with score and tactical correction', () => {
    const contract = buildNovelPromiseContract({
      title: '替补席最后一格',
      synopsis: '体育竞技青春文。高二转学生从校队替补席重新开始，靠训练、选拔赛、战术配合、比分压力和队友信任回到场上。',
      tags: [],
      constitutionTags: [],
      genre: 'modern',
      startupPlatformProfile: 'auto',
    });

    expect(contract.constitutionSignals).toContain('sports-competition');
    expect(contract.requiredPayoffKeywords).toEqual(expect.arrayContaining(['得分', '助攻', '站位', '修正']));
    expect(contract.requiredSceneKeywords).toEqual(expect.arrayContaining(['球场', '记分牌', '比分', '防守']));

    const report = auditGenreDrift({
      chapterContent: [
        '记分牌显示第三节还剩4分12秒，沈砚从替补席起身，教练让他防5号接球。',
        '第一次防守被过后，他调整站位，卡住右路突破，张恒抢下篮板反击得分。',
        '最后一回合他没有强投，而是传到底角完成助攻，比分反超，队友第一次拍了他的背。',
      ].join('\n\n'),
      title: '替补席最后一格',
      synopsis: '体育竞技青春文。高二转学生从校队替补席重新开始，靠训练、选拔赛、战术配合、比分压力和队友信任回到场上。',
      genre: 'modern',
      promiseContract: contract,
    });

    expect(report.promiseDrift.promiseHits).toBeGreaterThanOrEqual(4);
    expect(report.promiseDrift.sceneHits).toBeGreaterThanOrEqual(4);
    expect(report.qualityFloorPassed).toBe(true);
  });

  it('does not activate career signals from negative constraints in sports synopsis', () => {
    const contract = buildNovelPromiseContract({
      title: '替补席最后一格',
      synopsis: '体育竞技青春文。主线是训练、选拔赛、战术配合、身体极限和队友信任。不走悬疑调查，不写商业经营，不写职场项目流程。',
      tags: [],
      constitutionTags: [],
      genre: 'modern',
      startupPlatformProfile: 'auto',
    });

    expect(contract.constitutionSignals).toContain('sports-competition');
    expect(contract.constitutionSignals).not.toContain('female-career');
    expect(contract.requiredSceneKeywords).toEqual(expect.arrayContaining(['球场', '体育馆']));
    expect(contract.requiredSceneKeywords).not.toEqual(expect.arrayContaining(['会议室', '合同']));
  });
});

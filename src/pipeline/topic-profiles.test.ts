import { describe, expect, it } from 'vitest';
import { inferStartupStorySignals } from '../novel/startup-story-signals.js';
import { buildChapterPromiseCard } from './chapter-promise-card.js';
import { detectDeferredPayoffPressure } from './chapter-promise-delay.js';
import { buildPromiseContract } from './promise-contract.js';
import { buildStartupFunctionalScenePlan } from './startup-functional-blocks.js';
import { buildStartupRetentionHints } from './startup-retention-hints.js';
import { getGenreBaseline } from './genre-baselines.js';

describe('topic profile registry integration', () => {
  it('keeps showbiz public-battle constraints aligned across contract, card, and startup plan', () => {
    const source = {
      title: '被雪藏三年后，我靠试镜翻红',
      synopsis: '娱乐圈逆袭文。过气女演员靠试镜、热搜、直播反馈、品牌改口和资源反抢重新翻红。',
      genre: 'modern',
    };
    const contract = buildPromiseContract({
      ...source,
      tags: ['娱乐圈', '热搜'],
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 1,
      totalPlannedChapters: 80,
      novelTitle: source.title,
      genre: source.genre,
      promiseContract: contract,
    });
    const hints = buildStartupRetentionHints({
      chapterNumber: 1,
      protagonistNames: ['沈棠'],
      genre: source.genre,
      novelTitle: source.title,
      novelSynopsis: source.synopsis,
      novelTags: ['娱乐圈', '热搜'],
    });
    const plan = buildStartupFunctionalScenePlan({
      chapterNumber: 1,
      outlineText: '场景1：试镜间被临时换角\n场景2：镜头前反击\n场景3：热搜起爆后品牌改口',
      novelTitle: source.title,
      novelSynopsis: source.synopsis,
      promiseContract: contract,
      chapterPromiseCard: card,
      maxWordCount: 2400,
    });

    expect(contract.constitutionSignals).toContain('showbiz');
    expect(contract.requiredPayoffKeywords).toContain('试镜');
    expect(contract.requiredPayoffKeywords).toContain('预警');
    expect(contract.requiredSceneKeywords).toContain('片场');
    expect(contract.requiredSceneKeywords).toContain('签约台');
    expect(card.genreFocus).toBe('showbiz');
    expect(card.topicIds).toContain('showbiz');
    expect(card.requiredPayoff.keywords).toContain('试镜');
    expect(card.requiredScene.keywords).toContain('试镜');
    expect(hints.directionHint).toContain('娱乐圈公开战场');
    expect(plan?.scenePlan).toContain('公开舞台上的资源危机');
  });

  it('keeps sports competition constraints aligned across generation and evaluation', () => {
    const source = {
      title: '替补席最后一格',
      synopsis: '体育竞技青春文。高二转学生从校队替补席重新开始，靠训练、选拔赛、战术配合、比分压力和队友信任回到场上。',
      genre: 'modern',
    };
    const contract = buildPromiseContract(source);
    const card = buildChapterPromiseCard({
      chapterNumber: 1,
      totalPlannedChapters: 80,
      novelTitle: source.title,
      genre: source.genre,
      promiseContract: contract,
    });

    expect(contract.constitutionSignals).toContain('sports-competition');
    expect(card.genreFocus).toBe('sports');
    expect(card.topicIds).toContain('sports-competition');
    expect(card.requiredPayoff.keywords).toContain('得分');
    expect(card.requiredScene.keywords).toContain('球场');
    expect(inferStartupStorySignals({
      genre: source.genre,
      novelTitle: source.title,
      novelSynopsis: source.synopsis,
    }).has('sports-competition')).toBe(true);

    const plan = buildStartupFunctionalScenePlan({
      chapterNumber: 1,
      outlineText: '场景1：选拔赛开始\n场景2：失误后改防守站位\n场景3：最后一回合完成助攻',
      novelTitle: source.title,
      novelSynopsis: source.synopsis,
      promiseContract: contract,
      chapterPromiseCard: card,
      maxWordCount: 2400,
    });
    expect(plan?.scenePlan).toContain('场上压力先成立');
    expect(plan?.scenePlan).toContain('比分');

    const pressure = detectDeferredPayoffPressure({
      card,
      recentChapterContents: [
        '选拔赛前，沈砚坐在替补席反复看记分牌，教练说流程还要准备，所有人都在倒计时里等待。',
        '选拔赛马上开始，替补席边又一次讨论准备和赛前安排，记分牌亮着，却仍没有任何回合结果。',
      ],
    });
    expect(pressure.active).toBe(true);
  });

  it('keeps scifi engineering terms and startup rules from the same topic profile', () => {
    const source = {
      title: '星环维修日志',
      synopsis: '硬科幻工程文。空间站气闸报警，主角靠读数、参数修正、维修臂和推进模块排除故障。',
      genre: 'scifi',
    };
    const contract = buildPromiseContract(source);
    const card = buildChapterPromiseCard({
      chapterNumber: 1,
      totalPlannedChapters: 60,
      novelTitle: source.title,
      genre: source.genre,
      promiseContract: contract,
    });
    const hints = buildStartupRetentionHints({
      chapterNumber: 1,
      protagonistNames: ['顾临'],
      genre: source.genre,
      novelTitle: source.title,
      novelSynopsis: source.synopsis,
    });
    const plan = buildStartupFunctionalScenePlan({
      chapterNumber: 1,
      outlineText: '场景1：气闸报警\n场景2：修正参数\n场景3：信标回稳',
      novelTitle: source.title,
      novelSynopsis: source.synopsis,
      promiseContract: contract,
      chapterPromiseCard: card,
      maxWordCount: 2200,
    });

    expect(contract.constitutionSignals).toContain('scifi-engineering');
    expect(card.genreFocus).toBe('scifi-engineering');
    expect(card.requiredPayoff.keywords).toContain('读数');
    expect(card.requiredScene.keywords).toContain('气闸');
    expect(hints.directionHint).toContain('科幻工程');
    expect(plan?.scenePlan).toContain('故障现场报警');
    expect(getGenreBaseline('硬科幻工程').genre).toBe('kehuan');
  });

  it('keeps shame-system constraints in the shared topic profile registry', () => {
    const source = {
      title: '穿书当天，我激活了羞耻系统',
      synopsis: '办公室早会触发羞耻任务，女主必须当众完成指定台词，靠奖励惩罚和围观反应推进关系。',
      genre: 'modern',
    };
    const contract = buildPromiseContract({
      ...source,
      tags: ['系统', '社死'],
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 1,
      totalPlannedChapters: 80,
      novelTitle: source.title,
      genre: source.genre,
      promiseContract: contract,
    });

    expect(contract.constitutionSignals).toContain('shame-system');
    expect(card.genreFocus).toBe('system');
    expect(card.topicIds).toContain('shame-system');
    expect(card.requiredPayoff.keywords).toContain('任务完成');
    expect(card.requiredScene.keywords).toContain('办公室');
  });

  it('keeps apocalypse survival resource constraints in the shared topic profile registry', () => {
    const source = {
      title: '末世安全屋从一张补给券开始',
      synopsis: '末世求生文。主角靠补给券、工具箱、清水、加固车门和安全屋撑过尸潮。',
      genre: 'scifi',
    };
    const contract = buildPromiseContract({
      ...source,
      tags: ['末世', '生存', '求生'],
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 1,
      totalPlannedChapters: 90,
      novelTitle: source.title,
      genre: source.genre,
      promiseContract: contract,
    });

    expect(contract.constitutionSignals).toContain('apocalypse-survival');
    expect(card.genreFocus).toBe('survival');
    expect(card.topicIds).toContain('apocalypse-survival');
    expect(card.requiredPayoff.keywords).toContain('加固');
    expect(card.requiredScene.keywords).toContain('安全屋');
  });
});

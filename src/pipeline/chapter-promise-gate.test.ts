import { describe, expect, it } from 'vitest';
import { buildChapterPromiseCard } from './chapter-promise-card.js';
import { detectDeferredPayoffPressure } from './chapter-promise-delay.js';
import {
  buildChapterPromiseGateFixHints,
  evaluateChapterPromiseGate,
} from './chapter-promise-gate.js';
import { buildPromiseContract } from './promise-contract.js';

describe('chapter promise card + gate', () => {
  it('builds a startup promise card from entertainment constitution signals', () => {
    const contract = buildPromiseContract({
      title: '重生娱乐圈：开局绑定未来影帝',
      synopsis: '女主重生后靠试镜、热搜和资源翻红。',
      tags: ['娱乐圈', '重生', '影帝'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });

    const card = buildChapterPromiseCard({
      chapterNumber: 2,
      totalPlannedChapters: 80,
      novelTitle: '重生娱乐圈：开局绑定未来影帝',
      genre: 'modern',
      promiseContract: contract,
    });

    expect(card.phase).toBe('startup');
    expect(card.genreFocus).toBe('showbiz');
    expect(card.requiredPayoff.keywords).toContain('试镜');
    expect(card.requiredScene.keywords).toContain('试镜');
    expect(card.preferredEndingFocus.join('、')).toContain('资源');
    expect(card.summary).toContain('章节承诺卡');
  });

  it('flags mystery-led startup chapter that misses entertainment payoff', () => {
    const contract = buildPromiseContract({
      title: '重生娱乐圈：开局绑定未来影帝',
      synopsis: '女主重生后靠试镜、热搜和资源翻红。',
      tags: ['娱乐圈', '重生', '影帝'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 2,
      totalPlannedChapters: 80,
      novelTitle: '重生娱乐圈：开局绑定未来影帝',
      genre: 'modern',
      promiseContract: contract,
    });

    const report = evaluateChapterPromiseGate({
      chapterContent: '林栀盯着消失的评论，开始调查匿名短信和监控来源。她整理预案、追查线索，想搞清幕后真相。',
      chapterNumber: 2,
      gateMode: 'warn',
      card,
    });

    expect(report.passed).toBe(false);
    expect(report.findings.some(item => item.code === 'missing-primary-payoff')).toBe(true);
    expect(report.findings.some(item => item.code === 'forbidden-substitution-dominant')).toBe(true);
    expect(buildChapterPromiseGateFixHints(card, report)).toContain('本章主回报必须改成');
  });

  it('flags showbiz ending that drifts into black-shadow crisis', () => {
    const contract = buildPromiseContract({
      title: '重生娱乐圈：开局绑定未来影帝',
      synopsis: '女主重生后靠试镜、热搜和资源翻红。',
      tags: ['娱乐圈', '重生', '影帝'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 2,
      totalPlannedChapters: 80,
      novelTitle: '重生娱乐圈：开局绑定未来影帝',
      genre: 'modern',
      promiseContract: contract,
    });

    const report = evaluateChapterPromiseGate({
      chapterContent: '前面她拿下试镜机会。结尾时，巷口的黑影又来了，鸭舌帽人影在黑暗里盯着她，像有什么在等待。',
      chapterNumber: 2,
      gateMode: 'warn',
      card,
    });

    expect(report.findings.some(item => item.code === 'off-promise-ending-hook')).toBe(true);
  });

  it('flags startup chapter that opens with forbidden technical infiltration and then jumps to another main set piece', () => {
    const contract = buildPromiseContract({
      title: '重生娱乐圈：开局绑定未来影帝',
      synopsis: '女主重生后靠试镜、热搜和资源翻红。',
      tags: ['娱乐圈', '重生', '影帝'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 2,
      totalPlannedChapters: 80,
      novelTitle: '重生娱乐圈：开局绑定未来影帝',
      genre: 'modern',
      promiseContract: contract,
    });

    const report = evaluateChapterPromiseGate({
      chapterContent: '她登录邮箱，破解密码，改掉邮件内容。发送成功后松了口气。第二天下午，她来到试镜间，拿下角色，导演组当场拍板。',
      chapterNumber: 2,
      gateMode: 'warn',
      card,
    });

    expect(report.findings.some(item => item.code === 'forbidden-opening-substitution')).toBe(true);
    expect(report.findings.some(item => item.code === 'overpacked-startup-scope')).toBe(true);
  });

  it('builds collapse-warning startup card around public warning instead of black-material investigation', () => {
    const contract = buildPromiseContract({
      title: '被雪藏三年后，我靠塌房预警爆红了',
      synopsis: '过气艺人绑定塌房预警系统后，靠公开预警、避雷截胡和直播翻红起量。',
      tags: ['娱乐圈', '顶流', '直播'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 2,
      totalPlannedChapters: 80,
      novelTitle: '被雪藏三年后，我靠塌房预警爆红了',
      genre: 'modern',
      promiseContract: contract,
    });

    expect(card.requiredPayoff.keywords).toContain('预警');
    expect(card.requiredScene.keywords).toContain('直播');
    expect(card.preferredEndingFocus.join('、')).toContain('公开预警');

    const report = evaluateChapterPromiseGate({
      chapterContent: '沈砚蹲守地下车库，跟拍偷拍视频，试图查证爆料来源。他连续两天深挖黑料和取证，没有公开预警，也没有直播发声。',
      chapterNumber: 2,
      gateMode: 'warn',
      card,
    });

    expect(report.findings.some(item => item.code === 'forbidden-substitution-dominant')).toBe(true);
  });

  it('detects repeated buildup pressure and forces the next showbiz chapter to execute the public payoff', () => {
    const contract = buildPromiseContract({
      title: '被雪藏三年后，我靠塌房预警爆红了',
      synopsis: '过气艺人绑定塌房预警系统后，靠公开预警、避雷截胡和直播翻红起量。',
      tags: ['娱乐圈', '顶流', '直播'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 6,
      totalPlannedChapters: 80,
      novelTitle: '被雪藏三年后，我靠塌房预警爆红了',
      genre: 'modern',
      promiseContract: contract,
    });

    const pressure = detectDeferredPayoffPressure({
      card,
      recentChapterContents: [
        '节目组把《暖心厨房》的直播流程发到休息室。刘姐反复强调暖心厨房直播前不能乱说话，所有人都在准备台本和倒计时。',
        '化妆间里，小陈递来《暖心厨房》直播流程和热搜预案，说直播前还要试机。沈砚只能在后台等待明天直播。',
      ],
    });

    expect(pressure.active).toBe(true);
    expect(pressure.directive).toContain('本章必须直接进入');
    expect(pressure.directive).toContain('禁止继续只写后台试探');
  });

  it('flags a third consecutive backstage setup chapter as deferred payoff loop', () => {
    const contract = buildPromiseContract({
      title: '被雪藏三年后，我靠塌房预警爆红了',
      synopsis: '过气艺人绑定塌房预警系统后，靠公开预警、避雷截胡和直播翻红起量。',
      tags: ['娱乐圈', '顶流', '直播'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 6,
      totalPlannedChapters: 80,
      novelTitle: '被雪藏三年后，我靠塌房预警爆红了',
      genre: 'modern',
      promiseContract: contract,
    });

    const report = evaluateChapterPromiseGate({
      chapterContent: '后台控台还在准备流程，休息室里不停试探刘姐的态度。所有人都盯着直播倒计时，等明天直播，却始终没有真正开始直播。',
      chapterNumber: 6,
      gateMode: 'strict',
      card,
      recentChapterContents: [
        '节目组把《暖心厨房》的直播流程发到休息室。刘姐反复强调暖心厨房直播前不能乱说话，所有人都在准备台本和倒计时。',
        '化妆间里，小陈递来《暖心厨房》直播流程和热搜预案，说直播前还要试机。沈砚只能在后台等待明天直播。',
      ],
    });

    expect(report.passed).toBe(false);
    expect(report.findings.some(item => item.code === 'deferred-payoff-loop')).toBe(true);
    expect(buildChapterPromiseGateFixHints(card, report)).toContain('禁止继续只写后台试探');
  });

  it('flags showbiz startup chapters where private deal scenes overpower the public battlefield', () => {
    const contract = buildPromiseContract({
      title: '被雪藏三年后，我靠塌房预警爆红了',
      synopsis: '过气艺人绑定塌房预警系统后，靠公开预警、避雷截胡和直播翻红起量。',
      tags: ['娱乐圈', '顶流', '直播'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 3,
      totalPlannedChapters: 80,
      novelTitle: '被雪藏三年后，我靠塌房预警爆红了',
      genre: 'modern',
      promiseContract: contract,
    });

    const report = evaluateChapterPromiseGate({
      chapterContent: '休息区里，王维拉上帘子单独谈条件。文件夹、律师函、合同、转账、助理和桌沿塞满了整个场景。片场那边只匆匆提了一句摄影棚还在等。',
      chapterNumber: 3,
      gateMode: 'warn',
      card,
    });

    expect(report.findings.some(item => item.code === 'private-deal-dominant')).toBe(true);
    expect(buildChapterPromiseGateFixHints(card, report)).toContain('公开战场');
  });

  it('flags showbiz startup chapters that use system future fragments as evidence substitutes', () => {
    const contract = buildPromiseContract({
      title: '被雪藏三年后，我靠塌房预警爆红了',
      synopsis: '过气艺人绑定塌房预警系统后，靠公开预警、避雷截胡和直播翻红起量。',
      tags: ['娱乐圈', '顶流', '直播'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 3,
      totalPlannedChapters: 80,
      novelTitle: '被雪藏三年后，我靠塌房预警爆红了',
      genre: 'modern',
      promiseContract: contract,
    });

    const report = evaluateChapterPromiseGate({
      chapterContent: '系统光幕亮起。破碎的画面挤进脑海，王总正在改报销单，审查组和账户流水一起闪过。沈砚当场拿着这些细节去反杀。',
      chapterNumber: 3,
      gateMode: 'strict',
      card,
    });

    expect(report.findings.some(item => item.code === 'system-evidence-substitution')).toBe(true);
    expect(buildChapterPromiseGateFixHints(card, report)).toContain('系统提供的未来片段');
  });

  it('builds a food-startup promise card that prioritizes cooking payoff over misery padding', () => {
    const contract = buildPromiseContract({
      title: '被逐农女，开局一碗面，馋哭满朝文武',
      synopsis: '她被逐出家门后，靠一碗面活下来，并从路边摊开始翻身。',
      tags: ['种田', '美食', '逆袭'],
      genre: 'historical',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 1,
      totalPlannedChapters: 120,
      novelTitle: '被逐农女，开局一碗面，馋哭满朝文武',
      genre: 'historical',
      promiseContract: contract,
    });

    expect(card.genreFocus).toBe('food');
    expect(card.requiredPayoff.keywords).toContain('开张');
    expect(card.requiredScene.keywords).toContain('灶台');
    expect(card.preferredEndingFocus.join('、')).toContain('口碑扩散');
  });

  it('flags food startup chapters that only sell misery and mysterious attention', () => {
    const contract = buildPromiseContract({
      title: '被逐农女，开局一碗面，馋哭满朝文武',
      synopsis: '她被逐出家门后，靠一碗面活下来，并从路边摊开始翻身。',
      tags: ['种田', '美食', '逆袭'],
      genre: 'historical',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 1,
      totalPlannedChapters: 120,
      novelTitle: '被逐农女，开局一碗面，馋哭满朝文武',
      genre: 'historical',
      promiseContract: contract,
    });

    const report = evaluateChapterPromiseGate({
      chapterContent: '寒风刮过破庙残垣。苏晚蜷在角落里，想起被赶出家门的旧事，胃里空得发疼。门外忽然走来一个气质不凡的年轻公子，站在门口静静看着她。',
      chapterNumber: 1,
      gateMode: 'warn',
      card,
    });

    expect(report.findings.some(item => item.code === 'missing-primary-payoff')).toBe(true);
    expect(report.sceneHits).toBeGreaterThan(0);
    expect(report.findings.some(item => item.code === 'missing-signature-scene')).toBe(false);
  });

  it('builds a rivals-romance startup card around direct collision', () => {
    const contract = buildPromiseContract({
      title: '和死对头同居后，我先动心了',
      synopsis: '两人明明是彼此最看不顺眼的死对头，却被迫住进同一屋檐下，一路互怼互撩。',
      tags: ['死对头', '欢喜冤家', '同居'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 1,
      totalPlannedChapters: 80,
      novelTitle: '和死对头同居后，我先动心了',
      genre: 'modern',
      promiseContract: contract,
    });

    expect(card.genreFocus).toBe('romance');
    expect(card.requiredPayoff.keywords).toContain('互怼');
    expect(card.requiredScene.keywords).toContain('当面');
    expect(card.preferredEndingFocus.join('、')).toContain('关系推进');
  });

  it('builds a war-statecraft card from war and empire-building promises', () => {
    const contract = buildPromiseContract({
      title: '万域霸主',
      synopsis: '陆擎收拢残兵败将，连斩十三域主，攻破三百六十七城，建立天朝秩序：废奴、军功爵、科举、国子监，旧贵族反扑，上界神明窥伺。',
      tags: ['战争', '权谋'],
      genre: '架空历史',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 24,
      totalPlannedChapters: 120,
      novelTitle: '万域霸主',
      genre: '架空历史',
      promiseContract: contract,
    });

    expect(contract.constitutionSignals).toContain('war-statecraft');
    expect(contract.suspenseDriftKeywords).toContain('祭坛');
    expect(card.genreFocus).toBe('war-statecraft');
    expect(card.requiredPayoff.keywords).toEqual(expect.arrayContaining(['攻城', '兵权', '军令']));
    expect(card.forbiddenSubstitutions.flatMap(item => item.keywords)).toContain('第三门');
  });

  it('hard-fails war-statecraft chapters dominated by altar key mechanics', () => {
    const contract = buildPromiseContract({
      title: '万域霸主',
      synopsis: '战争权谋，主线是攻城、收编、军功爵、废奴政令和天朝秩序扩张。',
      tags: ['战争', '权谋'],
      genre: '架空历史',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 25,
      totalPlannedChapters: 120,
      novelTitle: '万域霸主',
      genre: '架空历史',
      promiseContract: contract,
    });

    const report = evaluateChapterPromiseGate({
      chapterContent: '陆擎没有调兵攻城，而是沿着断碑坐标寻找祭坛。银日轮在基座上亮起，钥匙碎片和密钥同时锁定第三门。法罗说血引已经完成，封印即将传送到第二道门背后。',
      chapterNumber: 25,
      gateMode: 'strict',
      card,
    });

    expect(report.passed).toBe(false);
    expect(report.findings.some(item => item.code === 'off-domain-ritual-mechanic')).toBe(true);
    expect(buildChapterPromiseGateFixHints(card, report)).toContain('攻城破城');
  });

  it('passes war-statecraft chapters that change military and statecraft positions', () => {
    const contract = buildPromiseContract({
      title: '万域霸主',
      synopsis: '战争权谋，主线是攻城、收编、军功爵、废奴政令和天朝秩序扩张。',
      tags: ['战争', '权谋'],
      genre: '架空历史',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 26,
      totalPlannedChapters: 120,
      novelTitle: '万域霸主',
      genre: '架空历史',
      promiseContract: contract,
    });

    const report = evaluateChapterPromiseGate({
      chapterContent: '城门前战旗压下，陆擎按军令改阵，先断粮道再夺城楼。降兵被收编进新营，旧贵族失去兵权，只能在府衙承认废奴政令。国子监名单当场张出，军功爵的第一批名册送到军营。',
      chapterNumber: 26,
      gateMode: 'strict',
      card,
    });

    expect(report.passed).toBe(true);
    expect(report.findings).toHaveLength(0);
  });

  it('uses topic profile payoff keywords for sports chapters instead of a sliced local list', () => {
    const contract = buildPromiseContract({
      title: '替补席最后一格',
      synopsis: '体育竞技青春文。高二转学生从校队替补席重新开始，靠晨训、队内选拔、战术配合、比分压力和队友信任回到场上。',
      tags: ['体育', '篮球'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const card = buildChapterPromiseCard({
      chapterNumber: 1,
      totalPlannedChapters: 80,
      novelTitle: '替补席最后一格',
      genre: 'modern',
      promiseContract: contract,
    });

    const report = evaluateChapterPromiseGate({
      chapterContent: [
        '比分牌红字刺眼，陈序坐在替补席末段，教练盯着计时器。',
        '赵一鸣失误后，陈序上场先卡住底角站位，抢下篮板，把球传球给方岩。',
        '红队重新拉开空间，教练通知他明天参加合练名单，队友终于回头看他。',
      ].join('\n'),
      chapterNumber: 1,
      gateMode: 'strict',
      card,
    });

    expect(card.topicIds).toContain('sports-competition');
    expect(report.payoffHits).toBeGreaterThan(0);
    expect(report.sceneHits).toBeGreaterThan(0);
    expect(report.findings.some(item => item.code === 'missing-primary-payoff')).toBe(false);
    expect(report.passed).toBe(true);
  });
});

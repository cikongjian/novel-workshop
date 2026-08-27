import { describe, expect, it } from 'vitest';
import {
  buildStartupOpeningFixHints,
  evaluateStartupOpeningGate,
} from './startup-opening-gate.js';
import { buildPromiseContract } from './promise-contract.js';

describe('evaluateStartupOpeningGate', () => {
  it('flags slow and expository openings', () => {
    const report = evaluateStartupOpeningGate({
      chapterContent: '很多年前，这座城曾经有过辉煌的历史。据说那时英雄辈出。原来整个世界一直遵循古老规则。'.repeat(20),
      chapterNumber: 1,
      platformProfile: 'fanqie',
      maxWordCount: 3000,
    });

    expect(report.enabled).toBe(true);
    expect(report.passed).toBe(false);
    expect(report.findings.some(item => item.code === 'weak-first-screen')).toBe(true);
    expect(report.findings.some(item => item.code === 'heavy-exposition')).toBe(true);
  });

  it('passes a hook-led fanqie style opening', () => {
    const report = evaluateStartupOpeningGate({
      chapterContent: [
        '林砚一脚踹开包厢门时，桌上的合同还压着他妹妹的住院单。',
        '“今天不签，你妹妹今晚就别想进手术室。”',
        '他盯着对面那张笑脸，第一次决定把录音笔亮出来。',
        '包厢里瞬间炸了，保镖扑上来的同时，手机里的转账记录也投上了屏幕。',
        '五分钟后，警笛声逼近，而真正要命的人，才刚刚下楼。'
      ].join(''),
      chapterNumber: 1,
      platformProfile: 'fanqie',
      maxWordCount: 3000,
    });

    expect(report.passed).toBe(true);
    expect(report.overallScore).toBeGreaterThanOrEqual(62);
  });

  it('builds concrete fix hints', () => {
    const report = evaluateStartupOpeningGate({
      chapterContent: '他想了很多，回忆了很多。'.repeat(100),
      chapterNumber: 2,
      platformProfile: 'qidian',
      maxWordCount: 3000,
    });
    const hints = buildStartupOpeningFixHints(report);
    expect(hints).toContain('前 1000 字内明确写出主角此刻要做什么');
  });

  it('flags promise drift when early chapter is mystery-led', () => {
    const contract = buildPromiseContract({
      title: '重生娱乐圈：开局绑定未来影帝',
      synopsis: '女主重生后靠试镜、热搜和资源翻红。',
      tags: ['娱乐圈', '重生'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });

    const report = evaluateStartupOpeningGate({
      chapterContent: '林栀盯着消失的评论，开始调查匿名短信和监控来源。新的秘密和真相一个接一个冒出来。',
      chapterNumber: 2,
      platformProfile: 'fanqie',
      promiseContract: contract,
      maxWordCount: 3000,
    });

    expect(report.findings.some(item => item.code === 'suspense-drift')).toBe(true);
    expect(report.findings.some(item => item.code === 'missing-promise-payoff')).toBe(true);
  });

  it('recognizes showbiz public battlefield goal, obstacle, and payoff', () => {
    const contract = buildPromiseContract({
      title: '被雪藏三年后，我靠试镜翻红',
      synopsis: '过气女演员靠试镜、热搜、直播反馈、品牌改口和资源反抢重新翻红。',
      tags: ['娱乐圈', '热搜'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const report = evaluateStartupOpeningGate({
      chapterContent: [
        '试镜间门口，沈棠按住皱掉的台本，导演组刚把女三号名单划到对家名下。',
        '经纪人低声说品牌方撤了物料，热搜里营销号正骂她耍大牌，她必须在直播探班前把角色抢回来。',
        '她直接进镜头试戏，临场把压戏段落接住，导演点头改口，直播间弹幕刷屏，评论区开始转向。',
        '品牌方助理递来改口消息，对家脸色发白。导演把合同推到她面前：“明天定妆，你先进组。”',
      ].join('\n'),
      chapterNumber: 1,
      platformProfile: 'fanqie',
      promiseContract: contract,
      maxWordCount: 2400,
    });
    const codes = report.findings.map(item => item.code);

    expect(codes).not.toContain('unclear-goal');
    expect(codes).not.toContain('unclear-obstacle');
    expect(codes).not.toContain('weak-early-payoff');
  });

  it('recognizes collapse-warning showbiz openings with public signing and verification payoff', () => {
    const contract = buildPromiseContract({
      title: '被雪藏三年后，我靠塌房预警爆红了',
      synopsis: '女主拿到塌房预警能力，在直播间提前避雷、截胡资源、阻止团队踩坑，并靠公开验证和流量反馈爆红。',
      tags: ['娱乐圈', '顶流', '直播'],
      constitutionTags: ['collapse-warning'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const report = evaluateStartupOpeningGate({
      chapterContent: [
        '#林可岚 代言人塌房倒计时 3:00#挂在弹幕墙顶端，茶饮代言压轴签约台已经推到镜头前。',
        '苏念只是小主播，没作品没流量没后台，却必须在王总落笔前叫停签约：“这份茶饮代言不能签。”',
        '签约本被她按住，直播间弹幕滚动，品牌方当场宣布签约暂停，质检报告和供应链清单对外开放。',
        '王总追上来改口请她做体验官，热搜开始攀升，而系统又弹出下一条：下一个塌房预警，季川，综艺录制现场，倒计时十五分钟。',
      ].join('\n'),
      chapterNumber: 1,
      platformProfile: 'fanqie',
      promiseContract: contract,
      maxWordCount: 2400,
    });
    const codes = report.findings.map(item => item.code);

    expect(codes).not.toContain('unclear-goal');
    expect(codes).not.toContain('unclear-obstacle');
    expect(codes).not.toContain('weak-early-payoff');
    expect(codes).not.toContain('missing-promise-payoff');
  });

  it('flags overloaded chapter one and emits compression hint', () => {
    const report = evaluateStartupOpeningGate({
      chapterContent: [
        '顾砚舟推开解剖室的门，满屋福尔马林味和抓挠门板的尖响一起压过来，五个新手玩家缩在墙角不敢抬头，只有他还在盯着天花板和通风口，像在看一间还没装修完的铺面。',
        '他花光点数换出安全结界和奶茶，当场稳住厉鬼，淡金色光幕把鬼爪和黑气一并挡在外面，角落里快要崩溃的几个人这才意识到，他不是在求生，而是在副本里试图把生意做起来。',
        '学姐喝完后立刻签约，成了便利店第一名员工，系统连续弹出雇佣成功、员工录入、商品解锁三条提示，顾砚舟顺手把安保、盘货和夜间巡逻都塞进她的岗位说明。',
        '五个新手玩家冲进来付费避难，他卖掉护身符和矿泉水，点数不断入账，结界里很快从惊魂未定变成排队付费，连原本想抢东西的资深玩家都被这套秩序硬生生拖住。',
        '紧接着他把店铺迁到旧礼堂，正式开业，货架、收银台和新规一起展开，原本阴森的演讲台被结界洗成了二十四小时营业的安全区，第一轮生意还没消化完，第二轮经营升级已经拍到脸上。',
        '【店铺绑定成功！】【正式开业！】【主神制裁协议启动。】血红色提示框连着炸开，下一副本难度提升、结算奖励削减、稽查者即将介入，一连串新变量已经不是章末钩子，而是第二波完整推进。',
        '几分钟后，规则渗透继续上涨，新的稽查者已经站到门外，红衣学姐重新绷紧鬼气，几个玩家缩在货架后发抖，而顾砚舟已经开始盘算员工福利和快乐水采购。',
      ].join('\n\n'),
      chapterNumber: 1,
      platformProfile: 'fanqie',
      maxWordCount: 2400,
    });

    expect(report.passed).toBe(false);
    expect(report.findings.some(item => item.code === 'overloaded-opening')).toBe(true);
    expect(buildStartupOpeningFixHints(report)).toContain('一次主兑现');
  });

  it('recognizes farming survival openings with practical payoff wording', () => {
    const contract = buildPromiseContract({
      title: '荒年小饭摊，开局一锅野菜汤',
      synopsis: '逃荒农女被赶出家门后靠野菜、生火、换几文钱和撑过一天翻身。',
      tags: ['种田', '逃荒', '美食'],
      genre: 'historical',
      platformProfile: 'fanqie',
    });
    const report = evaluateStartupOpeningGate({
      chapterContent: [
        '沈青抓起墙角灰灰菜时，荒院的灶坑只剩半缸雨水。',
        '粮袋见底，弟弟还在发抖，她得先把这锅野菜汤做成，至少换几文钱撑过今天。',
        '火苗终于窜起来，邻居家的婶子闻着味停在篱笆外，摸出五文铜钱说：“给我留一碗，明天你多摘点。”',
        '沈青把铜钱攥进掌心，转头看向集市方向，明天那口破锅必须摆出去。',
      ].join('\n'),
      chapterNumber: 1,
      platformProfile: 'fanqie',
      promiseContract: contract,
      maxWordCount: 2400,
    });
    const codes = report.findings.map(item => item.code);

    expect(codes).not.toContain('unclear-goal');
    expect(codes).not.toContain('unclear-obstacle');
    expect(codes).not.toContain('weak-early-payoff');
  });

  it('recognizes office shame-system task delivery as goal, obstacle, and payoff', () => {
    const contract = buildPromiseContract({
      title: '穿书当天，我激活了羞耻系统',
      synopsis: '女主在办公室早会上触发羞耻任务，必须当众说完指定台词，靠社死奖励改变关系。',
      tags: ['系统', '社死'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const report = evaluateStartupOpeningGate({
      chapterContent: [
        '早会站位区，陈鹿刚抓住文件夹，任务栏就在眼前弹开：三十秒内对主管说完指定台词。',
        '七八双眼睛同时看过来，她不能失败，失败惩罚会把昨晚的录音当众播放。',
        '她咬牙把台词完整念完，会议室静了一瞬，后排同事憋笑憋到肩膀发抖。',
        '【任务完成，奖励积分+10。】主管却把下一份汇报推到她面前：“既然这么会说，下午你来讲。”',
      ].join('\n'),
      chapterNumber: 1,
      platformProfile: 'fanqie',
      promiseContract: contract,
      maxWordCount: 2400,
    });
    const codes = report.findings.map(item => item.code);

    expect(codes).not.toContain('unclear-goal');
    expect(codes).not.toContain('unclear-obstacle');
    expect(codes).not.toContain('weak-early-payoff');
  });

  it('recognizes apocalypse survival resource payoff instead of requiring generic victory words', () => {
    const contract = buildPromiseContract({
      title: '末世安全屋从一张补给券开始',
      synopsis: '末世求生文，主角靠补给券、工具箱、清水和加固车门撑过尸潮。',
      tags: ['末世', '生存', '求生'],
      genre: 'scifi',
      platformProfile: 'fanqie',
    });
    const report = evaluateStartupOpeningGate({
      chapterContent: [
        '林雾抓起最后一张补给券时，车库门缝已经渗进黑血。',
        '今晚熬不过去，她必须在尸群撞开铁门前换到工具箱和两瓶清水。',
        '自动柜吐出扳手和水瓶，她把车门内侧加固，第一只丧尸撞上来时只撞出一声闷响。',
        '广播忽然改口，下一处补给点将在天亮前关闭。',
      ].join('\n'),
      chapterNumber: 1,
      platformProfile: 'fanqie',
      promiseContract: contract,
      maxWordCount: 2400,
    });
    const codes = report.findings.map(item => item.code);

    expect(codes).not.toContain('unclear-goal');
    expect(codes).not.toContain('unclear-obstacle');
    expect(codes).not.toContain('weak-early-payoff');
  });

  it('recognizes sports competition loops as opening goal, obstacle, and payoff', () => {
    const contract = buildPromiseContract({
      title: '替补席最后一格',
      synopsis: '体育竞技青春文，主线是训练、选拔赛、比分压力和队友信任。',
      tags: ['体育', '篮球'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const report = evaluateStartupOpeningGate({
      chapterContent: [
        '体育馆计时器还剩二十秒，沈砚站在替补席边，记分牌显示班队落后三分。',
        '上一回合他的传球失误被教练记在板上，这次必须完成右翼传切，否则首发名单没有他的位置。',
        '他压低重心冲进底线，队友补位挡住夹击，他把球递到空切点，助攻得分后又回身防住最后一次突破。',
        '教练把笔尖停在首发名单上：“明天班赛，你先打第一节。”',
      ].join('\n'),
      chapterNumber: 1,
      platformProfile: 'fanqie',
      promiseContract: contract,
      maxWordCount: 2400,
    });
    const codes = report.findings.map(item => item.code);

    expect(codes).not.toContain('unclear-goal');
    expect(codes).not.toContain('unclear-obstacle');
    expect(codes).not.toContain('weak-early-payoff');
  });

  it('recognizes campus club recruitment payoff as opening delivery', () => {
    const contract = buildPromiseContract({
      title: '废柴社团今天也要招满人',
      synopsis: '校园轻喜剧，濒临废社的模型社靠招新、误会笑点、模型技能和同学报名保住社团。',
      tags: ['校园', '社团'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });
    const report = evaluateStartupOpeningGate({
      chapterContent: [
        '招新摊位前，许知夏按住被风吹乱的传单，登记表上还是空白。',
        '老师刚刚提醒她下午截止，没人报名的话活动室就要收回，模型社直接废社。',
        '她把断掉天线的模型当场修好，路过的林浅笑出声，误会她已经是社长。',
        '林浅在登记表上写下名字：“我留下，明天再帮你拉一个同学。”',
      ].join('\n'),
      chapterNumber: 1,
      platformProfile: 'fanqie',
      promiseContract: contract,
      maxWordCount: 2400,
    });
    const codes = report.findings.map(item => item.code);

    expect(codes).not.toContain('unclear-goal');
    expect(codes).not.toContain('unclear-obstacle');
    expect(codes).not.toContain('weak-early-payoff');
  });

  it('recognizes war-statecraft military and policy payoff before mystery mechanics', () => {
    const contract = buildPromiseContract({
      title: '万域霸主',
      synopsis: '战争权谋，主线是攻城、收编、军功爵、废奴政令和天朝秩序扩张。',
      tags: ['战争', '权谋'],
      genre: 'historical',
      platformProfile: 'fanqie',
    });
    const report = evaluateStartupOpeningGate({
      chapterContent: [
        '城门前战旗压下，陆擎按军令改阵，先断粮道再夺城楼。',
        '守军背后还有旧贵族反扑，叛将试图夺兵权，他必须在天黑前破城。',
        '降兵被收编进新营，旧贵族失去兵权，只能在府衙承认废奴政令。',
        '国子监名单当场张出，军功爵第一批名册送到军营，而东门换防令已经压到案上。',
      ].join('\n'),
      chapterNumber: 1,
      platformProfile: 'fanqie',
      promiseContract: contract,
      maxWordCount: 2400,
    });
    const codes = report.findings.map(item => item.code);

    expect(codes).not.toContain('unclear-goal');
    expect(codes).not.toContain('unclear-obstacle');
    expect(codes).not.toContain('weak-early-payoff');
  });

  it('recognizes fantasy upgrade goals, pressure, and visible payoff', () => {
    const contract = buildPromiseContract({
      title: '被逐当天我破境反杀',
      synopsis: '玄幻升级爽文，主角被逐出宗门后靠突破、资源争夺和反杀一路升级。',
      constitutionTags: ['fantasy-upgrade', 'faceslap'],
      genre: 'fantasy',
      platformProfile: 'fanqie',
    });
    const report = evaluateStartupOpeningGate({
      chapterContent: [
        '周元被逐出宗门，丹田碎裂，执法弟子还封住了山路。',
        '他必须在追兵赶到前夺下坊市里的灵石，突破炼气五层，再去赌场反杀刘驼子。',
        '伤口仍在渗血，他却运转功法吸收灵石，当场破境，一拳击败挡路的刀疤脸。',
        '围观散修齐齐退后，刘驼子则带着炼气六层的帮手堵住赌场后门。',
      ].join('\n'),
      chapterNumber: 2,
      platformProfile: 'fanqie',
      promiseContract: contract,
      maxWordCount: 3000,
    });
    const codes = report.findings.map(item => item.code);

    expect(codes).not.toContain('unclear-goal');
    expect(codes).not.toContain('unclear-obstacle');
    expect(codes).not.toContain('weak-early-payoff');
  });
});

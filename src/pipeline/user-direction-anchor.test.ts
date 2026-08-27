import { describe, expect, it } from 'vitest';
import {
  auditUserDirectionAnchors,
  buildUserDirectionAnchorRepairInstruction,
  buildUserDirectionAnchorInstruction,
  extractUserDirectionAnchors,
} from './user-direction-anchor.js';

describe('user direction anchors', () => {
  it('extracts positive task anchors while ignoring negative anti-drift text', () => {
    const anchors = extractUserDirectionAnchors(
      '继续科幻工程维修题材：叶澜在星环维修舱处理推进模块过热与备用电池压降，重点写读数判断、现场协作、阀门/气闸/维修臂操作和救援后的新参数记录。不要写成调查阴谋。',
    );

    expect(anchors).toEqual(expect.arrayContaining([
      '推进模块',
      '备用电池',
      '维修臂',
      '读数判断',
      '现场协作',
      '阀门',
      '气闸',
      '压降',
      '过热',
      '救援',
    ]));
    expect(anchors).not.toContain('调查');
    expect(anchors).not.toContain('阴谋');
  });

  it('extracts workplace delivery anchors without glued Chinese phrases', () => {
    const anchors = extractUserDirectionAnchors(
      '职场事业线项目交付：林澄必须在公开会议上推进验收清单闭环，拿出现场照片、结构确认单和客户复测安排，让客户当场确认下一步验收口径，并让至少一名同事公开站队。不要写成调查内鬼、查监控、追幕后黑手。',
      14,
    );

    expect(anchors).toEqual(expect.arrayContaining([
      '公开会议',
      '验收清单',
      '现场照片',
      '结构确认单',
      '客户复测',
      '验收口径',
      '同事',
      '站队',
      '项目',
      '客户',
      '交付',
    ]));
    expect(anchors).not.toContain('结构确认单和客户');
    expect(anchors).not.toContain('让客户');
    expect(anchors).not.toContain('调查');
  });

  it('extracts shame-system scene anchors such as morning meeting and public reaction', () => {
    const anchors = extractUserDirectionAnchors(
      '第1章写陈鹿在办公室早会上触发羞耻任务，被迫当众完成一句社死发言，并得到奖励和围观反应。',
      12,
    );

    expect(anchors).toEqual(expect.arrayContaining([
      '办公室',
      '早会',
      '羞耻任务',
      '社死发言',
      '奖励',
      '围观反应',
    ]));
  });

  it('requests repair when a shame-system chapter changes the requested scene', () => {
    const audit = auditUserDirectionAnchors({
      direction: '第1章写陈鹿在办公室早会上触发羞耻任务，被迫当众完成一句社死发言，并得到奖励和围观反应。',
      content: [
        '陈鹿站在棋牌社凉棚下，旁边动漫社正在招新。',
        '系统提示：社死任务#001已触发。',
        '他对路过女生念出指定台词，凉棚前响起笑声。',
        '任务完成，奖励积分三百。',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.missingAnchors).toEqual(expect.arrayContaining(['办公室', '早会']));
    expect(audit.shouldRepair).toBe(true);
  });

  it('counts concrete public-task wording as shame-system anchor fulfillment', () => {
    const audit = auditUserDirectionAnchors({
      direction: '第1章写陈鹿在办公室早会上触发羞耻任务，被迫当众完成一句社死发言，并得到奖励和围观反应。',
      content: [
        '办公室早会站位区，陈鹿站在主管和同事面前。',
        '公开任务已触发，场景：早会站位。',
        '他念完那句“我很享受被大家审视的感觉”，系统显示台词完整。',
        '同事憋笑失败，奖励：社死亲和力+3。',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.presentAnchors).toEqual(expect.arrayContaining([
      '办公室',
      '早会',
      '羞耻任务',
      '社死发言',
      '奖励',
      '围观反应',
    ]));
    expect(audit.shouldRepair).toBe(false);
  });

  it('extracts sports training anchors', () => {
    const anchors = extractUserDirectionAnchors(
      '体育竞技青春文：沈砚在三天后班赛前进行右翼传切训练。开头第一屏写计时、比分压力和一次传球失误；中段写折返跑、右翼传切、身体极限、队友补位和失误修正；结尾落到班赛首发名单或最后一次队友信任选择。不要写悬疑调查，不要写职场项目流程。',
      14,
    );

    expect(anchors).toEqual(expect.arrayContaining([
      '计时',
      '比分压力',
      '传球失误',
      '折返跑',
      '右翼传切',
      '身体极限',
      '队友补位',
      '失误修正',
      '班赛',
      '首发名单',
      '队友信任',
    ]));
    expect(anchors).not.toContain('调查');
    expect(anchors).not.toContain('项目');
  });

  it('keeps positive anchors after an early negative sentence', () => {
    const anchors = extractUserDirectionAnchors(
      '这一章写班赛正式开始，不要继续写单纯训练。必须出现计时、比分压力、一次传球失误、一次右翼传切尝试、一次队友补位，以及主角在身体极限下完成失误修正。结尾要落到首发名单和队友信任的新变化。',
      14,
    );

    expect(anchors).toEqual(expect.arrayContaining([
      '班赛',
      '计时',
      '比分压力',
      '传球失误',
      '右翼传切',
      '队友补位',
      '身体极限',
      '失误修正',
      '首发名单',
      '队友信任',
    ]));
    expect(anchors).not.toContain('训练');
  });

  it('builds a hard instruction only when enough anchors exist', () => {
    const instruction = buildUserDirectionAnchorInstruction('处理推进模块过热与备用电池压降。');

    expect(instruction).toContain('用户方向锚点');
    expect(instruction).toContain('推进模块');
    expect(instruction).toContain('备用电池');
    expect(instruction).toContain('压降');
  });

  it('warns when user direction appears question-mark corrupted', () => {
    const audit = auditUserDirectionAnchors({
      direction: '?'.repeat(40),
      content: '正文正常。',
      stage: 'final',
    });

    expect(audit.anchors).toEqual([]);
    expect(audit.warnings).toContain('user direction appears mojibake or question-mark corrupted');
  });

  it('requests repair when generated content misses most user anchors', () => {
    const audit = auditUserDirectionAnchors({
      direction: '处理推进模块过热与备用电池压降，写阀门、气闸、维修臂操作。',
      content: '叶澜把夹爪放进工具箱，继续比对螺栓痕迹，确认焊接点还新鲜。',
    });

    expect(audit.shouldRepair).toBe(true);
    expect(audit.feedback).toContain('用户方向锚点缺失');
    expect(audit.missingAnchors).toEqual(expect.arrayContaining(['推进模块', '备用电池', '压降']));
  });

  it('builds outline repair instruction from missing anchors', () => {
    const audit = auditUserDirectionAnchors({
      direction: '处理推进模块过热与备用电池压降，写阀门、气闸、维修臂操作。',
      content: '叶澜把夹爪放进工具箱，继续比对螺栓痕迹。',
    });
    const instruction = buildUserDirectionAnchorRepairInstruction(audit);

    expect(instruction).toContain('用户方向锚点强制重做');
    expect(instruction).toContain('推进模块');
    expect(instruction).toContain('备用电池');
    expect(instruction).toContain('场景列表必须围绕这些缺失锚点重排');
  });

  it('counts sports action aliases as fulfilled anchors', () => {
    const audit = auditUserDirectionAnchors({
      direction: '继续体育班赛，必须出现比分压力、传球失误、右翼传切、队友补位、身体极限、失误修正、助攻、防守成功、队友信任。',
      content: [
        '计时器还剩四十秒，分差只剩一分。',
        '张恒的传球被林霄指尖碰到，球变线出界。',
        '沈砚从右翼45度沉底空切，左膝刺痛逼他改成低位直塞。',
        '刘洋提前换防卡住路线，孙毅补防到篮下。',
        '沈砚重新调整站位，把球传给刘洋，刘洋上篮得分。',
        '张恒拍了拍他的肩，说下一回合继续喂你。',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.presentAnchors).toEqual(expect.arrayContaining([
      '比分压力',
      '传球失误',
      '右翼传切',
      '队友补位',
      '身体极限',
      '失误修正',
      '助攻',
      '防守',
      '队友信任',
    ]));
    expect(audit.shouldRepair).toBe(false);
  });

  it('counts showcase-game context aliases as fulfilled anchors', () => {
    const audit = auditUserDirectionAnchors({
      direction: '继续体育线，这章写社团招新展示赛，必须出现队友补位、失误修正、助攻。',
      content: [
        '边线外两排新生手里捏着登记表，有人在报名栏上写名字。',
        '沈砚调整步幅，把重心挪到右脚，提前半秒跑回右翼。',
        '刘洋从边线跑过时说：“我补你右侧。”',
        '沈砚没有强行出手，击地传向弧顶。孙毅接球，空位中投，球钻进篮筐。',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.presentAnchors).toEqual(expect.arrayContaining([
      '社团',
      '招新',
      '队友补位',
      '失误修正',
      '助攻',
    ]));
    expect(audit.shouldRepair).toBe(false);
  });

  it('counts engineering record and collaboration aliases as fulfilled anchors', () => {
    const audit = auditUserDirectionAnchors({
      direction: '继续科幻工程维修线，必须出现参数记录、现场协作、氧压传感器读数跳变。',
      content: [
        '叶澜看着氧压传感器读数从0.62atm跳到1.18atm，采样间隔仍在闪烁。',
        '调度频道切入：“收到，入口压力保持。”老孙追问：“校准标记恢复了吗？”',
        '她在记录板上补完最终参数：传感器校准坐标、阀门位置修正、备用电池压降8.8V。',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.presentAnchors).toEqual(expect.arrayContaining([
      '氧压',
      '传感器',
      '读数',
      '参数记录',
      '现场协作',
    ]));
    expect(audit.missingAnchors).not.toContain('参数记录');
    expect(audit.missingAnchors).not.toContain('现场协作');
  });

  it('counts hard-scifi maintenance aliases as fulfilled anchors', () => {
    const audit = auditUserDirectionAnchors({
      direction: '围绕气闸室传感器校准后的故障记录推进：主角必须在外环停电前确认假警报源，复用星环、维修班、气闸室、错误日志等已落库元素；本章要有清晰维修流程。',
      content: [
        '星环外环补片区的气闸室还在泄压，舱门闭锁灯每三秒闪一次。',
        '叶澜让维修组在频道里保持静默，老孙只回了一句：“班组电源还有十二分钟。”',
        '她把校准探头贴到传感阵列背板上，沿着三个采样点做复校。',
        '报错记录显示报警假阳性来自备用线束，下一轮断电前必须拆开接线盒。',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.anchors).toEqual(expect.arrayContaining([
      '气闸',
      '传感器',
      '校准',
      '故障记录',
      '外环',
      '停电',
      '假警报',
      '星环',
      '维修班',
      '错误日志',
    ]));
    expect(audit.presentAnchors).toEqual(expect.arrayContaining([
      '气闸',
      '传感器',
      '校准',
      '故障记录',
      '外环',
      '停电',
      '假警报',
      '星环',
      '维修班',
      '错误日志',
    ]));
    expect(audit.shouldRepair).toBe(false);
  });

  it('requests repair when a rich hard-scifi direction misses several critical anchors', () => {
    const audit = auditUserDirectionAnchors({
      direction: '围绕气闸室传感器校准后的故障记录推进：主角必须在外环停电前确认假警报源，复用星环、维修班、气闸室、错误日志等已落库元素；本章要有清晰维修流程。',
      content: [
        '星环外环补片区的气闸室还在泄压。',
        '李班长在维修组频道里提醒她只看校准日志。',
        '外环断电窗口还有四十分钟，她带着工具箱爬向接线盒。',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.coverage).toBeGreaterThan(0.55);
    expect(audit.missingAnchors).toEqual(expect.arrayContaining([
      '传感器',
      '故障记录',
      '假警报',
    ]));
    expect(audit.shouldRepair).toBe(true);
  });

  it('counts workplace delivery aliases as fulfilled anchors', () => {
    const audit = auditUserDirectionAnchors({
      direction: '继续职场事业线，写客户复测会议，必须出现公开会议、方案拆解、责任分配，并让至少一名同事当场站队。',
      content: [
        '客户方刘总坐在302会议室靠窗那侧，面前摊着验收口径异议书。',
        '客户复测时间表今晚之前要发给刘总确认。',
        '林澄把验收草案和偏差项逐项对齐，标注每一条参数依据。',
        '小李站了起来，把恒通现场验收确认单复印件推到桌面中央。',
        '小陈问：“这个补强谁出图？”周维在工程监督栏签字。',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.presentAnchors).toEqual(expect.arrayContaining([
      '客户复测',
      '公开会议',
      '方案拆解',
      '责任分配',
      '同事',
    ]));
    expect(audit.missingAnchors).not.toContain('公开会议');
    expect(audit.missingAnchors).not.toContain('同事');
  });

  it('counts workplace pressure meeting aliases from business scenes', () => {
    const audit = auditUserDirectionAnchors({
      direction: '继续职场事业线，必须出现客户追加要求、公开会议、同事站队、方案拆解。',
      content: [
        '302的门半开着，刘总坐在靠窗那头，结构补强原始图压在会议桌中央。',
        '林澄在白板上写下三行：复测时间表、替代供应商资质、结构补强出图单位。',
        '周维终于开口：“赵工，这条路你能收还是林工收？”',
        '小陈接过纸，已经开始翻手机日历。',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.presentAnchors).toEqual(expect.arrayContaining([
      '客户',
      '公开会议',
      '同事',
      '站队',
      '方案拆解',
    ]));
    expect(audit.missingAnchors).not.toContain('站队');
  });

  it('extracts and counts romance delivery anchors', () => {
    const audit = auditUserDirectionAnchors({
      direction: '继续恋爱线，必须出现品牌方采访、Lisa流程提醒、旧星星、密码、顾砚舟护短、林栀主动靠近、同居卧室门缝和镜头前三次牵手。',
      content: [
        'Lisa发来采访流程，品牌方要求镜头前自然牵手三次。',
        '顾砚舟把旧星星放在茶几上，旧星星的Z痕被重新打磨过。',
        '他当着林栀输入密码，最后一位是她生日。',
        '顾砚舟说：“我站你那边，没人能先护你。”',
        '林栀没有退，主动靠近半步，卧室门留了一条缝。',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.presentAnchors).toEqual(expect.arrayContaining([
      '品牌方',
      '采访',
      'Lisa',
      '旧星星',
      '密码',
      '护短',
      '主动靠近',
      '门缝',
      '牵手',
    ]));
    expect(audit.coverage).toBeGreaterThanOrEqual(0.9);
    expect(audit.shouldRepair).toBe(false);
  });

  it('extracts and counts frontier civilization anchors', () => {
    const audit = auditUserDirectionAnchors({
      direction: '继续蛮荒文明线，必须出现部落分工、陶罐灶台、交易凭证、蓄水、骨棍灰斑、虎牙守洞、阿骨掌勺、暗金沉淀和神罚压力。',
      content: [
        '部落的人围在洞口，秦墨让虎牙守洞，阿骨接手掌勺，老族长带孩子搬木片。',
        '新的陶罐架上灶台，骨片刻号做交易凭证，蓄水坑边围出湿土线。',
        '骨棍顶端灰斑扩大，陶罐底部暗金沉淀发亮，像神罚压到洞口。',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.presentAnchors).toEqual(expect.arrayContaining([
      '部落',
      '分工',
      '陶罐',
      '灶台',
      '交易凭证',
      '蓄水',
      '骨棍',
      '虎牙',
      '阿骨',
    ]));
    expect(audit.coverage).toBeGreaterThanOrEqual(0.9);
  });

  it('treats political power synonyms as fulfilled anchors', () => {
    const audit = auditUserDirectionAnchors({
      direction: '继续权谋门阀线，必须承接兵权交割、女帝误解和门阀公开压力。',
      content: [
        '柴家撤回戍卫营归门阀共管原议，戍卫营的管辖权进入朝堂待议。',
        '皇帝给了苏清月自由择婿权，门阀拦不住她站上正堂。',
        '沈渊等的是那个女人明天必须做出的选择：要么当众赐印，要么继续压制。',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.presentAnchors).toEqual(expect.arrayContaining(['兵权', '女帝', '门阀']));
    expect(audit.shouldRepair).toBe(false);
  });

  it('treats campus public support as a standing-side anchor', () => {
    const audit = auditUserDirectionAnchors({
      direction: '继续校园社团招新线，必须出现同学公开站队、招新名单和活动室。',
      content: [
        '活动室门口，几个同学把名字写进招新名单。',
        '一个新生举手说：“我可以帮忙守场。”另一个女生把室友都带来试做模型。',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.presentAnchors).toEqual(expect.arrayContaining(['站队', '招新', '活动室']));
    expect(audit.missingAnchors).not.toContain('站队');
  });

  it('treats food stall business synonyms as fulfilled anchors', () => {
    const audit = auditUserDirectionAnchors({
      direction: '继续小饭摊经营线，必须出现客流、摊位、复购和酸汤面。',
      content: [
        '破庙岔道口的灶火刚亮，沈知夏把酸汤面端上桌。',
        '墙上炭痕写着十六碗，今天必须卖出十六碗。',
        '一个老客放下碗，说：“明天我还来，再来一碗。”',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.presentAnchors).toEqual(expect.arrayContaining(['客流', '摊位', '复购', '酸汤面']));
    expect(audit.shouldRepair).toBe(false);
  });

  it('treats explicit alternative anchors as fulfilled when either side appears', () => {
    const audit = auditUserDirectionAnchors({
      direction: '继续体育线，让沈砚完成一次防守成功或助攻，结尾落到首发名单。',
      content: [
        '沈砚从右翼换防补位，压住赵一舟的突破路线。',
        '赵一舟急停后被迫把球拨出边线，球权转换。',
        '教练把首发名单贴到门口，沈砚的名字在第二行。',
      ].join('\n'),
      stage: 'final',
    });

    expect(audit.presentAnchors).toEqual(expect.arrayContaining([
      '防守',
      '助攻',
      '首发名单',
    ]));
    expect(audit.missingAnchors).not.toContain('助攻');
    expect(audit.coverage).toBe(1);
  });

  it('turns missing sports anchors into concrete repair actions', () => {
    const audit = auditUserDirectionAnchors({
      direction: '继续体育班赛，必须出现比分压力、传球失误、右翼传切、队友补位、身体极限、失误修正、助攻。',
      content: '沈砚在场边看着计时器。',
    });
    const instruction = buildUserDirectionAnchorRepairInstruction(audit);

    expect(instruction).toContain('传球被断、变线、出界或丢球');
    expect(instruction).toContain('右翼45度或右侧底线的传切路线');
    expect(instruction).toContain('分球、直塞或喂球后由队友完成得分');
  });

  it('does not request repair when most anchors are present', () => {
    const audit = auditUserDirectionAnchors({
      direction: '处理推进模块过热与备用电池压降，写阀门、气闸、维修臂操作。',
      content: '推进模块温度继续升高，备用电池出现压降。叶澜在气闸口用维修臂锁住阀门。',
      stage: 'final',
    });

    expect(audit.shouldRepair).toBe(false);
    expect(audit.coverage).toBeGreaterThanOrEqual(0.55);
    expect(audit.directionChars).toBeGreaterThan(0);
    expect(audit.contentChars).toBeGreaterThan(0);
    expect(audit.sourceHash).toMatch(/^[0-9a-f]{8}:[0-9a-f]{8}$/);
    expect(audit.directionPreview).toContain('推进模块');
    expect(audit.stage).toBe('final');
  });
});

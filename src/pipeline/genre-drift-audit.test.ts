import { describe, expect, it } from 'vitest';
import { auditGenreDrift } from './genre-drift-audit.js';

function buildLongText(paragraphs: string[]): string {
  return paragraphs.map(item => `${item}${'。'.repeat(1)}`).join('\n\n');
}

describe('auditGenreDrift', () => {
  it('flags romance chapters that let mystery signals replace relationship payoff', () => {
    const report = auditGenreDrift({
      title: '协议婚后，偏执总裁天天护短',
      synopsis: '甜宠先婚后爱，核心回报是偏爱、护短和关系升温。',
      genre: 'romance',
      constitutionTags: ['sweet'],
      chapterContent: buildLongText([
        '林栀开始调查匿名短信的来源，监控里的秘密和幕后线索不断浮出水面。',
        '她沿着证据查到旧仓库，新的真相又指向一个没露面的匿名人。',
        '整整一夜，她都在排查偷拍视频和账号来源，准备把谜团继续深挖。',
      ]),
    });

    expect(report.qualityFloorPassed).toBe(false);
    expect(report.issues[0]).toContain('题材漂移');
  });

  it('passes romance chapters when world rules create relationship payoff', () => {
    const report = auditGenreDrift({
      title: '协议婚后，偏执总裁天天护短',
      synopsis: '甜宠先婚后爱，核心回报是偏爱、护短和关系升温。',
      genre: 'romance',
      constitutionTags: ['sweet'],
      chapterContent: buildLongText([
        '戒指契约会在雨天发热，顾砚舟把伞偏到林栀肩上，掌心替她挡住烫意。',
        '董事会逼她交出项目，他当场护短，把合同推回去，偏爱明明白白落在众人面前。',
        '她靠近半步，把发热的戒指贴到他掌心，两个人的关系在这场公开站队里升温。',
      ]),
    });

    expect(report.qualityFloorPassed, report.issues.join('\n')).toBe(true);
  });

  it('recognizes forced proximity romance payoff instead of requiring business-style results', () => {
    const report = auditGenreDrift({
      title: '死对头协议同居后先动心',
      synopsis: '恋爱同居，死对头在直播合同和马场障碍区里被迫牵手，关系回报是嘴硬关心、旧伤被记得和心动升温。',
      genre: 'romance',
      chapterContent: buildLongText([
        'Lisa的消息写得清清楚楚：障碍区必须牵手通过，直播效果数据模型显示这组画面预期流量最高。',
        '顾砚舟问她是怕他骑马出事，还是怕牵手。林栀提起他锁骨旧伤，两个人都把关心藏在嘴硬里。',
        '电梯里他让她走右边，自己去扛障碍更多的左边。上车后他提醒她系好安全带，她口袋里的星星吊饰硌着掌心，还有29分钟到马场。',
      ]),
    });

    expect(report.promiseDrift.promiseHits).toBeGreaterThanOrEqual(3);
    expect(report.promiseDrift.missingPrimaryPayoff).toBe(false);
    expect(report.qualityFloorPassed, report.issues.join('\n')).toBe(true);
  });

  it('recognizes shoulder massage and star engraving as romance payoff', () => {
    const report = auditGenreDrift({
      title: '死对头协议同居后先动心',
      synopsis: '协议同居恋爱，关系回报来自旧伤被记得、星星吊饰和嘴硬靠近。',
      genre: 'romance',
      chapterContent: buildLongText([
        '客厅里铺着瑜伽垫，顾砚舟坐在沙发边缘，林栀让他脱外套，右肩旧伤让他的手指卡了两次。',
        '她给他推拿时摸到疤痕，声音压低，问自己能不能让他不疼。他没回答，只把右肩交给她。',
        '最后他拿起那枚无刻字星星，说等她给出答案，这枚什么时候能刻上字，他就什么时候还。',
      ]),
    });

    expect(report.promiseDrift.promiseHits).toBeGreaterThanOrEqual(4);
    expect(report.promiseDrift.missingPrimaryPayoff).toBe(false);
    expect(report.qualityFloorPassed, report.issues.join('\n')).toBe(true);
  });

  it('flags food business chapters that become investigation-led', () => {
    const report = auditGenreDrift({
      title: '荒年小饭馆：我靠一锅汤养活全村',
      synopsis: '美食经营，核心回报是做菜、客流、口碑和升级。',
      genre: 'modern',
      tags: ['美食', '经营', '种田'],
      chapterContent: buildLongText([
        '她没有开灶，而是调查匿名账本的来源，顺着线索查监控。',
        '秘密账册背后还有幕后人，新的证据指向镇外仓库。',
        '村民都在等饭馆开门，她却继续排查真相和匿名信。',
      ]),
    });

    expect(report.qualityFloorPassed).toBe(false);
  });

  it('recognizes food business payoff expressed as tasting, payment, queue, and stall pressure', () => {
    const report = auditGenreDrift({
      title: '荒年小饭摊，开局一锅酸汤面',
      synopsis: '美食经营，核心回报是出锅、试吃、掏钱、排队复购和小摊升级。',
      genre: 'modern',
      tags: ['美食', '经营'],
      chapterContent: buildLongText([
        '酸汤面刚出锅，庙口的风把葱香和面汤味卷到巷子里，路人停下问价。',
        '顾老六试吃第一碗后把汤喝干，摸出五块钱拍在桌上，又用微信转了一碗打包带走。',
        '妇人和两个短褐汉子排在后面等面，最后一碗售罄时，顾老六说明天带一队人来，沈知夏已经在算明天添面粉和摊子钱。',
      ]),
    });

    expect(report.promiseDrift.promiseHits + report.promiseDrift.sceneHits).toBeGreaterThanOrEqual(4);
    expect(report.qualityFloorPassed).toBe(true);
  });

  it('fails food business chapters that stay in cooking setup without sales payoff', () => {
    const report = auditGenreDrift({
      title: '荒年小饭摊，开局一锅酸汤面',
      synopsis: '美食经营，核心回报是出锅、试吃、掏钱、排队复购和小摊升级。',
      genre: 'modern',
      tags: ['美食', '经营'],
      chapterContent: buildLongText([
        '沈知夏在庙口支起摊子，灶台底下的柴火烧得很旺，锅边冒出白汽。',
        '她把酸汤和面汤反复调匀，葱香从锅里散出来，破庙门口有人停步看了一眼。',
        '她继续切葱、添水、揉面，想着等汤再滚一滚就能开摊。',
      ]),
    });

    expect(report.promiseDrift.sceneHits).toBeGreaterThan(0);
    expect(report.promiseDrift.missingPrimaryPayoff).toBe(true);
    expect(report.qualityFloorPassed).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('题材主回报缺失'),
    ]));
  });

  it('fails sports chapters that stay in training setup without competitive result', () => {
    const report = auditGenreDrift({
      title: '替补席最后一格',
      synopsis: '体育竞技青春文，主线是训练、选拔赛、比分压力和队友信任。',
      genre: 'modern',
      tags: ['体育', '篮球'],
      chapterContent: buildLongText([
        '沈砚走进体育馆，球场灯光亮起，教练站在替补席边看计时器。',
        '他在弧顶和底角之间做折返，队友站在记分牌下等下一组训练。',
        '训练继续，所有人重新排队，膝盖反馈正常，他准备再跑一组。',
      ]),
    });

    expect(report.promiseDrift.sceneHits).toBeGreaterThan(0);
    expect(report.promiseDrift.missingPrimaryPayoff).toBe(true);
    expect(report.qualityFloorPassed).toBe(false);
  });

  it('passes hard sci-fi chapters that use world rules as experiment feedback', () => {
    const report = auditGenreDrift({
      title: '星环维修员',
      synopsis: '硬科幻，核心回报是实验、反馈、修正和工程解决。',
      genre: 'scifi',
      tags: ['科幻', '工程'],
      chapterContent: buildLongText([
        '叶澜把冷却阀调低三度，实验读数立刻回落，星环外壳的裂纹停止扩散。',
        '第二轮测试失败后，她改写推进模块参数，反馈曲线终于贴近安全阈值。',
        '维修队按新方案启动外层环，失控的光带被压回轨道，工程问题当场得到验证。',
      ]),
    });

    expect(report.qualityFloorPassed, report.issues.join('\n')).toBe(true);
  });

  it('flags engineering sci-fi chapters that replace repair feedback with signal-source investigation', () => {
    const report = auditGenreDrift({
      title: '星环维修员',
      synopsis: '硬科幻工程文，核心回报是读数、参数修正、实验反馈和现场维修。',
      genre: 'scifi',
      tags: ['科幻', '工程'],
      chapterContent: buildLongText([
        '叶澜没有继续修气闸，而是开始调查匿名泵体信号的来源。',
        '她调出监控、追查未登记操作者，顺着线索寻找幕后人留下的证据。',
        '冷却阀还在报警，氧压持续下降，她却把所有时间都放在那个秘密信号到底是什么上。',
      ]),
    });

    expect(report.qualityFloorPassed).toBe(false);
    expect(report.issues[0]).toContain('题材漂移');
  });

  it('flags engineering sci-fi endings that become source-mystery hooks without an executable fault', () => {
    const report = auditGenreDrift({
      title: '星环维修员',
      synopsis: '硬科幻工程文，核心回报是读数、参数修正、实验反馈和现场维修。',
      genre: 'scifi',
      tags: ['科幻', '工程'],
      chapterContent: buildLongText([
        '叶澜更换冷却阀密封环，压力读数回到标准值，信标从红灯跳成绿灯。',
        '她把维修日志签完，确认泵体恢复运行，工具箱锁回气闸壁挂架。',
        '那个泵的信号来源如果不是线路串扰，不是计时器老化，它到底是什么？她决定下周亲手确认。',
      ]),
    });

    expect(report.qualityFloorPassed).toBe(false);
    expect(report.issues[0]).toContain('科幻/工程章尾');
  });

  it('does not treat confirm-key UI around device diagnostics as a source-mystery hook', () => {
    const report = auditGenreDrift({
      title: '星环维修员',
      synopsis: '硬科幻工程文，核心回报是读数、参数修正、实验反馈和现场维修。',
      genre: 'scifi',
      tags: ['科幻', '工程'],
      chapterContent: buildLongText([
        '叶澜更换散热风扇轴承，振动加速度从4.1m/s²回到1.8m/s²，温度降到39°C。',
        '系统弹出推荐检查：A段循环泵轴承状态检测，关联逻辑为振动频谱特征频率1200Hz重叠。',
        '她没有点确认键，重新拉开工具箱，取出万用表，朝A段器材库走去。',
      ]),
    });

    expect(report.qualityFloorPassed).toBe(true);
    expect(report.issues.join('\n')).not.toContain('科幻/工程章尾');
  });

  it('passes civilization-upgrade fantasy chapters without turning them into cultivation or mystery', () => {
    const report = auditGenreDrift({
      title: '我在蛮荒建了个文明',
      synopsis: '穿越蛮荒，教土著知识获得异能，带领部落文明升级并对抗神罚。',
      genre: 'fantasy',
      chapterContent: buildLongText([
        '秦墨在河滩教阿骨制陶，泥碗烧成时，部落第一次能把清水和肉汤分别装起来。',
        '系统提示他获得土系异能，掌心能摸出地下黏土层和塌陷裂缝的位置。',
        '灰犬神兽逼近下游，他用新能力带人避开软地，围栏和陶碗都成了部落进步的证据。',
      ]),
    });

    expect(report.promiseDrift.promiseHits + report.promiseDrift.sceneHits).toBeGreaterThan(0);
    expect(report.qualityFloorPassed).toBe(true);
  });

  it('recognizes civilization-upgrade pottery and storage payoff from natural wording', () => {
    const report = auditGenreDrift({
      title: '我在蛮荒教部落烧陶',
      synopsis: '文明升级题材，主角靠制陶、净水、储粮和部落反馈推进生存条件。',
      genre: 'fantasy',
      chapterContent: buildLongText([
        '秦衡把第三个碗胚放回火堆，用热灰覆盖一半，慢点加柴控制火候。',
        '陶碗烧成后，他把河水倒进去，水晃了晃没漏，孩子接过碗喝了两口。',
        '阿图说天亮去找更大的粘土坑，长老点头同意，秦衡决定明天烧个缸，用来装水和储粮。',
      ]),
    });

    expect(report.promiseDrift.promiseHits).toBeGreaterThanOrEqual(4);
    expect(report.promiseDrift.missingPrimaryPayoff).toBe(false);
    expect(report.qualityFloorPassed, report.issues.join('\n')).toBe(true);
    expect(report.issues.join('\n')).not.toContain('术语污染');
  });

  it('recognizes farming survival payoff expressed as money and one more day of food', () => {
    const report = auditGenreDrift({
      title: '荒年小院，野菜汤换活路',
      synopsis: '种田求生，主角靠找野菜、生火、做汤、换钱换粮活下来。',
      genre: 'historical',
      tags: ['种田', '荒年'],
      chapterContent: buildLongText([
        '沈青禾在塌墙边捡干枝，火星落进草绒里，火苗终于稳住。',
        '她把野菜汤端给张婶尝，张婶数出五文铜钱，说明儿再给她留一碗。',
        '五文够换半斤粗粮，够她再撑一天，她抬头看向院外荒地，准备明早继续翻找。',
      ]),
    });

    expect(report.promiseDrift.promiseHits).toBeGreaterThanOrEqual(4);
    expect(report.promiseDrift.missingPrimaryPayoff).toBe(false);
    expect(report.qualityFloorPassed, report.issues.join('\n')).toBe(true);
  });

  it('recognizes rivals romance payoff from forced proximity, remembered scars, and signing', () => {
    const report = auditGenreDrift({
      title: '和死对头同居后先动心',
      synopsis: '死对头协议同居，关系回报是互怼、旧疤被记得、嘴硬关心和最终签字。',
      genre: 'romance',
      chapterContent: buildLongText([
        '门锁刚响，许知意的帽子就被拽住，整个人被拉回玄关，后背撞上周叙胸膛。',
        '周叙看见她无名指旧疤，嘴上嫌她手残，却把一双新手套推到杯底。',
        '房东催共享合约，她和他隔着客厅四目相对，最后按灭手机，深吸一口气签字。',
      ]),
    });

    expect(report.promiseDrift.promiseHits).toBeGreaterThanOrEqual(4);
    expect(report.promiseDrift.missingPrimaryPayoff).toBe(false);
    expect(report.qualityFloorPassed, report.issues.join('\n')).toBe(true);
  });

  it('does not flag suspense chapters for using clues and truth as the main drive', () => {
    const report = auditGenreDrift({
      title: '旧楼第七扇门',
      synopsis: '悬疑推理，核心回报是线索、误导和真相推进。',
      genre: 'mystery',
      tags: ['悬疑', '推理'],
      chapterContent: buildLongText([
        '陈默沿着监控死角调查，发现匿名短信和第七扇门的秘密有关。',
        '新的证据指向旧楼管理员，线索之间的矛盾让真相更近了一步。',
      ]),
    });

    expect(report.suspenseGenre).toBe(true);
    expect(report.qualityFloorPassed).toBe(true);
  });

  it('recognizes historical power struggle signals as the genre promise', () => {
    const report = auditGenreDrift({
      title: '我收叛将推门阀，女帝却恨我入骨',
      synopsis: '历史权谋，门阀、太后、皇帝和城门兵权互相博弈。',
      genre: 'historical',
      tags: ['权谋', '门阀'],
      chapterContent: buildLongText([
        '沈渊站在城门前，看着白幡转向，太后的人和皇帝的人同时改了阵型。',
        '府衙的印被压在卷轴下，戍卫营被迫站队，门阀失去一条退路。',
        '铁门和药铺正门同时变成筹码，谁拿到城门，谁就能反制朝堂。',
      ]),
    });

    expect(report.promiseDrift.promiseHits + report.promiseDrift.sceneHits).toBeGreaterThan(0);
    expect(report.qualityFloorPassed).toBe(true);
  });

  it('does not treat ordinary workplace document terms as engineering pollution', () => {
    const report = auditGenreDrift({
      title: '她在会议室抢回项目',
      synopsis: '女性事业线逆袭文，主线是会议室公开反击、客户反馈和项目归属变化。',
      genre: 'modern',
      tags: ['职场', '事业线'],
      chapterContent: buildLongText([
        '林若棠在会议室拿出客户签名的书面反馈，指出验收节点是她加班改完的。',
        '陈铭说自己优化了方案，她打开编辑记录，项目初稿署名仍是她一个人。',
        '老赵当场确认林若棠主责，客户反馈按她的版本推进，会后把材料发到邮箱。',
      ]),
    });

    expect(report.promiseDrift.promiseHits).toBeGreaterThan(0);
    expect(report.qualityFloorPassed, report.issues.join('\n')).toBe(true);
    expect(report.issues.join('\n')).not.toContain('术语污染');
  });

  it('allows technical delivery evidence in a workplace software project', () => {
    const report = auditGenreDrift({
      title: '她把项目抢回来',
      synopsis: '女性事业线逆袭文，女主靠客户交付和公开站队夺回项目主导权。',
      genre: 'modern',
      constitutionTags: ['female-career'],
      chapterContent: buildLongText([
        '林念在会议室打开版本记录，指出D模块部署节点已经提前，客户要求今天确认。',
        '陈工核对时间戳和缓存记录后当场表态，张明必须为旧方案承担延期责任。',
        '王总把签字页推给林念，要求她在十点前提交替代方案并直接向客户汇报。',
      ]),
    });

    expect(report.issues.join('\n')).not.toContain('术语污染');
  });

  it('does not treat livestream sync and brand authorization wording as engineering pollution', () => {
    const report = auditGenreDrift({
      title: '塌房预警开播夜',
      synopsis: '女主拿到塌房预警能力，在直播间提前避雷、截胡资源、阻止团队踩坑，并靠公开验证和流量反馈爆红。',
      genre: 'modern',
      constitutionTags: ['collapse-warning'],
      chapterContent: buildLongText([
        '林星收到预警：林峰假唱声画不同步，倒计时只剩五分钟。',
        '她在直播现场换序救场，IP品牌方代表当场确认授权书有问题，合同改由她团队对接。',
        '热搜验证了预警，直播间人数上涨，IP品牌方要求今晚二十二点前签约，IP联名档期也转给她复核。',
      ]),
    });

    expect(report.issues.join('\n')).not.toContain('术语污染');
  });

  it('flags war-statecraft chapters that drift into altar key mechanics', () => {
    const report = auditGenreDrift({
      title: '万域霸主',
      synopsis: '陆擎收拢残兵败将，连斩十三域主，攻破三百六十七城，建立天朝秩序：废奴、军功爵、科举、国子监，旧贵族反扑。',
      genre: '架空历史',
      tags: ['战争', '权谋'],
      chapterContent: buildLongText([
        '陆擎没有调兵，也没有处理城门军令，而是盯着祭坛上的坐标。断碑亮起，钥匙碎片和密钥同时指向第三门。',
        '银日轮在基座转动，血引完成后，封印被传送到第二道门背后，法罗要求他们继续寻找下一处锚点。',
        '军营和旧贵族反扑都被搁置，所有人围着祭坛、坐标、碎片和第三柱等待新的神谕。',
      ]),
    });

    expect(report.qualityFloorPassed).toBe(false);
    expect(report.issues.join('\n')).toContain('战争/权谋承诺');
  });

  it('passes war-statecraft chapters when politics and battlefield outcomes dominate', () => {
    const report = auditGenreDrift({
      title: '万域霸主',
      synopsis: '陆擎收拢残兵败将，连斩十三域主，攻破三百六十七城，建立天朝秩序：废奴、军功爵、科举、国子监，旧贵族反扑。',
      genre: '架空历史',
      tags: ['战争', '权谋'],
      chapterContent: buildLongText([
        '陆擎在城门前改阵，先以骑兵压住东门，再让降兵封死粮道，守军被迫交出兵权。',
        '府衙当场张贴废奴政令，军功爵名册送进军营，旧贵族的私兵被拆进三支新营。',
        '国子监开榜后，旧贵族只能退回朝堂布局，下一轮反扑从粮仓和校场同时开始。',
      ]),
    });

    expect(report.promiseDrift.promiseHits + report.promiseDrift.sceneHits).toBeGreaterThan(0);
    expect(report.qualityFloorPassed).toBe(true);
  });
});

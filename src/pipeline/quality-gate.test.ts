import { describe, expect, it } from 'vitest';
import { evaluateQualityGate } from './quality-gate.js';

describe('evaluateQualityGate genre coverage', () => {
  it('recognizes domain-specific beats only when promise keywords are supplied', () => {
    const text = [
      '沈渊站在城门前，看着白幡转向，太后的人和皇帝的人同时改了阵型。',
      '府衙的印压在卷轴下，戍卫营被迫换防，门阀失去一条退路。',
      '铁门和药铺正门同时变成筹码，谁拿到城门，谁就能反制朝堂。',
      '苏清月把开门线压进掌心，金色纹路发热，左臂灰线逼得沈渊立刻抬手。',
    ].join('\n\n').repeat(8);

    const withoutDomainKeywords = evaluateQualityGate({
      chapterContent: text,
      gateMode: 'warn',
    });
    const withDomainKeywords = evaluateQualityGate({
      chapterContent: text,
      gateMode: 'warn',
      domainStructureKeywords: [
        '站队',
        '布局',
        '反制',
        '夺权',
        '兵权',
        '门阀',
        '朝堂',
        '太后',
        '皇帝',
        '府衙',
        '戍卫',
        '阵型',
        '城门',
        '白幡',
        '卷轴',
        '铁门',
        '药铺',
        '印',
        '刀鞘',
      ],
    });

    expect(withoutDomainKeywords.findings.some(finding => finding.code === 'low-structure-signal')).toBe(true);
    expect(withDomainKeywords.findings.some(finding => finding.code === 'low-structure-signal')).toBe(false);
    expect(withDomainKeywords.structureScore).toBeGreaterThan(withoutDomainKeywords.structureScore);
  });

  it.each([
    {
      label: 'food business',
      keywords: ['开张', '铜板', '闻香', '排队', '卖光', '灶台', '锅边', '摊子', '集市'],
      text: [
        '灶台前第一锅汤滚起来，锅边香气压过集市的冷风，排队的人从摊子前绕到街角。',
        '她把铜板一枚枚推到木匣里，抬手把最后三碗递出去，锅底在众人眼前见了底。',
        '隔壁酒楼掌柜看着空锅，脸色变了；她把招牌重新挂正，当场宣布明日继续开张。',
      ].join('\n\n'),
    },
    {
      label: 'romance rivalry',
      keywords: ['互怼', '对上', '同框', '逼近', '拉住', '护短', '吃醋', '失控', '门口', '宴会'],
      text: [
        '宴会门口，两个人被人群挤到同框，谁也没先退，目光先对上。',
        '她转身要走，他伸手拉住她的手腕，替她挡下那杯递错的酒，声音低得只有她听见。',
        '旁人起哄时，她先开口护短，把他堵回门边，两句互怼把场面推到失控前一息。',
      ].join('\n\n'),
    },
    {
      label: 'scifi survival',
      keywords: ['气闸', '氧舱', '轨道', '舱门', '电池', '反推', '维修臂', '补给', '信标'],
      text: [
        '氧舱警报亮起，轨道碎片擦过外壳，气闸只剩一条能手动闭合的缝。',
        '他把备用电池塞进维修臂底座，借反推把舱门顶回原位，信标终于从红灯跳成绿灯。',
        '补给箱撞上舱壁那一刻，所有人都听见锁扣扣死，下一轮绕行路线被迫提前。',
      ].join('\n\n'),
    },
  ])('supports $label beats without suspense vocabulary', ({ keywords, text }) => {
    const expanded = text.repeat(8);
    const report = evaluateQualityGate({
      chapterContent: expanded,
      gateMode: 'warn',
      domainStructureKeywords: keywords,
    });

    expect(report.findings.some(finding => finding.code === 'low-structure-signal')).toBe(false);
    expect(expanded).not.toMatch(/秘密|真相|线索|调查|监控|匿名|幕后/);
  });

  it('counts sports payoff and teammate feedback as emotional movement', () => {
    const isolatedTraining = Array.from({ length: 8 }, () => [
      '折返跑第十七秒，沈砚踩过底线，膝盖疼得像被细线勒住。',
      '他完成第八组，扶着膝盖喘气，训练继续，所有人重新排队。',
    ].join('\n\n')).join('\n\n');
    const competitivePayoff = Array.from({ length: 5 }, () => [
      '刘洋看了一眼底角的沈砚，还是把球传给孙毅。孙毅被贴住强投，球砸在篮筐前沿，A组快攻把比分打成4:0。',
      '下一回合沈砚补防救球，没有强投，背后运球后把球击地传到底角。刘洋接球三分命中，记分牌翻成4:5。',
      '刘洋跑回来和沈砚击掌，说了一句“好传”。教练陈维吹哨暂停，宣布明天选拔赛沈砚首发打一节。',
    ].join('\n\n')).join('\n\n');

    const trainingReport = evaluateQualityGate({
      chapterContent: isolatedTraining,
      gateMode: 'warn',
      stylePreset: 'campus',
    });
    const payoffReport = evaluateQualityGate({
      chapterContent: competitivePayoff,
      gateMode: 'warn',
      stylePreset: 'campus',
    });

    expect(payoffReport.emotionScore).toBeGreaterThan(trainingReport.emotionScore);
    expect(payoffReport.emotionScore).toBeGreaterThanOrEqual(55);
    expect(payoffReport.findings.some(finding => finding.code === 'low-emotion-variance')).toBe(false);
  });

  it('counts food business sales and competitor pressure as emotional movement', () => {
    const purchaseLedger = Array.from({ length: 6 }, () => [
      '沈知夏清晨去粮铺买三斤杂面粉，花了三文，又花一文买酸菜。',
      '她回到破庙口，把面粉倒进布袋，算出怀里还剩三文，准备继续开摊。',
    ].join('\n\n')).join('\n\n');
    const businessPayoff = Array.from({ length: 4 }, () => [
      '赵掌柜抢了风口，壮汉先买了粥，沈知夏少卖一碗。她摘回野花椒，把酸汤味道重新顶到路口。',
      '妇人尝了一口，当场朝粥摊喊今天不吃粥了，三个挑夫排队掏铜板，最后六碗卖光。',
      '她蹲在灶台边算收入，扣掉面粉和酸菜成本，净利十一文，转身买下两个陶碗和一块写价钱的木牌。',
    ].join('\n\n')).join('\n\n');

    const ledgerReport = evaluateQualityGate({
      chapterContent: purchaseLedger,
      gateMode: 'warn',
      stylePreset: 'serious',
    });
    const payoffReport = evaluateQualityGate({
      chapterContent: businessPayoff,
      gateMode: 'warn',
      stylePreset: 'serious',
    });

    expect(payoffReport.emotionScore).toBeGreaterThan(ledgerReport.emotionScore);
    expect(payoffReport.emotionScore).toBeGreaterThanOrEqual(54.5);
    expect(payoffReport.findings.some(finding => finding.code === 'low-emotion-variance')).toBe(false);
  });

  it('counts romance choice payoff and visible reaction as emotional movement', () => {
    const proceduralLivestream = Array.from({ length: 5 }, () => [
      'Lisa宣布直播进入好感值测试环节，工作人员递上两块白板。',
      '两个人按流程写下答案，同时亮给镜头，弹幕继续滚动。',
    ].join('\n\n')).join('\n\n');
    const relationshipChoice = Array.from({ length: 3 }, () => [
      'Lisa宣布直播进入好感值测试环节，弹幕问同居期间最心动的瞬间。她握着白板，掌心出了汗，口袋里的星星吊饰硌得掌根发疼。',
      '她写下“他笑了”，他写下“她站过来的时候”。弹幕刷过满屏，顾砚舟却偏头看着她，像在辨认这句话到底是真是假。',
      '她把便利贴攥紧，走回野餐垫旁，说等直播结束就告诉他一个答案。他没回答，只把她咬过一口的三明治推到她面前。',
    ].join('\n\n')).join('\n\n');

    const proceduralReport = evaluateQualityGate({
      chapterContent: proceduralLivestream,
      gateMode: 'warn',
      stylePreset: 'romance-sweet',
    });
    const relationshipReport = evaluateQualityGate({
      chapterContent: relationshipChoice,
      gateMode: 'warn',
      stylePreset: 'romance-sweet',
    });

    expect(relationshipReport.emotionScore).toBeGreaterThan(proceduralReport.emotionScore);
    expect(relationshipReport.emotionScore).toBeGreaterThanOrEqual(60);
    expect(relationshipReport.findings.some(finding => finding.code === 'low-emotion-variance')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { detectStartupOpeningOverload } from './startup-opening-overload.js';

describe('detectStartupOpeningOverload', () => {
  it('flags chapter one that opens a second arc after the first payoff', () => {
    const report = detectStartupOpeningOverload({
      chapterNumber: 1,
      chapterContent: [
        '顾砚舟推开解剖室的门，满屋福尔马林味和抓挠门板的尖响一起压过来，五个新手玩家缩在墙角不敢抬头，只有他还在盯着天花板和通风口，像在看一间还没装修完的铺面。',
        '他当场激活系统，花光点数换出安全结界和一杯奶茶，淡金色的光幕把厉鬼硬生生拦在外面，连空气里的血腥味都被温热甜香盖住，角落里的人这才意识到他不是疯了，而是要当着副本的面把店开起来。',
        '学姐喝完后当场签约，便利店的第一名员工正式到岗，系统面板连着跳出雇佣成功、员工录入、商品解锁三条提示，顾砚舟也顺势把安保、盘货和夜间巡逻的工作一次性分给她。',
        '五个新手玩家冲进结界付款，他又连着卖掉护身符、矿泉水和压缩饼干，点数一路入账，原本快要崩掉的逃生秩序被他三句话改成了明码标价的交易规则，连躲在门边观望的资深玩家都开始动摇。',
        '紧接着他把店铺直接迁到旧礼堂，正式开业，货架和收银台同时展开，原本阴森破败的演讲台被金白色结界洗成了二十四小时营业的安全区，所有人还没从第一笔买卖里回过神，就被他拉着进入第二个更大的经营场。',
        '【店铺绑定成功！】【正式开业！】【主神制裁协议启动。】血红色提示框在视野里接连炸开，下一副本难度提升、结算奖励削减、稽查者即将介入，一连串新规则像第二轮剧情一样压了下来。',
        '几分钟后，规则渗透再次上涨，新的稽查者已经踩着金属脚步堵到门外，红衣学姐重新绷紧鬼气，几个玩家缩在货架后发抖，而顾砚舟已经开始盘算下一批员工福利和快乐水采购，整个章尾不再只是钩子，而是又开了一轮新局。',
      ].join('\n\n'),
    });

    expect(report.overloaded).toBe(true);
    expect(report.reason).toContain('第一次可见回报后');
  });

  it('keeps a tight opening chapter as non-overloaded', () => {
    const report = detectStartupOpeningOverload({
      chapterNumber: 1,
      chapterContent: [
        '沈知微推门进包厢，把婚姻协议拍在陆景珩面前。',
        '她只给二十四小时：结婚，换信托资金解锁。',
        '陆景珩翻完最后一页，当场签字。',
        '临出门前，他只说了一句：明早九点，民政局见。',
      ].join('\n\n'),
    });

    expect(report.overloaded).toBe(false);
  });
});

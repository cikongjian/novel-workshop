import { describe, expect, it } from 'vitest';
import { evaluateCommercialGate } from './commercial-gate.js';
import { buildPromiseContract } from './promise-contract.js';

describe('evaluateCommercialGate promise drift', () => {
  it('flags entertainment chapters that drift into mystery-first progression', () => {
    const contract = buildPromiseContract({
      title: '重生娱乐圈：开局绑定未来影帝',
      synopsis: '女主重生后要靠试镜、资源和热搜反杀翻红。',
      tags: ['娱乐圈', '重生'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });

    const report = evaluateCommercialGate({
      chapterContent: [
        '林栀收到匿名短信后，没有去试镜，而是先调查删评记录。',
        '她怀疑幕后还有人监控自己，便对着录音和线索逐条排查。',
        '真相越来越近，可新的秘密也接连冒出来。',
      ].join(''),
      chapterNumber: 2,
      plotThreads: [],
      protagonistNames: ['林栀'],
      promiseContract: contract,
      gateMode: 'warn',
    });

    expect(report.findings.some(item => item.code === 'genre-promise-drift')).toBe(true);
  });

  it('flags unsupported information leaps from system hints to dossier-level details', () => {
    const contract = buildPromiseContract({
      title: '被雪藏三年后，我靠塌房预警爆红了',
      synopsis: '过气艺人绑定预警系统后，靠直播和热搜翻红。',
      tags: ['娱乐圈', '系统', '热搜'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });

    const report = evaluateCommercialGate({
      chapterContent: [
        '光幕弹出：【王维：职务侵占，曝光倒计时89天。】',
        '一段转账界面画面猛地挤进脑海，备注写着《星梦计划》宣发费。',
        '沈砚抬眼，直接报出一百二十万、四十五万、晨星文化传媒、法人刘建军、高新区创业园B座307。',
        '王维脸色一下白了。',
      ].join(''),
      chapterNumber: 3,
      plotThreads: [],
      protagonistNames: ['沈砚'],
      promiseContract: contract,
      gateMode: 'warn',
    });

    expect(report.findings.some(item => item.code === 'unsupported-information-leap')).toBe(true);
  });

  it('flags future-fragment variants that hide behind Chinese numerals and invoice tails', () => {
    const contract = buildPromiseContract({
      title: '被雪藏三年后，我靠塌房预警爆红了',
      synopsis: '过气艺人绑定预警系统后，靠直播和热搜翻红。',
      tags: ['娱乐圈', '系统', '热搜'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });

    const report = evaluateCommercialGate({
      chapterContent: [
        '系统光幕亮起：【王维：职务侵占，曝光倒计时22天。】',
        '几段破碎的画面猛地挤进脑海，发票号后六位是338775，另一张单据只剩账户尾号0892。',
        '沈砚抬眼就报出四十二万、鑫达文化传媒、法人姓王。',
      ].join(''),
      chapterNumber: 3,
      plotThreads: [],
      protagonistNames: ['沈砚'],
      promiseContract: contract,
      gateMode: 'warn',
    });

    expect(report.findings.some(item => item.code === 'unsupported-information-leap')).toBe(true);
  });

  it('flags antagonists who surrender too quickly and hand over multiple rewards at once', () => {
    const contract = buildPromiseContract({
      title: '被雪藏三年后，我靠塌房预警爆红了',
      synopsis: '过气艺人绑定预警系统后，靠直播和热搜翻红。',
      tags: ['娱乐圈', '系统', '热搜'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });

    const report = evaluateCommercialGate({
      chapterContent: [
        '王维压低声音，说住址已经查到了，不配合就等律师函。',
        '沈砚看着他，淡淡问了一句，你想怎么谈。',
        '王维立刻转账五万，当场答应压住法务，又拨电话安排热搜和资源。',
      ].join(''),
      chapterNumber: 3,
      plotThreads: [],
      protagonistNames: ['沈砚'],
      promiseContract: contract,
      gateMode: 'warn',
    });

    expect(report.findings.some(item => item.code === 'easy-antagonist-surrender')).toBe(true);
  });
});

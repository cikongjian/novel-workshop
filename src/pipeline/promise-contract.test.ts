import { describe, expect, it } from 'vitest';
import {
  buildPromiseContract,
  evaluatePromiseDrift,
} from './promise-contract.js';

describe('buildPromiseContract', () => {
  it('detects fanqie entertainment rise promises', () => {
    const contract = buildPromiseContract({
      title: '重生娱乐圈：开局绑定未来影帝',
      synopsis: '重生回选秀落选当天，女主靠试镜、热搜和资源反抢逆袭翻红。',
      tags: ['娱乐圈', '重生', '影帝'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });

    expect(contract.profileId).toBe('fanqie-entertainment-rise');
    expect(contract.requiredPayoffKeywords).toContain('试镜');
  });

  it('detects shame system promises', () => {
    const contract = buildPromiseContract({
      title: '穿书当天，我激活了羞耻系统',
      synopsis: '绑定羞耻系统后，女主必须完成社死任务，否则现场公开处刑。',
      tags: ['系统', '社死', '穿书'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });

    expect(contract.profileId).toBe('fanqie-shame-system');
    expect(contract.requiredPayoffKeywords).toContain('社死');
  });

  it('detects collapse-warning entertainment promises', () => {
    const contract = buildPromiseContract({
      title: '被雪藏三年后，我靠塌房预警爆红了',
      synopsis: '过气艺人绑定塌房预警系统后，靠公开预警、避雷截胡和直播翻红起量。',
      tags: ['娱乐圈', '顶流', '直播'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });

    expect(contract.profileId).toBe('fanqie-showbiz-warning-rise');
    expect(contract.constitutionSignals).toContain('collapse-warning');
    expect(contract.requiredPayoffKeywords).toContain('预警');
  });

  it('treats novel card tags as constitutional hard constraints', () => {
    const contract = buildPromiseContract({
      title: '她在仙门打脸升级',
      synopsis: '被逐出宗门后，女主靠金手指一路突破反杀。',
      tags: ['玄幻', '打脸', '爽文'],
      genre: 'fantasy',
      platformProfile: 'fanqie',
    });

    expect(contract.constitutionSignals).toContain('fantasy-upgrade');
    expect(contract.constitutionSignals).toContain('faceslap');
    expect(contract.summary).toContain('强制标签');
  });
});

describe('evaluatePromiseDrift', () => {
  it('flags suspense drift when entertainment payoff is missing', () => {
    const contract = buildPromiseContract({
      title: '重生娱乐圈：开局绑定未来影帝',
      synopsis: '女主重生后要在娱乐圈翻红。',
      tags: ['娱乐圈', '重生'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });

    const report = evaluatePromiseDrift(
      '林栀盯着被抹除的评论，开始调查幕后真相。匿名短信、监控记录、线索拼图一条条出现，她意识到有人在暗处试探她。',
      contract,
    );

    expect(report.active).toBe(true);
    expect(report.drifting).toBe(true);
    expect(report.missingPrimaryPayoff).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  evaluateSettingDriftGate,
  buildSettingDriftGateFixHints,
} from './setting-drift-gate.js';
import type { SettingBaseline } from './setting-baseline/types.js';

const baseline: SettingBaseline = {
  version: 1,
  novelId: 'n1',
  status: 'confirmed',
  createdAt: '2026-07-07T00:00:00.000Z',
  genre: '玄幻权谋',
  powerSystems: [{ name: '霸体', description: '从草根觉醒的霸体气血体系' }],
  worldFrame: { summary: '万域大地诸侯割据', factions: ['北境狼主', '南疆毒王'] },
  characterCores: [{ name: '陆擎', role: 'protagonist', identity: '草根孤儿铁血霸主' }],
  promises: ['统一万域建立天朝'],
  antiDriftClause: '不得引入系统化术语体系',
  forbiddenDirections: [
    '上界神明 / 天界秩序',
    '跨界传送门 / 传送阵坐标网络',
    '坐标-碎片-覆写-加密段-锚点 系统化术语体系',
  ],
  sourceSummary: 'test',
  canonicalWorldEntries: [{
    name: '宵禁规则',
    category: 'rule',
    description: '日落后关闭城门。',
    constraints: ['日落后城门必须关闭'],
    consequences: ['违规者会被巡夜司扣押'],
  }],
};

// 取自《万域霸主》后期漂移段特征：坐标/碎片/覆写/银日轮/祭坛/系统日志腔
const driftedChapter = [
  '陆擎站在坐标基座前，银日轮碎片闪烁。',
  '祭坛中央的符文亮起，浮现字迹：“坐标覆写完成”。',
  '他注入气血，碎片链路共振，加密段被读取。',
  '第二枚碎片的锚点锁定，传送门坐标重写，扫描网络反向追踪。',
  '法罗的备份令牌碎裂，覆写协议启动。',
  '祭坛表面浮现一行金字：“坐标锚点已注入，加密段校准完成”。',
].join('\n');

const normalChapter = [
  '陆擎提刀走出城门，赵铁柱跟在身后。',
  '北风卷着雪沫，落日城的旗帜猎猎作响。',
  '他望向北方，狼主的营地里炊烟升起。',
  '碎星刀在掌心震颤，霸体气血沿经脉运转。',
].join('\n');

describe('evaluateSettingDriftGate', () => {
  it('off 模式直接通过，不做检测', () => {
    const r = evaluateSettingDriftGate({ chapterContent: driftedChapter, baseline, chapterNumber: 50, gateMode: 'off' });
    expect(r.passed).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it('漂移术语簇密度过高时触发 drift-term-cluster', () => {
    const r = evaluateSettingDriftGate({ chapterContent: driftedChapter, baseline, chapterNumber: 50, gateMode: 'warn' });
    expect(r.findings.some(f => f.code === 'drift-term-cluster')).toBe(true);
    expect(r.driftScore).toBeGreaterThan(0);
  });

  it('正常章节不触发漂移信号', () => {
    const r = evaluateSettingDriftGate({ chapterContent: normalChapter, baseline, chapterNumber: 5, gateMode: 'warn' });
    expect(r.findings.some(f => f.code === 'drift-term-cluster')).toBe(false);
  });

  it('30 章后阈值收紧：轻度漂移在晚期触发、早期不触发', () => {
    // ~450 字正文 + 3 个漂移词 → density ≈ 6.6/千字：早期阈值 8（不触发）、晚期阈值 4（触发）
    const padding = '他走在漫长的山道上，四周寂静无声。'.repeat(30);
    const light = `${padding}坐标碎片祭坛。`;
    const early = evaluateSettingDriftGate({ chapterContent: light, baseline, chapterNumber: 5, gateMode: 'warn' });
    const late = evaluateSettingDriftGate({ chapterContent: light, baseline, chapterNumber: 50, gateMode: 'warn' });
    expect(early.findings.some(f => f.code === 'drift-term-cluster')).toBe(false);
    expect(late.findings.some(f => f.code === 'drift-term-cluster')).toBe(true);
  });

  it('warn 模式 passed 恒为 true（仅记录），strict 模式按 error 级 finding 判定', () => {
    const warn = evaluateSettingDriftGate({ chapterContent: driftedChapter, baseline, chapterNumber: 50, gateMode: 'warn' });
    expect(warn.passed).toBe(true); // warn 不阻断
    expect(warn.findings.every(f => f.level === 'warn')).toBe(true);

    const strict = evaluateSettingDriftGate({ chapterContent: driftedChapter, baseline, chapterNumber: 50, gateMode: 'strict' });
    expect(strict.findings.every(f => f.level === 'error')).toBe(true);
    expect(strict.passed).toBe(false); // 有 error 级 finding
  });

  it('提供 baseline 时检测 forbidden-direction（禁止方向命中）', () => {
    const r = evaluateSettingDriftGate({ chapterContent: driftedChapter, baseline, chapterNumber: 50, gateMode: 'warn' });
    expect(r.findings.some(f => f.code === 'forbidden-direction')).toBe(true);
  });

  it('无 baseline 时仅做术语簇/说明书化检测（信号 3/4 跳过）', () => {
    const r = evaluateSettingDriftGate({ chapterContent: driftedChapter, baseline: null, chapterNumber: 50, gateMode: 'warn' });
    expect(r.findings.some(f => f.code === 'drift-term-cluster')).toBe(true);
    expect(r.findings.some(f => f.code === 'forbidden-direction')).toBe(false);
  });

  it('detects a reversal of world bible canon only for a confirmed baseline', () => {
    const chapterContent = '宵禁规则形同虚设，城门彻夜敞开，所有人都能任意通行。';
    const confirmed = evaluateSettingDriftGate({
      chapterContent,
      baseline,
      chapterNumber: 8,
      gateMode: 'strict',
    });
    const pending = evaluateSettingDriftGate({
      chapterContent,
      baseline: { ...baseline, status: 'pending' },
      chapterNumber: 8,
      gateMode: 'strict',
    });

    expect(confirmed.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'baseline-world-rule-conflict' }),
    ]));
    expect(confirmed.passed).toBe(false);
    expect(pending.findings.some(finding => finding.code === 'baseline-world-rule-conflict')).toBe(false);
  });
});

describe('buildSettingDriftGateFixHints', () => {
  it('off 模式或无 findings 返回空串', () => {
    const off = evaluateSettingDriftGate({ chapterContent: driftedChapter, baseline, chapterNumber: 50, gateMode: 'off' });
    expect(buildSettingDriftGateFixHints(off)).toBe('');

    const clean = evaluateSettingDriftGate({ chapterContent: normalChapter, baseline, chapterNumber: 5, gateMode: 'warn' });
    expect(buildSettingDriftGateFixHints(clean)).toBe('');
  });

  it('有 findings 时生成"拉回基线"修复 hint', () => {
    const r = evaluateSettingDriftGate({ chapterContent: driftedChapter, baseline, chapterNumber: 50, gateMode: 'strict' });
    const hint = buildSettingDriftGateFixHints(r);
    expect(hint).toContain('设定漂移门禁修复');
    expect(hint).toContain('创作宪法');
  });
});

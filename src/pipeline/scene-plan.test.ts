import { describe, expect, it } from 'vitest';
import { buildScenePlanFromOutline, extractScenePlanChecks } from './scene-plan.js';
import { evaluateQualityGate } from './quality-gate.js';

describe('scene plan extraction', () => {
  it('extracts clean concrete keywords from markdown outline cards', () => {
    const outline = [
      '### 场景1：教学失败与第一轮代价（选材→搭斜梁→损失）',
      '- **地点**：洞口外斜坎 + 岩洞内侧',
      '- **出场角色**：秦墨、阿骨、虎牙、老族长',
      '- **内容要点**：秦墨演示斜梁，虎牙失手砸碎陶罐，独耳手臂受伤。',
      '',
      '### 场景2：神罚光再临 + 联合阻挡（结构+能力共同防御）',
      '- **地点**：洞口内外（棚顶下方 + 斜坎外侧）',
      '- **内容要点**：暗金色神罚光落在棚顶，灰犬撞向矮埂，秦墨用土系异能加固。',
    ].join('\n');

    const plan = buildScenePlanFromOutline(outline, 6);
    const checks = extractScenePlanChecks(plan);

    expect(checks).toHaveLength(2);
    expect(checks[0].keywords.join('、')).toContain('斜坎');
    expect(checks[0].keywords.join('、')).toContain('秦墨');
    expect(checks[0].keywords.join('、')).toContain('虎牙');
    expect(checks[0].keywords.join('、')).not.toContain('：洞口');
    expect(checks[1].keywords.join('、')).toContain('棚顶');
    expect(checks[1].keywords.join('、')).toContain('灰犬');
    expect(checks[1].keywords.join('、')).not.toContain('（棚顶');
  });

  it('does not report zero scene coverage when the prose fulfills generated scene cards', () => {
    const outline = [
      '### 场景1：冷却阀校准失败与第一次警报',
      '- **地点**：星环外层维修舱 + 控制台',
      '- **内容要点**：叶澜调整冷却阀，读数反跳，维修臂被震脱。',
      '',
      '### 场景2：推进模块重启 + 工程方案验证',
      '- **地点**：气闸外侧 + 轨道维修臂',
      '- **内容要点**：备用电池接入推进模块，反推让舱门闭合，信标从红灯跳绿。',
    ].join('\n');
    const plan = buildScenePlanFromOutline(outline, 6);
    const chapter = [
      '叶澜把冷却阀往回拧了半圈，控制台读数没有下降，反而猛地反跳。维修臂在震动里脱开卡扣，撞上舱壁。',
      '她把备用电池接进推进模块，抓住轨道维修臂的扶手下令反推。舱门在刺耳摩擦声里闭合，信标终于从红灯跳成绿灯。',
    ].join('\n\n').repeat(6);

    const report = evaluateQualityGate({
      chapterContent: chapter,
      scenePlan: plan,
      gateMode: 'warn',
    });

    expect(report.findings.some(finding => finding.code === 'low-scene-coverage')).toBe(false);
  });
});

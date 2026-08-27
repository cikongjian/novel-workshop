/**
 * 输出校验器测试
 */
import { describe, it, expect } from 'vitest';
import { validateAgentOutput, getRetryPolicy } from './output-validator.js';
import type { AgentOutput } from '../agents/types.js';

function makeOutput(role: AgentOutput['agentRole'], content: string): AgentOutput {
  return { agentRole: role, content, timestamp: new Date().toISOString() };
}

describe('validateAgentOutput', () => {
  it('should reject empty output', () => {
    const result = validateAgentOutput(makeOutput('writer', ''));
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('输出为空');
  });

  it('should reject whitespace-only output', () => {
    const result = validateAgentOutput(makeOutput('writer', '   \n  '));
    expect(result.valid).toBe(false);
  });

  it('should detect garbled text (control chars)', () => {
    const garbled = 'abc' + '\x01\x02\x03\x04' + 'def';
    const result = validateAgentOutput(makeOutput('writer', garbled));
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('乱码'))).toBe(true);
  });

  it('should detect garbled text (repeated chars)', () => {
    const repeated = 'a'.repeat(25);
    const result = validateAgentOutput(makeOutput('writer', repeated));
    expect(result.valid).toBe(false);
  });

  it('should enforce writer minLength', () => {
    const result = validateAgentOutput(makeOutput('writer', '短文'));
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('输出过短'))).toBe(true);
  });

  it('should pass valid writer output', () => {
    const content = '这是一段足够长的小说内容。'.repeat(30);
    const result = validateAgentOutput(makeOutput('writer', content));
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should reject writer output starting with code block', () => {
    const content = '```\n' + '内容'.repeat(200);
    const result = validateAgentOutput(makeOutput('writer', content));
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('禁止格式'))).toBe(true);
  });

  it('should reject writer output with future fragment plus case-file details', () => {
    const content = '系统光幕一闪，她脑海里闪过一段未来片段：账户尾号4921，报销单金额八十万，合同就压在会所包厢的桌上。'
      + '随后她立刻决定拿这些信息去反杀对方。'.repeat(20);
    const result = validateAgentOutput(makeOutput('writer', content));
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('禁止格式'))).toBe(true);
  });

  it('should reject editor output with system case-file leap', () => {
    const content = '预警面板弹出时，她已经看到流水、转账和监控编号，甚至连发票号尾号都清清楚楚。'
      + '这让她无需现场证据就能直接发动反击。'.repeat(20);
    const result = validateAgentOutput(makeOutput('editor', content));
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('禁止格式'))).toBe(true);
  });

  it('should enforce reader requiredPatterns', () => {
    const content = '这是一段读者反馈内容，写得不错，继续加油。';
    const result = validateAgentOutput(makeOutput('reader', content));
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('必要格式'))).toBe(true);
  });

  it('should pass valid reader output with score', () => {
    const content = JSON.stringify({
      overallScore: 8.5,
      pacing: '节奏稳定，冲突推进清晰。',
    });
    const result = validateAgentOutput(makeOutput('reader', content));
    expect(result.valid).toBe(true);
  });

  it('should pass unknown role with sufficient content', () => {
    const result = validateAgentOutput(makeOutput('plot-analyst' as AgentOutput['agentRole'], '有效内容'));
    expect(result.valid).toBe(true);
  });

  it('should reject world-builder output missing the canonical sections', () => {
    const result = validateAgentOutput(makeOutput(
      'world-builder',
      '这是一段长度足够但没有按世界观正史结构输出的分析。'.repeat(20),
    ));

    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('正史依据'))).toBe(true);
  });

  it('should pass structured world-builder output with proposals isolated', () => {
    const content = [
      '### 正史依据',
      '- 已有世界观：城门日落后关闭。',
      '### 场景环境',
      '- 城门内侧道路狭窄，限制马队通行。',
      '- 夜间只有巡夜司持有通行令牌，普通商队必须在城外等候。',
      '### 适用规则',
      '- 宵禁已经由已有世界观确认。',
      '- 通行令牌只解决进城资格，不赋予携带兵器的权限。',
      '### 势力动态',
      '- 巡夜司负责执行宵禁。',
      '- 本章没有材料证明其他势力已经介入。',
      '### 背景知识',
      '- 其他历史背景尚未建立。',
      '### 一致性检查',
      '- 无已知冲突。',
      '### 长期知识缺口',
      '- 力量体系尚未建立；其余领域已覆盖。',
      '### 待确认提案',
      '- 无。',
    ].join('\n');

    expect(validateAgentOutput(makeOutput('world-builder', content)).valid).toBe(true);
  });

  it('should reject world-builder output that mixes legacy proposal sections', () => {
    const content = [
      '### 正史依据',
      '- 已确认。',
      '### 场景环境',
      '- 已确认。',
      '### 适用规则',
      '- 已确认。',
      '### 势力动态',
      '- 已确认。',
      '### 背景知识',
      '- 已确认。',
      '### 一致性检查',
      '- 无冲突。',
      '### 长期知识缺口',
      '- 历史时间线尚未建立。',
      '### 待确认提案',
      '- 无。',
      '### 新增设定建议',
      '- 增加隐藏神族。',
    ].join('\n');

    expect(validateAgentOutput(makeOutput('world-builder', content)).valid).toBe(false);
  });
});

describe('getRetryPolicy', () => {
  it('should return 1 retry for writer', () => {
    const policy = getRetryPolicy('writer');
    expect(policy.maxRetries).toBe(1);
    expect(policy.temperatureIncrement).toBe(0.15);
  });

  it('should return 1 retry for reader', () => {
    const policy = getRetryPolicy('reader');
    expect(policy.maxRetries).toBe(1);
    expect(policy.temperatureIncrement).toBe(0.05);
  });

  it('should return default for unknown role', () => {
    const policy = getRetryPolicy('world-builder');
    expect(policy.maxRetries).toBe(2);
  });
});

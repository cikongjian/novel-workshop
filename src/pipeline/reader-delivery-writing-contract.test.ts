import { describe, expect, it } from 'vitest';
import { buildReaderDeliveryWritingContract } from './reader-delivery-writing-contract.js';

describe('buildReaderDeliveryWritingContract', () => {
  it('provides opening, reaction and ending acceptance criteria', () => {
    const contract = buildReaderDeliveryWritingContract();
    expect(contract).toContain('前 500 字');
    expect(contract).toContain('两次命名角色反应节拍');
    expect(contract).toContain('最后 300 字');
    expect(contract).toContain('第 N 章');
    expect(contract).toContain('具体选择');
  });

  it('adds workplace-specific conflict and public response requirements', () => {
    const contract = buildReaderDeliveryWritingContract({
      genre: 'modern',
      constitutionTags: ['female-career'],
    });
    expect(contract).toContain('当面冲突');
    expect(contract).toContain('3 个具名人物反应节拍');
    expect(contract).toContain('盟友承担风险');
    expect(contract).toContain('最多连续写 2 段');
    expect(contract).toContain('改变权限、责任、关系或资源');
    expect(contract).toContain('预算责任');
  });
});

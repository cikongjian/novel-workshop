import { describe, expect, it } from 'vitest';
import {
  buildWriterWorldGuidance,
  stripUnconfirmedWorldSections,
} from './world-builder-guidance.js';

describe('world-builder guidance', () => {
  it('removes author-only secrets and unconfirmed suggestions', () => {
    const content = [
      '## 适用规则',
      '- 已确认：使用能力会消耗体力。',
      '## 背景知识',
      '### 必须在正文中体现',
      '- 城门夜间关闭。',
      '### 作者心中有数即可',
      '- 幕后真凶其实是城主。',
      '## 一致性检查',
      '- 无已知冲突。',
      '## 长期知识缺口',
      '- 力量体系尚未建立。',
      '## 新增设定建议',
      '- 建议增加隐藏神族。',
    ].join('\n');

    const result = stripUnconfirmedWorldSections(content);

    expect(result).toContain('使用能力会消耗体力');
    expect(result).toContain('城门夜间关闭');
    expect(result).toContain('无已知冲突');
    expect(result).not.toContain('幕后真凶');
    expect(result).not.toContain('力量体系尚未建立');
    expect(result).not.toContain('隐藏神族');
  });

  it('marks retained content as non-canonical chapter guidance', () => {
    const result = buildWriterWorldGuidance('## 场景环境\n- 山路狭窄。');

    expect(result).toContain('不是新的世界观正史');
    expect(result).toContain('不得据此新增年代、势力、能力、幕后真相或精确数值');
    expect(result).toContain('山路狭窄');
  });

  it('returns undefined when only proposal sections remain', () => {
    expect(buildWriterWorldGuidance('## 待确认提案\n- 新增一个帝国。')).toBeUndefined();
  });
});

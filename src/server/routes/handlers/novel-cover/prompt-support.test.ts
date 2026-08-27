import { describe, expect, it } from 'vitest';
import {
  buildTemplateCoverPrompt,
  composeCoverPromptBlock,
  parseCoverPromptBlock,
} from './prompt-support.js';

describe('novel cover prompt support', () => {
  it('builds template prompt with cover-safe constraints', () => {
    const payload = buildTemplateCoverPrompt(
      {
        id: 'n1',
        title: '长夜余烬',
        genre: 'fantasy',
        synopsis: '主角在废土尽头寻找旧日火种。',
        description: '一场关于复仇与救赎的旅程。',
        tags: ['废土', '升级'],
      } as any,
      [
        {
          name: '林夜',
          role: 'protagonist',
          firstAppearance: 1,
          appearance: '黑衣、持刃、眼神冷冽',
          personality: '克制隐忍',
          motivation: '寻找真相',
          arc: '',
          position: '巡夜人',
        },
      ] as any,
      {
        chapters: [{ title: '火种现身', summary: '主角第一次发现火种线索。' }],
        plotThreads: [{ name: '火种', description: '追索旧文明遗留力量。' }],
      } as any,
    );

    expect(payload.promptSource).toBe('template');
    expect(payload.positivePrompt).toContain('竖版 2:3 构图');
    expect(payload.positivePrompt).toContain('上方三分之一标题安全区');
    expect(payload.contextSummary).toContain('题材：史诗玄幻');
  });

  it('composes and parses prompt blocks', () => {
    const block = composeCoverPromptBlock('heroic focus', 'blurry, text');
    expect(block).toBe('Positive: heroic focus\nNegative: blurry, text');
    expect(parseCoverPromptBlock(block)).toEqual({
      positivePrompt: 'heroic focus',
      negativePrompt: 'blurry, text',
    });
  });

  it('parses plain prompt blocks without negative section', () => {
    expect(parseCoverPromptBlock('single prompt line')).toEqual({
      positivePrompt: 'single prompt line',
      negativePrompt: '',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { inspectGeneratedTitle } from '../agents/title-generation-strategy.js';
import { buildChapterFallbackTitle } from './chapter-title-fallback.js';

describe('buildChapterFallbackTitle', () => {
  it('does not fall back to a generic chapter number title', () => {
    const title = buildChapterFallbackTitle({
      chapterNumber: 4,
      outline: '# 第4章',
      content: '叶澜蹲在气闸室前，发现氧压读数再次跳变。她把工单压到前台，先拆开传感器外壳。',
    });

    expect(title).not.toBe('第 4 章');
    expect(title).not.toBe('第4章');
    expect(inspectGeneratedTitle(title).mechanical).toBe(false);
  });

  it('uses concrete outline key events before a neutral fallback', () => {
    const title = buildChapterFallbackTitle({
      chapterNumber: 5,
      outline: [
        '# 第5章章节大纲',
        '',
        '#### 场景 1：冷却泵时序重启',
        '#### 场景 2：备用阀门锁死',
      ].join('\n'),
      content: '正文',
    });

    expect(title).toBe('冷却泵时序重启');
  });

  it('derives an engineering pressure title from chapter content when outline has no title', () => {
    const title = buildChapterFallbackTitle({
      chapterNumber: 6,
      outline: '# 第6章',
      content: [
        '她刚把旧垫片收进袋子，气闸外侧的氧压读数突然回落。',
        'HUD缓存里跳出新的工单：A 段分析仪报警，传感器模块锁死，必须立刻复位。',
      ].join('\n\n'),
    });

    expect(title).toMatch(/气闸|氧压|分析仪|传感器|模块|工单/u);
    expect(inspectGeneratedTitle(title).mechanical).toBe(false);
  });
});

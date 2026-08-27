import { describe, expect, it } from 'vitest';
import type { AgentContext } from './types.js';
import { shouldAdoptGeneratedChapterTitle } from './title-audit.js';
import {
  inspectGeneratedTitle,
  sanitizeGeneratedTitle,
} from './title-generation-strategy.js';
import { evaluateGeneratedTitle } from './title-quality-evaluator.js';
import { TitleGeneratorAgent } from './title-generator.js';

class TestTitleGeneratorAgent extends TitleGeneratorAgent {
  build(context: AgentContext): string {
    return this.buildUserMessage(context);
  }
}

describe('sanitizeGeneratedTitle', () => {
  it('strips quotes, whitespace and trailing punctuation', () => {
    expect(sanitizeGeneratedTitle('  "标题"  ')).toBe('标题');
    expect(sanitizeGeneratedTitle('【标题】')).toBe('标题');
    expect(sanitizeGeneratedTitle('标题。。')).toBe('标题');
  });

  it('strips chapter labels, book-title wrappers and leading separators', () => {
    expect(sanitizeGeneratedTitle('：青石谷的第一场雨')).toBe('青石谷的第一场雨');
    expect(sanitizeGeneratedTitle('《乱葬岗上的第一局》')).toBe('乱葬岗上的第一局');
    expect(sanitizeGeneratedTitle('第3章：城门口的羞辱')).toBe('城门口的羞辱');
    expect(sanitizeGeneratedTitle('章节标题：《送她进监狱》')).toBe('送她进监狱');
  });

  it('strips outline labels accidentally copied into chapter titles', () => {
    expect(sanitizeGeneratedTitle('章节大纲「一斤面粉和几根葱')).toBe('一斤面粉和几根葱');
    expect(sanitizeGeneratedTitle('大纲：灶台前的第二碗面')).toBe('灶台前的第二碗面');
  });

  it('strips trailing outline word-count hints from titles', () => {
    expect(sanitizeGeneratedTitle('返回公寓的车内约900字')).toBe('返回公寓的车内');
    expect(sanitizeGeneratedTitle('户外野餐主题大约1200字')).toBe('户外野餐主题');
  });

  it('strips unbalanced quote marks from generated titles', () => {
    expect(sanitizeGeneratedTitle('替补登场的第一次“认证')).toBe('替补登场的第一次认证');
    expect(sanitizeGeneratedTitle('「登记表上的第三个名字')).toBe('登记表上的第三个名字');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(sanitizeGeneratedTitle('   ')).toBe('');
  });
});

describe('inspectGeneratedTitle', () => {
  it('flags overly generic AI-like titles', () => {
    const result = inspectGeneratedTitle('真相竟是如此', ['祖师洞天', '首席拦路']);
    expect(result.mechanical).toBe(true);
    expect(result.reasons.join('、')).toContain('AI');
  });

  it('flags empty titles', () => {
    const result = inspectGeneratedTitle('');
    expect(result.mechanical).toBe(true);
    expect(result.reasons).toContain('标题为空');
  });

  it('flags overly short titles', () => {
    const result = inspectGeneratedTitle('真相');
    expect(result.mechanical).toBe(true);
    expect(result.reasons).toContain('标题过短');
  });

  it('flags titles that repeat recent titles', () => {
    const result = inspectGeneratedTitle('冷库里的钥匙', ['旧仓库的脚印', '冷库里的钥匙']);
    expect(result.mechanical).toBe(true);
    expect(result.reasons).toContain('与最近标题重复');
  });

  it('flags formulaic first-event titles and repeated shape', () => {
    const result = inspectGeneratedTitle('青石谷的第一场雨', ['城门口的第一口血']);
    expect(result.mechanical).toBe(true);
    expect(result.reasons).toContain('标题句式像模板');
    expect(result.reasons).toContain('与最近标题句式过近');
  });

  it('flags outline-summary style titles', () => {
    const result = inspectGeneratedTitle('策反与反噬', []);
    expect(result.mechanical).toBe(true);
    expect(result.reasons).toContain('标题像摘要小标题');
  });

  it('flags topic-like outline titles copied from chapter themes', () => {
    const result = inspectGeneratedTitle('成本危机下的经营突围：一碗酸汤面如何变小', []);
    expect(result.mechanical).toBe(true);
    expect(result.reasons).toContain('标题像摘要小标题');
  });

  it('flags protagonist-facing-pressure outline titles', () => {
    const result = inspectGeneratedTitle('沈知夏面对按碗收摊费的规则压力', []);
    expect(result.mechanical).toBe(true);
    expect(result.reasons).toContain('标题像摘要小标题');
  });

  it('flags result-summary titles that explain the chapter outcome', () => {
    const result = inspectGeneratedTitle('逃荒少女用一碗酸汤面实现开摊首单成交', []);
    expect(result.mechanical).toBe(true);
    expect(result.reasons).toContain('标题像摘要小标题');
    expect(inspectGeneratedTitle('茶水间——谈判前的试探').reasons).toContain('标题像摘要小标题');
    expect(inspectGeneratedTitle('林念正面回应老板权限质疑').reasons).toContain('标题像摘要小标题');
  });

  it('flags workplace outline summaries and mechanical separators', () => {
    const summaryTitles = [
      '技术对接会·开门见山',
      '林知带领小团队进场联调',
      '公开战场拿回测试环境',
      '提前介入的B组验收标准',
      '全栈接口覆盖测试结果出炉',
    ];

    for (const title of summaryTitles) {
      expect(inspectGeneratedTitle(title).reasons).toContain('标题像摘要小标题');
    }
    expect(inspectGeneratedTitle('林念夺回项目签字权').reasons).not.toContain('标题像摘要小标题');
  });

  it('flags repeated tail words and incomplete generated titles', () => {
    expect(inspectGeneratedTitle('灶台前的反击前').reasons).toContain('标题尾词重复');
    expect(inspectGeneratedTitle('周元在黑风崖灵药区开张卖').reasons).toContain('标题疑似残句');
    expect(inspectGeneratedTitle('周元在铁矿山赌场旁支灶开').reasons).toContain('标题疑似残句');
    expect(inspectGeneratedTitle('资源复审会议上').reasons).toContain('标题疑似残句');
    expect(inspectGeneratedTitle('林知在客户现场推进第二阶').reasons).toContain('标题疑似残句');
  });

  it('flags role-slot placeholders in generated titles', () => {
    expect(inspectGeneratedTitle('主角在项目成果被下属篡改').reasons).toContain('标题含角色占位词');
    expect(inspectGeneratedTitle('女主当场夺回签约权').reasons).toContain('标题含角色占位词');
    expect(inspectGeneratedTitle('林念夺回项目签字权').reasons).not.toContain('标题含角色占位词');
  });

  it('passes good titles', () => {
    const result = inspectGeneratedTitle('第二把钥匙开口了', ['旧仓库的脚印']);
    expect(result.mechanical).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });
});

describe('evaluateGeneratedTitle', () => {
  it('penalizes titles with abstract words compared to concrete titles', () => {
    const params = {
      genre: 'mystery',
      recentTitles: ['旧仓库的脚印', '没有指纹的杯子'],
    };

    const plain = evaluateGeneratedTitle('危机与反转', params);
    const sharper = evaluateGeneratedTitle('第二把钥匙开口了', params);

    expect(sharper.score).toBeGreaterThan(plain.score);
    expect(plain.issues.join('、')).toContain('抽象词');
  });

  it('penalizes abstract-word-heavy titles', () => {
    const params = {
      genre: 'modern',
      recentTitles: [],
    };

    const result = evaluateGeneratedTitle('危机中的反击与逆袭', params);
    expect(result.issues.join('、')).toContain('抽象词');
  });

  it('penalizes banned openers', () => {
    const params = { genre: 'modern', recentTitles: [] };
    const result = evaluateGeneratedTitle('竟然是这样的结果', params);
    expect(result.issues.join('、')).toContain('套路');
  });

  it('rewards titles with good length', () => {
    const params = { genre: 'fantasy', recentTitles: [] };
    const result = evaluateGeneratedTitle('寒水剑偏向门内', params);
    expect(result.strengths).toContain('长度克制');
  });
});

describe('shouldAdoptGeneratedChapterTitle', () => {
  it('rejects empty generated titles', () => {
    const decision = shouldAdoptGeneratedChapterTitle({
      currentTitle: '原标题',
      generatedTitle: '',
      auditInput: { genre: 'modern' },
    });
    expect(decision.accept).toBe(false);
    expect(decision.reasons).toContain('生成标题为空');
  });

  it('rejects titles identical to current', () => {
    const decision = shouldAdoptGeneratedChapterTitle({
      currentTitle: '原标题',
      generatedTitle: '原标题',
      auditInput: { genre: 'modern' },
    });
    expect(decision.accept).toBe(false);
    expect(decision.reasons).toContain('生成标题与原标题相同');
  });

  it('treats summary-like current titles as replaceable placeholders', () => {
    const decision = shouldAdoptGeneratedChapterTitle({
      currentTitle: '加桌卖三十碗：钱不够时',
      generatedTitle: '小碗一文',
      auditInput: { genre: 'food-business' },
    });

    expect(decision.accept).toBe(true);
    expect(decision.currentScore).toBeNull();
  });

  it('accepts strong replacements over placeholder titles', () => {
    const decision = shouldAdoptGeneratedChapterTitle({
      currentTitle: '第 1 章',
      generatedTitle: '系统判我不配当主角',
      auditInput: {
        genre: 'scifi',
        novelSynopsis: '主角被系统剥夺主角权限。',
      },
    });
    expect(decision.accept).toBe(true);
  });

  it('rejects mechanically invalid replacements even when the current title is a placeholder', () => {
    const decision = shouldAdoptGeneratedChapterTitle({
      currentTitle: '第 1 章',
      generatedTitle: '主角在项目成果被下属篡改',
      auditInput: { genre: 'modern' },
    });

    expect(decision.accept).toBe(false);
    expect(decision.reasons.join('、')).toContain('机械质量检查');
  });
});

describe('TitleGeneratorAgent', () => {
  it('includes full content and recent titles in the prompt', () => {
    const agent = new TestTitleGeneratorAgent();
    const message = agent.build({
      novelId: 'novel-1',
      novelTitle: '夜雨缉凶',
      genre: 'mystery',
      novelSynopsis: '刑警顾临在连环分尸案中追查真相。',
      chapterNumber: 17,
      inputText: JSON.stringify({
        fullContent: '顾临推开冷库铁门，冷气扑面而来。这里就是第二现场。',
        previousTitle: '冷库里的第二把钥匙',
        recentTitles: ['旧仓库的脚印', '没有指纹的杯子'],
      }),
    });

    expect(message).toContain('章节全文');
    expect(message).toContain('推开冷库铁门');
    expect(message).toContain('旧仓库的脚印');
    expect(message).toContain('冷库里的第二把钥匙');
    expect(message).toContain('作品简介');
  });

  it('falls back to raw input when not JSON', () => {
    const agent = new TestTitleGeneratorAgent();
    const message = agent.build({
      novelId: 'novel-1',
      novelTitle: '测试小说',
      novelSynopsis: '',
      genre: 'modern',
      chapterNumber: 1,
      inputText: '这是纯文本内容，不是 JSON',
    });

    expect(message).toContain('章节全文');
    expect(message).toContain('纯文本内容');
  });
});

import { describe, expect, it } from 'vitest';
import {
  getDefaultPlotBranchChapter,
  getPlotBranchImpactText,
  normalizePlotBranchDraft,
  parseCharacterImpactsText,
  resolvePlotBranchParentId,
} from './plot-branches';

function node(id: string, chapterNumber: number) {
  return { id, chapterNumber } as Parameters<typeof getDefaultPlotBranchChapter>[1] & {
    id: string;
    chapterNumber: number;
  };
}

function tree(nodes: Array<{ id: string; chapterNumber: number }>, activePath: string[]) {
  return { nodes, activePath } as unknown as Parameters<typeof resolvePlotBranchParentId>[0];
}

describe('parseCharacterImpactsText', () => {
  it('按行解析「名字：影响」', () => {
    expect(parseCharacterImpactsText('林越：失去信任\n苏白：被迫结盟')).toEqual([
      { name: '林越', impact: '失去信任' },
      { name: '苏白', impact: '被迫结盟' },
    ]);
  });

  it('半角冒号也能分割', () => {
    const result = parseCharacterImpactsText('林越: 失去信任');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('林越');
    expect(result[0].impact).toBe('失去信任');
  });

  it('丢弃空行与缺少任一侧的行', () => {
    expect(parseCharacterImpactsText('\n\n  \n林越：变强\n只有名字\n：只有影响')).toEqual([
      { name: '林越', impact: '变强' },
    ]);
  });

  it('影响内部含冒号时保留后半段', () => {
    const result = parseCharacterImpactsText('林越：抉择：留下或离开');
    expect(result).toHaveLength(1);
    expect(result[0].impact).toContain('留下或离开');
  });

  it('空串返回空数组', () => {
    expect(parseCharacterImpactsText('')).toEqual([]);
    expect(parseCharacterImpactsText('   \n  ')).toEqual([]);
  });
});

describe('normalizePlotBranchDraft', () => {
  it('缺少标题或描述时返回 null', () => {
    expect(normalizePlotBranchDraft({})).toBeNull();
    expect(normalizePlotBranchDraft({ title: '分支' })).toBeNull();
    expect(normalizePlotBranchDraft({ description: '说明' })).toBeNull();
    expect(normalizePlotBranchDraft({ title: '  ', description: '  ' })).toBeNull();
  });

  it('归一化基本字段', () => {
    const draft = normalizePlotBranchDraft({ title: '退婚', description: '当场翻脸' });
    expect(draft).toMatchObject({ title: '退婚', description: '当场翻脸' });
  });

  it('impactPrediction 缺失时回退到 impact', () => {
    const draft = normalizePlotBranchDraft({
      title: '退婚',
      description: '当场翻脸',
      impact: '家族关系破裂',
    });
    expect(draft?.impactPrediction).toBe('家族关系破裂');
  });

  it('impactPrediction 优先于 impact', () => {
    const draft = normalizePlotBranchDraft({
      title: '退婚',
      description: '当场翻脸',
      impactPrediction: '首选说明',
      impact: '备用说明',
    });
    expect(draft?.impactPrediction).toBe('首选说明');
  });

  it('不因异常类型抛错', () => {
    expect(() => normalizePlotBranchDraft({ title: 1, description: null })).not.toThrow();
    expect(() => normalizePlotBranchDraft({ title: '有', description: '有', characterImpacts: 'x' })).not.toThrow();
    expect(() => normalizePlotBranchDraft({ title: '有', description: '有', riskLevel: 999 })).not.toThrow();
  });
});

describe('resolvePlotBranchParentId', () => {
  const sample = tree(
    [node('n1', 1), node('n5', 5), node('n9', 9)],
    ['n1', 'n5', 'n9'],
  );

  it('显式选中节点时直接采用', () => {
    expect(resolvePlotBranchParentId(sample, 3, 'n9')).toBe('n9');
  });

  it('取不超过目标章的最近节点', () => {
    expect(resolvePlotBranchParentId(sample, 7)).toBe('n5');
    expect(resolvePlotBranchParentId(sample, 5)).toBe('n5');
    expect(resolvePlotBranchParentId(sample, 100)).toBe('n9');
  });

  it('目标章早于所有节点时返回 null', () => {
    expect(resolvePlotBranchParentId(sample, 0)).toBeNull();
  });

  it('树为空或缺失时返回 null', () => {
    expect(resolvePlotBranchParentId(null, 5)).toBeNull();
    expect(resolvePlotBranchParentId(undefined, 5)).toBeNull();
    expect(resolvePlotBranchParentId(tree([], []), 5)).toBeNull();
  });

  it('activePath 里的悬空 id 被忽略', () => {
    const dangling = tree([node('n1', 1)], ['n1', '不存在的节点']);
    expect(resolvePlotBranchParentId(dangling, 10)).toBe('n1');
  });

  it('只考虑 activePath 上的节点', () => {
    const offPath = tree([node('n1', 1), node('n8', 8)], ['n1']);
    expect(resolvePlotBranchParentId(offPath, 10)).toBe('n1');
  });
});

describe('getDefaultPlotBranchChapter', () => {
  it('优先用选中节点的章号', () => {
    expect(getDefaultPlotBranchChapter(null, node('n3', 3))).toBe(3);
  });

  it('否则取 activePath 上最大章号', () => {
    const sample = tree([node('n1', 1), node('n6', 6)], ['n1', 'n6']);
    expect(getDefaultPlotBranchChapter(sample)).toBe(6);
  });

  it('无可用节点时回落到第 1 章', () => {
    expect(getDefaultPlotBranchChapter(null)).toBe(1);
    expect(getDefaultPlotBranchChapter(tree([], []))).toBe(1);
  });
});

describe('getPlotBranchImpactText', () => {
  it('优先 impactPrediction', () => {
    expect(getPlotBranchImpactText({ impactPrediction: '首选', impact: '备用' })).toBe('首选');
  });

  it('impactPrediction 为空白时回退 impact', () => {
    expect(getPlotBranchImpactText({ impactPrediction: '   ', impact: '备用' })).toBe('备用');
  });

  it('两者都缺时返回空串', () => {
    expect(getPlotBranchImpactText({})).toBe('');
    expect(getPlotBranchImpactText({ impactPrediction: '  ', impact: '  ' })).toBe('');
  });
});

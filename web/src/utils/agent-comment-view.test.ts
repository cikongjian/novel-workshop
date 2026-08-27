import { describe, expect, it } from 'vitest';
import { buildAgentCommentView, normalizeAgentRoleValue } from './agent-comment-view';

/** 从 rich 视图取 html，其余形态直接失败，避免断言写在联合类型上失真 */
function richHtml(raw: string): string {
  const view = buildAgentCommentView(raw);
  if (view.kind !== 'rich') throw new Error(`期望 rich 视图，实际为 ${view.kind}`);
  return view.html;
}

describe('buildAgentCommentView 安全性', () => {
  // 该 html 直接进入 v-html（Agent 评语展示），输入是模型返回值，属不可信内容
  const attackerTagPattern = /<\s*\/?\s*(script|img|svg|iframe|body|object|embed|style|link)\b/iu;

  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '【标题】\n<svg/onload=alert(1)>',
    '```json\n<script>alert(1)</script>\n```',
  ])('转义模型返回的原始 HTML：%s', (payload) => {
    const view = buildAgentCommentView(payload);
    if (view.kind === 'empty') return;
    const html = view.kind === 'rich' ? view.html : JSON.stringify(view.review);
    const withoutOwnTags = html.replace(/<\/?(p|br|strong|del|code|pre|ul|ol|li|h[1-6])>/gu, '');
    expect(withoutOwnTags).not.toMatch(attackerTagPattern);
  });

  it('JSON 结构里的 HTML 同样被转义', () => {
    const html = richHtml('{"note":"<script>alert(1)</script>"}');
    expect(html).not.toMatch(/<\s*script/iu);
  });

  it('不放行危险协议链接', () => {
    const html = richHtml('[点我](javascript:alert(1))');
    expect(html).not.toMatch(/href\s*=\s*["']?\s*javascript:/iu);
  });
});

describe('buildAgentCommentView 形态判定', () => {
  it('空输入返回 empty', () => {
    expect(buildAgentCommentView('')).toEqual({ kind: 'empty' });
    expect(buildAgentCommentView('   \n  ')).toEqual({ kind: 'empty' });
  });

  it('普通文本返回 rich', () => {
    const html = richHtml('这一章节奏偏慢，建议压缩铺垫。');
    expect(html).toContain('节奏偏慢');
  });

  it('把【小节】行转成标题', () => {
    const html = richHtml('【总体评价】\n可以');
    expect(html).toMatch(/<h3>/u);
    expect(html).toContain('总体评价');
  });

  it('剥掉 json 代码块围栏', () => {
    const html = richHtml('```json\n不是合法 json\n```');
    expect(html).not.toContain('```');
  });

  it('读者评分 JSON 走 reader-review 形态', () => {
    const view = buildAgentCommentView(
      '{"overallScore":82,"issues":["节奏偏慢"],"highlights":["结尾有力"],"suggestions":["压缩铺垫"]}',
    );
    expect(view.kind).toBe('reader-review');
    if (view.kind !== 'reader-review') return;
    expect(view.review.scoreValue).toBe(82);
    expect(view.review.issues).toContain('节奏偏慢');
    expect(view.review.highlights).toContain('结尾有力');
    expect(view.review.suggestions).toContain('压缩铺垫');
  });

  it('叙述字段按中文标签归集', () => {
    const view = buildAgentCommentView(
      '{"pacing":"偏慢","engagement":"中段掉","characterization":"立住了","emotion":"够","prose":"干净"}',
    );
    expect(view.kind).toBe('reader-review');
    if (view.kind !== 'reader-review') return;
    const labels = view.review.narratives.map((item) => item.label);
    expect(labels).toEqual(['节奏', '吸引力', '角色塑造', '情绪张力', '文笔']);
  });

  it('叙述字段为空时不产生条目', () => {
    const view = buildAgentCommentView('{"pacing":"","engagement":"   ","issues":["x"]}');
    expect(view.kind).toBe('reader-review');
    if (view.kind !== 'reader-review') return;
    expect(view.review.narratives).toEqual([]);
  });

  it('缺少评审字段的 JSON 不走 reader-review', () => {
    const view = buildAgentCommentView('{"note":"只是普通结构化输出"}');
    expect(view.kind).toBe('rich');
  });

  it('结构化 JSON 渲染为标题加正文', () => {
    const html = richHtml('{"建议":"删掉第三段"}');
    expect(html).toContain('结构化结果');
    expect(html).toContain('删掉第三段');
  });

  it('不因畸形 JSON 抛错', () => {
    for (const raw of ['{', '[}', '{"a":', 'null', '[]', '{}']) {
      expect(() => buildAgentCommentView(raw)).not.toThrow();
    }
  });
});

describe('normalizeAgentRoleValue', () => {
  it('归一化大小写与下划线', () => {
    expect(normalizeAgentRoleValue('  WORLD_BUILDER ')).toBe('world-builder');
  });

  it.each([
    ['world', 'world-builder'],
    ['worldbuilder', 'world-builder'],
    ['character-builder', 'character'],
    ['characterdesigner', 'character'],
    ['reviewer', 'reader'],
    ['review', 'reader'],
    ['editing', 'editor'],
    ['writer-editor', 'editor'],
    ['writereditor', 'editor'],
  ])('别名 %s 映射为 %s', (input, expected) => {
    expect(normalizeAgentRoleValue(input)).toBe(expected);
  });

  it('未知角色原样返回', () => {
    expect(normalizeAgentRoleValue('outline')).toBe('outline');
    expect(normalizeAgentRoleValue('')).toBe('');
  });
});

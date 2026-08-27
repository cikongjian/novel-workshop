import { describe, expect, it } from 'vitest';
import type { NovelGenre } from '../types';
import {
  buildIdeaKickstartPrompt,
  normalizeBookTitle,
  parseIdeaKickstartPayload,
} from './idea-kickstart';

const GENRE = 'xuanhuan' as NovelGenre;

/** 构造一条满足必填项（title / synopsis / seedIdea）的方案 */
function idea(overrides: Record<string, unknown> = {}) {
  return {
    key: 'idea-1',
    label: '方案一',
    title: '断剑归来',
    synopsis: '少年在废墟中拾到断剑，从此踏上复仇之路。',
    seedIdea: '玄幻题材，主角以断剑起家，目标是揭开家族灭门真相。',
    ...overrides,
  };
}

function payload(ideas: unknown[]): string {
  return JSON.stringify({ ideas });
}

describe('normalizeBookTitle', () => {
  it('剥掉书名号并去空白', () => {
    expect(normalizeBookTitle('  《断剑归来》 ')).toBe('断剑归来');
  });

  it('处理只有单侧书名号的情况', () => {
    expect(normalizeBookTitle('《断剑归来')).toBe('断剑归来');
    expect(normalizeBookTitle('断剑归来》')).toBe('断剑归来');
  });

  it('无书名号时原样返回', () => {
    expect(normalizeBookTitle('断剑归来')).toBe('断剑归来');
  });

  it('空串与纯空白返回空串', () => {
    expect(normalizeBookTitle('')).toBe('');
    expect(normalizeBookTitle('   ')).toBe('');
    expect(normalizeBookTitle('《》')).toBe('');
  });
});

describe('parseIdeaKickstartPayload 正常路径', () => {
  it('解析标准 JSON', () => {
    const result = parseIdeaKickstartPayload(payload([idea()]));
    expect(result?.ideas).toHaveLength(1);
    expect(result?.ideas[0].title).toBe('断剑归来');
  });

  it('从 ```json 代码块中提取', () => {
    const raw = `这是说明\n\`\`\`json\n${payload([idea()])}\n\`\`\`\n结束`;
    expect(parseIdeaKickstartPayload(raw)?.ideas).toHaveLength(1);
  });

  it('从无语言标记的代码块中提取', () => {
    const raw = `\`\`\`\n${payload([idea()])}\n\`\`\``;
    expect(parseIdeaKickstartPayload(raw)?.ideas).toHaveLength(1);
  });

  it('从夹带前后文的花括号切片中提取', () => {
    const raw = `前言说明 ${payload([idea()])} 后记说明`;
    expect(parseIdeaKickstartPayload(raw)?.ideas).toHaveLength(1);
  });

  it('最多返回 3 条方案', () => {
    const many = [1, 2, 3, 4, 5].map((n) => idea({ key: `idea-${n}`, title: `书名${n}` }));
    expect(parseIdeaKickstartPayload(payload(many))?.ideas).toHaveLength(3);
  });

  it('书名中的书名号被剥掉', () => {
    const result = parseIdeaKickstartPayload(payload([idea({ title: '《断剑归来》' })]));
    expect(result?.ideas[0].title).toBe('断剑归来');
  });

  it('缺失的可选字段补为空串', () => {
    const result = parseIdeaKickstartPayload(payload([idea()]));
    expect(result?.ideas[0].hook).toBe('');
    expect(result?.ideas[0].protagonist).toBe('');
  });

  it('缺失 key 与 label 时按序号兜底', () => {
    const result = parseIdeaKickstartPayload(
      payload([idea({ key: undefined, label: undefined })]),
    );
    expect(result?.ideas[0].key).toBe('idea-1');
    expect(result?.ideas[0].label).toBe('方案 1');
  });

  it('过长字段被截断', () => {
    const result = parseIdeaKickstartPayload(
      payload([idea({ title: '书'.repeat(80) })]),
    );
    expect(result?.ideas[0].title.length).toBeLessThanOrEqual(40);
  });
});

describe('parseIdeaKickstartPayload 拒绝与兜底', () => {
  it('空输入返回 null', () => {
    expect(parseIdeaKickstartPayload('')).toBeNull();
    expect(parseIdeaKickstartPayload('   \n ')).toBeNull();
  });

  it('缺少必填字段的方案被丢弃', () => {
    expect(parseIdeaKickstartPayload(payload([idea({ title: '' })]))).toBeNull();
    expect(parseIdeaKickstartPayload(payload([idea({ synopsis: '' })]))).toBeNull();
    expect(parseIdeaKickstartPayload(payload([idea({ seedIdea: '' })]))).toBeNull();
  });

  it('只保留合法方案，丢弃残缺项', () => {
    const result = parseIdeaKickstartPayload(
      payload([idea({ title: '' }), idea({ title: '有效书名' })]),
    );
    expect(result?.ideas).toHaveLength(1);
    expect(result?.ideas[0].title).toBe('有效书名');
  });

  it('ideas 非数组或为空时返回 null', () => {
    expect(parseIdeaKickstartPayload('{"ideas":[]}')).toBeNull();
    expect(parseIdeaKickstartPayload('{"ideas":"x"}')).toBeNull();
    expect(parseIdeaKickstartPayload('{}')).toBeNull();
  });

  it('数组元素不是对象时被跳过', () => {
    expect(parseIdeaKickstartPayload('{"ideas":[null,1,"x",[]]}')).toBeNull();
  });

  it('不因畸形输入抛错', () => {
    for (const raw of ['{', '[}', '{"ideas":', 'null', 'undefined', '```json\n{\n```', '纯中文说明']) {
      expect(() => parseIdeaKickstartPayload(raw)).not.toThrow();
    }
  });

  it('非字符串字段不被当作有效值', () => {
    expect(parseIdeaKickstartPayload(payload([idea({ title: 123, synopsis: {}, seedIdea: [] })]))).toBeNull();
  });
});

describe('buildIdeaKickstartPrompt', () => {
  const base = { title: '', genre: GENRE, synopsis: '', seedIdea: '' };

  it('要求只返回 JSON', () => {
    const prompt = buildIdeaKickstartPrompt(base);
    expect(prompt).toContain('只返回 JSON');
    expect(prompt).toContain('"ideas"');
  });

  it('无任何输入时给出默认引导语', () => {
    expect(buildIdeaKickstartPrompt(base)).toContain('原创脑洞');
  });

  it('带入已有标题、简介与想法', () => {
    const prompt = buildIdeaKickstartPrompt({
      ...base,
      title: '断剑归来',
      synopsis: '少年复仇',
      seedIdea: '断剑起家',
    });
    expect(prompt).toContain('断剑归来');
    expect(prompt).toContain('少年复仇');
    expect(prompt).toContain('断剑起家');
  });

  it('仅空白输入视为未提供', () => {
    const prompt = buildIdeaKickstartPrompt({ ...base, title: '   ', synopsis: '  ' });
    expect(prompt).toContain('原创脑洞');
  });

  it('始终要求 3 套方案', () => {
    expect(buildIdeaKickstartPrompt(base)).toContain('3 套');
  });
});

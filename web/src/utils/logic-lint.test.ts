import { describe, expect, it } from 'vitest';
import { detectIntraChapterLogicConflicts } from './logic-lint';

const NAMES = ['林越', '苏白'];

function codes(content: string, knownCharacterNames = NAMES, maxFindings?: number) {
  return detectIntraChapterLogicConflicts({ content, knownCharacterNames, maxFindings })
    .map((finding) => finding.code);
}

describe('detectIntraChapterLogicConflicts 自指检测', () => {
  it('识别「某人对某人说」的重名错误', () => {
    expect(codes('林越对林越说了一句狠话。')).toContain('self-talk');
  });

  it('容忍名字与「对/说」之间的空格', () => {
    expect(codes('林越 对 林越 说完便走。')).toContain('self-talk');
  });

  it('不同人名之间的对话不算自指', () => {
    expect(codes('林越对苏白说了一句狠话。')).not.toContain('self-talk');
  });
});

describe('detectIntraChapterLogicConflicts 称呼冲突检测', () => {
  it('识别发言人紧接着被当作下人称呼', () => {
    const found = codes('林越说：“把东西拿来。”身后的林越小厮低头应了。');
    expect(found).toContain('self-reference-role-mismatch');
  });

  it('支持指示代词插入', () => {
    const found = codes('林越说：“动手。”那林越这个奴才竟敢抬头。');
    expect(found).toContain('self-reference-role-mismatch');
  });

  it('识别多种发言动词', () => {
    for (const verb of ['说', '问', '喊', '骂', '心想']) {
      const found = codes(`林越${verb}：“来人。”旁边的林越丫鬟应声。`);
      expect(found).toContain('self-reference-role-mismatch');
    }
  });

  it('超出 160 字窗口的称呼不算冲突', () => {
    const filler = '走'.repeat(200);
    const found = codes(`林越说：“动手。”${filler}林越小厮低头。`);
    expect(found).not.toContain('self-reference-role-mismatch');
  });

  it('发言后出现他人身份词不算冲突', () => {
    const found = codes('林越说：“动手。”身后的苏白小厮低头应了。');
    expect(found).not.toContain('self-reference-role-mismatch');
  });

  it('没有发言标记时不误报', () => {
    const found = codes('林越小厮站在门口。');
    expect(found).not.toContain('self-reference-role-mismatch');
  });
});

describe('detectIntraChapterLogicConflicts 边界与约束', () => {
  it('空内容返回空数组', () => {
    expect(detectIntraChapterLogicConflicts({ content: '' })).toEqual([]);
    expect(detectIntraChapterLogicConflicts({ content: '   \n  ' })).toEqual([]);
  });

  it('未提供人名时不产生结论', () => {
    expect(detectIntraChapterLogicConflicts({ content: '林越对林越说。' })).toEqual([]);
  });

  it('过短或过长的人名被忽略', () => {
    expect(codes('林对林说。', ['林'])).toEqual([]);
    const longName = '一二三四五六七八九';
    expect(codes(`${longName}对${longName}说。`, [longName])).toEqual([]);
  });

  it('人名未出现在正文时跳过', () => {
    expect(codes('这一章没有任何人名。', ['林越'])).toEqual([]);
  });

  it('结论去重，同一类问题不重复报', () => {
    const content = '林越对林越说。林越对林越说。林越对林越说。';
    const selfTalk = codes(content).filter((code) => code === 'self-talk');
    expect(selfTalk).toHaveLength(1);
  });

  it('遵守 maxFindings 上限', () => {
    const content = '林越对林越说。苏白对苏白说。';
    expect(codes(content, NAMES, 1)).toHaveLength(1);
  });

  it('每条结论都带 code / level / message', () => {
    const findings = detectIntraChapterLogicConflicts({
      content: '林越对林越说。',
      knownCharacterNames: NAMES,
    });
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.code.length).toBeGreaterThan(0);
      expect(finding.level).toBe('warn');
      expect(finding.message).toContain('林越');
    }
  });

  it('不因含正则元字符的人名抛错', () => {
    expect(() => codes('测试内容', ['a.*b', '(x)', '[y]', 'a+b'])).not.toThrow();
  });

  it('正常文本不产生任何结论', () => {
    const found = codes('林越说：“走吧。”苏白点头跟上，两人穿过长街。');
    expect(found).toEqual([]);
  });
});

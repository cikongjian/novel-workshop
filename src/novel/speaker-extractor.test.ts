import { describe, expect, it } from 'vitest';
import { extractMissingSpeakerCandidates } from './speaker-extractor.js';

describe('extractMissingSpeakerCandidates', () => {
  it('extracts explicit speaker markers', () => {
    const result = extractMissingSpeakerCandidates({
      chapterContent: '（#林渊）"别动。" 远处传来脚步声。',
    });

    expect(result).toContain('林渊');
    expect(result).not.toContain('脚步声');
  });

  it('extracts unmarked dialogue context names', () => {
    const result = extractMissingSpeakerCandidates({
      chapterContent: '林渊说道："这一次我来。" 苏晚看向窗外，低声问道："你确定？"',
    });

    expect(result).toEqual(expect.arrayContaining(['林渊', '苏晚']));
  });

  it('extracts character agent headings', () => {
    const result = extractMissingSpeakerCandidates({
      chapterContent: '',
      analysisText: [
        '### [许清寒]',
        '- 角色定位：配角',
        '- 本章行为要点：提醒主角隐藏身份',
      ].join('\n'),
    });

    expect(result).toContain('许清寒');
    expect(result).not.toContain('角色定位');
  });

  it('extracts listed character names from analysis text', () => {
    const result = extractMissingSpeakerCandidates({
      chapterContent: '',
      analysisText: '本章角色：林渊、苏晚、陈北',
    });

    expect(result).toEqual(expect.arrayContaining(['林渊', '苏晚', '陈北']));
  });

  it('filters non-character noise', () => {
    const result = extractMissingSpeakerCandidates({
      chapterContent: '风声说道："呜。" 章节大纲显示下一幕转场，众人沉默。',
      analysisText: '### 角色关系动态\n### 当前章节',
    });

    expect(result).not.toContain('风声');
    expect(result).not.toContain('章节大纲');
    expect(result).not.toContain('角色关系动态');
    expect(result).not.toContain('当前章节');
  });

  it('does not treat common words containing simple speech verbs as names', () => {
    const result = extractMissingSpeakerCandidates({
      chapterContent: '那些神话传说在村口流传了很久。林渊说："我知道真相。"',
    });

    expect(result).toContain('林渊');
    expect(result).not.toContain('神话传');
  });

  it('filters action fragments and normalizes annotated marker names', () => {
    const result = extractMissingSpeakerCandidates({
      chapterContent: [
        '（#陆知微（首次登场））"沈墨，你来晚了。"',
        '（#身份#沈云舟）"三天后见。"',
        '沈墨没回答，只把地图收进袖口。说完转身就走。',
      ].join('\n'),
    });

    expect(result).toEqual(expect.arrayContaining(['陆知微', '沈云舟']));
    expect(result).not.toEqual(expect.arrayContaining(['沈墨没', '说完', '身份#沈云舟']));
  });

  it('does not treat clause fragments before actions as unmarked names', () => {
    const result = extractMissingSpeakerCandidates({
      chapterContent: '但眼神紧盯着门口，而不是死盯着刀锋。陆知微看向沈云舟，沈云舟回答：“我知道。”',
    });

    expect(result).toEqual(expect.arrayContaining(['陆知微', '沈云舟']));
    expect(result).not.toEqual(expect.arrayContaining(['但眼神紧', '而不是死']));
  });

  it('does not treat adverbs before speech actions as names', () => {
    const result = extractMissingSpeakerCandidates({
      chapterContent: '苏清月看着他喉咙上的灰线，终于开口：“你走这一趟干什么？”',
    });

    expect(result).not.toContain('终于');
  });

  it('keeps legitimate names that end with action-like characters', () => {
    const result = extractMissingSpeakerCandidates({
      chapterContent: '（#林知行）“我来处理。”（#顾长生）“先等等。”',
    });

    expect(result).toEqual(expect.arrayContaining(['林知行', '顾长生']));
  });

  it('strips an unambiguous multi-character speech suffix from a marker', () => {
    const result = extractMissingSpeakerCandidates({
      chapterContent: '（#林渊说道）“这次我来。”',
    });

    expect(result).toContain('林渊');
    expect(result).not.toContain('林渊说道');
  });
});

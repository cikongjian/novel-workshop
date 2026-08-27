import { describe, expect, it } from 'vitest';
import {
  cleanPublicFacingContent,
  makePublicFacingExcerpt,
} from './public-facing-content.js';

describe('public-facing-content', () => {
  it('removes speaker markers, decorative separators, and markdown emphasis', () => {
    expect(cleanPublicFacingContent('(#林栀)“知道了。”\n\n***\n\n她看向**光**。')).toBe('“知道了。”\n\n她看向光。');
  });

  it('removes consecutive trailing speaker markers from generated chapter tails', () => {
    expect(cleanPublicFacingContent('“明天，”他说，“我来接你。”\n\n不是合同说的。(#林栀)(#顾砚舟)'))
      .toBe('“明天，”他说，“我来接你。”\n\n不是合同说的。');
  });

  it('removes leaked character exit markers from public prose', () => {
    expect(cleanPublicFacingContent('雾瘴卷过来，把周元吞没。#(退场:周元)'))
      .toBe('雾瘴卷过来，把周元吞没。');
    expect(cleanPublicFacingContent('王厉倒下了。(#死亡:王厉)'))
      .toBe('王厉倒下了。');
  });

  it('unwraps short bracketed meta labels while preserving their text', () => {
    expect(cleanPublicFacingContent('【光线变暗】消耗加倍。\n\n**控制类**和【感知干扰类】技能性价比暴跌。'))
      .toBe('光线变暗消耗加倍。\n\n控制类和感知干扰类技能性价比暴跌。');
  });

  it('keeps longer bracketed copy with punctuation intact', () => {
    expect(cleanPublicFacingContent('【系统提示：请确认】\n继续前进。')).toBe('【系统提示：请确认】\n继续前进。');
  });

  it('repairs repeated confirmation phrasing without changing the scene meaning', () => {
    expect(cleanPublicFacingContent('你是在确定我父亲是在确定我是不是注定要站在你旁边。'))
      .toBe('你是在确定我是不是注定要站在你旁边。');
  });

  it('repairs awkward choice-reason phrasing from generated dialogue', () => {
    expect(cleanPublicFacingContent('但我选你，不是因为资格。是选你这件事本身就不需要。'))
      .toBe('但我选你，不是因为资格。是我自己要选。');
  });

  it('repairs dash-leading stiff this-is phrasing from contrast cleanup', () => {
    expect(cleanPublicFacingContent('嘴角有一道细纹——这是皱了一下又放平。'))
      .toBe('嘴角有一道细纹——皱了一下又放平。');
    expect(cleanPublicFacingContent('小臂有一道灰线——这是青黑色，已经到了手腕。'))
      .toBe('小臂有一道灰线——青黑色，已经到了手腕。');
    expect(cleanPublicFacingContent('灰色边界往上爬了半寸——这是皮肤下的灰线确实动了一下。'))
      .toBe('灰色边界往上爬了半寸——皮肤下的灰线确实动了一下。');
  });

  it('removes leading bare chapter numbers and trailing editor notes', () => {
    expect(cleanPublicFacingContent([
      '第14章',
      '',
      '茶几上只剩一枚星星。',
      '',
      '[心迹揭露/关系转折]：这里是编辑说明，不应进入正文。',
      '',
      '[整体评价]：本章完成了无刻星星归属的决定性抉择。',
    ].join('\n'))).toBe('茶几上只剩一枚星星。');
  });

  it('turns generated chapter-number callbacks into story-time references', () => {
    expect(cleanPublicFacingContent([
      '平板翻开第2章拍的照片。',
      '灯带比第8章时更密。',
      '《管路维修手册》第4章仍贴在舱门旁。',
    ].join('\n'))).toBe([
      '平板翻开此前拍的照片。',
      '灯带比上次更密。',
      '《管路维修手册》第4章仍贴在舱门旁。',
    ].join('\n'));
  });

  it('cuts content after explicit editor notes separator', () => {
    expect(cleanPublicFacingContent([
      '她把星星放进口袋。',
      '',
      '---EDITOR_NOTES---',
      '',
      '1. 修改说明：强化关系转折。',
    ].join('\n'))).toBe('她把星星放进口袋。');
  });

  it('removes leading editor/model prose prefixes from chapter content', () => {
    expect(cleanPublicFacingContent('润色后正文\n\n残阳如血。\n\n军旗在城头展开。')).toBe('残阳如血。\n\n军旗在城头展开。');
    expect(cleanPublicFacingContent('润色后正文：残阳如血。\n\n军旗在城头展开。')).toBe('残阳如血。\n\n军旗在城头展开。');
    expect(cleanPublicFacingContent('以下是优化后正文。\n\n残阳如血。')).toBe('残阳如血。');
  });

  it('keeps ordinary body text that happens to mention body copy later', () => {
    expect(cleanPublicFacingContent('残阳如血。\n\n他把正文誊到军报背面。')).toBe('残阳如血。\n\n他把正文誊到军报背面。');
  });

  it('replaces public role placeholders used as character names', () => {
    expect(cleanPublicFacingContent('主角蹲在篝火边。\n\n主角把陶碗递给孩子。'))
      .toBe('他蹲在篝火边。\n\n他把陶碗递给孩子。');
    expect(cleanPublicFacingContent('女主把合同按在桌上。\n\n男主没有退。'))
      .toBe('她把合同按在桌上。\n\n他没有退。');
  });

  it('keeps real protagonist concepts intact', () => {
    expect(cleanPublicFacingContent('系统判我不配当主角。\n\n主角权限被锁死。'))
      .toBe('系统判我不配当主角。\n\n主角权限被锁死。');
  });

  it('builds excerpts from cleaned public content', () => {
    expect(makePublicFacingExcerpt('(#甲)***\n\n**需要测试**\n\n【光线变暗】继续推进。', 20)).toBe('需要测试 光线变暗继续推进。');
  });
});

import { describe, expect, it } from 'vitest';

import {
  detectStartupSceneBoundaryIssues,
  estimateLeadingSceneReplayAgainstFullContext,
} from './startup-scene-boundary-guard.js';

describe('startup scene boundary guard', () => {
  it('detects when a later scene restarts a core beat from the middle of prior content', () => {
    const priorChapterContent = [
      '陆景川接过话筒，当众宣布婚礼全网直播。',
      '录音一放出来，全场立刻炸开，陆振华脸色瞬间失去血色。',
      '他冷声问，需要不要现在就去查酒店前台和急性心肌炎的诊断证明。',
      '周董在最关键的时候走进宴会厅，站到了陆景川这一边。',
    ].join('\n\n');

    const currentSceneText = [
      '陆景川重复那句“伪造？”，转向镜头，问要不要现在查酒店前台和急性心肌炎的诊断证明。',
      '宾客席再次炸开，所有人都看向脸色发白的陆振华。',
    ].join('\n\n');

    expect(estimateLeadingSceneReplayAgainstFullContext(currentSceneText, priorChapterContent)).toBeGreaterThanOrEqual(0.48);

    const issues = detectStartupSceneBoundaryIssues({
      genreFocus: 'generic',
      sceneIndex: 1,
      sceneText: currentSceneText,
      priorChapterContent,
    });

    expect(issues.some(item => item.code === 'generic-replayed-core-beat')).toBe(true);
  });
});

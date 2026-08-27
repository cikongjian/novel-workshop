import { describe, expect, it } from 'vitest';
import {
  isGenerationTimeoutFailure,
  shouldPersistGenerationFailure,
} from './generation-failure-classifier.js';

describe('generation failure classifier', () => {
  it('persists ordinary failures', () => {
    expect(shouldPersistGenerationFailure({ error: new Error('upstream failed') })).toBe(true);
  });

  it('does not persist explicit user cancellation', () => {
    const controller = new AbortController();
    controller.abort(new Error('用户取消生成'));

    expect(shouldPersistGenerationFailure({
      error: new Error('This operation was aborted'),
      signal: controller.signal,
    })).toBe(false);
  });

  it('persists idle timeout even though the attempt signal is aborted', () => {
    const controller = new AbortController();
    controller.abort(new Error('章节 3 生成空闲超时：已 480 秒无心跳'));

    expect(isGenerationTimeoutFailure(new Error('request aborted'), controller.signal)).toBe(true);
    expect(shouldPersistGenerationFailure({
      error: new Error('章节 3 生成空闲超时：已 480 秒无心跳'),
      signal: controller.signal,
    })).toBe(true);
  });
});

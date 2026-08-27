import { describe, expect, it } from 'vitest';
import { buildProviderChatCompletionRequestExtras } from './provider-request-options.js';

describe('buildProviderChatCompletionRequestExtras', () => {
  it('disables thinking for zhipu glm-5 models', () => {
    expect(buildProviderChatCompletionRequestExtras('zhipu', 'glm-5-turbo')).toEqual({
      thinking: {
        type: 'disabled',
      },
    });
    expect(buildProviderChatCompletionRequestExtras('zhipu', 'GLM-5-Flash')).toEqual({
      thinking: {
        type: 'disabled',
      },
    });
  });

  it('leaves other providers and models unchanged', () => {
    expect(buildProviderChatCompletionRequestExtras('zhipu', 'glm-4-plus')).toEqual({});
    expect(buildProviderChatCompletionRequestExtras('deepseek', 'deepseek-chat')).toEqual({});
  });
});

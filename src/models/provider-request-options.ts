import type { ModelProvider } from './types.js';

type ProviderChatCompletionRequestExtras = Record<string, unknown>;

export function buildProviderChatCompletionRequestExtras(
  provider: ModelProvider,
  model: string,
): ProviderChatCompletionRequestExtras {
  if (provider === 'zhipu' && isZhipuReasoningModel(model)) {
    return {
      thinking: {
        type: 'disabled',
      },
    };
  }

  return {};
}

function isZhipuReasoningModel(model: string): boolean {
  return model.trim().toLowerCase().startsWith('glm-5');
}

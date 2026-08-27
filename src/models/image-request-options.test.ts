import { describe, expect, it } from 'vitest';
import {
  buildImageGenerateRequestVariants,
  shouldRetryImageRequestVariant,
} from './image-request-options.js';

describe('image request options', () => {
  it('builds a gpt-image-2 first request without legacy or SD-only parameters', () => {
    const variants = buildImageGenerateRequestVariants({
      model: 'gpt-image-2',
      prompt: 'premium novel cover',
      options: {
        size: '832x1216',
        negativePrompt: 'text, watermark',
        quality: 'low',
      },
    });

    expect(variants[0].profile).toBe('openai-gpt-image');
    expect(variants[0].request).toMatchObject({
      model: 'gpt-image-2',
      n: 1,
      size: '832x1216',
      quality: 'low',
    });
    expect(variants[0].request).not.toHaveProperty('response_format');
    expect(variants[0].request).not.toHaveProperty('image_size');
    expect(variants[0].request).not.toHaveProperty('negative_prompt');
    expect(String(variants[0].request.prompt)).toContain('Avoid in the image: text, watermark');
  });

  it('keeps an extended compatible proxy variant available after gpt-image requests', () => {
    const variants = buildImageGenerateRequestVariants({
      model: 'gpt-image-2',
      prompt: 'single character portrait',
      options: {
        size: '1024x1024',
        negativePrompt: 'bad hands',
      },
    });

    const extended = variants.find(item => item.profile === 'openai-compatible-extended');
    expect(extended?.request).toMatchObject({
      model: 'gpt-image-2',
      prompt: 'single character portrait',
      image_size: '1024x1024',
      negative_prompt: 'bad hands',
      response_format: 'b64_json',
    });
  });

  it('retries only parameter compatibility errors', () => {
    expect(shouldRetryImageRequestVariant({
      status: 400,
      error: {
        message: "Unknown parameter: 'response_format'",
        param: 'response_format',
      },
    })).toBe(true);

    expect(shouldRetryImageRequestVariant({
      status: 401,
      message: 'Invalid API key',
    })).toBe(false);
  });
});

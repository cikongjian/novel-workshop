import * as OpenAIModule from 'openai';
import { recordAiUsage } from '../ai/usage-recorder.js';
import {
  buildImageGenerateRequestVariants,
  isGptImageModel,
  shouldRetryImageRequestVariant,
  type ImageGenerateOptions,
} from './image-request-options.js';

export type { ImageGenerateOptions } from './image-request-options.js';

export interface ImageGenerationClient {
  readonly provider: string;
  readonly model: string;
  generate(prompt: string, options?: ImageGenerateOptions): Promise<{
    b64Data?: string;
    imageUrl?: string;
    revisedPrompt?: string;
  }>;
  /**
   * 参考图出图：调用 `/v1/images/edits`（multipart）。
   * 漫画出图时注入角色立绘作为参考图，强制高保真复现面部以锁定角色一致性。
   */
  edit(prompt: string, options?: ImageGenerateOptions): Promise<{
    b64Data?: string;
    imageUrl?: string;
    revisedPrompt?: string;
  }>;
}

type OpenAIConstructor = typeof import('openai').default;
type OpenAIClientInstance = InstanceType<OpenAIConstructor>;

const OpenAIClientCtor: OpenAIConstructor =
  (OpenAIModule as unknown as { default: OpenAIConstructor }).default;

export class OpenAICompatibleImageClient implements ImageGenerationClient {
  readonly provider = 'openai-compatible-image';
  readonly model: string;
  private readonly client: OpenAIClientInstance;
  private readonly defaultModel: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, model: string, baseURL?: string) {
    this.client = new OpenAIClientCtor({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      timeout: 5 * 60_000,
    });
    this.defaultModel = model;
    this.model = model;
    this.apiKey = apiKey;
    this.baseUrl = baseURL?.trim() || 'https://api.openai.com/v1';
  }

  async generate(prompt: string, options?: ImageGenerateOptions): Promise<{
    b64Data?: string;
    imageUrl?: string;
    revisedPrompt?: string;
  }> {
    const model = options?.model ?? this.defaultModel;
    const variants = buildImageGenerateRequestVariants({ model, prompt, options });
    let lastError: unknown;

    for (let index = 0; index < variants.length; index += 1) {
      const variant = variants[index];
      try {
        const response = await this.client.images.generate(variant.request as any);
        const image = extractGeneratedImagePayload(response);
        if (!image.b64Data && !image.imageUrl) {
          throw new Error('图像生成失败：未返回图片数据');
        }

        await recordAiUsage({
          usageKind: 'image-generate',
          provider: this.provider,
          model,
          inputTokens: 0,
          outputTokens: 0,
          requestCount: Math.max(1, Number(variant.request.n ?? 1)),
          promptChars: variant.promptChars,
          outputChars: image.revisedPrompt?.length ?? 0,
          metadata: {
            size: variant.size,
            hasNegativePrompt: Boolean(options?.negativePrompt?.trim()),
            requestProfile: variant.profile,
            retryCount: index,
          },
        });

        if (image.b64Data) {
          return {
            b64Data: image.b64Data,
            revisedPrompt: image.revisedPrompt,
          };
        }

        return {
          imageUrl: image.imageUrl,
          revisedPrompt: image.revisedPrompt,
        };
      } catch (error) {
        lastError = error;
        const canRetry = index < variants.length - 1 && shouldRetryImageRequestVariant(error);
        if (!canRetry) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('图像生成失败');
  }

  /**
   * 参考图出图：调用 `/v1/images/edits`（multipart/form-data）。
   *
   * 实现说明：手动用 fetch + FormData 构造请求，绕过 OpenAI SDK 的 images.edit。
   * 原因：部分第三方中转对 SDK 的 multipart 请求认证处理有兼容性问题
   * （generate 成功但 edit 返回 401），手动 fetch 可完全控制 Authorization 头。
   *
   * - gpt-image-2 编辑场景自动启用 high-fidelity，无需也不能传 input_fidelity；
   * - prompt 里用「图1/图2」指代 referenceImages 顺序，模型据此锁定角色身份。
   */
  async edit(prompt: string, options?: ImageGenerateOptions): Promise<{
    b64Data?: string;
    imageUrl?: string;
    revisedPrompt?: string;
  }> {
    const model = options?.model ?? this.defaultModel;
    const referenceImages = options?.referenceImages ?? [];
    if (referenceImages.length === 0) {
      throw new Error('参考图出图需要至少一张参考图（referenceImages）');
    }
    if (referenceImages.length > 16) {
      throw new Error('参考图数量不能超过 16 张（gpt-image-2 上限）');
    }

    const size = options?.size?.trim() || '1024x1024';
    const n = Math.max(1, Math.round(options?.n ?? 1));

    const formData = new FormData();
    formData.append('model', model);
    formData.append('prompt', prompt.trim());
    formData.append('n', String(n));
    formData.append('size', size);
    if (isGptImageModel(model)) {
      if (options?.quality) formData.append('quality', options.quality);
      if (options?.outputFormat) formData.append('output_format', options.outputFormat);
    }
    for (const img of referenceImages) {
      const blob = new Blob([new Uint8Array(img.buffer)], { type: img.mimeType });
      formData.append('image', blob, img.filename);
    }

    const url = `${this.baseUrl.replace(/\/$/, '')}/images/edits`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const err = new Error(`${response.status} status code (no body)`);
      Object.assign(err, { status: response.status, ...(text ? { error: text } : {}) });
      throw err;
    }

    const json = (await response.json()) as unknown;
    const image = extractGeneratedImagePayload(json);
    if (!image.b64Data && !image.imageUrl) {
      throw new Error('图像编辑失败：未返回图片数据');
    }

    await recordAiUsage({
      usageKind: 'image-generate',
      provider: this.provider,
      model,
      inputTokens: 0,
      outputTokens: 0,
      requestCount: n,
      promptChars: prompt.length,
      outputChars: image.revisedPrompt?.length ?? 0,
      metadata: {
        size,
        referenceImageCount: referenceImages.length,
        requestProfile: 'openai-image-edit-fetch',
        hasNegativePrompt: Boolean(options?.negativePrompt?.trim()),
      },
    });

    if (image.b64Data) {
      return { b64Data: image.b64Data, revisedPrompt: image.revisedPrompt };
    }
    return { imageUrl: image.imageUrl, revisedPrompt: image.revisedPrompt };
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function extractGeneratedImagePayload(response: unknown): {
  b64Data?: string;
  imageUrl?: string;
  revisedPrompt?: string;
} {
  const raw = response as any;
  const image = raw?.data?.[0] ?? raw?.images?.[0] ?? raw?.output?.[0] ?? raw?.result?.[0];
  return {
    b64Data: readString(image?.b64_json)
      ?? readString(image?.base64)
      ?? readString(image?.image_base64)
      ?? readString(raw?.b64_json)
      ?? readString(raw?.base64),
    imageUrl: readString(image?.url)
      ?? readString(image?.image_url)
      ?? readString(raw?.url)
      ?? readString(raw?.image_url),
    revisedPrompt: readString(image?.revised_prompt)
      ?? readString(image?.revisedPrompt)
      ?? readString(raw?.revised_prompt),
  };
}

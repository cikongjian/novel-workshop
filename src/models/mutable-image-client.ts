import type { ImageGenerationClient } from './image-client.js';
import type { ImageGenerateOptions } from './image-request-options.js';

export class MutableImageGenerationClient implements ImageGenerationClient {
  private current?: ImageGenerationClient;

  constructor(current?: ImageGenerationClient) {
    this.current = current;
  }

  get provider(): string {
    return this.current?.provider ?? 'image-client-unconfigured';
  }

  get model(): string {
    return this.current?.model ?? '';
  }

  get configured(): boolean {
    return Boolean(this.current);
  }

  setClient(client: ImageGenerationClient): void {
    this.current = client;
  }

  clear(): void {
    this.current = undefined;
  }

  async generate(
    prompt: string,
    options?: ImageGenerateOptions,
  ): Promise<{ b64Data?: string; imageUrl?: string; revisedPrompt?: string }> {
    if (!this.current) {
      throw Object.assign(
        new Error('图像生成服务未配置，请先在设置页面配置 IMAGE_API_KEY / IMAGE_MODEL / IMAGE_BASE_URL'),
        { statusCode: 503, code: 'IMAGE_CLIENT_UNCONFIGURED' },
      );
    }
    return this.current.generate(prompt, options);
  }

  async edit(
    prompt: string,
    options?: ImageGenerateOptions,
  ): Promise<{ b64Data?: string; imageUrl?: string; revisedPrompt?: string }> {
    if (!this.current) {
      throw Object.assign(
        new Error('图像生成服务未配置，请先在设置页面配置 IMAGE_API_KEY / IMAGE_MODEL / IMAGE_BASE_URL'),
        { statusCode: 503, code: 'IMAGE_CLIENT_UNCONFIGURED' },
      );
    }
    return this.current.edit(prompt, options);
  }
}

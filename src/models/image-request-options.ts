export type ImageQuality = 'auto' | 'low' | 'medium' | 'high' | 'standard' | 'hd';
export type ImageOutputFormat = 'png' | 'jpeg' | 'webp';

/**
 * 参考图：用于 gpt-image-2 的 `/v1/images/edits` 端点（image[] 多图输入）。
 * 漫画出图时注入出场角色的立绘，强制高保真复现面部以锁定角色一致性。
 */
export type ReferenceImage = {
  /** 图片二进制内容 */
  buffer: Buffer;
  /** MIME 类型，如 image/png、image/webp */
  mimeType: string;
  /** 文件名（含扩展名），部分供应商要求 */
  filename: string;
};

export type ImageGenerateOptions = {
  model?: string;
  size?: string;
  n?: number;
  negativePrompt?: string;
  quality?: ImageQuality;
  outputFormat?: ImageOutputFormat;
  /** 参考图列表；仅 edit() 使用，generate() 忽略 */
  referenceImages?: ReferenceImage[];
};

export type ImageRequestProfile =
  | 'openai-gpt-image'
  | 'openai-legacy-image'
  | 'openai-compatible-extended';

export type ImageGenerateRequestVariant = {
  profile: ImageRequestProfile;
  request: Record<string, unknown>;
  promptChars: number;
  size: string;
};

const DEFAULT_IMAGE_SIZE = '1024x1024';

const PARAM_RETRY_MARKERS = [
  'unknown parameter',
  'unrecognized parameter',
  'unsupported parameter',
  'invalid parameter',
  'invalid request',
  'extra inputs are not permitted',
  'unexpected keyword',
  'response_format',
  'image_size',
  'negative_prompt',
  'output_format',
  'quality',
];

const AUTH_ERROR_MARKERS = [
  '401',
  '403',
  'unauthorized',
  'forbidden',
  'api key',
  'invalid api key',
  'insufficient',
  '未授权',
  '未配置',
];

function normalizeModelName(model: string): string {
  return model.trim().toLowerCase();
}

export function isGptImageModel(model: string): boolean {
  const normalized = normalizeModelName(model);
  return normalized.includes('gpt-image-') || normalized.includes('chatgpt-image');
}

function isDalleImageModel(model: string): boolean {
  return /dall[-_]?e/i.test(model);
}

function isExtendedCompatibleImageModel(model: string): boolean {
  return /(stable[-_ ]?diffusion|sdxl|flux|kolors|midjourney|qwen[-_ ]?image|wanx|imagen)/i.test(model);
}

function normalizePositivePrompt(prompt: string): string {
  return prompt.trim();
}

function normalizeNegativePrompt(negativePrompt?: string): string {
  return negativePrompt?.trim() ?? '';
}

function mergeNegativePrompt(prompt: string, negativePrompt: string): string {
  if (!negativePrompt) return prompt;
  return `${prompt}\n\nAvoid in the image: ${negativePrompt}`;
}

function buildGptImageRequest(params: {
  model: string;
  prompt: string;
  negativePrompt: string;
  requestCount: number;
  size: string;
  quality?: ImageQuality;
  outputFormat?: ImageOutputFormat;
}): ImageGenerateRequestVariant {
  const prompt = mergeNegativePrompt(params.prompt, params.negativePrompt);
  return {
    profile: 'openai-gpt-image',
    request: {
      model: params.model,
      prompt,
      n: params.requestCount,
      size: params.size,
      ...(params.quality ? { quality: params.quality } : {}),
      ...(params.outputFormat ? { output_format: params.outputFormat } : {}),
    },
    promptChars: prompt.length,
    size: params.size,
  };
}

function buildLegacyImageRequest(params: {
  model: string;
  prompt: string;
  negativePrompt: string;
  requestCount: number;
  size: string;
}): ImageGenerateRequestVariant {
  const prompt = mergeNegativePrompt(params.prompt, params.negativePrompt);
  return {
    profile: 'openai-legacy-image',
    request: {
      model: params.model,
      prompt,
      n: params.requestCount,
      size: params.size,
      response_format: 'b64_json',
    },
    promptChars: prompt.length,
    size: params.size,
  };
}

function buildExtendedCompatibleRequest(params: {
  model: string;
  prompt: string;
  negativePrompt: string;
  requestCount: number;
  size: string;
}): ImageGenerateRequestVariant {
  return {
    profile: 'openai-compatible-extended',
    request: {
      model: params.model,
      prompt: params.prompt,
      n: params.requestCount,
      size: params.size,
      image_size: params.size,
      ...(params.negativePrompt ? { negative_prompt: params.negativePrompt } : {}),
      response_format: 'b64_json',
    },
    promptChars: params.prompt.length + params.negativePrompt.length,
    size: params.size,
  };
}

function dedupeVariants(variants: ImageGenerateRequestVariant[]): ImageGenerateRequestVariant[] {
  const seen = new Set<string>();
  const deduped: ImageGenerateRequestVariant[] = [];
  for (const variant of variants) {
    const signature = JSON.stringify(variant.request);
    if (seen.has(signature)) continue;
    seen.add(signature);
    deduped.push(variant);
  }
  return deduped;
}

export function buildImageGenerateRequestVariants(params: {
  model: string;
  prompt: string;
  options?: ImageGenerateOptions;
}): ImageGenerateRequestVariant[] {
  const prompt = normalizePositivePrompt(params.prompt);
  const negativePrompt = normalizeNegativePrompt(params.options?.negativePrompt);
  const requestCount = Math.max(1, Math.round(params.options?.n ?? 1));
  const size = params.options?.size?.trim() || DEFAULT_IMAGE_SIZE;
  const shared = {
    model: params.model,
    prompt,
    negativePrompt,
    requestCount,
    size,
  };

  const gptImage = buildGptImageRequest({
    ...shared,
    quality: params.options?.quality,
    outputFormat: params.options?.outputFormat,
  });
  const legacyImage = buildLegacyImageRequest(shared);
  const extendedCompatible = buildExtendedCompatibleRequest(shared);

  if (isGptImageModel(params.model)) {
    return dedupeVariants([gptImage, legacyImage, extendedCompatible]);
  }
  if (isDalleImageModel(params.model)) {
    return dedupeVariants([legacyImage, gptImage, extendedCompatible]);
  }
  if (isExtendedCompatibleImageModel(params.model)) {
    return dedupeVariants([extendedCompatible, gptImage, legacyImage]);
  }
  return dedupeVariants([gptImage, extendedCompatible, legacyImage]);
}

function readErrorStatus(error: unknown): number | undefined {
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  const raw = candidate?.status ?? candidate?.statusCode ?? candidate?.response?.status;
  const status = Number(raw);
  return Number.isFinite(status) ? status : undefined;
}

function readErrorParam(error: unknown): string {
  const candidate = error as {
    param?: unknown;
    error?: { param?: unknown };
  };
  const raw = candidate?.param ?? candidate?.error?.param;
  return typeof raw === 'string' ? raw.toLowerCase() : '';
}

function readErrorText(error: unknown): string {
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    type?: unknown;
    error?: { code?: unknown; message?: unknown; type?: unknown };
    response?: { data?: unknown };
  };
  const parts = [
    candidate?.message,
    candidate?.code,
    candidate?.type,
    candidate?.error?.message,
    candidate?.error?.code,
    candidate?.error?.type,
    typeof candidate?.response?.data === 'string' ? candidate.response.data : undefined,
  ];
  return parts.filter(part => typeof part === 'string' && part.trim()).join(' ').toLowerCase();
}

export function shouldRetryImageRequestVariant(error: unknown): boolean {
  const status = readErrorStatus(error);
  if (status !== undefined && ![400, 404, 415, 422].includes(status)) {
    return false;
  }

  const text = readErrorText(error);
  if (AUTH_ERROR_MARKERS.some(marker => text.includes(marker))) {
    return false;
  }

  const param = readErrorParam(error);
  if (['response_format', 'image_size', 'negative_prompt', 'output_format', 'quality'].includes(param)) {
    return true;
  }

  return PARAM_RETRY_MARKERS.some(marker => text.includes(marker));
}

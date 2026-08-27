import { http, AI_TIMEOUT } from './http';

// ==================== 角色立绘 ====================
export type PortraitStyleIndexHit = {
  layer: 'era' | 'culture' | 'identity' | 'attire' | 'facial' | 'expression' | 'visualStyle' | 'format';
  key: string;
  summary: string;
};

export type PortraitStyleOverrides = {
  eraKey?: string;
  roleAttireId?: string;
  visualStyleKey?: string;
  formatKey?: string;
};

export type PortraitStyleOptions = {
  eraOptions: Array<{
    key: string;
    label: string;
  }>;
  roleAttireOptions: Array<{
    id: string;
    label: string;
    category: string;
  }>;
  visualStyleOptions: Array<{
    key: string;
    label: string;
    summary: string;
  }>;
  formatOptions: Array<{
    key: string;
    label: string;
    summary: string;
  }>;
};

export type PortraitStyleIndex = {
  cultureProfile: string;
  culturePositive: string;
  cultureNegative: string[];
  identityKeywords: string;
  attireKeywords: string;
  facialKeywords: string;
  expressionKeywords: string;
  visualStyle?: {
    key: string;
    label: string;
    styleAnchor: string;
    tailAnchor: string;
    negativeKeywords: string[];
  };
  format?: {
    key: string;
    label: string;
    formatAnchor: string;
    negativeKeywords: string[];
  };
  roleAttire?: {
    id: string;
    label: string;
    category: string;
    matched: boolean;
    matchedKeywords: string[];
    score: number;
    priority: number;
    preferredEras: string[];
    resolutionReason: string;
    candidates: Array<{
      id: string;
      label: string;
      category: string;
      score: number;
      priority: number;
      eraMatched: boolean;
      matchedKeywords: string[];
    }>;
  };
  overrides?: {
    eraManual: boolean;
    roleAttireManual: boolean;
    visualStyleManual?: boolean;
    formatManual?: boolean;
    eraKey?: string;
    eraSummary?: string;
    roleAttireId?: string;
    roleAttireLabel?: string;
    visualStyleKey?: string;
    visualStyleLabel?: string;
    formatKey?: string;
    formatLabel?: string;
  };
  layerHits: PortraitStyleIndexHit[];
};

/** AI 根据角色资料生成英文图像提示词 */
export async function generatePortraitPrompt(
  novelId: string,
  characterId: string,
  options?: { styleOverrides?: PortraitStyleOverrides },
): Promise<{ prompt: string; styleIndex?: PortraitStyleIndex }> {
  const { data } = await http.post<{ prompt: string; styleIndex?: PortraitStyleIndex }>(
    `/novels/${novelId}/characters/${characterId}/portrait-prompt`,
    options ?? {},
    { timeout: AI_TIMEOUT },
  );
  return data;
}

/** 生成角色立绘图片 */
export async function generateCharacterPortrait(
  novelId: string,
  characterId: string,
  options?: { prompt?: string; autoGenerate?: boolean; styleOverrides?: PortraitStyleOverrides },
): Promise<{ imagePath: string; imageUrl: string; prompt: string; styleIndex?: PortraitStyleIndex }> {
  const { data } = await http.post<{ imagePath: string; imageUrl: string; prompt: string; styleIndex?: PortraitStyleIndex }>(
    `/novels/${novelId}/characters/${characterId}/portrait`,
    options ?? { autoGenerate: true },
    { timeout: AI_TIMEOUT },
  );
  return data;
}

export async function fetchPortraitStyleOptions(novelId: string): Promise<PortraitStyleOptions> {
  const { data } = await http.get<PortraitStyleOptions>(
    `/novels/${novelId}/characters/portrait-style-options`,
  );
  return data;
}

/**
 * 获取角色立绘图片 URL
 * @param thumbWidth 缩略图宽度 (200|400|600|800)，不传则返回原图
 */
export function getCharacterPortraitUrl(novelId: string, characterId: string, thumbWidth?: number): string {
  const base = `/api/novels/${novelId}/characters/${characterId}/portrait`;
  return thumbWidth ? `${base}?w=${thumbWidth}` : base;
}

/** 通过已登录的 HTTP 客户端读取角色立绘，用于需要鉴权的 <img> 预览 */
export async function fetchCharacterPortraitBlob(
  novelId: string,
  characterId: string,
  thumbWidth?: number,
): Promise<Blob> {
  const { data } = await http.get<Blob>(
    `/novels/${novelId}/characters/${characterId}/portrait`,
    {
      params: {
        ...(thumbWidth ? { w: thumbWidth } : {}),
        t: Date.now(),
      },
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      responseType: 'blob',
    },
  );
  return data;
}

/** 删除角色立绘 */
export async function deleteCharacterPortrait(
  novelId: string,
  characterId: string,
): Promise<void> {
  await http.delete(`/novels/${novelId}/characters/${characterId}/portrait`);
}

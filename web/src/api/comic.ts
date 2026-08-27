import { http } from './http';

/** 单格漫画结果（与后端 ComicPanelResult 对齐） */
export type ComicPanel = {
  panelIndex: number;
  sceneId?: string;
  textRenderMode?: 'embedded' | 'overlay';
  pageIndex?: number;
  panelIndexInPage?: number;
  panelRole?: string;
  layoutTemplate?: string;
  transitionFromPrevious?: string;
  bubblePlacement?: string;
  sfx?: string;
  emotion?: string;
  /** 相对 novel 目录的图片路径；失败时为空串 */
  imagePath: string;
  prompt: string;
  referenceCharacterIds: string[];
  truncated: boolean;
  failed?: string;
  /** 参考图出图失败，已降级为纯文生图（无锁脸） */
  degraded?: boolean;
  /** 旁白/动作描述（图注） */
  narration?: string;
  /** 角色台词（对话气泡） */
  dialogue?: string;
};

/** 单章漫画清单（与后端 ComicManifest 对齐） */
export type ComicManifest = {
  novelId: string;
  chapterNumber: number;
  generatedAt: string;
  model: string;
  size: string;
  panelDir: string;
  /** draft=草稿（定期清理）；published=已发布（保留供书城读者） */
  status: 'draft' | 'published';
  panels: ComicPanel[];
};

/** 剧情点（剧情挖掘师产出） */
export type ComicBeat = {
  beatIndex: number;
  title: string;
  chapterLocation: string;
  event: string;
  characters: string[];
  emotionIntensity: number;
  visualPotential: number;
  reason: string;
};

export type ComicSceneCharacter = {
  name: string;
  action: string;
  expression: string;
};

/** 分镜场景（作者勾选单位） */
export type ComicScene = {
  sceneId: string;
  pageIndex?: number;
  panelIndexInPage?: number;
  panelRole?: string;
  layoutTemplate?: string;
  transitionFromPrevious?: string;
  bubblePlacement?: string;
  sfx?: string;
  beatIndex: number;
  title: string;
  characters: ComicSceneCharacter[];
  event: string;
  dialogue: string;
  narration: string;
  shotType: 'wide' | 'medium' | 'closeup' | 'insert';
  cameraAngle: 'eye-level' | 'low-angle' | 'high-angle' | 'over-shoulder';
  composition: 'rule-of-thirds' | 'diagonal' | 'center';
  shotReason: string;
  emotion: string;
  visualDescription: string;
  promptDraft: string;
};

/** 场景列表（设计漫画场景的产物，落盘 scene-list.json） */
export type ComicSceneList = {
  novelId: string;
  chapterNumber: number;
  generatedAt: string;
  beats: ComicBeat[];
  scenes: ComicScene[];
};

export type ComicGenerateOptions = {
  size?: string;
  /** 单章格数，默认 3，上限 6 */
  maxPanels?: number;
};

/**
 * 生成本章漫画（计费：cap.comic-panel × 格数）。
 * 后端受 comicChapterEnabled 开关管控，关闭时返回 404。
 */
export async function generateComic(
  novelId: string,
  chapterNumber: number,
  options?: ComicGenerateOptions,
): Promise<ComicManifest> {
  const { data } = await http.post<ComicManifest>(
    `/novels/${novelId}/comics/${chapterNumber}`,
    options ?? {},
    { timeout: 6 * 60_000 },
  );
  return data;
}

/** 发布本章漫画（draft → published）。已发布的保留在服务器供书城读者，不被定期清理。 */
export async function publishComic(novelId: string, chapterNumber: number): Promise<ComicManifest> {
  const { data } = await http.post<ComicManifest>(`/novels/${novelId}/comics/${chapterNumber}/publish`);
  return data;
}

/** 删除单格漫画（同步删除图片文件 + 从 manifest 移除） */
export async function deletePanel(novelId: string, chapterNumber: number, panelIndex: number): Promise<ComicManifest> {
  const { data } = await http.delete<ComicManifest>(`/novels/${novelId}/comics/${chapterNumber}/panels/${panelIndex}`);
  return data;
}

/** 排序漫画格（传新顺序的 panelIndex 数组，服务器重排 manifest） */
export async function reorderPanels(novelId: string, chapterNumber: number, panelIndices: number[]): Promise<ComicManifest> {
  const { data } = await http.post<ComicManifest>(`/novels/${novelId}/comics/${chapterNumber}/reorder`, { panelIndices });
  return data;
}

/** 原位重新生成单格漫画，保留格号和分镜位置 */
export async function regeneratePanel(
  novelId: string,
  chapterNumber: number,
  panelIndex: number,
  comicStyle?: string,
): Promise<ComicManifest> {
  const { data } = await http.post<ComicManifest>(
    `/novels/${novelId}/comics/${chapterNumber}/panels/${panelIndex}/regenerate`,
    { comicStyle },
    { timeout: 6 * 60_000 },
  );
  return data;
}

/** 读取本章漫画清单；未生成返回 null（不抛错） */
export async function getComic(
  novelId: string,
  chapterNumber: number,
): Promise<ComicManifest | null> {
  try {
    const { data } = await http.get<ComicManifest>(`/novels/${novelId}/comics/${chapterNumber}`);
    return data;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * 拼接单格图片的可访问 URL。
 * @param imagePath 后端返回的相对路径，形如 "comics/chapter-1/panel-1.png"
 */
export function comicPanelUrl(novelId: string, chapterNumber: number, imagePath: string): string {
  const file = imagePath.split('/').pop() ?? '';
  return `/api/novels/${novelId}/comics/${chapterNumber}/panels/${file}`;
}

/** 设计漫画场景（①剧情挖掘 + ②分镜设计，AI 产出场景列表） */
export async function designScenes(
  novelId: string,
  chapterNumber: number,
  mode: 'replace' | 'append' = 'replace',
): Promise<ComicSceneList> {
  const { data } = await http.post<ComicSceneList>(
    `/novels/${novelId}/comics/${chapterNumber}/design-scenes`,
    { mode },
    { timeout: 6 * 60_000 },
  );
  return data;
}

/** 读取场景列表；未设计返回 null */
export async function getScenes(novelId: string, chapterNumber: number): Promise<ComicSceneList | null> {
  try {
    const { data } = await http.get<ComicSceneList>(`/novels/${novelId}/comics/${chapterNumber}/scenes`);
    return data;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** 删除单个候选分镜场景；已生成漫画格引用的场景后端会拒绝删除 */
export async function deleteComicScene(
  novelId: string,
  chapterNumber: number,
  sceneId: string,
): Promise<ComicSceneList> {
  const { data } = await http.delete<ComicSceneList>(
    `/novels/${novelId}/comics/${chapterNumber}/scenes/${encodeURIComponent(sceneId)}`,
  );
  return data;
}

export type GenerateSelectedResult = { started: boolean; total: number };

/** 触发生成选中场景漫画（异步：后端立即返回，后台逐个出图 + 增量写 manifest） */
export async function generateSelectedComic(
  novelId: string,
  chapterNumber: number,
  sceneIds: string[],
  comicStyle?: string,
): Promise<GenerateSelectedResult> {
  const { data } = await http.post<GenerateSelectedResult>(
    `/novels/${novelId}/comics/${chapterNumber}/generate-selected`,
    { sceneIds, comicStyle },
    { timeout: 30_000 },
  );
  return data;
}

function isNotFound(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 404;
}

import { http } from './http';
import type { SceneCard, AdaptationMode, AdaptationPackage, AdaptationPackageStatus } from '../types';

// ==================== IP 改编 ====================

export type GenerateAdaptationPackageParams = {
  chapterNumberStart: number;
  chapterNumberEnd: number;
  mode: AdaptationMode;
  payloadPath?: string;
  qaReportPath?: string;
  audioDialogueIntensity?: 'low' | 'medium' | 'high';
  audioRewriteLevel?: 'conservative' | 'balanced' | 'dramatic';
  audioNarrationMaxRatio?: number;
  audioGenreOverride?: 'fantasy' | 'mystery' | 'modern' | 'scifi' | 'historical' | 'romance' | 'custom';
  audioSynthesizeAudio?: boolean;
};

export async function generateAdaptationPackage(
  novelId: string,
  params: GenerateAdaptationPackageParams,
): Promise<AdaptationPackage> {
  const { data } = await http.post<AdaptationPackage>(`/novels/${novelId}/adaptations/generate`, params);
  return data;
}

export async function listAdaptationPackages(
  novelId: string,
  params?: { mode?: AdaptationMode; status?: AdaptationPackageStatus },
): Promise<AdaptationPackage[]> {
  const { data } = await http.get<AdaptationPackage[]>(`/novels/${novelId}/adaptations`, { params });
  return data;
}

export async function deleteAdaptationPackage(
  novelId: string,
  packageId: string,
  params?: { removeArtifacts?: boolean },
): Promise<{
  packageId: string;
  deleted: boolean;
  removeArtifacts: boolean;
  removedArtifacts: string[];
}> {
  const { data } = await http.delete<{
    packageId: string;
    deleted: boolean;
    removeArtifacts: boolean;
    removedArtifacts: string[];
  }>(`/novels/${novelId}/adaptations/${packageId}`, { params });
  return data;
}

export async function getAdaptationPackagePayload(
  novelId: string,
  packageId: string,
): Promise<{
  packageId: string;
  mode: AdaptationMode;
  payloadPath: string;
  payload: unknown;
}> {
  const { data } = await http.get<{
    packageId: string;
    mode: AdaptationMode;
    payloadPath: string;
    payload: unknown;
  }>(`/novels/${novelId}/adaptations/${packageId}/payload`);
  return data;
}

export async function runAdaptationQA(
  novelId: string,
  packageId: string,
  params: { passed: boolean; qaReportPath?: string },
): Promise<AdaptationPackage> {
  const { data } = await http.post<AdaptationPackage>(`/novels/${novelId}/adaptations/${packageId}/qa`, params);
  return data;
}

export async function checkAdaptationPublishReady(
  novelId: string,
  packageId: string,
): Promise<{
  packageId: string;
  publishReady: boolean;
  blockers: string[];
  warnings?: string[];
  checkedAt?: string;
}> {
  const { data } = await http.post<{
    packageId: string;
    publishReady: boolean;
    blockers: string[];
    warnings?: string[];
    checkedAt?: string;
  }>(
    `/novels/${novelId}/adaptations/${packageId}/publish-ready-check`,
  );
  return data;
}


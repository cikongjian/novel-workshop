import { http } from './http';
import type { UniverseAnchor, AnchorLink, AnchorTimeRelation } from '../types';

// ==================== 宇宙锚点 ====================

/** 获取所有锚点列表 */
export async function fetchAnchors(): Promise<UniverseAnchor[]> {
  const { data } = await http.get<UniverseAnchor[]>('/anchors');
  return data;
}

/** 删除锚点 */
export async function deleteAnchor(anchorId: string): Promise<void> {
  await http.delete(`/anchors/${anchorId}`);
}

/** 从完结小说生成锚点（异步，通过 WebSocket 推送进度） */
export async function generateAnchor(novelId: string): Promise<{ anchorId: string; message: string }> {
  const { data } = await http.post<{ anchorId: string; message: string }>(
    `/anchors/generate/${novelId}`,
    {},
    { timeout: 10000 },
  );
  return data;
}

/** 批量确认角色入池 */
export async function confirmAnchorCharacters(
  anchorId: string,
  characterIds: string[],
): Promise<UniverseAnchor> {
  const { data } = await http.post<UniverseAnchor>(
    `/anchors/${anchorId}/characters/confirm`,
    { characterIds },
  );
  return data;
}

/** 将角色移出池 */
export async function removeAnchorCharacter(
  anchorId: string,
  characterId: string,
): Promise<UniverseAnchor> {
  const { data } = await http.delete<UniverseAnchor>(
    `/anchors/${anchorId}/characters/${characterId}`,
  );
  return data;
}

/** 获取小说的锚点关联列表 */
export async function fetchAnchorLinks(novelId: string): Promise<AnchorLink[]> {
  const { data } = await http.get<AnchorLink[]>(`/anchors/links/${novelId}`);
  return data;
}

/** 关联锚点到小说 */
export async function linkAnchor(
  novelId: string,
  link: { anchorId: string; timeRelation: AnchorTimeRelation; priority?: number },
): Promise<AnchorLink[]> {
  const { data } = await http.post<AnchorLink[]>(`/anchors/links/${novelId}`, link);
  return data;
}

/** 解除锚点关联 */
export async function unlinkAnchor(novelId: string, anchorId: string): Promise<AnchorLink[]> {
  const { data } = await http.delete<AnchorLink[]>(`/anchors/links/${novelId}/${anchorId}`);
  return data;
}

/** 更新锚点关联（时间关系/优先级） */
export async function updateAnchorLink(
  novelId: string,
  anchorId: string,
  updates: { timeRelation?: AnchorTimeRelation; priority?: number },
): Promise<AnchorLink[]> {
  const { data } = await http.put<AnchorLink[]>(
    `/anchors/links/${novelId}/${anchorId}`,
    updates,
  );
  return data;
}

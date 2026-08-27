/**
 * 设定基线存储
 *
 * 复用 truth-files 的路径约定（data/novels/{id}/truth-files/），自包含读写，
 * 不耦合 truth-file-manager 内部。文件不存在时返回 null（向后兼容）。
 */
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveNovelStorageDir } from '../../novel/data-root.js';
import type { SettingBaseline } from './types.js';

const FILE_NAME = 'setting-baseline.json';

export function getSettingBaselinePath(novelsDir: string, novelId: string): string {
  return join(resolveNovelStorageDir(novelsDir, novelId), 'truth-files', FILE_NAME);
}

async function readJsonSafe(filePath: string): Promise<SettingBaseline | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as SettingBaseline;
    if (parsed && parsed.version === 1 && parsed.novelId) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function writeJsonSafe(filePath: string, data: SettingBaseline): Promise<void> {
  const dir = dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function loadSettingBaseline(novelsDir: string, novelId: string): Promise<SettingBaseline | null> {
  return readJsonSafe(getSettingBaselinePath(novelsDir, novelId));
}

export async function saveSettingBaseline(novelsDir: string, baseline: SettingBaseline): Promise<void> {
  await writeJsonSafe(getSettingBaselinePath(novelsDir, baseline.novelId), baseline);
}

/** 写入 pending 基线（待人工确认）；若已存在 confirmed 基线则不覆盖 */
export async function writePendingBaseline(novelsDir: string, baseline: SettingBaseline): Promise<void> {
  const existing = await loadSettingBaseline(novelsDir, baseline.novelId);
  if (existing?.status === 'confirmed') return;
  await saveSettingBaseline(novelsDir, { ...baseline, status: 'pending' });
}

/** 人工确认冻结：pending → confirmed。返回更新后的基线或 null（不存在） */
export async function confirmSettingBaseline(
  novelsDir: string,
  novelId: string,
): Promise<SettingBaseline | null> {
  const existing = await loadSettingBaseline(novelsDir, novelId);
  if (!existing) return null;
  if (existing.status === 'confirmed') return existing;
  const confirmed: SettingBaseline = {
    ...existing,
    status: 'confirmed',
    confirmedAt: new Date().toISOString(),
  };
  await saveSettingBaseline(novelsDir, confirmed);
  return confirmed;
}

/** confirmed 基线才作为强约束注入 Writer / 参与门禁阻断 */
export function isBaselineActive(baseline: SettingBaseline | null): baseline is SettingBaseline {
  return Boolean(baseline && baseline.status === 'confirmed');
}

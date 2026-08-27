import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadSettingBaseline,
  saveSettingBaseline,
  confirmSettingBaseline,
  writePendingBaseline,
  isBaselineActive,
} from './baseline-store.js';
import { buildSettingBaseline } from './baseline-snapshot.js';
import type { SettingBaseline } from './types.js';

let novelsDir: string;

beforeAll(async () => {
  novelsDir = await mkdtemp(join(tmpdir(), 'setting-baseline-test-'));
});
afterAll(async () => {
  await rm(novelsDir, { recursive: true, force: true });
});

function makeBaseline(status: SettingBaseline['status']): SettingBaseline {
  const b = buildSettingBaseline({
    novel: { id: 'test-novel', genre: '玄幻', title: '测试', synopsis: '测试简介', tags: [] },
    worldEntries: [],
    characters: [],
    fromChapters: '1-3',
  });
  return { ...b, status };
}

describe('setting-baseline store', () => {
  it('文件不存在时 load 返回 null（向后兼容）', async () => {
    expect(await loadSettingBaseline(novelsDir, 'absent-novel')).toBeNull();
  });

  it('save → load 往返保持数据', async () => {
    const b = makeBaseline('pending');
    await saveSettingBaseline(novelsDir, b);
    const loaded = await loadSettingBaseline(novelsDir, 'test-novel');
    expect(loaded?.status).toBe('pending');
    expect(loaded?.novelId).toBe('test-novel');
    expect(loaded?.version).toBe(1);
  });

  it('confirmSettingBaseline: pending → confirmed，幂等', async () => {
    const confirmed = await confirmSettingBaseline(novelsDir, 'test-novel');
    expect(confirmed?.status).toBe('confirmed');
    expect(confirmed?.confirmedAt).toBeTruthy();
    // 再次确认幂等
    const again = await confirmSettingBaseline(novelsDir, 'test-novel');
    expect(again?.status).toBe('confirmed');
  });

  it('writePendingBaseline 不覆盖已 confirmed 的基线（防误降级）', async () => {
    const before = await loadSettingBaseline(novelsDir, 'test-novel');
    expect(before?.status).toBe('confirmed'); // 前置：已确认

    const pendingAttempt = makeBaseline('pending');
    await writePendingBaseline(novelsDir, pendingAttempt);

    const after = await loadSettingBaseline(novelsDir, 'test-novel');
    expect(after?.status).toBe('confirmed'); // 仍是 confirmed，未被 pending 覆盖
  });

  it('isBaselineActive: 仅 confirmed 视为激活', () => {
    expect(isBaselineActive(null)).toBe(false);
    expect(isBaselineActive({ ...makeBaseline('pending') })).toBe(false);
    expect(isBaselineActive({ ...makeBaseline('confirmed') })).toBe(true);
  });
});

/**
 * 设定基线 → Writer 上下文渲染
 *
 * 把 SettingBaseline 渲染成"## 创作宪法（不可漂移）"文本段，注入 writer context。
 * 仅 confirmed 基线才作为强约束注入；pending 基线不注入（避免冻结错误设定）。
 */
import type { SettingBaseline } from './types.js';

export function buildBaselineContext(baseline: SettingBaseline | null): string {
  if (!baseline || baseline.status !== 'confirmed') return '';

  const lines: string[] = ['## 创作宪法（设定基线 · 不可漂移）'];
  lines.push('以下是你这部长篇的"设定骨架"，由作者确认冻结。新章节只能在骨架上长枝叶，不得更换骨架：');

  if (baseline.powerSystems.length > 0) {
    lines.push('');
    lines.push('【力量体系（禁止替换为另一套体系）】');
    for (const p of baseline.powerSystems) {
      lines.push(`- ${p.name}：${p.description || '（无描述）'}`);
    }
  }

  if (baseline.worldFrame.summary || baseline.worldFrame.factions.length > 0) {
    lines.push('');
    lines.push('【世界观框架】');
    if (baseline.worldFrame.summary) lines.push(`- ${baseline.worldFrame.summary}`);
    if (baseline.worldFrame.factions.length > 0) {
      lines.push(`- 核心势力：${baseline.worldFrame.factions.join('、')}`);
    }
  }

  if (baseline.characterCores.length > 0) {
    lines.push('');
    lines.push('【核心角色定位（禁止改写核心人设）】');
    for (const c of baseline.characterCores) {
      lines.push(`- ${c.name}（${c.role}）：${c.identity || '（见角色档案）'}`);
    }
  }

  if ((baseline.canonicalWorldEntries?.length ?? 0) > 0) {
    lines.push('');
    lines.push('【世界正史边界（提及时必须遵守，不要求本章全部出现）】');
    for (const entry of baseline.canonicalWorldEntries ?? []) {
      const facts = [
        ...entry.constraints.map(item => `约束：${item}`),
        ...entry.consequences.map(item => `后果：${item}`),
      ];
      lines.push(`- ${entry.name}：${facts.join('；') || entry.description || '不得与既有正史冲突'}`);
    }
  }

  if (baseline.promises.length > 0) {
    lines.push('');
    lines.push('【核心剧情承诺】');
    for (const p of baseline.promises) lines.push(`- ${p}`);
  }

  if (baseline.forbiddenDirections.length > 0) {
    lines.push('');
    lines.push('【禁止漂移方向（命中即视为设定漂移）】');
    for (const f of baseline.forbiddenDirections) lines.push(`- ${f}`);
  }

  if (baseline.antiDriftClause) {
    lines.push('');
    lines.push(`【反漂移约束】${baseline.antiDriftClause}`);
  }

  lines.push('');
  lines.push('若本章需要引入新设定，必须能用一句话关联到上述骨架；不得引入与骨架无关的新核心体系（尤其是系统化、数据库化、跨界传送类术语）。');

  return lines.join('\n');
}

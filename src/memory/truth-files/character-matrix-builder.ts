/**
 * 角色信息边界矩阵构建器
 *
 * 从 CharacterLiveState[]（多章快照）+ CharacterProfile.relationships
 * 构建角色间信息边界视图。
 *
 * 核心价值：追踪"谁知道什么"——这是 StoryStateSnapshot 没有的功能。
 * 对推理/悬疑类型尤其重要（information_boundary 权重高达 2.0）。
 */

import type { CharacterLiveState } from '../../novel/story-state-types.js';
import type { CharacterProfile } from '../../novel/types.js';
import type { CharacterMatrixView, CharacterInfoEdge } from './types.js';

// ==================== 常量 ====================

/** 最多处理的角色数量（避免 O(n²) 爆炸） */
const MAX_CHARACTERS = 15;

/** 最多保留的信息边关系数 */
const MAX_INFO_EDGES = 30;

// ==================== 构建函数 ====================

/**
 * 从 CharacterLiveState[] 提取已揭示/隐藏秘密
 */
function extractSecrets(
  characters: CharacterLiveState[],
): {
  revealed: Array<{ characterName: string; secrets: string[] }>;
  hidden: Array<{ characterName: string; secrets: string[] }>;
} {
  const revealed: Array<{ characterName: string; secrets: string[] }> = [];
  const hidden: Array<{ characterName: string; secrets: string[] }> = [];

  for (const c of characters) {
    if (c.revealedSecrets.length > 0) {
      revealed.push({ characterName: c.name, secrets: [...c.revealedSecrets] });
    }
    if (c.hiddenSecrets.length > 0) {
      hidden.push({ characterName: c.name, secrets: [...c.hiddenSecrets] });
    }
  }

  return { revealed, hidden };
}

/**
 * 构建角色间的信息边界关系
 *
 * 逻辑：
 * 1. 从 CharacterProfile.relationships 获取角色对
 * 2. 从 CharacterLiveState.relationshipChanges 获取动态变化
 * 3. 推断共享知识 vs 信息不对称
 */
function buildInfoEdges(
  characters: CharacterLiveState[],
  profiles: CharacterProfile[],
): CharacterInfoEdge[] {
  const edges: CharacterInfoEdge[] = [];
  const charByName = new Map(characters.map(c => [c.name, c]));
  const profileById = new Map(profiles.map(p => [p.id, p]));
  const profileByName = new Map(profiles.map(p => [p.name, p]));

  for (const profile of profiles.slice(0, MAX_CHARACTERS)) {
    if (!profile.relationships) continue;

    for (const rel of profile.relationships) {
      const targetProfile = profileById.get(rel.targetId);
      if (!targetProfile) continue;

      const fromState = charByName.get(profile.name);
      const toState = charByName.get(targetProfile.name);
      if (!fromState || !toState) continue;

      // 共享知识 = fromState.revealedSecrets ∩ 与 target 相关的信息
      // 信息不对称 = fromState.hiddenSecrets（to 不知道的）
      const sharedKnowledge: string[] = [];
      const asymmetricKnowledge: string[] = [];

      // from 的已揭示秘密中涉及 to 的部分视为共享知识
      for (const secret of fromState.revealedSecrets) {
        if (secret.includes(targetProfile.name) || secret.includes(profile.name)) {
          sharedKnowledge.push(secret);
        }
      }

      // from 的隐藏秘密 = to 不知道的
      for (const secret of fromState.hiddenSecrets) {
        asymmetricKnowledge.push(secret);
      }

      // 仅在有实质信息时才创建边
      if (sharedKnowledge.length === 0 && asymmetricKnowledge.length === 0 && !rel.publicVsPrivate) {
        continue;
      }

      edges.push({
        from: profile.name,
        to: targetProfile.name,
        sharedKnowledge,
        asymmetricKnowledge,
        relationType: rel.type,
        publicVsPrivate: rel.publicVsPrivate || undefined,
      });
    }
  }

  return edges.slice(0, MAX_INFO_EDGES);
}

// ==================== 导出 ====================

/**
 * 构建角色信息边界矩阵视图
 *
 * @param latestCharacterStates - 最新章节的角色状态
 * @param profiles - 角色配置文件（含 relationships）
 */
export function buildCharacterMatrixView(
  latestCharacterStates: CharacterLiveState[],
  profiles: CharacterProfile[],
): CharacterMatrixView {
  const truncatedStates = latestCharacterStates.slice(0, MAX_CHARACTERS);
  const { revealed, hidden } = extractSecrets(truncatedStates);
  const infoEdges = buildInfoEdges(truncatedStates, profiles);

  return {
    revealedSecrets: revealed,
    hiddenSecrets: hidden,
    infoEdges,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 将 CharacterMatrixView 渲染为 prompt 注入文本
 */
export function renderCharacterMatrixContext(view: CharacterMatrixView): string {
  const lines: string[] = ['【角色信息边界】'];

  // 已揭示秘密
  if (view.revealedSecrets.length > 0) {
    lines.push('已揭示秘密：');
    for (const item of view.revealedSecrets) {
      lines.push(`  ${item.characterName}：${item.secrets.join('；')}`);
    }
  }

  // 隐藏秘密
  if (view.hiddenSecrets.length > 0) {
    lines.push('隐藏秘密（读者可能不知）：');
    for (const item of view.hiddenSecrets) {
      lines.push(`  ${item.characterName}：${item.secrets.join('；')}`);
    }
  }

  // 信息不对称
  const asymmetricEdges = view.infoEdges.filter(e => e.asymmetricKnowledge.length > 0 || e.publicVsPrivate);
  if (asymmetricEdges.length > 0) {
    lines.push('信息不对称：');
    for (const edge of asymmetricEdges) {
      if (edge.publicVsPrivate) {
        lines.push(`  ${edge.from}→${edge.to}：表面"${edge.relationType}"，实则"${edge.publicVsPrivate}"`);
      }
      if (edge.asymmetricKnowledge.length > 0) {
        lines.push(`  ${edge.from}知道但${edge.to}不知道：${edge.asymmetricKnowledge.join('；')}`);
      }
    }
  }

  return lines.join('\n');
}

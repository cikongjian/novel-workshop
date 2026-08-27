/**
 * 分支摘取（Branch Cherry-Pick）
 *
 * 类似 git cherry-pick，从一个分支的快照中选择性地
 * 提取特定元素（角色状态、情节线、世界变化）合并到目标状态。
 */

import type { StoryState, StoryStateSnapshot } from '../novel/story-state-types.js';

// ── 类型 ──────────────────────────────────────────────────────────

export interface CherryPickRequest {
  /** Source branch ID */
  sourceBranchId: string;
  /** Chapter number from the source to pick */
  sourceChapter: number;
  /** Which elements to cherry-pick */
  elements: {
    /** Character names to copy over (their full state) */
    characters?: string[];
    /** Plot thread names to copy over */
    plotThreads?: string[];
    /** Whether to include world state changes */
    worldChanges?: boolean;
    /** Whether to include faction changes */
    factionChanges?: boolean;
    /** Whether to include causal chains */
    causalChains?: boolean;
  };
}

export interface CherryPickResult {
  /** The merged snapshot */
  snapshot: StoryStateSnapshot;
  /** Summary of what was picked */
  pickedElements: string[];
  /** Any conflicts detected */
  conflicts: string[];
}

// ── 实现 ──────────────────────────────────────────────────────────

/**
 * Cherry-pick selected elements from a source snapshot into a target state.
 * Returns a new snapshot (does not modify the target in place).
 */
export function cherryPickFromBranch(
  sourceSnapshot: StoryStateSnapshot,
  targetState: StoryState,
  request: CherryPickRequest,
): CherryPickResult {
  // Get the latest target snapshot as base
  const targetSnapshots = targetState.snapshots;
  if (targetSnapshots.length === 0) {
    return {
      snapshot: structuredClone(sourceSnapshot),
      pickedElements: ['完整快照（目标为空）'],
      conflicts: [],
    };
  }

  const base = structuredClone(targetSnapshots[targetSnapshots.length - 1]);
  const pickedElements: string[] = [];
  const conflicts: string[] = [];

  // Cherry-pick characters
  if (request.elements.characters && request.elements.characters.length > 0) {
    for (const charName of request.elements.characters) {
      const sourceChar = sourceSnapshot.characters.find(c => c.name === charName);
      if (!sourceChar) {
        conflicts.push(`角色 ${charName} 在源分支第${request.sourceChapter}章不存在`);
        continue;
      }

      const targetIdx = base.characters.findIndex(c => c.name === charName);
      if (targetIdx >= 0) {
        // Check for conflicts: if both modified, warn
        const targetChar = base.characters[targetIdx];
        if (targetChar.location !== sourceChar.location) {
          conflicts.push(`${charName}位置冲突：目标=${targetChar.location}，源=${sourceChar.location}`);
        }
        base.characters[targetIdx] = structuredClone(sourceChar);
      } else {
        base.characters.push(structuredClone(sourceChar));
      }
      pickedElements.push(`角色：${charName}`);
    }
  }

  // Cherry-pick plot threads
  if (request.elements.plotThreads && request.elements.plotThreads.length > 0) {
    for (const threadName of request.elements.plotThreads) {
      const sourceThread = sourceSnapshot.plot.activeThreads.find(t => t.threadName === threadName);
      if (!sourceThread) {
        conflicts.push(`情节线 ${threadName} 在源分支不存在`);
        continue;
      }

      const targetIdx = base.plot.activeThreads.findIndex(t => t.threadName === threadName);
      if (targetIdx >= 0) {
        base.plot.activeThreads[targetIdx] = structuredClone(sourceThread);
      } else {
        base.plot.activeThreads.push(structuredClone(sourceThread));
      }
      pickedElements.push(`情节线：${threadName}`);
    }
  }

  // Cherry-pick world changes
  if (request.elements.worldChanges) {
    base.world = structuredClone(sourceSnapshot.world);
    pickedElements.push('世界状态');
  }

  // Cherry-pick faction changes
  if (request.elements.factionChanges) {
    base.factions = structuredClone(sourceSnapshot.factions);
    pickedElements.push('势力状态');
  }

  // Cherry-pick causal chains
  if (request.elements.causalChains) {
    // Merge: add source chains that don't exist in target
    for (const sourceChain of sourceSnapshot.causalChains) {
      const exists = base.causalChains.some(
        c => c.cause === sourceChain.cause && c.causeChapter === sourceChain.causeChapter,
      );
      if (!exists) {
        base.causalChains.push(structuredClone(sourceChain));
        pickedElements.push(`因果链：${sourceChain.cause}`);
      }
    }
  }

  // Update metadata
  base.createdAt = new Date().toISOString();

  return { snapshot: base, pickedElements, conflicts };
}

/**
 * Truth File 适配器
 *
 * 将 truth files（确定性状态视图）转换为 MemoryItem[]，
 * 接入统一记忆编排器的打分管线。
 *
 * 3 个 MemorySource：
 * - truth_file:current_state  — 当前世界/角色压缩状态
 * - truth_file:pending_hooks  — 待兑现伏笔（每个过期伏笔单独一条）
 * - truth_file:character_matrix — 角色信息边界矩阵
 */

import type {
  MemoryItem,
  MemorySource,
  MemorySourceAdapter,
  OrchestratorParams,
} from './types.js';
import type { TruthFileBundle } from '../truth-files/types.js';
import {
  renderCurrentStateContext,
  renderPendingHooksContext,
  renderCharacterMatrixContext,
} from '../truth-files/index.js';

// ────────────────────────────── 数据接口 ──────────────────────────────

/**
 * Truth file 数据加载接口。
 * 由外部注入，解耦文件 I/O 依赖。
 */
export interface TruthFileData {
  loadBundle(novelId: string): Promise<TruthFileBundle>;
}

// ────────────────────────────── Source 常量 ──────────────────────────────

const SOURCE_CURRENT_STATE: MemorySource = 'truth_file:current_state' as MemorySource;
const SOURCE_PENDING_HOOKS: MemorySource = 'truth_file:pending_hooks' as MemorySource;
const SOURCE_CHARACTER_MATRIX: MemorySource = 'truth_file:character_matrix' as MemorySource;

// ────────────────────────────── 适配器实现 ──────────────────────────────

export class TruthFileAdapter implements MemorySourceAdapter {
  readonly name = 'truth-file';
  readonly sources: readonly MemorySource[] = [
    SOURCE_CURRENT_STATE,
    SOURCE_PENDING_HOOKS,
    SOURCE_CHARACTER_MATRIX,
  ];

  constructor(private readonly data: TruthFileData) {}

  async retrieve(params: OrchestratorParams): Promise<MemoryItem[]> {
    const bundle = await this.data.loadBundle(params.novelId);
    const items: MemoryItem[] = [];

    // 1. 当前状态视图
    if (bundle.currentState) {
      const isRecent = Math.abs(bundle.currentState.chapterNumber - params.chapterNumber) <= 2;
      if (isRecent) {
        const text = renderCurrentStateContext(bundle.currentState);
        if (text.length > 0) {
          items.push({
            id: `truth_file:current_state:${params.novelId}`,
            source: SOURCE_CURRENT_STATE,
            entityId: params.novelId,
            chapterNumber: bundle.currentState.chapterNumber,
            text,
            charCount: text.length,
            relevance: 0.92,
            freshness: 1.0,
            isCritical: false,
            unresolvedWeight: 0,
            provenance: `truth-file:current-state ch${bundle.currentState.chapterNumber}`,
          });
        }
      }
    }

    // 2. 待兑现伏笔
    if (bundle.pendingHooks && bundle.pendingHooks.hooks.length > 0) {
      // 过期/紧急伏笔：每个单独一条，高优先级
      const criticalHooks = bundle.pendingHooks.hooks.filter(h => h.urgency === 'critical');
      const warningHooks = bundle.pendingHooks.hooks.filter(h => h.urgency === 'warning');

      if (criticalHooks.length > 0 || warningHooks.length > 0) {
        // 紧急伏笔：逐条注入，isCritical=true
        for (const hook of criticalHooks) {
          const text = `[过期伏笔] 第${hook.plantedInChapter}章埋设「${hook.hint}」已过期${Math.abs(hook.chaptersUntilOverdue)}章，必须尽快兑现`;
          items.push({
            id: `truth_file:pending_hooks:critical:${hook.plantedInChapter}:${hook.hint.slice(0, 20)}`,
            source: SOURCE_PENDING_HOOKS,
            entityId: params.novelId,
            chapterNumber: hook.plantedInChapter,
            text,
            charCount: text.length,
            relevance: 0.95,
            freshness: 1.0,
            isCritical: true,
            unresolvedWeight: 0.8,
            provenance: `truth-file:pending-hook:critical ch${hook.plantedInChapter}`,
          });
        }

        // 预警伏笔：合并为一条
        if (warningHooks.length > 0) {
          const lines = warningHooks.map(h =>
            `- 第${h.plantedInChapter}章「${h.hint}」剩余${h.chaptersUntilOverdue}章`
          );
          const text = `[伏笔预警]\n${lines.join('\n')}`;
          items.push({
            id: `truth_file:pending_hooks:warning:${params.novelId}`,
            source: SOURCE_PENDING_HOOKS,
            entityId: params.novelId,
            chapterNumber: params.chapterNumber,
            text,
            charCount: text.length,
            relevance: 0.88,
            freshness: 1.0,
            isCritical: false,
            unresolvedWeight: 0.6,
            provenance: `truth-file:pending-hooks:warning ${warningHooks.length} hooks`,
          });
        }
      }

      // 正常伏笔：合并为一条整体视图
      const normalHooks = bundle.pendingHooks.hooks.filter(h => h.urgency === 'normal');
      if (normalHooks.length > 0) {
        const text = renderPendingHooksContext(bundle.pendingHooks);
        items.push({
          id: `truth_file:pending_hooks:overview:${params.novelId}`,
          source: SOURCE_PENDING_HOOKS,
          entityId: params.novelId,
          chapterNumber: params.chapterNumber,
          text,
          charCount: text.length,
          relevance: 0.80,
          freshness: 0.9,
          isCritical: false,
          unresolvedWeight: 0.3,
          provenance: `truth-file:pending-hooks:overview ${normalHooks.length} hooks`,
        });
      }
    }

    // 3. 角色信息边界矩阵
    if (bundle.characterMatrix) {
      const hasContent =
        bundle.characterMatrix.revealedSecrets.length > 0
        || bundle.characterMatrix.hiddenSecrets.length > 0
        || bundle.characterMatrix.infoEdges.length > 0;

      if (hasContent) {
        // 如果有焦点角色，过滤只包含相关角色的信息
        let text = renderCharacterMatrixContext(bundle.characterMatrix);

        if (params.focusCharacterIds && params.focusCharacterIds.length > 0) {
          // 焦点角色名称需从外部获取（这里使用 characterAliases 反查）
          const focusNames = new Set<string>();
          if (params.characterAliases) {
            for (const [name] of params.characterAliases) {
              focusNames.add(name);
            }
          }
          // 即使有焦点角色，也注入完整矩阵（编排器的预算裁剪会处理长度）
        }

        if (text.length > 0) {
          items.push({
            id: `truth_file:character_matrix:${params.novelId}`,
            source: SOURCE_CHARACTER_MATRIX,
            entityId: params.novelId,
            chapterNumber: params.chapterNumber,
            text,
            charCount: text.length,
            relevance: 0.88,
            freshness: 0.95,
            isCritical: false,
            unresolvedWeight: 0,
            provenance: 'truth-file:character-matrix',
          });
        }
      }
    }

    return items;
  }
}

/**
 * 门禁辅助函数 — 从 chapter-pipeline.ts 提取的门禁修复提示构建和说话人白名单评估逻辑。
 *
 * 不依赖 ChapterPipeline 的 `this`，通过显式参数获取所需数据。
 */

import type { CharacterProfile } from '../novel/types.js';
import type { ChapterGenerationResult, PipelineNovelManager, SpeakerWhitelistReport } from './types.js';
import type { WorldContract } from './world-contract.js';
import type { OutlineContract } from './outline-gate.js';
import {
  BUILTIN_ALLOWED_SPEAKERS,
  type CharacterWhitelistGateMode,
} from './pipeline-constants.js';

// ==================== 大纲门禁修复提示 ====================

export function buildOutlineGateFixHints(
  fulfillment: NonNullable<ChapterGenerationResult['outlineFulfillment']>,
  contract: OutlineContract,
): string {
  const lines: string[] = [
    '以下是 strict 大纲门禁修复要求，请对正文做最小必要改写：',
  ];

  if (fulfillment.missingRequired.length > 0) {
    lines.push('');
    lines.push('【必须补齐的大纲要点】');
    for (const item of fulfillment.missingRequired) {
      const matched = contract.required.find(required => required.text === item);
      const sourceLabel = matched?.source === 'chapter-outline'
        ? '主线大纲'
        : matched?.source === 'foreshadowing'
          ? '未回收伏笔'
          : '本章细纲';
      lines.push(`- (${sourceLabel}) ${item}`);
    }
  }

  lines.push('');
  lines.push('【改写边界】');
  lines.push('- 保持主剧情顺序与已成稿段落节奏，不要整章重写。');
  lines.push('- 以事件、冲突、抉择兑现要点，避免只做名词点缀。');
  lines.push('- 输出格式仍为"润色后的正文 + ---EDITOR_NOTES--- + 修改说明"。');
  return lines.join('\n');
}

// ==================== 世界观门禁修复提示 ====================

export function buildWorldGateFixHints(
  fulfillment: NonNullable<ChapterGenerationResult['worldFulfillment']>,
  contract: WorldContract,
): string {
  const lines: string[] = [
    '以下是 strict 门禁修复要求，请对正文做最小必要改写：',
  ];

  if (fulfillment.missingRequired.length > 0) {
    lines.push('');
    lines.push('【必须补齐的必引要素】');
    for (const name of fulfillment.missingRequired) {
      const entry = contract.required.find(item => item.name === name);
      lines.push(`- ${name}`);
      if (entry?.constraints && entry.constraints.length > 0) {
        lines.push(`  - 约束：${entry.constraints.join('；')}`);
      }
      if (entry?.consequences && entry.consequences.length > 0) {
        lines.push(`  - 后果：${entry.consequences.join('；')}`);
      }
    }
  }

  if (fulfillment.unsourcedTerms.length > 0) {
    lines.push('');
    lines.push('【需处理的疑似无来源设定】');
    lines.push(`- ${fulfillment.unsourcedTerms.join('、')}`);
    lines.push('- 若是笔误或歧义，请改写为已存在设定名；若必须新增，请补一句来源说明并与既有规则兼容。');
  }

  const semanticFindings = fulfillment.findings.filter(
    finding => finding.code === 'shallow-required' || finding.code === 'contradicted-rule',
  );
  if (semanticFindings.length > 0) {
    lines.push('');
    lines.push('【必须恢复的世界规则作用】');
    for (const finding of semanticFindings) {
      const entry = [
        ...contract.required,
        ...contract.supporting,
        ...(contract.canonical ?? []),
      ].find(item => item.name === finding.entryName);
      lines.push(`- ${finding.message}`);
      if (entry?.constraints.length) lines.push(`  - 必须体现的约束：${entry.constraints.join('；')}`);
      if (entry?.consequences.length) lines.push(`  - 可见后果：${entry.consequences.join('；')}`);
      if (finding.code === 'contradicted-rule') lines.push('  - 删除反向描述，不得把既有规则写成失效或任意绕过。');
    }
  }

  lines.push('');
  lines.push('【改写边界】');
  lines.push('- 尽量保持原剧情节奏与段落结构，不做整章重写。');
  lines.push('- 补写内容必须推动冲突、决策或后果，不得只点名设定。');
  lines.push('- 输出格式仍为"润色后的正文 + ---EDITOR_NOTES--- + 修改说明"。');
  return lines.join('\n');
}

export function shouldAttemptWorldGateFix(params: {
  fulfillment: NonNullable<ChapterGenerationResult['worldFulfillment']>;
  contract: WorldContract;
  gateMode: 'off' | 'warn' | 'strict';
  skipStrictGate: boolean;
}): boolean {
  if (params.skipStrictGate || params.gateMode === 'off') return false;
  const semanticFindings = params.fulfillment.findings.filter(
    finding => finding.code === 'shallow-required' || finding.code === 'contradicted-rule',
  );
  const approvedSemanticViolation = semanticFindings.some(finding => (
    [...params.contract.required, ...(params.contract.canonical ?? [])]
      .some(entry => entry.name === finding.entryName && entry.baseline)
  ));
  if (approvedSemanticViolation) return true;
  return params.gateMode === 'strict'
    && !params.fulfillment.passed
    && (
      params.fulfillment.missingRequired.length > 0
      || params.fulfillment.unsourcedTerms.length > 0
      || semanticFindings.length > 0
    );
}

// ==================== 说话人标记收集 ====================

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function collectSpeakerMarkers(content: string): Array<{ name: string; occurrences: number }> {
  const markerRe = /[\(\uFF08]\s*#\s*([^()\uFF08\uFF09\n]+?)\s*[\)\uFF09]/g;
  const counter = new Map<string, { name: string; occurrences: number }>();
  let match: RegExpExecArray | null;
  while ((match = markerRe.exec(content)) !== null) {
    const rawName = (match[1] ?? '').trim();
    if (!rawName) continue;
    const key = normalizeName(rawName);
    const prev = counter.get(key);
    if (prev) {
      prev.occurrences += 1;
    } else {
      counter.set(key, {
        name: rawName,
        occurrences: 1,
      });
    }
  }
  return [...counter.values()];
}

// ==================== 说话人白名单评估 ====================

export async function evaluateSpeakerWhitelist(params: {
  novelManager: PipelineNovelManager;
  characters: CharacterProfile[];
  novelId: string;
  chapterNumber: number;
  chapterContent: string;
  mode: CharacterWhitelistGateMode;
}): Promise<SpeakerWhitelistReport> {
  const { novelManager, characters, chapterNumber, chapterContent, mode } = params;
  const speakers = collectSpeakerMarkers(chapterContent);
  if (speakers.length === 0) {
    return {
      mode,
      passed: true,
      summary: '未检测到说话人标记',
      findings: [],
    };
  }

  const knownNames = new Set<string>();
  for (const character of characters) {
    knownNames.add(normalizeName(character.name));
    for (const alias of character.aliases ?? []) {
      knownNames.add(normalizeName(alias));
    }
  }

  const pendingMap = new Map<string, 'pending' | 'approved' | 'rejected'>();
  if (novelManager.getPendingCharacterCandidates) {
    const pendingCandidates = await novelManager.getPendingCharacterCandidates(params.novelId);
    for (const item of pendingCandidates) {
      pendingMap.set(normalizeName(item.name), item.status);
    }
  }

  const findings = speakers
    .filter((item) => {
      const key = normalizeName(item.name);
      if (BUILTIN_ALLOWED_SPEAKERS.has(key)) return false;
      return !knownNames.has(key);
    })
    .map((item) => {
      const key = normalizeName(item.name);
      return {
        name: item.name,
        occurrences: item.occurrences,
        inPendingPool: pendingMap.get(key) === 'pending',
      };
    });

  if (findings.length === 0) {
    return {
      mode,
      passed: true,
      summary: '说话人角色均在白名单内',
      findings: [],
    };
  }

  const detail = findings
    .map(item => `${item.name}x${item.occurrences}${item.inPendingPool ? '(候选池)' : ''}`)
    .join('，');

  return {
    mode,
    passed: false,
    summary: `检测到 ${findings.length} 个未建档说话人（第 ${chapterNumber} 章）：${detail}`,
    findings,
  };
}

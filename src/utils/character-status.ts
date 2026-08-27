/**
 * 角色死亡/退场状态检测工具
 * 供 chapter-pipeline、shuangwen-pipeline、finalize-pipeline 共享使用
 */

export type CharacterStatus = 'active' | 'dead' | 'exited';

// ── 标准化标记（由增强后的 Character Merger Agent 输出）──
const MARKER_DEAD = /【状态：已死亡】/;
const MARKER_EXITED = /【状态：已退场】/;

// ── 旧正则模式（兼容已有数据）──
const DEAD_PATTERNS: RegExp[] = [
  /暴毙/, /身亡/, /殒命/, /被杀/, /遇害/, /丧命/,
  /处死/, /自尽/, /毒发/, /灭口/, /殉/, /阵亡/, /死亡/, /毙命/,
];

const EXIT_PATTERNS: RegExp[] = [
  /退场/, /流放/, /逃离/, /失踪/, /下落不明/, /被囚/, /永久离开/,
];

/**
 * 从 append-only 的 currentState 中提取最新一条状态记录
 * 格式: "[第N章] 状态描述"
 */
/** 无信息占位符（card-blurb-generator 历史版本会无条件追加，读取时需跳过） */
const PLACEHOLDER_STATE_RE = /^\[第\d+章\]\s*剧情推进\s*$/;

export function getLatestStateEntry(currentState: string): string {
  const entries = currentState.split(/(?=\[第\d+章\])/);
  // 从后往前取第一条非占位符条目："[第N章]剧情推进"零信息，
  // 若被取为 latest 会覆盖真实状态（含死亡/退场标记），导致角色状态记忆空洞
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]?.trim();
    if (entry && !PLACEHOLDER_STATE_RE.test(entry)) return entry;
  }
  return entries[entries.length - 1]?.trim() || currentState;
}

/**
 * 检测角色状态：优先识别标准化标记，兜底使用旧正则
 */
export function detectCharacterStatus(currentState: string | undefined): CharacterStatus {
  if (!currentState) return 'active';

  const latest = getLatestStateEntry(currentState);

  // 优先：标准化标记
  if (MARKER_DEAD.test(latest)) return 'dead';
  if (MARKER_EXITED.test(latest)) return 'exited';

  // 兜底：旧正则
  if (DEAD_PATTERNS.some(p => p.test(latest))) return 'dead';
  if (EXIT_PATTERNS.some(p => p.test(latest))) return 'exited';

  return 'active';
}

/**
 * 角色是否不可用（已死亡或已退场）
 */
export function isCharacterUnavailable(currentState: string | undefined): boolean {
  const status = detectCharacterStatus(currentState);
  return status === 'dead' || status === 'exited';
}

// ── 正文退场标记扫描（writer/editor 在正文中嵌入的硬标记）──

/** 兼容 (#死亡:角色名)、(#退场:角色名) 及模型偶发的 #(退场:角色名)。 */
const EXIT_TAG_PATTERN = /(?:\([#\uFF03]|[#\uFF03]\()(死亡|退场):([^)]+)\)/g;

export interface ExitMarker {
  name: string;
  status: 'dead' | 'exited';
}

const DEATH_CONTEXT_RE = /死亡|死去|身亡|断气|闭上了眼|没了呼吸|尸体|再也没有醒来|咽下最后一口气|毙命|殒命|当场身亡/;
const EXIT_CONTEXT_RE = /退场|永久离开|从此再无音讯|再也没回来|消失在人海|头也不回地离开|离开了这个城市|流放|失踪|下落不明|永远离开/;

function hasExitContext(text: string, status: ExitMarker['status']): boolean {
  const normalized = text.replace(/\s+/g, '');
  return status === 'dead'
    ? DEATH_CONTEXT_RE.test(normalized)
    : EXIT_CONTEXT_RE.test(normalized);
}

/**
 * 从章节正文中提取所有退场标记
 */
export function extractExitMarkers(chapterText: string): ExitMarker[] {
  const markers: ExitMarker[] = [];
  const seen = new Set<string>();
  for (const match of chapterText.matchAll(EXIT_TAG_PATTERN)) {
    const status = match[1] === '死亡' ? 'dead' as const : 'exited' as const;
    const name = match[2].trim();
    const key = `${status}:${name}`;
    if (!seen.has(key)) {
      seen.add(key);
      markers.push({ name, status });
    }
  }
  return markers;
}

/**
 * 从正文中剥离退场标记，返回干净的文本
 */
export function stripExitMarkers(chapterText: string): string {
  return chapterText.replace(EXIT_TAG_PATTERN, '').replace(/ +\n/g, '\n');
}

export function sanitizeSuspiciousExitMarkers(chapterText: string): {
  sanitizedText: string;
  removedMarkers: ExitMarker[];
} {
  const removedMarkers: ExitMarker[] = [];
  const sanitizedText = chapterText
    .replace(EXIT_TAG_PATTERN, (full, rawType, rawName, offset, source) => {
      const status = rawType === '死亡' ? 'dead' as const : 'exited' as const;
      const name = String(rawName).trim();
      const context = String(source).slice(Math.max(0, Number(offset) - 120), Number(offset));
      if (hasExitContext(context, status)) {
        return full;
      }
      removedMarkers.push({ name, status });
      return '';
    })
    .replace(/ +\n/g, '\n');

  return { sanitizedText, removedMarkers };
}

/**
 * 智能取名系统 - 跨小说去重服务
 *
 * 扫描所有小说已用过的角色名，构建"避让名单"，注入 Writer/Merger 的 prompt。
 * 解决用户反馈的核心问题："10 本里有 4 本主角叫林默"。
 *
 * 设计要点：
 * - 主角名跨小说去重（重点）
 * - 配角名只在本小说内去重（避免误伤）
 * - 带内存缓存，TTL 5 分钟，避免每次生成都扫描全库
 * - 依赖最小化，通过 NameRegistryDeps 接口注入，便于测试
 */

import {
  AI_TEMPLATE_NAMES,
  HIGH_FREQ_SURNAMES,
  MID_FREQ_SURNAMES,
  HIGH_FREQ_NAME_CHARS,
  OVERUSED_COMPOUND_SURNAMES,
  getNamingStyleForGenre,
  isAiTemplateName,
} from './name-pool.js';

/**
 * 主角角色定位（这些名字跨小说去重）
 */
const PROTAGONIST_ROLES = new Set([
  'protagonist',
  'deuteragonist',
]);

/**
 * 依赖接口（最小化）
 * 由 NovelManager 实现，或测试时用 mock
 */
export interface NameRegistryDeps {
  listNovels(): Promise<readonly { id: string; title?: string }[]>;
  getCharacters(novelId: string): Promise<readonly NameRegistryCharacter[]>;
}

export interface NameRegistryCharacter {
  name: string;
  role?: string;
  aliases?: string[];
}

export interface UsedNamesSnapshot {
  /** 跨小说的主角名（含别名），用于注入避让名单 */
  crossNovelProtagonistNames: string[];
  /** 跨小说的标题列表，用于在避让名单里标注来源 */
  crossNovelProtagonistSources: Array<{ name: string; fromTitle: string }>;
  /** 扫描时间戳 */
  scannedAt: number;
}

/**
 * 缓存：novelId -> 快照
 * 同一本小说的多次生成共享同一份避让名单，5 分钟过期。
 */
const snapshotCache = new Map<string, UsedNamesSnapshot>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * 扫描所有小说，构建主角名快照
 * @param deps 依赖（通常是 NovelManager）
 * @param currentNovelId 当前小说 ID（排除自身）
 */
export async function scanUsedProtagonistNames(
  deps: NameRegistryDeps,
  currentNovelId: string,
): Promise<UsedNamesSnapshot> {
  const cached = snapshotCache.get(currentNovelId);
  if (cached && Date.now() - cached.scannedAt < CACHE_TTL_MS) {
    return cached;
  }

  const novels = await deps.listNovels();
  const otherNovelIds = novels.filter((n) => n.id !== currentNovelId).map((n) => n.id);
  const titleById = new Map(novels.map((n) => [n.id, n.title ?? n.id] as const));

  const protagonistNames = new Set<string>();
  const sources: Array<{ name: string; fromTitle: string }> = [];

  // 并行扫描，限制并发避免 IO 风暴
  const BATCH = 6;
  for (let i = 0; i < otherNovelIds.length; i += BATCH) {
    const batch = otherNovelIds.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (novelId) => {
        const chars = await deps.getCharacters(novelId);
        const title = titleById.get(novelId) ?? novelId;
        const prots: Array<{ name: string; fromTitle: string }> = [];
        for (const c of chars) {
          if (!c.role || !PROTAGONIST_ROLES.has(c.role)) continue;
          if (c.name) {
            protagonistNames.add(c.name);
            prots.push({ name: c.name, fromTitle: title });
          }
          for (const alias of c.aliases ?? []) {
            if (alias) {
              protagonistNames.add(alias);
              prots.push({ name: alias, fromTitle: title });
            }
          }
        }
        return prots;
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') sources.push(...r.value);
    }
  }

  const snapshot: UsedNamesSnapshot = {
    crossNovelProtagonistNames: [...protagonistNames],
    crossNovelProtagonistSources: sources,
    scannedAt: Date.now(),
  };
  snapshotCache.set(currentNovelId, snapshot);
  return snapshot;
}

/**
 * 清除缓存（测试用，或强制刷新）
 */
export function clearNameRegistryCache(): void {
  snapshotCache.clear();
}

/**
 * 构建当前小说内已有角色名列表
 */
export function collectNovelCharacterNames(
  characters: readonly NameRegistryCharacter[],
): string[] {
  const names = new Set<string>();
  for (const c of characters) {
    if (c.name) names.add(c.name);
    for (const alias of c.aliases ?? []) {
      if (alias) names.add(alias);
    }
  }
  return [...names];
}

/**
 * 从避让名单里挑出出现次数最高的（用于优先避让）
 */
function pickTopRepeatedNames(
  sources: Array<{ name: string; fromTitle: string }>,
  limit: number,
): string[] {
  const counts = new Map<string, number>();
  for (const s of sources) {
    counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

/**
 * 构建完整的命名约束文本，用于注入 Writer Agent 的 prompt
 *
 * @param deps 依赖
 * @param novelId 当前小说 ID
 * @param genre 题材
 * @param currentNovelCharacters 当前小说已有角色（用于本小说内去重）
 */
export async function buildNamingConstraints(
  deps: NameRegistryDeps,
  novelId: string,
  genre: string,
  currentNovelCharacters: readonly NameRegistryCharacter[] = [],
): Promise<string> {
  const [snapshot, novelCharNames] = await Promise.all([
    scanUsedProtagonistNames(deps, novelId),
    Promise.resolve(collectNovelCharacterNames(currentNovelCharacters)),
  ]);

  const parts: string[] = [];

  parts.push('## 角色命名规范（强制执行）');
  parts.push('');
  parts.push('命名是反 AI 套路化的重要一环。AI 训练数据里有几个名字被反复使用（如"林默""苏辰""叶凡"），不加约束就会出现 10 本书 4 本主角同名的灾难。');

  // 1. 绝对禁止的 AI 模板名
  parts.push('');
  parts.push('### 绝对禁止的名字（命中即视为失败）');
  parts.push('以下名字在 AI 训练数据里出现频率极高，禁止用作任何新角色的名字：');
  // 只列前 30 个最关键的，避免 prompt 过长
  parts.push(AI_TEMPLATE_NAMES.slice(0, 30).join('、') + ' 等');
  parts.push('- 上述名字的变体也禁止：如"林默"→"林默然""林默之"也算违规');
  parts.push('- 同姓同字组合也禁止：如已禁"林默"，则"林深""林溪""林眠"等"林+单字诗意"组合也不要用');

  // 2. 高频字黑名单
  parts.push('');
  parts.push('### 高频字避让（这些字已被网文用烂，优先不用）');
  parts.push(HIGH_FREQ_NAME_CHARS.slice(0, 30).join('、'));
  parts.push('- 堆砌这些字会让名字显得模板化、AI 化');

  // 3. 复姓慎用
  parts.push('');
  parts.push('### 复姓慎用（除非世界观明确需要，否则不用）');
  parts.push(OVERUSED_COMPOUND_SURNAMES.join('、'));

  // 4. 姓氏选择策略
  parts.push('');
  parts.push('### 姓氏选择策略');
  parts.push('**避免连续使用超高频姓氏**（已用得太多）：');
  parts.push(HIGH_FREQ_SURNAMES.join('、'));
  parts.push('');
  parts.push('**优先使用中频姓氏**（这些姓有辨识度且不烂大街）：');
  // 随机挑 20 个，让每次都不一样，增加多样性
  const shuffled = [...MID_FREQ_SURNAMES].sort(() => Math.random() - 0.5);
  parts.push(shuffled.slice(0, 20).join('、'));
  parts.push('- 单双字名要合理分配，不要全是双字名');
  parts.push('- 配角可接地气（如：王大壮、李翠花、赵铁柱），不要所有角色都诗意化');

  // 5. 跨小说避让名单（核心）
  const crossNames = snapshot.crossNovelProtagonistNames;
  if (crossNames.length > 0) {
    parts.push('');
    parts.push('### 跨小说避让名单（这些主角名已被其他小说使用，禁止再用）');
    // 优先列出出现次数多的
    const topRepeated = pickTopRepeatedNames(snapshot.crossNovelProtagonistSources, 15);
    const others = crossNames.filter((n) => !topRepeated.includes(n)).slice(0, 15);
    const displayList = [...topRepeated, ...others];
    if (displayList.length > 0) {
      parts.push(displayList.join('、'));
      parts.push('- 以上名字已被其他小说的主角使用，本章不得再用');
      if (topRepeated.length > 0) {
        parts.push(`- 其中 "${topRepeated.slice(0, 5).join('、')}" 出现次数最多，特别需要避让`);
      }
    }
  }

  // 6. 本小说已有角色（避免重名）
  if (novelCharNames.length > 0) {
    parts.push('');
    parts.push('### 本小说已有角色名（新角色不得重名）');
    const display = novelCharNames.slice(0, 30);
    parts.push(display.join('、'));
    if (novelCharNames.length > 30) {
      parts.push(`...等共 ${novelCharNames.length} 个`);
    }
    parts.push('- 新角色（包括龙套）的名字不得与上述任何名字重复或过于相似');
  }

  // 7. 题材命名风格
  parts.push('');
  parts.push('### 题材命名风格');
  parts.push(getNamingStyleForGenre(genre));

  // 8. 命名原则总结
  parts.push('');
  parts.push('### 命名原则总结');
  parts.push('1. **避让优先**：先查避让名单，确保名字没被用过');
  parts.push('2. **姓氏多样**：不要用"林/叶/苏/沈"，换中频姓氏');
  parts.push('3. **字义朴实**：不要堆砌"墨/尘/逸/凌"，用有烟火气的字');
  parts.push('4. **单双搭配**：单字名和双字名都要有，不要全是双字名');
  parts.push('5. **配角接地气**：配角可用普通名字（建国、翠花、阿芬），增加真实感');
  parts.push('6. **谐音检查**：避免不雅谐音（如"范统""杜子腾"）');

  return parts.join('\n');
}

/**
 * 构建简短版的避让名单，用于 CharacterMerger Agent（只列名单，不重复风格建议）
 * Merger 主要是建档时检查重名，不需要完整的命名教学
 */
export async function buildMergeAvoidList(
  deps: NameRegistryDeps,
  novelId: string,
  currentNovelCharacters: readonly NameRegistryCharacter[] = [],
): Promise<string> {
  const [snapshot, novelCharNames] = await Promise.all([
    scanUsedProtagonistNames(deps, novelId),
    Promise.resolve(collectNovelCharacterNames(currentNovelCharacters)),
  ]);

  const parts: string[] = [];
  parts.push('## 命名避让清单（创建新角色时必须检查）');
  parts.push('');
  parts.push('当本章出现新角色需要建档时，名字必须避让以下名单：');
  parts.push('');

  // AI 模板黑名单
  parts.push('### AI 模板名黑名单（绝对禁止）');
  parts.push(AI_TEMPLATE_NAMES.slice(0, 25).join('、') + ' 等');
  parts.push('');

  // 跨小说主角
  if (snapshot.crossNovelProtagonistNames.length > 0) {
    parts.push('### 跨小说主角名（已被其他小说使用，禁止再用）');
    parts.push(snapshot.crossNovelProtagonistNames.slice(0, 30).join('、'));
    parts.push('');
  }

  // 本小说已有角色
  if (novelCharNames.length > 0) {
    parts.push('### 本小说已有角色（不得重名）');
    parts.push(novelCharNames.slice(0, 30).join('、'));
    parts.push('');
  }

  parts.push('如果正文里出现了上述名单中的名字，优先用别名/绰号建档，并在 currentState 里标注"名字与已有角色冲突，已用绰号"。');

  return parts.join('\n');
}

/**
 * 检查一个名字是否违反命名约束（用于事前校验）
 */
export function checkNameViolation(name: string): { violated: boolean; reason?: string } {
  if (!name || !name.trim()) {
    return { violated: true, reason: '名字为空' };
  }
  if (isAiTemplateName(name)) {
    return { violated: true, reason: `名字"${name}"在 AI 模板黑名单中，是 AI 训练数据高频名` };
  }
  return { violated: false };
}

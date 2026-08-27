import type { Request } from 'express';
import type { AuthDb } from '../../../../auth/types.js';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { CharacterProfile } from '../../../../novel/types.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';

export type CharacterBackfillDeps = {
  novelManager: NovelManager;
  modelClient?: ModelClient;
  novelMemory?: NovelMemory;
  authDb?: AuthDb;
  billingService?: import('../../../../billing/billing-service.js').BillingService;
};

export async function tryIndexCharacter(
  novelMemory: NovelMemory | undefined,
  novelId: string,
  character: CharacterProfile,
): Promise<void> {
  if (!novelMemory) return;
  try {
    await novelMemory.indexCharacter(novelId, character);
  } catch {
    // 记忆索引失败不影响主流程
  }
}

export async function resolveCharacterBackfillModelClient(params: {
  deps: CharacterBackfillDeps;
  req: Request;
  novelId: string;
  unavailableMessage: string;
}): Promise<{
  activeModelClient: ModelClient;
  novel: NonNullable<Awaited<ReturnType<NovelManager['getNovel']>>>;
}> {
  const novel = await params.deps.novelManager.getNovel(params.novelId);
  const modelAccess = await resolveUserModelAccess({
    authDb: params.deps.authDb,
    userId: params.req.auth?.id,
    headers: params.req.headers,
    novel,
  });
  if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
    const error = new Error(modelAccess.error) as Error & { code?: string; statusCode?: number };
    error.code = 'USER_API_UNAVAILABLE';
    error.statusCode = 400;
    throw error;
  }
  const activeModelClient = modelAccess.client ?? params.deps.modelClient;
  if (!activeModelClient) {
    const error = new Error(params.unavailableMessage) as Error & { statusCode?: number };
    error.statusCode = 503;
    throw error;
  }
  return { activeModelClient, novel };
}

export function parseBackfillJsonArray<T>(raw: string): T[] {
  let jsonStr = raw.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  return JSON.parse(jsonStr) as T[];
}

export function selectTtsBackfillCandidates(
  characters: CharacterProfile[],
  force: boolean,
): CharacterProfile[] {
  return force
    ? characters
    : characters.filter(character => !character.gender || !character.age || !character.speechStyle);
}

export function buildTtsBackfillPrompt(
  characters: CharacterProfile[],
  force: boolean,
): string {
  const charSummaries = characters.map(character => ({
    id: character.id,
    name: character.name,
    aliases: character.aliases,
    role: character.role,
    gender: force ? '（请重新推断）' : (character.gender || '（缺失）'),
    age: force ? '（请重新推断）' : (character.age || '（缺失）'),
    speechStyle: force ? '（请重新推断）' : (character.speechStyle || '（缺失）'),
    appearance: character.appearance?.slice(0, 200) || '',
    personality: character.personality?.slice(0, 200) || '',
    backstory: character.backstory?.slice(0, 200) || '',
  }));

  return [
    '你是一位小说角色分析专家。以下角色的部分关键字段缺失（标记为"（缺失）"），请根据角色的名字、称谓、外貌、性格、背景等已有信息推断并补全。',
    '',
    '需要补全的字段：',
    '- gender（性别）：取值 `男` 或 `女`',
    '- age（年龄段）：取值如 `少年`、`青年`、`中年`、`老年`、`少女`、`幼童`，或具体年龄如 `约二十岁`',
    '- speechStyle（说话风格）：描述角色的语气、用词习惯、说话节奏，如 `温柔细腻，常用叠词`、`粗犷豪放，声音洪亮`',
    '',
    '## 性别判断指引（重要）',
    '',
    '请特别注意以下线索，按优先级从高到低判断性别：',
    '',
    '1. **称谓/头衔明确指示性别**：',
    '   - 女性称谓：嬷嬷、婆婆、奶奶、姥姥、大娘、夫人、小姐、娘子、公主、皇后、太后、贵妃、王妃、丫鬟、侍女、宫女、姑娘、姐姐、妹妹、女侠',
    '   - 男性称谓：爷爷、大爷、王爷、公子、少爷、先生、大人、将军、元帅、太子、殿下、和尚、道士、师兄、师弟',
    '',
    '2. **描述文本中的代词**（"她"→女、"他"→男）',
    '',
    '3. **外貌描述**中的性别线索（如"柳眉"、"红唇"→女；"胡须"、"魁梧"→男）',
    '',
    '4. **名字本身不能作为唯一判断依据**。很多中文名字（如"龙玉潇"、"凤九"、"慕容"等）不分性别，必须结合其他线索。',
    '',
    '5. 如果实在无法推断，默认为 `男`',
    '',
    '## 角色列表',
    JSON.stringify(charSummaries, null, 2),
    '',
    '## 输出格式',
    '直接输出 JSON 数组，每个元素包含 id 和需要补全的字段（只输出缺失的字段）：',
    '```json',
    '[',
    '  { "id": "角色UUID", "gender": "男", "age": "青年", "speechStyle": "沉稳有力，语速适中" }',
    ']',
    '```',
    '',
    '注意：',
    '- 只输出 JSON，不要输出其他内容',
    '- 只补全标记为"（缺失）"或"（请重新推断）"的字段',
    '- 如果实在无法推断，gender 默认为 `男`，age 默认为 `青年`，speechStyle 默认为 `平和沉稳，语速适中`',
  ].join('\n');
}

export async function applyTtsBackfillPatches(params: {
  novelId: string;
  characters: CharacterProfile[];
  patches: Array<{ id: string; gender?: string; age?: string; speechStyle?: string }>;
  force: boolean;
  deps: CharacterBackfillDeps;
}): Promise<number> {
  const timestamp = new Date().toISOString();
  let updatedCount = 0;

  for (const patch of params.patches) {
    const char = params.characters.find(character => character.id === patch.id);
    if (!char) continue;

    let changed = false;
    if (patch.gender && (params.force || !char.gender)) {
      char.gender = patch.gender;
      changed = true;
    }
    if (patch.age && (params.force || !char.age)) {
      char.age = patch.age;
      changed = true;
    }
    if (patch.speechStyle && (params.force || !char.speechStyle)) {
      char.speechStyle = patch.speechStyle;
      changed = true;
    }

    if (!changed) continue;
    char.updatedAt = timestamp;
    await params.deps.novelManager.saveCharacter(params.novelId, char);
    await tryIndexCharacter(params.deps.novelMemory, params.novelId, char);
    updatedCount += 1;
  }

  return updatedCount;
}

export function selectPositionBackfillCandidates(
  characters: CharacterProfile[],
  force: boolean,
  filterIds?: string[],
): CharacterProfile[] {
  const candidates = filterIds?.length
    ? characters.filter(character => filterIds.includes(character.id))
    : characters;
  return force
    ? candidates
    : candidates.filter(character => !character.position);
}

export function buildPositionBackfillPrompt(params: {
  novel?: { title: string; genre: string; synopsis?: string };
  characters: CharacterProfile[];
  force: boolean;
}): string {
  const charSummaries = params.characters.map(character => ({
    id: character.id,
    name: character.name,
    aliases: character.aliases,
    role: character.role,
    position: params.force ? '（请重新推断）' : (character.position || '（缺失）'),
    personality: character.personality?.slice(0, 150) || '',
    backstory: character.backstory?.slice(0, 300) || '',
    currentState: character.currentState?.slice(0, 300) || '',
  }));

  return [
    '你是一位小说角色分析专家。请根据角色的名字、别名、背景故事、当前状态等信息，推断每个角色在故事中的职位/头衔/身份。',
    '',
    params.novel ? `小说标题：${params.novel.title}` : '',
    params.novel ? `小说类型：${params.novel.genre}` : '',
    params.novel?.synopsis ? `小说简介：${params.novel.synopsis.slice(0, 300)}` : '',
    '',
    '## 角色列表',
    JSON.stringify(charSummaries, null, 2),
    '',
    '## 输出格式',
    '直接输出 JSON 数组，每个元素包含 id 和 position：',
    '```json',
    '[',
    '  { "id": "角色UUID", "position": "尚膳监太监" }',
    ']',
    '```',
    '',
    '注意：',
    '- 只输出 JSON，不要输出其他内容',
    '- position 应该是角色在故事世界中的具体职位、头衔或社会身份',
    '- 例如：皇帝、丞相、禁军统领、尚膳监太监、掌印太监、江湖侠客、村长、商人、书生、侍女、公主等',
    '- 如果角色有多重身份，写最主要的那个',
    '- 如果实在无法推断，写"身份不明"',
    '- 只补全标记为"（缺失）"或"（请重新推断）"的字段',
  ].join('\n');
}

export async function applyPositionBackfillPatches(params: {
  novelId: string;
  characters: CharacterProfile[];
  patches: Array<{ id: string; position?: string }>;
  force: boolean;
  deps: CharacterBackfillDeps;
}): Promise<number> {
  const timestamp = new Date().toISOString();
  let updatedCount = 0;

  for (const patch of params.patches) {
    const char = params.characters.find(character => character.id === patch.id);
    if (!char) continue;
    if (!patch.position || (!params.force && char.position)) continue;

    char.position = patch.position;
    char.updatedAt = timestamp;
    await params.deps.novelManager.saveCharacter(params.novelId, char);
    await tryIndexCharacter(params.deps.novelMemory, params.novelId, char);
    updatedCount += 1;
  }

  return updatedCount;
}

import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import type { AuthDb } from '../../../../auth/types.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { CastSlot } from './route-support.js';

export type CastSessionProposeDeps = {
  authDb?: AuthDb;
  modelClient?: ModelClient;
  novelManager: NovelManager;
};

export async function resolveCastSessionProposeContext(params: {
  deps: CastSessionProposeDeps;
  novelId: string;
  userId?: string;
  headers: Record<string, string | string[] | undefined>;
}) {
  const [novel, existingCharacters, pendingCandidates] = await Promise.all([
    params.deps.novelManager.getNovel(params.novelId),
    params.deps.novelManager.getCharacters(params.novelId),
    params.deps.novelManager.getPendingCharacterCandidates(params.novelId).catch(() => []),
  ]);

  const modelAccess = await resolveUserModelAccess({
    authDb: params.deps.authDb,
    userId: params.userId,
    headers: params.headers,
    novel,
  });

  return {
    novel,
    existingCharacters,
    pendingCandidates,
    modelAccess,
    activeModelClient: modelAccess.client ?? params.deps.modelClient,
  };
}

export function buildCastSessionPrompt(params: {
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>;
  focus: 'roles-only' | 'roles-and-power';
  maxCharacters: number;
  novel: {
    title: string;
    genre?: string;
    synopsis?: string;
  };
  existingNames: string[];
  pendingNames: string[];
  slots: CastSlot[];
}): string {
  const conversationText = params.conversation
    .map(turn => `${turn.role === 'assistant' ? 'AI' : '用户'}: ${turn.content}`)
    .join('\n');

  const slotPrompt = params.slots
    .map(slot => {
      const fixed = slot.fixedNames && slot.fixedNames.length > 0
        ? `, fixedNames=[${slot.fixedNames.join(', ')}]`
        : '';
      return `- ${slot.key} | role=${slot.role} | required=${slot.required ? 'yes' : 'no'} | expectedCount=${slot.expectedCount}${fixed}${slot.description ? ` | ${slot.description}` : ''}`;
    })
    .join('\n');

  return [
    '你是小说主创助手，需要把“开局对话”整理为结构化角色与力量体系提案。',
    '输出必须是 JSON 对象，不要输出任何额外文字。',
    'JSON 结构固定为：',
    '{',
    '  "characters": [ { "name", "aliases", "role", "age", "gender", "appearance", "personality", "backstory", "motivation", "abilities", "speechStyle", "tags", "firstAppearance", "slot" } ],',
    '  "powerSystem": [ { "name", "description", "constraints", "consequences", "tags", "parameters" } ],',
    '  "relationshipSeeds": [ { "from", "to", "type", "description" } ]',
    '}',
    'powerSystem.parameters 可包含：systemType/tierNames/maxTier/resourceName/recoveryPerChapter/defaultCost/cooldownRule/riskRule/breakthroughRule/forbiddenActions/keyVerbs。',
    'characters.role 只能使用：protagonist/deuteragonist/antagonist/rival/love_interest/mentor/ally/faction_leader/supporting/family/comic_relief/minor。',
    'characters.slot 请尽量命中关键角色槽位 key。',
    `最多输出 ${params.maxCharacters} 个关键角色，优先剧情驱动角色，不要灌水角色。`,
    params.focus === 'roles-only'
      ? '本次重点仅角色，不需要生成力量体系，可返回空数组。'
      : '需要同时给出可驱动剧情冲突的力量体系条目（powerSystem）。',
    '角色命名尽量稳定，避免与已有角色重名。',
    '',
    `小说标题: ${params.novel.title}`,
    `小说类型: ${params.novel.genre || ''}`,
    `小说简介: ${params.novel.synopsis || '（无）'}`,
    `已有角色(仅供避重): ${params.existingNames.length > 0 ? params.existingNames.join('、') : '（无）'}`,
    `候选池待确认角色(仅供参考): ${params.pendingNames.length > 0 ? params.pendingNames.join('、') : '（无）'}`,
    '',
    '开局对话如下：',
    conversationText,
    '',
    '关键角色槽位如下（必须尽量覆盖 required=true 的槽位）：',
    slotPrompt,
  ].join('\n');
}

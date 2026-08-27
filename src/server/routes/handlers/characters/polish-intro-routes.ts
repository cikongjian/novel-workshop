import type { Request, Response, Router } from 'express';
import {
  resolveCharacterBackfillModelClient,
  parseBackfillJsonArray,
} from './backfill-route-support.js';
import type { CharacterBackfillDeps } from './backfill-route-support.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { beginAIBilling, settleAIBilling } from '../billing-guard.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import type { CharacterProfile } from '../../../../novel/types.js';

type PolishIntroResult = {
  /** 综合人物介绍段落（生动、有血有肉） */
  introParagraph: string;
  /** 各字段的润色结果 */
  polishedFields: {
    personality?: string;
    backstory?: string;
    motivation?: string;
    appearance?: string;
    publicPersona?: string;
    privatePersona?: string;
    reputation?: string;
    speechStyle?: string;
    worldview?: string;
  };
  /** 建议的角色标签 */
  suggestedTags: string[];
  /** 一个引人入胜的"一句话角色钩子"（适合展示在卡片上） */
  oneLiner: string;
};

function buildPolishIntroPrompt(params: {
  novel?: { title: string; genre: string; synopsis?: string };
  character: CharacterProfile;
}): string {
  const c = params.character;
  const charSummary = {
    name: c.name,
    aliases: c.aliases,
    role: c.role,
    position: c.position || '（未设置）',
    age: c.age || '（未设置）',
    gender: c.gender || '（未设置）',
    appearance: c.appearance || '（未填写）',
    personality: c.personality || '（未填写）',
    personalityTraits: c.personalityTraits,
    speechStyle: c.speechStyle || '（未填写）',
    speechExamples: c.speechExamples,
    backstory: c.backstory || '（未填写）',
    motivation: c.motivation || '（未填写）',
    abilities: c.abilities,
    publicPersona: c.persona?.publicPersona || '（未填写）',
    privatePersona: c.persona?.privatePersona || '（未填写）',
    maskTrigger: c.persona?.maskTrigger || '（未填写）',
    worldview: c.psychology?.worldview || '（未填写）',
    copingMechanisms: c.psychology?.copingMechanisms || [],
    emotionalTriggers: c.psychology?.emotionalTriggers || [],
    faction: c.socialIdentity?.faction || '（未填写）',
    socialClass: c.socialIdentity?.socialClass || '（未填写）',
    reputation: c.socialIdentity?.reputation || '（未填写）',
    symbolObject: c.symbolism?.symbolObject || '（未填写）',
    recurringMotif: c.symbolism?.recurringMotif || '（未填写）',
    themeWord: c.symbolism?.themeWord || '（未填写）',
  };

  return [
    '你是一位资深的小说角色设定编辑，专精于让角色介绍"活"起来。你的任务是根据角色的原始设定资料，润色优化角色介绍，让角色变得有血有肉、立体生动、充满张力。',

    params.novel ? `\n## 小说背景` : '',
    params.novel ? `- 书名：${params.novel.title}` : '',
    params.novel ? `- 类型：${params.novel.genre}` : '',
    params.novel?.synopsis ? `- 简介：${params.novel.synopsis.slice(0, 400)}` : '',

    '\n## 角色原始资料',
    JSON.stringify(charSummary, null, 2),

    '\n## 润色要求',
    '你的核心原则：提炼角色"精气神"，而不是复述剧情。',
    '',
    '【硬性禁令】',
    '- 绝对不要出现任何角色姓名（包括该角色本人及其关系的其他人），用"他/她"、身份称谓或泛指代替',
    '- 绝对不要编造具体事件、地点、组织名、物品名',
    '- 绝对不要猜测剧情走向或创造角色资料中不存在的情节',
    '- 如果角色资料中某个维度为空，对应的润色字段直接留空，不要凭空编造',
    '',
    '1. **introParagraph（人物介绍段落，150-300字）**：',
    '   - 聚焦角色"是什么样的人"：性格层次、内心矛盾、行为模式、气质印象',
    '   - 写法参考：像人物评传的开篇，用精炼的文学语言勾勒一个立体的人',
    '   - 可以写"他表面……实则……"式的反差，"他一生都在……"式的命运感',
    '   - 不要写"在XX章中，他做了XX"这种剧情复述',
    '   - 不要出现具体人名、地名、事件名',
    '',
    '2. **oneLiner（一句话钩子，20-50字）**：',
    '   - 一个极具冲击力的短句，概括角色的核心矛盾或命运',
    '   - 例如："用温文尔雅伪装滔天恨意的复仇者"、"被命运反复碾碎却从不肯跪的少年"',
    '',
    '3. **polishedFields（字段润色）**：',
    '   - 只润色原始资料中已有实质内容的字段，空字段不要编造',
    '   - 每个字段的润色原则：更具文学性、更有辨识度、更精炼传神',
    '   - personality：写出性格的张力和层次，不要罗列形容词',
    '   - backstory：写出人生轨迹中的关键转折和情感底色',
    '   - motivation：写出驱动力的根源和强度，让人感受到"他为什么非这样做不可"',
    '   - appearance：写出能让人记住的特征，不求面面俱到，一个独特的画面胜过百字描述',
    '   - publicPersona / privatePersona：强化"外表vs内心"的反差',
    '   - reputation / speechStyle / worldview：如有则润色提升',
    '',
    '4. **suggestedTags（建议标签，3-6个）**：',
    '   - 基于角色核心特质推荐标签，如"美强惨""腹黑""疯批""成长型""反差萌"等',
    '   - 标签短小精悍（2-5字），符合网文读者的阅读习惯',
    '',
    '## 输出格式',
    '直接输出 JSON 数组（只含一个元素），不要输出其他内容：',
    '```json',
    '[{',
    '  "introParagraph": "...",',
    '  "oneLiner": "...",',
    '  "polishedFields": {',
    '    "personality": "...",',
    '    "backstory": "...",',
    '    "motivation": "...",',
    '    "appearance": "...",',
    '    "publicPersona": "...",',
    '    "privatePersona": "...",',
    '    "reputation": "...",',
    '    "speechStyle": "...",',
    '    "worldview": "...",',
    '  },',
    '  "suggestedTags": ["标签1", "标签2"]',
    '}]',
    '```',
  ].join('\n');
}

export function registerPolishIntroRoutes(router: Router, deps: CharacterBackfillDeps): void {
  router.post('/:id/polish-intro', async (req: Request, res: Response): Promise<void> => {
    const billingUserId = req.auth?.id;
    let freezeId: string | undefined;
    let frozenPoints = 0;
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const characterId = (req.params as Record<string, string>).id;

      const { activeModelClient, novel } = await resolveCharacterBackfillModelClient({
        deps,
        req,
        novelId,
        unavailableMessage: 'AI 模型未配置，无法润色人物介绍',
      });

      const characters = await deps.novelManager.getCharacters(novelId);
      const character = characters.find(c => c.id === characterId);
      if (!character) {
        res.status(404).json({ error: '角色不存在' });
        return;
      }

      // 计费守卫
      const modelAccess = await resolveUserModelAccess({
        authDb: deps.authDb,
        userId: billingUserId,
        headers: req.headers,
        novel,
      });
      const bypassBilling = modelAccess.billingBypass;
      if (!bypassBilling && deps.billingService && billingUserId && billingUserId !== 'dev') {
        try {
          const guard = await beginAIBilling({
            billingService: deps.billingService,
            userId: billingUserId,
            operation: 'polishCharacterIntro',
            bizId: `char:${novelId}:${characterId}`,
          });
          freezeId = guard.freezeId;
          frozenPoints = guard.estimatedPoints;
        } catch (billingErr) {
          const msg = billingErr instanceof Error ? billingErr.message : String(billingErr);
          res.status(402).json({ error: msg, code: 'INSUFFICIENT_BALANCE' });
          return;
        }
      }

      const response = await activeModelClient.chat([
        {
          role: 'user',
          content: buildPolishIntroPrompt({ novel, character }),
        },
      ], { temperature: 0.7, maxTokens: 4096 });

      let result: PolishIntroResult;
      try {
        const raw = response.content.trim();
        const parsed = parseBackfillJsonArray<PolishIntroResult>(raw);
        result = parsed[0];
        // 兼容 AI 返回单个对象而非数组的情况
        if (!result && parsed.length === 0) {
          // 尝试直接解析为对象
          let jsonStr = raw;
          const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
          result = JSON.parse(jsonStr) as PolishIntroResult;
        }
        if (!result || !result.introParagraph) {
          throw new Error('AI 返回数据不完整');
        }
      } catch {
        if (freezeId && deps.billingService && billingUserId) {
          settleAIBilling(deps.billingService, billingUserId, freezeId, 0).catch(() => {});
        }
        res.status(500).json({ error: 'AI 返回的数据格式异常，请重试' });
        return;
      }

      if (freezeId && deps.billingService) {
        await settleAIBilling(deps.billingService, billingUserId!, freezeId, frozenPoints);
      }
      res.json(result);
    } catch (err) {
      if (freezeId && deps.billingService && billingUserId) {
        settleAIBilling(deps.billingService, billingUserId, freezeId, 0).catch(() => {});
      }
      const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number'
        ? Number((err as { statusCode: number }).statusCode)
        : 500;
      const message = safeErrorMessage(err, '人物介绍润色失败');
      const payload = statusCode === 400 && typeof (err as { code?: unknown })?.code === 'string'
        ? { error: message, code: String((err as { code: string }).code) }
        : statusCode === 500
          ? { error: '人物介绍润色失败', detail: message }
          : { error: message };
      console.error('[人物介绍润色] 失败:', err);
      res.status(statusCode).json(payload);
    }
  });
}

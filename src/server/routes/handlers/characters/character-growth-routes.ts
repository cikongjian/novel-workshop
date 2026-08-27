import type { Request, Response, Router } from 'express';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { CharacterStateSnapshot, CharacterEvent } from '../../../../novel/types.js';
import type { CharacterQuote, CharacterScene } from '../../../../novel/character-highlight-extractor.js';

interface RelationExchangeCard {
  lines: Array<{ speakerId: string; text: string }>;
  chapter: number;
}

interface RelationCard {
  otherId: string;
  otherName: string;
  otherRole: string;
  /** 关系性质：宿敌/盟友/同行者/过客（由对方 role 推断） */
  label: string;
  encounters: number;
  coAppearances: number;
  lastChapter: number;
  bestExchange?: RelationExchangeCard;
}

interface CharacterGrowthResponse {
  /** 逐章状态快照：情绪/压力/目标进度/关键事件，按章节升序 */
  snapshots: CharacterStateSnapshot[];
  /** 事件记忆链：结构化事件（行为/遭遇/关系/认知/成就/失去），按章节升序 */
  events: CharacterEvent[];
  /** 金句（角色标志性台词，按评分 top 3） */
  quotes: CharacterQuote[];
  /** 高光场面（关键章节片段） */
  scenes: CharacterScene[];
  /** 人物关系（按交锋次数 top 4） */
  relations: RelationCard[];
}

/** 由对方角色 role 推断关系性质标签。
 * 仅高置信度判定：明确反派=宿敌；其余不强行贴标签
 * （父子/师徒/恋人等需语义或作者标注，自动判定易出错）。 */
function inferRelationLabel(role: string): string {
  if (role === 'antagonist') return '宿敌';
  return '';
}

/** 按 chapterNumber 升序排序（返回新数组，不改动入参） */
function sortByChapter<T extends { chapterNumber: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.chapterNumber - b.chapterNumber);
}

/**
 * 注册角色成长数据读取路由
 *
 * GET /:characterId/growth —— 返回该角色的逐章状态快照 + 事件记忆链
 * 挂载于 /api/novels/:novelId/characters 前缀下。
 * GET 请求复用 characters.ts 的「GET 跳过权限」中间件，天然对读者公开。
 */
export function registerCharacterGrowthRoutes(
  router: Router,
  novelManager: NovelManager,
): void {
  router.get('/:characterId/growth', async (req: Request, res: Response): Promise<void> => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const characterId = (req.params as Record<string, string>).characterId;
      if (!novelId || !characterId) {
        res.status(400).json({ error: '参数缺失' });
        return;
      }

      const [snapshots, events, highlightsEntries, relationEntries, allCharacters] = await Promise.all([
        novelManager.getCharacterStateSnapshots(novelId, characterId),
        novelManager.getCharacterEvents(novelId, characterId),
        novelManager.getCharacterHighlights(novelId, characterId),
        novelManager.getCharacterRelations(novelId, characterId),
        novelManager.getCharacters(novelId),
      ]);

      const highlightsEntry = highlightsEntries[0];
      const charMap = new Map(allCharacters.map((c) => [c.id, c]));
      const relations: RelationCard[] = relationEntries
        .map((e) => {
          const otherId = e.aId === characterId ? e.bId : e.aId;
          const other = charMap.get(otherId);
          if (!other) return null;
          return {
            otherId,
            otherName: other.name,
            otherRole: other.role,
            label: inferRelationLabel(other.role),
            encounters: e.encounters,
            coAppearances: e.coAppearances,
            lastChapter: e.lastChapter,
            bestExchange: e.bestExchange,
          } as RelationCard;
        })
        .filter((r): r is RelationCard => r !== null)
        .sort((a, b) => b.encounters - a.encounters)
        .slice(0, 4);

      const payload: CharacterGrowthResponse = {
        snapshots: sortByChapter(snapshots),
        events: sortByChapter(events),
        quotes: highlightsEntry ? highlightsEntry.quotes.slice(0, 3) : [],
        scenes: highlightsEntry ? highlightsEntry.scenes : [],
        relations,
      };
      res.json(payload);
    } catch (err) {
      console.warn(
        '[character-growth] 读取失败:',
        err instanceof Error ? err.message : err,
      );
      res.status(500).json({ error: '读取角色成长数据失败' });
    }
  });
}

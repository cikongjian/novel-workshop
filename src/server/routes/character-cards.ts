/**
 * 角色卡牌路由
 * 收藏、取消收藏、查询收藏状态、热门排行
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { CharacterCardService } from '../../services/character-card-service.js';

export function createCharacterCardRouter(cardService: CharacterCardService) {
  const router = Router();

  function getUserId(req: Request): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((req as any).auth as { id?: string } | undefined)?.id;
  }

  // 收藏/取消收藏
  router.post('/:characterId/collect', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { novelId, characterName } = req.body ?? {};
    if (!novelId || !characterName) {
      res.status(400).json({ error: 'Missing novelId or characterName' });
      return;
    }
    const collected = cardService.toggleCollect(
      userId,
      String(req.params.characterId),
      novelId,
      characterName,
    );
    res.json({ collected });
  });

  // 查询收藏状态（未登录返回 false）
  router.get('/:characterId/collected', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.json({ collected: false });
      return;
    }
    res.json({
      collected: cardService.isCollected(userId, String(req.params.characterId)),
    });
  });

  // 获取收藏数
  router.get('/:characterId/count', (_req: Request, res: Response) => {
    res.json({
      count: cardService.getCollectCount(String(_req.params.characterId)),
    });
  });

  // 我的收藏列表
  router.get('/my', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const enriched = req.query.enriched === 'true';
    if (enriched) {
      res.json({ collections: cardService.getUserCollectionsEnriched(userId) });
    } else {
      res.json({ collections: cardService.getUserCollections(userId) });
    }
  });

  // 热门排行
  router.get('/popular', (_req: Request, res: Response) => {
    const limit = Math.min(Number(_req.query.limit) || 20, 50);
    res.json({ ranking: cardService.getPopularRanking(limit) });
  });

  return router;
}

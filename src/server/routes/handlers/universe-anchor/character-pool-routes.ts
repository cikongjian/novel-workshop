import type { Router } from 'express';
import type { AnchorRouteDeps } from './route-support.js';
import { loadAccessibleAnchor, log } from './route-support.js';

export function registerAnchorCharacterPoolRoutes(router: Router, deps: AnchorRouteDeps): void {
  router.post('/:anchorId/characters/confirm', async (req, res) => {
    try {
      const { characterIds } = req.body as { characterIds: string[] };
      if (!Array.isArray(characterIds)) {
        res.status(400).json({ error: 'characterIds 必须是数组' });
        return;
      }
      const accessibleAnchor = await loadAccessibleAnchor(req, res, deps, req.params.anchorId as string);
      if (!accessibleAnchor) return;
      const updatedAnchor = await deps.anchorManager.confirmCharacters(req.params.anchorId as string, characterIds);
      if (!updatedAnchor) {
        res.status(404).json({ error: '锚点不存在' });
        return;
      }
      res.json(updatedAnchor);
    } catch (err) {
      log.error('确认角色入池失败', { error: err });
      res.status(500).json({ error: '确认角色入池失败' });
    }
  });

  router.delete('/:anchorId/characters/:characterId', async (req, res) => {
    try {
      const accessibleAnchor = await loadAccessibleAnchor(req, res, deps, req.params.anchorId as string);
      if (!accessibleAnchor) return;
      const updatedAnchor = await deps.anchorManager.removeCharacterFromPool(
        req.params.anchorId as string,
        req.params.characterId as string,
      );
      if (!updatedAnchor) {
        res.status(404).json({ error: '锚点不存在' });
        return;
      }
      res.json(updatedAnchor);
    } catch (err) {
      log.error('移除角色出池失败', { error: err });
      res.status(500).json({ error: '移除角色出池失败' });
    }
  });
}

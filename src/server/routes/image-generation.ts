import { Router } from 'express';
import type { AuthDb } from '../../auth/types.js';
import type { BillingService } from '../../billing/billing-service.js';
import type { ModelClient, ImageGenerationClient } from '../../models/types.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import { registerImageGenerationPortraitRoutes } from './handlers/image-generation/portrait-routes.js';
import { registerImageGenerationPromptRoutes } from './handlers/image-generation/prompt-routes.js';

export function createImageGenerationRouter(
  novelManager: NovelManager,
  modelClient?: ModelClient,
  imageClient?: ImageGenerationClient,
  authDb?: AuthDb,
  billingService?: BillingService,
) {
  const router = Router({ mergeParams: true });

  registerImageGenerationPromptRoutes(router, {
    authDb,
    modelClient,
    novelManager,
  });
  registerImageGenerationPortraitRoutes(router, {
    authDb,
    billingService,
    imageClient,
    modelClient,
    novelManager,
  });

  return router;
}

import type { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { registerInlineTextRoutes } from './inline-text-routes.js';
import { registerSpeakerBackfillRoutes } from './speaker-backfill-routes.js';

export function registerInlineRoutes(router: Router, deps: GenerateDeps): void {
  registerInlineTextRoutes(router, deps);
  registerSpeakerBackfillRoutes(router, deps);
}

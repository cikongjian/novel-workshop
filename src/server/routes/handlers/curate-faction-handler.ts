import { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { registerApplyCuratedFactionWorldRoutes } from './curate-faction-apply-routes.js';
import { registerCurateFactionWorldRoutes } from './curate-faction-routes.js';

export function registerCurateFactionRoutes(router: Router, deps: GenerateDeps): void {
  registerCurateFactionWorldRoutes(router, deps);
  registerApplyCuratedFactionWorldRoutes(router, deps);
}

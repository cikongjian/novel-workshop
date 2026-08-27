import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import type { AuthConfig } from '../auth/types.js';
import { createLogger } from '../utils/logger.js';
import { setupCoreApp } from './app/core-setup.js';
import { registerFeatureRoutes } from './app/feature-routes.js';
import { registerOperationalRoutes } from './app/operational-routes.js';
import type { AppDeps, AppInstance } from './app/types.js';
import { createBroadcaster } from './ws.js';

const appLogger = createLogger('server');

export async function createApp(deps: AppDeps): Promise<AppInstance> {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const matchesWsPath = pathname === '/ws'
      || pathname === '/api/ws'
      || /^\/(?:fullstack|apps)\/[^/]+\/(?:api\/)?ws$/.test(pathname);
    if (!matchesWsPath) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  const authConfig = deps.authConfig ?? ({ enabled: false } as AuthConfig);
  const { broadcast, broadcastJson, getNovelGenerationStatus } = createBroadcaster(
    wss,
    authConfig.enabled,
    deps.redis,
    authConfig.enabled ? authConfig.jwtSecret : undefined,
    deps.novelManager,
  );

  const { staticDir, referralService } = await setupCoreApp(app, deps, authConfig);
  const featureRoutes = await registerFeatureRoutes(app, deps, broadcast, broadcastJson, getNovelGenerationStatus, referralService);
  registerOperationalRoutes(app, deps, authConfig, staticDir, wss);

  const reloadAI: AppInstance['reloadAI'] = (newDeps) => {
    featureRoutes.reloadAI(newDeps);
    appLogger.info('AI 生成路由已热重载');
  };

  return { app, server, reloadAI };
}

export type { AppDeps, AppInstance } from './app/types.js';

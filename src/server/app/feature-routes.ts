import type { Express } from 'express';
import type { ReferralService } from '../../referral/referral-service.js';
import { createAdaptationRouter } from '../routes/adaptation.js';
import { createComicRouter } from '../routes/comic.js';
import { createAdminZhihuAssistantRouter } from '../routes/admin-zhihu-assistant.js';
import { createAgentSkillsRouter } from '../routes/agent-skills.js';
import { createAnalyticsRouter } from '../routes/analytics.js';
import { createAnchorRouter } from '../routes/universe-anchor.js';
import { createAnnouncementsRouter } from '../routes/announcements.js';
import { createAssistantRouter } from '../routes/assistant.js';
import { createBackupRouter } from '../routes/backup.js';
import { createBillingRouter } from '../routes/billing.js';
import { createBookStoreRoutes } from '../routes/bookstore.js';
import { createCastSessionRouter } from '../routes/cast-session.js';
import { createCharactersRouter } from '../routes/characters.js';
import { createChaptersRouter } from '../routes/chapters.js';
import { createComplianceEventsRouter } from '../routes/compliance-events.js';
import { createContentAuditRoutes } from '../routes/content-audit.js';
import { createCostRouter } from '../routes/cost.js';
import { createDownloadsRouter } from '../routes/downloads.js';
import { createFactGraphRouter } from '../routes/fact-graph.js';
import { createGenerateRouter } from '../routes/generate.js';
import { createGuestVisitRoutes } from '../routes/guest-visits.js';
import { createHomepageRouter } from '../routes/homepage.js';
import { createImageGenerationRouter } from '../routes/image-generation.js';
import { createInteractiveRouter } from '../routes/interactive.js';
import { createMemoryRouter } from '../routes/memory.js';
import { createModerationRoutes } from '../routes/moderation.js';
import { createNovelCoverGenerationRouter } from '../routes/novel-cover-generation.js';
import { createNovelsRouter } from '../routes/novels.js';
import { createOutlineRouter } from '../routes/outline.js';
import { createPlotBranchRouter } from '../routes/plot-branches.js';
import { createPublishingRouter } from '../routes/publishing.js';
import { createReportsRoutes } from '../routes/reports.js';
import { createScenesRouter } from '../routes/scenes.js';
import { createSeriesRouter } from '../routes/series.js';
import { createSettingsRouter } from '../routes/settings.js';
import { createShortStoryRouter } from '../routes/short-story.js';
import { createShuangwenRouter } from '../routes/shuangwen.js';
import { createSnapshotRouter } from '../routes/handlers/snapshot-handler.js';
import { createQualityMetricsRouter } from '../routes/handlers/quality-metrics-handler.js';
import { createStyleDnaRouter } from '../routes/style-dna.js';
import { createSyncRouter } from '../routes/sync.js';
import { createSystemResourcesRouter } from '../routes/system-resources.js';
import { createTrendsRouter } from '../routes/trends.js';
import { createTTSRouter } from '../routes/tts.js';
import { createUniverseRouter } from '../routes/universes.js';
import { createWechatArticleRouter } from '../routes/wechat-article.js';
import { createWorldRouter } from '../routes/world.js';
import { createNotificationRouter } from '../routes/notifications.js';
import { createAnnotationRouter } from '../routes/annotations.js';
import { createWriterStatsRouter } from '../routes/writer-stats.js';
import { createWriterScoresRouter } from '../routes/writer-scores.js';
import { createCharacterCardRouter } from '../routes/character-cards.js';
import { createPosterRouter } from '../routes/posters.js';
import { createLetterRouter } from '../routes/letters.js';
import { createCharacterMomentsRouter } from '../routes/character-moments.js';
import { createVoteRouter } from '../routes/votes.js';
import { createCharacterChatRouter } from '../routes/character-chat.js';
import { createSideStoryRouter } from '../routes/side-stories.js';
import { createForkRouter } from '../routes/forks.js';
import { createFunRouter } from '../routes/fun.js';
import { createUnifiedMessageRouter } from '../routes/unified-messages.js';
import { createAdminDnaIllustrationRouter } from '../routes/admin-dna-illustrations.js';
import { createAdminNotificationRouter } from '../routes/admin-notifications.js';
import { createAdminNovelDebugRouter } from '../routes/admin-novel-debug.js';
import type {
  AppBroadcast,
  AppBroadcastJson,
  AppDeps,
  AppInstance,
  AppRouteHandler,
  ReloadAIDeps,
} from './types.js';
import type { GetNovelGenerationStatusFn } from '../../services/chapter-generation-status-service.js';

export async function registerFeatureRoutes(
  app: Express,
  deps: AppDeps,
  broadcast: AppBroadcast,
  broadcastJson: AppBroadcastJson,
  getNovelGenerationStatus: GetNovelGenerationStatusFn,
  referralService?: ReferralService,
): Promise<Pick<AppInstance, 'reloadAI'>> {
  if (deps.authConfig?.enabled || process.env.NODE_ENV !== 'production') {
    app.use('/api/admin/novel-debug', createAdminNovelDebugRouter({
      novelManager: deps.novelManager,
      novelMemory: deps.novelMemory,
      backupManager: deps.backupManager,
      complianceEventManager: deps.complianceEventManager,
    }));
  }
  app.use('/api/settings', createSettingsRouter({
    broadcastJson,
    onSettingsChanged: () => {
      deps.onSettingsChanged?.();
      if (deps.trendsScheduler) {
        void deps.trendsScheduler.restart();
      }
    },
    authDb: deps.authDb,
    novelManager: deps.novelManager,
  }));
  app.use('/api/homepage', createHomepageRouter(deps.novelManager));
  app.use('/api/agent-skills', createAgentSkillsRouter({
    billingService: deps.billingService,
    authDb: deps.authDb,
    novelManager: deps.novelManager,
  }));

  if (deps.notificationService) {
    app.use('/api/notifications', createNotificationRouter(deps.notificationService));
  }

  if (deps.annotationService) {
    app.use('/api/annotations', createAnnotationRouter(deps.annotationService));
  }

  if (deps.writerStatsService) {
    app.use('/api/writer-stats', createWriterStatsRouter(deps.writerStatsService));
  }

  if (deps.writerScoreService) {
    app.use('/api/writer-scores', createWriterScoresRouter(deps.writerScoreService));
  }

  if (deps.characterCardService) {
    app.use('/api/character-cards', createCharacterCardRouter(deps.characterCardService));
  }
  if (deps.posterService && deps.novelManager) {
    app.use('/api/posters', createPosterRouter(deps.posterService, deps.novelManager, deps.agents, deps.modelClient, deps.authDb, deps.bookStoreManager));
  }
  if (deps.letterService && deps.novelManager) {
    app.use('/api/letters', createLetterRouter(deps.letterService, deps.novelManager, deps.agents, deps.modelClient, deps.authDb, deps.unifiedMessageService));
  }
  if (deps.momentsService && deps.momentsGenerator && deps.novelManager) {
    app.use('/api/character-moments', createCharacterMomentsRouter(deps.momentsService, deps.momentsGenerator, deps.novelManager, deps.agents, deps.modelClient, deps.authDb, deps.characterCardService, deps.billingService));
  }
  if (deps.voteService && deps.novelManager) {
    app.use('/api/plot-votes', createVoteRouter(deps.voteService, deps.novelManager, deps.authDb, deps.modelClient, deps.agents));
  }
  if (deps.novelManager) {
    app.use('/api/interactive', createInteractiveRouter({
      novelManager: deps.novelManager,
      authDb: deps.authDb,
      bookStoreManager: deps.bookStoreManager,
      voteService: deps.voteService,
      orchestrator: deps.interactiveOrchestrator,
    }));
  }
  if (deps.chatSessionService && deps.novelManager) {
    app.use('/api/character-chat', createCharacterChatRouter(deps.chatSessionService, deps.novelManager, deps.modelClient, deps.authDb, deps.billingService));
  }
  if (deps.sideStoryService && deps.novelManager) {
    app.use('/api/side-stories', createSideStoryRouter(deps.sideStoryService, deps.novelManager, deps.modelClient, deps.authDb, deps.notificationService, deps.bookStoreManager, deps.unifiedMessageService));
  }
  if (deps.forkService && deps.novelManager) {
    app.use('/api/forks', createForkRouter(
      deps.forkService,
      deps.novelManager,
      deps.bookStoreManager,
      deps.notificationService,
      deps.authDb,
    ));
  }

  if (deps.unifiedMessageService) {
    app.use('/api/unified-messages', createUnifiedMessageRouter(
      deps.unifiedMessageService,
      deps.characterOutreachService,
      deps.novelManager,
      deps.notificationService,
      deps.letterService,
    ));
    app.use('/api/admin/notifications', createAdminNotificationRouter(
      deps.unifiedMessageService,
      deps.authDb,
      deps.dataDir,
    ));
  }

  if (deps.announcementManager) {
    app.use('/api', createAnnouncementsRouter(deps.announcementManager));
  }
  if (deps.guestVisitManager) {
    app.use('/api/admin/guest-visits', createGuestVisitRoutes(deps.guestVisitManager));
  }
  if (deps.complianceEventManager) {
    app.use('/api/admin/compliance-events', createComplianceEventsRouter({
      complianceEventManager: deps.complianceEventManager,
      guestVisitManager: deps.guestVisitManager,
      reportManager: deps.reportManager,
      authEnabled: deps.authConfig?.enabled ?? false,
      moderationEnabled: Boolean(deps.bookStoreManager && deps.userBanManager),
      complaintEntryPath: '/complaints',
    }));
  }
  if (deps.bookStoreManager && deps.auditQueueManager) {
    app.use('/api/bookstore', createBookStoreRoutes(
      deps.bookStoreManager,
      deps.auditQueueManager,
      deps.novelManager,
      deps.contentAuditService,
      deps.authDb,
      deps.autoUpdateService,
      deps.storefrontConfigManager,
      deps.complianceEventManager,
      deps.forkService,
    ));
  }
  if (deps.contentAuditService && deps.bookStoreManager) {
    app.use('/api/audit', createContentAuditRoutes(
      deps.contentAuditService,
      deps.bookStoreManager,
      deps.novelManager,
      deps.auditQueueManager,
    ));
  }
  if (deps.reportManager && deps.bookStoreManager && deps.userBanManager && deps.contentAuditService) {
    app.use('/api/reports', createReportsRoutes({
      reportManager: deps.reportManager,
      bookStoreManager: deps.bookStoreManager,
      userBanManager: deps.userBanManager,
      complianceEventManager: deps.complianceEventManager,
      contentAuditService: deps.contentAuditService,
      broadcastJson,
      verifySliderCaptcha: deps.verifySliderCaptcha,
    }));
  }
  if (deps.bookStoreManager && deps.userBanManager) {
    app.use('/api/admin/moderation', createModerationRoutes(
      deps.userBanManager,
      deps.bookStoreManager,
      deps.complianceEventManager,
    ));
  }
  if (deps.modelClient) {
    app.use('/api/admin/zhihu-assistant', createAdminZhihuAssistantRouter({
      novelManager: deps.novelManager,
      bookStoreManager: deps.bookStoreManager,
      modelClient: deps.modelClient,
    }));
  }

  app.use('/api/tts', createTTSRouter(deps.novelManager, deps.modelClient, deps.voiceDesignerAgent));
  app.use('/api/novels', createNovelsRouter(
    deps.novelManager,
    deps.storyStateManager,
    deps.novelMemory,
    deps.authDb,
    deps.modelClient,
    broadcastJson,
    deps.universeManager,
    deps.bookStoreManager,
  ));
  app.use('/api/novels/:novelId/cover-ai', createNovelCoverGenerationRouter(
    deps.novelManager,
    deps.modelClient,
    deps.imageClient,
    deps.authDb,
    deps.bookStoreManager,
    deps.contentAuditService,
    deps.billingService,
  ));
  app.use('/api/novels/:novelId/chapters', createChaptersRouter(
    deps.novelManager,
    deps.finalizePipeline,
    broadcast,
    deps.agents,
    deps.modelClient,
    deps.momentsGenerator,
    deps.bookStoreManager,
    deps.novelMemory,
    deps.storyStateManager,
    deps.authDb,
    getNovelGenerationStatus,
    deps.writerStatsService,
    deps.unifiedMessageService,
    deps.characterCardService,
    deps.voteService,
  ));
  app.use('/api/novels/:novelId/chapters/:chapterNumber/scenes', createScenesRouter(deps.novelManager));
  app.use('/api/novels/:novelId/characters', createCharactersRouter(
    deps.novelManager,
    deps.modelClient,
    deps.novelMemory,
    deps.authDb,
    deps.billingService,
  ));
  app.use('/api/novels/:novelId/characters', createImageGenerationRouter(
    deps.novelManager,
    deps.modelClient,
    deps.imageClient,
    deps.authDb,
    deps.billingService,
  ));
  app.use('/api/novels/:novelId/style-dna', createStyleDnaRouter(deps.novelManager, deps.modelClient));
  app.use('/api/novels/:novelId/cast-session', createCastSessionRouter(
    deps.novelManager,
    deps.modelClient,
    deps.novelMemory,
    deps.authDb,
  ));
  app.use('/api/novels/:novelId/world', createWorldRouter(deps.novelManager, deps.novelMemory));
  app.use('/api/novels/:novelId/outline', createOutlineRouter({
    novelManager: deps.novelManager,
    agents: deps.agents,
    modelClient: deps.modelClient,
    broadcast,
    authDb: deps.authDb,
  }));
  if (deps.adaptationManager) {
    app.use('/api/novels/:novelId/adaptations', createAdaptationRouter({
      novelManager: deps.novelManager,
      adaptationManager: deps.adaptationManager,
      modelClient: deps.modelClient,
      authDb: deps.authDb,
    }));
    // 章节漫画（移动端实验功能）：受系统设置开关 comicChapterEnabled 管控，关闭时端点返回 404
    app.use('/api/novels/:novelId/comics', createComicRouter({
      novelManager: deps.novelManager,
      adaptationManager: deps.adaptationManager,
      comicPipeline: deps.comicPipeline,
      modelClient: deps.modelClient,
      imageClient: deps.imageClient,
      authDb: deps.authDb,
      billingService: deps.billingService,
      notificationService: deps.notificationService,
      unifiedMessageService: deps.unifiedMessageService,
      bookStoreManager: deps.bookStoreManager,
    }));
  }
  app.use('/api/novels/:novelId/analytics', createAnalyticsRouter(deps.novelManager));
  app.use('/api/novels/:novelId/fact-graph', createFactGraphRouter(deps.novelManager, deps.novelMemory));
  app.use('/api/novels', createQualityMetricsRouter(deps.novelManager));
  app.use('/api/novels', createSnapshotRouter(deps.novelManager));
  app.use('/api/novels/:novelId/plot-branches', createPlotBranchRouter(
    deps.novelManager,
    deps.modelClient,
    deps.agents,
    broadcast,
    deps.authDb,
    deps.universeManager,
  ));
  if (deps.dataDir) {
    app.use('/api/novels/:novelId/cost', createCostRouter(deps.novelManager, deps.dataDir));
    app.use('/api/billing', createBillingRouter(deps.dataDir, deps.billingService, referralService, deps.authDb));
    app.use('/api/wechat-article', createWechatArticleRouter({
      dataDir: deps.dataDir,
      modelClient: deps.modelClient,
    }));
  }

  if (deps.backupManager) {
    app.use('/api/backups', createBackupRouter(deps.backupManager, deps.novelManager, deps.storageCleanup));
    app.use('/api/sync', createSyncRouter({
      backupManager: deps.backupManager,
      novelManager: deps.novelManager,
      broadcastJson,
      authConfig: deps.authConfig,
      authDb: deps.authDb,
      redis: deps.redis,
    }));
  }
  if (deps.novelMemory) {
    app.use('/api', createMemoryRouter({
      novelMemory: deps.novelMemory,
      novelManager: deps.novelManager,
    }));
  }
  if (deps.agents && deps.novelMemory && deps.modelClient) {
    app.use('/api', createAssistantRouter({
      agents: deps.agents,
      novelManager: deps.novelManager,
      novelMemory: deps.novelMemory,
      modelClient: deps.modelClient,
      authDb: deps.authDb,
    }));
  }

  app.use('/api/shuangwen', createShuangwenRouter({
    novelManager: deps.novelManager,
    modelClient: deps.modelClient,
    agents: deps.agents,
    memory: deps.novelMemory,
    novelMemory: deps.novelMemory,
    storyStateManager: deps.storyStateManager,
    chapterPipeline: deps.chapterPipeline,
    broadcast,
    billingService: deps.billingService,
    authDb: deps.authDb,
    notificationService: deps.notificationService,
  }));

  const fallback503: AppRouteHandler = (_req, res) => {
    res.status(503).json({ error: 'AI 生成功能尚未就绪，请先在设置页面配置 AI 模型 API Key' });
  };

  // 占位 modelClient——路由创建时需要非空引用，实际调用时由各端点（如聊天）通过用户个人 API 覆盖
  function createNoopModelClient(): import('../../models/types.js').ModelClient {
    const noop = () => { throw new Error('全局模型未配置，请在设置页配置模型 API Key，或在"我的→自有模型"中添加个人 API'); };
    return {
      provider: 'noop' as any,
      model: 'noop',
      chat: noop,
      chatStream: noop,
    };
  }
  let generateHandler: AppRouteHandler = fallback503;

  function buildGenerateHandler(
    newDeps: ReloadAIDeps = {
      modelClient: deps.modelClient,
      chapterPipeline: deps.chapterPipeline,
      revisionPipeline: deps.revisionPipeline,
      finalizePipeline: deps.finalizePipeline,
      batchRevisionPipeline: deps.batchRevisionPipeline,
    },
  ): AppRouteHandler {
    // 始终创建路由——聊天等端点通过用户个人 API 工作，不依赖全局 modelClient/管线
    const activeModelClient = newDeps.modelClient ?? createNoopModelClient();
    return createGenerateRouter({
      novelManager: deps.novelManager,
      novelMemory: deps.novelMemory,
      chapterPipeline: newDeps.chapterPipeline!,
      revisionPipeline: newDeps.revisionPipeline!,
      finalizePipeline: newDeps.finalizePipeline,
      modelClient: activeModelClient,
      broadcast,
      broadcastJson,
      agents: deps.agents,
      storyStateManager: deps.storyStateManager,
      batchRevisionPipeline: newDeps.batchRevisionPipeline,
      billingService: deps.billingService,
      referralService,
      authDb: deps.authDb,
      notificationService: deps.notificationService,
      momentsGenerator: deps.momentsGenerator,
      writerStatsService: deps.writerStatsService,
    });
  }

  generateHandler = buildGenerateHandler();
  app.use('/api/generate', (req, res, next) => generateHandler(req, res, next));

  app.use('/api/short-story', createShortStoryRouter({
    novelManager: deps.novelManager,
    billingService: deps.billingService,
    authDb: deps.authDb,
    referralService,
  }));

  if (deps.seriesManager && deps.storyStateManager) {
    app.use('/api/series', createSeriesRouter({
      seriesManager: deps.seriesManager,
      storyStateManager: deps.storyStateManager,
      novelManager: deps.novelManager,
      modelClient: deps.modelClient,
      agents: deps.agents,
      broadcastJson,
    }));
  }
  if (deps.universeManager) {
    app.use('/api/universes', createUniverseRouter({
      universeManager: deps.universeManager,
      novelManager: deps.novelManager,
      seriesManager: deps.seriesManager,
    }));
  }
  if (deps.storyStateManager) {
    import('../routes/resource-ledger.js')
      .then(({ createResourceLedgerRouter }) => {
        app.use('/api/resource-ledger', createResourceLedgerRouter(deps.storyStateManager!, deps.novelManager));
      })
      .catch((err) => {
        console.error('Failed to load resource-ledger routes:', err);
      });
  }
  if (deps.anchorManager) {
    app.use('/api/anchors', createAnchorRouter({
      anchorManager: deps.anchorManager,
      novelManager: deps.novelManager,
      modelClient: deps.modelClient,
      agents: deps.agents,
      broadcastJson,
      authDb: deps.authDb,
    }));
  }
  if (deps.trendsService && deps.trendsScheduler) {
    app.use('/api/trends', createTrendsRouter({
      trendsService: deps.trendsService,
      trendsScheduler: deps.trendsScheduler,
    }));
  }
  if (deps.publishingAdvisorService) {
    app.use('/api/publishing', createPublishingRouter({
      publishingAdvisorService: deps.publishingAdvisorService,
      novelManager: deps.novelManager,
    }));
  }
  if (deps.dataDir) {
    app.use('/api/downloads', createDownloadsRouter(deps.dataDir));
  }

  app.use('/api/system', createSystemResourcesRouter());

  // DNA 插画管理后台
  if (deps.modelClient) {
    app.use('/api/admin/dna-illustrations', createAdminDnaIllustrationRouter({
      modelClient: deps.modelClient,
      imageClient: deps.imageClient,
    }));
  }

  // 趣味开书玩法
  if (deps.modelClient && deps.novelManager) {
    app.use('/api/fun', createFunRouter({
      modelClient: deps.modelClient,
      novelManager: deps.novelManager,
      imageClient: deps.imageClient,
      authDb: deps.authDb,
    }));
  }

  // SEO 推送管理（百度收录）
  if (deps.bookStoreManager && deps.dataDir) {
    const { createSeoPushRoutes } = await import('../routes/seo-push-routes.js');
    app.use('/api/admin/seo/push', createSeoPushRoutes(
      deps.bookStoreManager,
      deps.dataDir,
    ));
  }

  return {
    reloadAI(newDeps) {
      generateHandler = buildGenerateHandler(newDeps);
    },
  };
}

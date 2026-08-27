import { getConfig, getNovelsDir } from './config/index.js';
import { brand } from './config/brand.js';
import { createAuthDb, initAuthSchema } from './auth/db.js';
import { seedAdminUser } from './auth/user-service.js';
import { createRedisClient, testRedisConnection, createInMemoryRedisFallback } from './auth/redis.js';
import { formatSecurityValidationError, validateProductionSecurityConfig } from './auth/security-config.js';
import type { Redis } from 'ioredis';
import type { AuthConfig, AuthDb } from './auth/types.js';
import { createModelClient, createEmbeddingClient, createImageClient, createNovelEmbeddingClient } from './models/provider.js';
import { MutableImageGenerationClient } from './models/mutable-image-client.js';
import { decryptNovelApiKey as decryptNovelApiKeyIfNeeded } from './server/routes/helpers/novel-api-key-crypto.js';
import { NotificationService } from './services/notification-service.js';
import { createAnnotationService } from './server/routes/annotations.js';
import { WriterStatsService } from './services/writer-stats-service.js';
import { WriterScoreService } from './services/writer-score-service.js';
import { WriterScoreScheduler } from './services/writer-score-scheduler.js';
import { CharacterCardService } from './services/character-card-service.js';
import { PosterService } from './services/poster-service.js';
import { LetterService } from './services/letter-service.js';
import { MomentsService } from './character-moments/moments-service.js';
import { MomentsGenerator } from './character-moments/moments-generator.js';
import { MomentsScheduler } from './character-moments/moments-scheduler.js';
import { VoteService } from './services/vote-service.js';
import { ChatSessionService } from './services/chat-session-service.js';
import { SideStoryService } from './services/side-story-service.js';
import { ForkService } from './services/fork-service.js';
import { UnifiedMessageService } from './services/unified-message-service.js';
import { CharacterOutreachService } from './services/character-outreach-service.js';
import { NovelManager } from './novel/novel-manager.js';
import { NovelMemory } from './memory/novel-memory.js';
import { NovelMemorySearchBridge } from './memory/orchestrator/index.js';
import { ChapterPipeline } from './pipeline/chapter-pipeline.js';
import { RevisionPipeline } from './pipeline/revision-pipeline.js';
import { FinalizePipeline } from './pipeline/finalize-pipeline.js';
import { createApp } from './server/app.js';
import type { AgentRole, NovelAgent } from './agents/types.js';
import type { PipelineMemory } from './pipeline/types.js';
import { qwen3TTSServiceManager } from './tts/qwen3-service-manager.js';
import { kokoroServiceManager } from './tts/kokoro-service-manager.js';
import { BackupManager } from './backup/backup-manager.js';
import { AdaptationManager } from './adaptation/adaptation-manager.js';
import { createLogger, closeLogger } from './utils/logger.js';

// 6 个创作 Agent
import { WorldBuilderAgent } from './agents/world-builder.js';
import { CharacterAgent } from './agents/character.js';
import { OutlineAgent } from './agents/outline.js';
import { OpeningSupervisorAgent } from './agents/opening-supervisor.js';
import { WriterAgent } from './agents/writer.js';
import { EditorAgent } from './agents/editor.js';
import { ReaderAgent } from './agents/reader.js';
// 3 个定稿专家 Agent
import { CharacterMergerAgent } from './agents/character-merger.js';
import { CardBlurbWriterAgent } from './agents/card-blurb-writer.js';
import { WorldMergerAgent } from './agents/world-merger.js';
import { PlotAnalystAgent } from './agents/plot-analyst.js';
// 声音设计 Agent
import { VoiceDesignerAgent } from './agents/voice-designer.js';
import { ForeshadowingCuratorAgent } from './agents/foreshadowing-curator.js';
import { ForeshadowingSchedulerAgent } from './agents/foreshadowing-scheduler.js';
import { CultureCuratorAgent } from './agents/culture-curator.js';
import { HistoryCuratorAgent } from './agents/history-curator.js';
import { PowerGradientDesignerAgent } from './agents/power-gradient-designer.js';
import { PowerCorrelationAnalystAgent } from './agents/power-correlation-analyst.js';
import { PowerWorldIntegratorAgent } from './agents/power-world-integrator.js';
import { FactionCultureArchitectAgent } from './agents/faction-culture-architect.js';
import { FactionInheritanceDesignerAgent } from './agents/faction-inheritance-designer.js';
import { FactionMotiveMissionPlannerAgent } from './agents/faction-motive-mission-planner.js';
// 5 个增强 Agent
import { OutlineGeneratorAgent } from './agents/outline-generator.js';
import { PlotExplorerAgent } from './agents/plot-explorer.js';
import { DialoguePolisherAgent } from './agents/dialogue-polisher.js';
import { MarketingWriterAgent } from './agents/marketing-writer.js';
import { WritingAssistantAgent } from './agents/writing-assistant.js';
import { TitleGeneratorAgent } from './agents/title-generator.js';
import { ChapterDigestAgent } from './agents/chapter-digest.js';
import { ArcSummaryAgent } from './agents/arc-summary.js';
import { ResizerAgent } from './agents/resizer.js';
import { StoryStateTrackerAgent } from './agents/story-state-tracker.js';
import { PlotLineExtractorAgent } from './agents/plot-line-extractor.js';
import { BatchReviserAgent } from './agents/batch-reviser.js';
import { NovelBlueprintExtractorAgent } from './agents/novel-blueprint-extractor.js';
import { AnchorCuratorAgent } from './agents/anchor-curator.js';
import { BookTitleRecommenderAgent } from './agents/book-title-recommender.js';
import { AuthorNoteWriterAgent } from './agents/author-note-writer.js';
import { SynopsisGeneratorAgent } from './agents/synopsis-generator.js';
import { NameGeneratorAgent } from './agents/name-generator.js';
import { CharacterMomentsAgent } from './agents/character-moments.js';
// 漫画生成管线（剧情挖掘 + 分镜设计 + prompt 工程）
import { ComicBeatExtractorAgent } from './agents/comic-beat-extractor.js';
import { ComicStoryboardDesignerAgent } from './agents/comic-storyboard-designer.js';
import { ComicPromptEngineerAgent } from './agents/comic-prompt-engineer.js';
import { CharacterDNAExtractorAgent } from './agents/character-dna-extractor.js';
import { ComicPipeline } from './comic/comic-pipeline.js';
import { BatchRevisionPipeline } from './pipeline/batch-revision-pipeline.js';
import { TrendsService } from './trends/trends-service.js';
import { TrendsScheduler } from './trends/trends-scheduler.js';
import { StorageCleanupScheduler } from './backup/storage-cleanup.js';
import { PublishingAdvisorService } from './publishing/publishing-advisor-service.js';
import { StoryStateManager } from './novel/story-state-manager.js';
import { SeriesManager } from './novel/series-manager.js';
import { UniverseManager } from './novel/universe-manager.js';
import { UniverseAnchorManager } from './novel/universe-anchor.js';
import { BillingService } from './billing/billing-service.js';
import { AnnouncementManager } from './announcement/announcement-manager.js';
import { BookStoreManager } from './bookstore/bookstore-manager.js';
import { initAppDb, getAppDb } from './db/app-db.js';
import { BookStoreStorefrontConfigManager } from './bookstore/storefront-config-manager.js';
import { ReportManager } from './bookstore/report-manager.js';
import { UserBanManager } from './bookstore/user-ban-manager.js';
import { ContentAuditService } from './bookstore/content-audit-service.js';
import { AuditQueueManager } from './bookstore/audit-queue.js';
import { ChapterPublishScheduler } from './bookstore/chapter-publish-scheduler.js';
import { BookstoreAutoUpdateManager } from './bookstore/auto-update-manager.js';
import { BookstoreAutoUpdateService } from './bookstore/auto-update-service.js';
import { BookstoreAutoUpdateScheduler } from './bookstore/auto-update-scheduler.js';
import { InteractiveNovelOrchestrator } from './interactive/interactive-orchestrator.js';
import { InteractiveNovelScheduler } from './interactive/interactive-scheduler.js';
import { GuestVisitManager } from './guest-visits/guest-visit-manager.js';
import { ComplianceEventManager } from './compliance/compliance-event-manager.js';
import type { AuditConfig } from './bookstore/audit-client.js';
import { configureAiUsageRecorder } from './ai/usage-recorder.js';

/**
 * 空记忆实现：Embedding 未配置时使用，搜索始终返回空字符串
 * 章节管线仍可正常运行，只是缺少前文语义检索能力
 */
class NoopMemory implements PipelineMemory {
  async searchChapterContext(_novelId: string, _query: string, _chapterNumber: number): Promise<string> { return ''; }
  async searchWorldContext(_novelId: string, _query: string): Promise<string> { return ''; }
  async searchCharacterContext(_novelId: string, _query: string): Promise<string> { return ''; }
  async searchDigestContext(_novelId: string, _query: string, _currentChapter?: number): Promise<string> { return ''; }
  async searchMultiQuery(_novelId: string, _queries: string[], _options?: { category?: string; limit?: number; currentChapter?: number }): Promise<string> { return ''; }
  async searchArcContext(_novelId: string, _query: string, _currentChapter?: number): Promise<string> { return ''; }
  async searchFactContext(_novelId: string, _query: string, _currentChapter?: number): Promise<string> { return ''; }
  async searchThreadContext(_novelId: string, _query: string, _currentChapter?: number): Promise<string> { return ''; }
  async searchCharacterStateContext(_novelId: string, _query: string, _currentChapter?: number): Promise<string> { return ''; }
}

async function main() {
  const config = getConfig();
  const authConfig = config.auth as AuthConfig;
  const securityValidation = validateProductionSecurityConfig({ auth: authConfig });
  if (!securityValidation.ok) {
    throw new Error(formatSecurityValidationError(securityValidation));
  }

  const novelsDir = getNovelsDir();
  const log = createLogger('启动');
  configureAiUsageRecorder(config.dataDir);
  if (process.env.NODE_ENV === 'production' && !config.auth.enabled) {
    log.warn('认证系统未启用（AUTH_ENABLED=false），生产环境建议开启认证');
  }
  if (
    process.env.NODE_ENV === 'production'
    && config.realNameVerification.enabled
    && config.realNameVerification.provider === 'mock_identity'
  ) {
    throw new Error('REAL_NAME_VERIFICATION_PROVIDER=mock_identity is not allowed in production');
  }

  log.info('初始化小说管理器...');
  const novelManager = new NovelManager(novelsDir);
  const adaptationManager = new AdaptationManager(novelsDir);

  // 初始化备份管理器
  const backupManager = new BackupManager(config.dataDir, config.backup);
  log.info('备份管理器就绪');

  // 初始化存储清理调度器（清理不活跃小说的衍生数据）
  const storageCleanup = new StorageCleanupScheduler(novelsDir, {
    enabled: true,
    completedInactiveDays: 7,
    inactiveDays: 30,
    scheduleHour: 4,
  });
  storageCleanup.start();

  // 初始化应用数据库（SQLite）
  const appDb = initAppDb(config.dataDir);
  log.info('应用数据库 (SQLite) 已初始化');

  // 初始化公告管理器
  const announcementManager = new AnnouncementManager(config.dataDir, appDb);
  await announcementManager.init();
  log.info('公告管理器就绪');

  // 初始化书城管理器
  const bookStoreManager = new BookStoreManager(config.dataDir, appDb);
  await bookStoreManager.migrateFromJson();

  // 演示环境修复：批量将 pending → approved
  try {
    const allBooks = await bookStoreManager.adminListBooks();
    let fixed = 0;
    for (const book of allBooks) {
      if (book.publishStatus !== 'approved') {
        getAppDb().prepare("UPDATE books SET publish_status = 'approved' WHERE id = ?").run(book.id);
        fixed++;
      }
    }
    if (fixed > 0) log.info(`已自动批准 ${fixed} 本书`);
  } catch (err) {
    log.warn('启动时自动批准书籍失败', { error: err instanceof Error ? err.message : String(err) });
  }

  // 书籍审核通过时自动推送到百度
  if (process.env.PLATFORM_URL && process.env.BAIDU_PUSH_TOKEN) {
    const { pushBookToBaidu } = await import('./server/routes/seo-push.js');
    bookStoreManager.onBookApproved((book) => {
      pushBookToBaidu(book.id, book.publishedChapters ?? [], {
        platformUrl: process.env.PLATFORM_URL,
        baiduToken: process.env.BAIDU_PUSH_TOKEN,
      }).catch((err) => {
        log.warn('自动推送百度失败', { bookId: book.id, error: err instanceof Error ? err.message : String(err) });
      });
    });
    log.info('百度自动推送已启用');
  }

  const storefrontConfigManager = new BookStoreStorefrontConfigManager(config.dataDir);
  const guestVisitManager = new GuestVisitManager(config.dataDir, appDb);
  const complianceEventManager = new ComplianceEventManager(config.dataDir);
  // ReportManager 需要等待 authDb，延后初始化
  let reportManager: ReportManager | undefined;
  const userBanManager = new UserBanManager(config.dataDir);
  const auditConfig: AuditConfig = {
    provider: process.env.CONTENT_AUDIT_PROVIDER || 'keyword',
    apiKey: process.env.CONTENT_AUDIT_API_KEY || '',
    secretKey: process.env.CONTENT_AUDIT_SECRET_KEY,
    region: process.env.CONTENT_AUDIT_REGION,
    passThreshold: Number(process.env.CONTENT_AUDIT_PASS_THRESHOLD) || 60,
    blockThreshold: Number(process.env.CONTENT_AUDIT_BLOCK_THRESHOLD) || 80,
  };
  const contentAuditService = new ContentAuditService(config.dataDir, auditConfig);
  const auditQueueManager = new AuditQueueManager(
    config.dataDir,
    bookStoreManager,
    contentAuditService,
    novelManager
  );
  const autoUpdateManager = new BookstoreAutoUpdateManager(config.dataDir);
  // 恢复上次未完成的审核任务（进程重启时）
  const chapterPublishScheduler = new ChapterPublishScheduler(
    bookStoreManager,
    auditQueueManager,
    novelManager,
  );
  await auditQueueManager.recoverOnStartup();
  chapterPublishScheduler.start();

  // 注入备份管理器到 NovelManager（用于删除前自动备份）
  novelManager.setBackupManager(backupManager);

  // 创建模型客户端（用于聊天等功能）
  let modelClient: import('./models/types.js').ModelClient | undefined;
  try {
    modelClient = createModelClient(config);
    log.info(`模型客户端就绪: ${config.model.provider} / ${config.model.model}`);
    // 模型就绪后，切换内容审核为 AI 智能审核模式（上下文感知，消除关键词误判）
    contentAuditService.setModelClient(modelClient);
    log.info('内容审核已切换为 AI 智能审核模式');
  } catch (err) {
    log.warn('模型客户端初始化失败，AI 功能将不可用', { error: err instanceof Error ? err.message : String(err) });
  }

  // 创建 Embedding 客户端（用于记忆系统）
  let embeddingClient;
  try {
    embeddingClient = createEmbeddingClient(config);
    log.info(`Embedding 客户端就绪: ${config.embedding.model}`);
  } catch (err) {
    log.warn('Embedding 未配置，记忆检索将不可用（不影响基本创作）');
  }

  // 创建图像生成客户端（用于封面、角色立绘等）
  let imageClient: import('./models/types.js').ImageGenerationClient | undefined;
  const liveImageClient = new MutableImageGenerationClient();
  try {
    imageClient = createImageClient(config);
    liveImageClient.setClient(imageClient);
    log.info(`图像生成客户端就绪: ${config.image.model}`);
  } catch (err) {
    liveImageClient.clear();
    log.warn('图像生成未配置，封面和立绘功能将不可用');
  }

  // 初始化记忆系统：有 Embedding 用真实 NovelMemory，否则用 NoopMemory
  let novelMemory: NovelMemory | undefined;
  let pipelineMemory: PipelineMemory;
  if (embeddingClient) {
    try {
      novelMemory = new NovelMemory(novelsDir, embeddingClient, {
        hybridSearchEnabled: config.memory.hybridSearchEnabled,
        embeddingClientResolver: async (novelId: string) => {
          try {
            const novel = await novelManager.getNovel(novelId);
            if (!novel.embeddingConfig?.provider || !novel.embeddingConfig?.model) return null;
            return createNovelEmbeddingClient({
              provider: novel.embeddingConfig.provider,
              apiKey: decryptNovelApiKeyIfNeeded(novel.embeddingConfig.apiKey ?? ''),
              model: novel.embeddingConfig.model,
              baseUrl: novel.embeddingConfig.baseUrl ?? '',
            });
          } catch {
            return null;
          }
        },
      });
      pipelineMemory = novelMemory;
      log.info('记忆系统就绪（语义搜索已启用）');
    } catch (err) {
      log.warn('记忆系统初始化失败，降级为无记忆模式', { error: err instanceof Error ? err.message : String(err) });
      pipelineMemory = new NoopMemory();
    }
  } else {
    pipelineMemory = new NoopMemory();
  }

  // 注册 Agent 并创建管线
  let chapterPipeline: ChapterPipeline | undefined;
  let revisionPipeline: RevisionPipeline | undefined;
  let batchRevisionPipeline: BatchRevisionPipeline | undefined;
  let storyStateManager: StoryStateManager | undefined;
  let seriesManager: SeriesManager | undefined;
  let universeManager: UniverseManager | undefined;
  let anchorManager: UniverseAnchorManager | undefined;

  universeManager = new UniverseManager(config.dataDir);

  // Agent 只要代码能加载就能创建，不依赖模型配置
  const agents = new Map<AgentRole, NovelAgent>([
    ['world-builder', new WorldBuilderAgent()],
    ['character', new CharacterAgent()],
    ['outline', new OutlineAgent()],
    ['opening-supervisor', new OpeningSupervisorAgent()],
    ['writer', new WriterAgent()],
    ['editor', new EditorAgent()],
    ['reader', new ReaderAgent()],
    ['character-merger', new CharacterMergerAgent()],
    ['card-blurb-writer', new CardBlurbWriterAgent()],
    ['world-merger', new WorldMergerAgent()],
    ['plot-analyst', new PlotAnalystAgent()],
    ['voice-designer', new VoiceDesignerAgent()],
    ['foreshadowing-curator', new ForeshadowingCuratorAgent()],
    ['foreshadowing-scheduler', new ForeshadowingSchedulerAgent()],
    ['culture-curator', new CultureCuratorAgent()],
    ['history-curator', new HistoryCuratorAgent()],
    ['power-gradient-designer', new PowerGradientDesignerAgent()],
    ['power-correlation-analyst', new PowerCorrelationAnalystAgent()],
    ['power-world-integrator', new PowerWorldIntegratorAgent()],
    ['faction-culture-architect', new FactionCultureArchitectAgent()],
    ['faction-inheritance-designer', new FactionInheritanceDesignerAgent()],
    ['faction-motive-mission-planner', new FactionMotiveMissionPlannerAgent()],
    ['outline-generator', new OutlineGeneratorAgent()],
    ['plot-explorer', new PlotExplorerAgent()],
    ['dialogue-polisher', new DialoguePolisherAgent()],
    ['marketing-writer', new MarketingWriterAgent()],
    ['writing-assistant', new WritingAssistantAgent()],
    ['title-generator', new TitleGeneratorAgent()],
    ['chapter-digest', new ChapterDigestAgent()],
    ['arc-summary', new ArcSummaryAgent()],
    ['resizer', new ResizerAgent()],
    ['story-state-tracker', new StoryStateTrackerAgent()],
    ['plot-line-extractor', new PlotLineExtractorAgent()],
    ['batch-reviser', new BatchReviserAgent()],
    ['novel-blueprint-extractor', new NovelBlueprintExtractorAgent()],
    ['anchor-curator', new AnchorCuratorAgent()],
    ['book-title-recommender', new BookTitleRecommenderAgent()],
    ['author-note-writer', new AuthorNoteWriterAgent()],
    ['synopsis-generator', new SynopsisGeneratorAgent()],
    ['name-generator', new NameGeneratorAgent()],
    ['character-moments', new CharacterMomentsAgent()],
    ['comic-beat-extractor', new ComicBeatExtractorAgent()],
    ['comic-storyboard-designer', new ComicStoryboardDesignerAgent()],
    ['comic-prompt-engineer', new ComicPromptEngineerAgent()],
    ['character-dna-extractor', new CharacterDNAExtractorAgent()],
  ]);

  // 漫画生成管线（3 Agent 串行编排：剧情挖掘 → 分镜设计 → prompt 工程）
  const comicPipeline = new ComicPipeline(
    agents.get('comic-beat-extractor') as ComicBeatExtractorAgent,
    agents.get('comic-storyboard-designer') as ComicStoryboardDesignerAgent,
    agents.get('comic-prompt-engineer') as ComicPromptEngineerAgent,
    novelManager,
  );
  log.info(`已注册 ${agents.size} 个 Agent`);

  // 管线使用实际或占位 modelClient 创建（各端点通过 modelOverride 注入用户个人 API）
  const pipelineModelClient = modelClient ?? { provider: 'noop' as any, model: 'noop', chat: () => { throw new Error('noop'); }, chatStream: () => { throw new Error('noop'); } } as any;

  chapterPipeline = new ChapterPipeline(
    agents,
    pipelineMemory,
    novelManager,
    pipelineModelClient,
    config.chapterEnhancement,
      {
        contractEnabled: config.worldFeatures.contractEnabled,
        gateMode: config.worldFeatures.gateMode,
        strictFallbackToWarn: config.worldFeatures.strictFallbackToWarn,
        retrievalV2Enabled: config.worldFeatures.retrievalV2Enabled,
        retrievalTopK: config.worldFeatures.retrievalTopK,
      },
      {
        gateMode: config.outlineFeatures.gateMode,
        strictFallbackToWarn: config.outlineFeatures.strictFallbackToWarn,
        maxRequired: config.outlineFeatures.maxRequired,
      },
      {
        gateMode: config.qualityFeatures.gateMode,
        strictFallbackToWarn: config.qualityFeatures.strictFallbackToWarn,
        passScore: config.qualityFeatures.passScore,
        minStructureScore: config.qualityFeatures.minStructureScore,
        minStyleScore: config.qualityFeatures.minStyleScore,
        minEmotionScore: config.qualityFeatures.minEmotionScore,
      },
      undefined, // characterWhitelistFeatures — 使用默认值
      {
        gateMode: config.continuityFeatures.gateMode,
        strictFallbackToWarn: config.continuityFeatures.strictFallbackToWarn,
      },
      {
        gateMode: config.powerRuleFeatures.gateMode,
        strictFallbackToWarn: config.powerRuleFeatures.strictFallbackToWarn,
      },
    );
  log.info('章节生成管线就绪');

  // 注入故事状态机和系列管理器
  storyStateManager = new StoryStateManager(novelsDir);
  seriesManager = new SeriesManager(config.dataDir);
  anchorManager = new UniverseAnchorManager(config.dataDir);
  chapterPipeline.setStoryStateManager(storyStateManager);
  chapterPipeline.setSeriesManager(seriesManager);
  if (universeManager) chapterPipeline.setUniverseManager(universeManager);
  chapterPipeline.setAnchorManager(anchorManager);
  if (novelMemory) {
    chapterPipeline.setRawVectorSearch(new NovelMemorySearchBridge(novelMemory));
  }
  log.info('故事状态机 & 系列管理器 & 锚点管理器就绪');

  revisionPipeline = new RevisionPipeline(agents, novelManager, pipelineModelClient);
  log.info('修订管线就绪');

  // 批量修订管线
  batchRevisionPipeline = new BatchRevisionPipeline(agents, pipelineMemory, novelManager, pipelineModelClient);
  log.info('批量修订管线就绪');

  const finalizePipeline = modelClient
    ? new FinalizePipeline(
        new Map<AgentRole, NovelAgent>([
          ['character-merger', new CharacterMergerAgent()],
          ['card-blurb-writer', new CardBlurbWriterAgent()],
          ['world-merger', new WorldMergerAgent()],
          ['plot-analyst', new PlotAnalystAgent()],
        ]),
        novelManager,
        modelClient,
        novelMemory,
      )
    : undefined;
  if (finalizePipeline) {
    log.info('定稿合并管线就绪');
  }

  // 获取声音设计 Agent
  const voiceDesignerAgent = new VoiceDesignerAgent();

  // 初始化全网热点大师
  let trendsService: TrendsService | undefined;
  let trendsScheduler: TrendsScheduler | undefined;
  let publishingAdvisorService: PublishingAdvisorService | undefined;
  if (modelClient) {
    trendsService = new TrendsService(config.dataDir, modelClient);
    trendsScheduler = new TrendsScheduler(trendsService);
    trendsScheduler.start().catch((err) => {
      log.warn('热点调度器启动失败', { reason: err instanceof Error ? err.message : String(err) });
    });
    log.info('全网热点大师就绪');
  }
  publishingAdvisorService = new PublishingAdvisorService(novelManager, trendsService);
  log.info('上架推荐顾问就绪');

  // 初始化认证系统：生产环境失败关闭，开发环境可降级为本地无认证模式
  let authDb: AuthDb | undefined;
  let redisClient: Redis | undefined;
  if (authConfig.enabled) {
    try {
      if (!authConfig.jwtSecret || authConfig.jwtSecret.length < 32) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('AUTH_JWT_SECRET 长度不足，至少需要32字符');
        }
        // 演示环境使用固定密钥（生产环境请通过环境变量覆盖）
        const DEMO_JWT_SECRET = 'novel-workshop-demo-jwt-secret-key-2026-min-32-chars!!';
        authConfig.jwtSecret = DEMO_JWT_SECRET;
        log.warn('JWT_SECRET 未配置，使用演示固定密钥（生产环境请设置 AUTH_JWT_SECRET）');
      }

      // 演示环境使用固定加密密钥（生产环境请通过环境变量覆盖）
      if ((process.env.USER_API_ENCRYPTION_SECRET?.trim() ?? '').length < 32) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('USER_API_ENCRYPTION_SECRET 长度不足，至少需要32字符');
        }
        const DEMO_ENCRYPTION_SECRET = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
        process.env.USER_API_ENCRYPTION_SECRET = DEMO_ENCRYPTION_SECRET;
        log.warn('USER_API_ENCRYPTION_SECRET 未配置，使用演示固定密钥（生产环境请设置该变量）');
      }
      authDb = createAuthDb(config.dataDir);
      await initAuthSchema(authDb);
      await seedAdminUser(authDb, authConfig.adminUsername, authConfig.adminPassword);
      log.info('认证系统就绪 (SQLite)');

      // ReportManager 需要 authDb 进行实名校验
      reportManager = new ReportManager(config.dataDir, authDb, appDb);
      log.info('举报管理器就绪');

      // 初始化 Redis（用于 refresh token 存储和速率限制）
      redisClient = createRedisClient({
        host: authConfig.redisHost,
        port: authConfig.redisPort,
        password: authConfig.redisPassword,
        db: authConfig.redisDb,
      });
      const redisOk = await testRedisConnection(redisClient);
      if (!redisOk) {
        redisClient.disconnect();
        log.warn('Redis 连接失败，使用内存缓存替代（重启后刷新令牌失效）');
        redisClient = createInMemoryRedisFallback();
      } else {
        log.info('Redis 就绪');
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
      log.warn('认证系统初始化失败，降级为无认证模式', {
        reason: err instanceof Error ? err.message : String(err),
      });
      // 清理已创建的资源
      authDb = undefined;
      redisClient?.disconnect();
      redisClient = undefined;
      authConfig.enabled = false;
    }
  }

  if (!authConfig.enabled) {
    log.info('认证系统未启用（开发模式）');
    // ReportManager 不需要实名校验
    reportManager = new ReportManager(config.dataDir, null as any, appDb);
    log.info('举报管理器就绪（开发模式，无实名校验）');
  }

  // 创建计费服务（共享单例）
  const billingService = new BillingService(config.dataDir, appDb);
  log.info('计费服务就绪');

  // 启动公告自动归档定时任务（每小时执行一次）
  const announcementArchiveTimer = setInterval(() => {
    announcementManager.archiveExpiredAnnouncements().catch((err) => {
      log.error('公告自动归档失败', { error: err instanceof Error ? err.message : String(err) });
    });
  }, 3600000);
  // unref：归档定时器不应阻止进程退出，由优雅停机统一收尾
  announcementArchiveTimer.unref();

  const autoUpdateService = new BookstoreAutoUpdateService({
    autoUpdateManager,
    bookStoreManager,
    auditQueueManager,
    novelManager,
    chapterPipeline,
    novelMemory,
    modelClient,
    agents,
    storyStateManager,
  });
  const autoUpdateScheduler = new BookstoreAutoUpdateScheduler(autoUpdateService);
  autoUpdateScheduler.start();
  log.info('书城系统就绪');

  // 初始化推送通知服务
  const notificationService = new NotificationService(
    config.dataDir,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  await notificationService.init(process.env.VAPID_CONTACT_EMAIL);
  log.info('推送通知服务就绪');

  // 初始化划线批注服务
  const annotationService = createAnnotationService(config.dataDir);
  log.info('划线批注服务就绪');

  // 初始化写作统计服务
  const writerStatsService = new WriterStatsService(config.dataDir);
  log.info('写作统计服务就绪');

  // 初始化角色卡牌服务
  const characterCardService = new CharacterCardService(config.dataDir);
  log.info('角色卡牌服务就绪');

  // 初始化分享海报服务
  const posterService = new PosterService(config.dataDir);
  log.info('分享海报服务就绪');

  // 初始化角色信箱服务
  const letterService = new LetterService(config.dataDir);
  log.info('角色信箱服务就绪');

  // 初始化角色朋友圈服务
  const momentsService = new MomentsService(config.dataDir);
  const momentsGenerator = new MomentsGenerator(momentsService, novelManager);
  log.info('角色朋友圈服务就绪');

  // 初始化角色朋友圈调度器（每 6 小时自动生成动态）
  const momentsScheduler = new MomentsScheduler(momentsGenerator, novelManager, agents, modelClient ?? undefined);
  momentsScheduler.start();

  // 初始化剧情投票服务
  const voteService = new VoteService(config.dataDir);
  log.info('剧情投票服务就绪');

  // 初始化角色实时对话服务
  const chatSessionService = new ChatSessionService(config.dataDir);
  log.info('角色实时对话服务就绪');

  // 初始化 AI 番外生成服务
  const sideStoryService = new SideStoryService(config.dataDir);
  const forkService = new ForkService(config.dataDir);
  log.info('AI 番外生成服务就绪');

  // 初始化作家分服务（依赖 appDb + novelManager + writerStatsService + 投票/Fork/信箱/改编服务）
  const writerScoreService = new WriterScoreService(
    appDb, novelManager, writerStatsService, voteService, forkService, letterService, adaptationManager,
  );
  log.info('作家分服务就绪');

  // 启动作家分定时重算（每日凌晨 2:00）
  const writerScoreScheduler = new WriterScoreScheduler(writerScoreService);
  writerScoreScheduler.start();
  log.info('作家分定时任务已启动');

  // 章节发布后自动重算该作家的作家分
  bookStoreManager.onChapterPublished((bookId: string, chapterNumber: number) => {
    try {
      const book = getAppDb().prepare('SELECT user_id FROM books WHERE id = ?').get(bookId) as { user_id: string } | undefined;
      if (book) {
        writerScoreService.recalculateAndSave(book.user_id).catch((err) => {
          log.warn('章节发布后作家分重算失败', { bookId, chapterNumber, error: err instanceof Error ? err.message : String(err) });
        });
      }
    } catch (err) {
      log.warn('章节发布联动处理失败', { bookId, chapterNumber, error: err instanceof Error ? err.message : String(err) });
    }
  });
  log.info('作家分-章节发布联动已就绪');

  // 初始化统一消息中心
  const unifiedMessageService = new UnifiedMessageService(config.dataDir);
  const characterOutreachService = new CharacterOutreachService(unifiedMessageService, modelClient);
  log.info('统一消息中心就绪（角色搭话引擎已挂载）');

  // 初始化互动小说编排器与调度器（自动推进循环）
  const interactiveOrchestrator = new InteractiveNovelOrchestrator({
    novelManager,
    bookStoreManager,
    auditQueueManager,
    voteService,
    chapterPipeline,
    novelMemory,
    modelClient,
    agents,
    storyStateManager,
  });
  const interactiveScheduler = new InteractiveNovelScheduler(interactiveOrchestrator);
  interactiveScheduler.start();
  log.info('互动小说调度器就绪');

  const appInstance = await createApp({
    novelManager,
    modelClient,
    novelMemory,
    chapterPipeline,
    revisionPipeline,
    finalizePipeline,
    voiceDesignerAgent,
    adaptationManager,
    comicPipeline,
    agents,
    backupManager,
    dataDir: config.dataDir,
    storyStateManager,
    seriesManager,
    universeManager,
    anchorManager,
    batchRevisionPipeline,
    imageClient: liveImageClient,
    trendsService,
    trendsScheduler,
    publishingAdvisorService,
    authConfig,
    authDb,
    redis: redisClient,
    billingService,
    announcementManager,
    bookStoreManager,
    reportManager,
    userBanManager,
    contentAuditService,
    auditQueueManager,
    autoUpdateService,
    storefrontConfigManager,
    guestVisitManager,
    complianceEventManager,
    storageCleanup,
    notificationService,
    annotationService,
    writerStatsService,
    writerScoreService,
    characterCardService,
    posterService,
    letterService,
    momentsService,
    momentsGenerator,
    voteService,
    chatSessionService,
    sideStoryService,
    forkService,
    unifiedMessageService,
    characterOutreachService,
    interactiveOrchestrator,
    onSettingsChanged: () => tryReloadAIStack(),
  });
  const { server, reloadAI } = appInstance;

  /**
   * 设置变更后尝试重建图像客户端；文本生成管线仅在当前 modelClient
   * 不存在时执行热重载，避免运行中切换导致状态不一致。
   */
  function tryReloadAIStack(): void {
    const freshConfig = getConfig();
    reloadImageClient(freshConfig);
    if (modelClient) return; // 已有真实模型客户端，不需要热重载
    try {
      modelClient = createModelClient(freshConfig);
      log.info(`模型客户端热重载成功: ${freshConfig.model.provider} / ${freshConfig.model.model}`);

      // 用真实模型客户端重建管线
      chapterPipeline = new ChapterPipeline(
        agents,
        pipelineMemory,
        novelManager,
        modelClient,
        freshConfig.chapterEnhancement,
        {
          contractEnabled: freshConfig.worldFeatures.contractEnabled,
          gateMode: freshConfig.worldFeatures.gateMode,
          strictFallbackToWarn: freshConfig.worldFeatures.strictFallbackToWarn,
          retrievalV2Enabled: freshConfig.worldFeatures.retrievalV2Enabled,
          retrievalTopK: freshConfig.worldFeatures.retrievalTopK,
        },
        {
          gateMode: freshConfig.outlineFeatures.gateMode,
          strictFallbackToWarn: freshConfig.outlineFeatures.strictFallbackToWarn,
          maxRequired: freshConfig.outlineFeatures.maxRequired,
        },
        {
          gateMode: freshConfig.qualityFeatures.gateMode,
          strictFallbackToWarn: freshConfig.qualityFeatures.strictFallbackToWarn,
          passScore: freshConfig.qualityFeatures.passScore,
          minStructureScore: freshConfig.qualityFeatures.minStructureScore,
          minStyleScore: freshConfig.qualityFeatures.minStyleScore,
          minEmotionScore: freshConfig.qualityFeatures.minEmotionScore,
        },
      );
      if (storyStateManager) chapterPipeline.setStoryStateManager(storyStateManager);
      if (seriesManager) chapterPipeline.setSeriesManager(seriesManager);
      if (universeManager) chapterPipeline.setUniverseManager(universeManager);
      if (anchorManager) chapterPipeline.setAnchorManager(anchorManager);
      if (novelMemory) {
        chapterPipeline.setRawVectorSearch(new NovelMemorySearchBridge(novelMemory));
      }

      revisionPipeline = new RevisionPipeline(agents, novelManager, modelClient);
      batchRevisionPipeline = new BatchRevisionPipeline(agents, pipelineMemory, novelManager, modelClient);
      autoUpdateService.updateRuntimeDeps({
        chapterPipeline,
        novelMemory,
        modelClient,
        agents,
        storyStateManager,
      });

      reloadAI({
        modelClient,
        chapterPipeline,
        revisionPipeline,
        finalizePipeline: undefined,
        batchRevisionPipeline,
      });
      log.info('AI 生成管线热重载完成');
    } catch (err) {
      log.warn('AI 模型热重载失败', { reason: err instanceof Error ? err.message : String(err) });
    }
  }

  function reloadImageClient(freshConfig: ReturnType<typeof getConfig>): void {
    try {
      const nextImageClient = createImageClient(freshConfig);
      imageClient = nextImageClient;
      liveImageClient.setClient(nextImageClient);
      log.info(`图像生成客户端热重载成功: ${freshConfig.image.model}`);
    } catch (err) {
      imageClient = undefined;
      liveImageClient.clear();
      log.warn('图像生成客户端热重载后不可用', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const { port, host } = config.server;

  // 安全检查：AUTH_ENABLED=false 时绑定非 localhost 地址给出警告
  if (!config.auth.enabled) {
    const isLocalhost = host === '127.0.0.1' || host === '::1' || host === 'localhost';
    if (!isLocalhost) {
      log.warn(`认证未启用但绑定到 ${host}，服务将对网络开放——建议开启认证（AUTH_ENABLED=true）`);
    }
    log.warn('认证未启用（AUTH_ENABLED=false），以开发模式运行');
  }

  server.listen(port, host, () => {
    log.info('');
    log.info('='.repeat(50));
    log.info(`  ${brand.displayName} 已启动`);
    log.info(`  地址: http://${host}:${port}`);
    log.info(`  WebSocket: ws://${host}:${port}/ws`);
    log.info('='.repeat(50));

    qwen3TTSServiceManager.autoStartIfNeeded(config.tts.engine, config.tts.qwen3Url).catch((err) => {
      log.warn('Qwen3 TTS 自动启动失败', { reason: err instanceof Error ? err.message : String(err) });
    });
    kokoroServiceManager.autoStartIfNeeded(config.tts.narrationEngine, config.tts.kokoroUrl).catch((err) => {
      log.warn('Kokoro TTS 自动启动失败', { reason: err instanceof Error ? err.message : String(err) });
    });
  });

  // ===== 优雅停机 =====
  const SHUTDOWN_TIMEOUT_MS = 10_000;
  let shuttingDown = false;

  async function gracefulShutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`收到 ${signal}，开始优雅停机...`);

    // 设置最大等待时间，防止停机卡住
    const forceExitTimer = setTimeout(() => {
      log.warn('优雅停机超时，强制退出');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      // 1. 停止接受新连接
      server.close(() => {
        log.info('HTTP 服务器已关闭');
      });

      // 2. 停止定时任务
      storageCleanup.stop();
      chapterPublishScheduler.stop();
      autoUpdateScheduler.stop();
      interactiveScheduler.stop();
      trendsScheduler?.stop();
      momentsScheduler.stop();
      writerScoreScheduler.stop();

      // 3. 关闭 Redis 连接
      if (redisClient) {
        await redisClient.quit().catch(() => { /* 忽略 */ });
        log.info('Redis 连接已关闭');
      }

      log.info('优雅停机完成');
      // 刷新并关闭日志文件，确保停机前的日志落盘
      await closeLogger();
      process.exit(0);
    } catch (err) {
      log.error('停机过程中出错', { reason: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
  process.on('SIGINT', () => { void gracefulShutdown('SIGINT'); });
}

// 全局未捕获异常处理
const fatalLog = createLogger('致命错误');

process.on('unhandledRejection', (reason) => {
  fatalLog.error('未处理的 Promise 拒绝', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (error) => {
  fatalLog.error('未捕获的异常', {
    error: error.message,
    stack: error.stack,
  });
  // 未捕获异常后进程状态不可靠，必须退出
  process.exit(1);
});

main().catch((err) => {
  fatalLog.error('启动失败', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
  process.exit(1);
});

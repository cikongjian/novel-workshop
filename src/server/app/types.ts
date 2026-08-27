import type { Server } from 'node:http';
import type { Express, NextFunction, Request, Response } from 'express';
import type { Redis } from 'ioredis';
import type { AgentEvent, NovelAgent } from '../../agents/types.js';
import type { AnnouncementManager } from '../../announcement/announcement-manager.js';
import type { AdaptationManager } from '../../adaptation/adaptation-manager.js';
import type { ComicPipeline } from '../../comic/comic-pipeline.js';
import type { AuthConfig, AuthDb } from '../../auth/types.js';
import type { BackupManager } from '../../backup/backup-manager.js';
import type { BillingService } from '../../billing/billing-service.js';
import type { AuditQueueManager } from '../../bookstore/audit-queue.js';
import type { BookstoreAutoUpdateService } from '../../bookstore/auto-update-service.js';
import type { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import type { ContentAuditService } from '../../bookstore/content-audit-service.js';
import type { BookStoreStorefrontConfigManager } from '../../bookstore/storefront-config-manager.js';
import type { GuestVisitManager } from '../../guest-visits/guest-visit-manager.js';
import type { ComplianceEventManager } from '../../compliance/compliance-event-manager.js';
import type { ReportManager } from '../../bookstore/report-manager.js';
import type { UserBanManager } from '../../bookstore/user-ban-manager.js';
import type { NovelMemory } from '../../memory/novel-memory.js';
import type { ImageGenerationClient, ModelClient } from '../../models/types.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { BatchRevisionPipeline } from '../../pipeline/batch-revision-pipeline.js';
import type { ChapterPipeline } from '../../pipeline/chapter-pipeline.js';
import type { FinalizePipeline } from '../../pipeline/finalize-pipeline.js';
import type { RevisionPipeline } from '../../pipeline/revision-pipeline.js';

export type AppDeps = {
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
  chapterPipeline?: ChapterPipeline;
  revisionPipeline?: RevisionPipeline;
  finalizePipeline?: FinalizePipeline;
  modelClient?: ModelClient;
  voiceDesignerAgent?: NovelAgent;
  adaptationManager?: AdaptationManager;
  comicPipeline?: ComicPipeline;
  agents?: Map<string, NovelAgent>;
  backupManager?: BackupManager;
  dataDir?: string;
  storyStateManager?: import('../../novel/story-state-manager.js').StoryStateManager;
  seriesManager?: import('../../novel/series-manager.js').SeriesManager;
  universeManager?: import('../../novel/universe-manager.js').UniverseManager;
  anchorManager?: import('../../novel/universe-anchor.js').UniverseAnchorManager;
  batchRevisionPipeline?: BatchRevisionPipeline;
  imageClient?: ImageGenerationClient;
  trendsService?: import('../../trends/trends-service.js').TrendsService;
  trendsScheduler?: import('../../trends/trends-scheduler.js').TrendsScheduler;
  publishingAdvisorService?: import('../../publishing/publishing-advisor-service.js').PublishingAdvisorService;
  onSettingsChanged?: () => void;
  authConfig?: AuthConfig;
  authDb?: AuthDb;
  redis?: Redis;
  billingService?: BillingService;
  announcementManager?: AnnouncementManager;
  bookStoreManager?: BookStoreManager;
  reportManager?: ReportManager;
  userBanManager?: UserBanManager;
  contentAuditService?: ContentAuditService;
  auditQueueManager?: AuditQueueManager;
  autoUpdateService?: BookstoreAutoUpdateService;
  storefrontConfigManager?: BookStoreStorefrontConfigManager;
  guestVisitManager?: GuestVisitManager;
  complianceEventManager?: ComplianceEventManager;
  storageCleanup?: import('../../backup/storage-cleanup.js').StorageCleanupScheduler;
  notificationService?: import('../../services/notification-service.js').NotificationService;
  annotationService?: import('../routes/annotations.js').AnnotationService;
  writerStatsService?: import('../../services/writer-stats-service.js').WriterStatsService;
  writerScoreService?: import('../../services/writer-score-service.js').WriterScoreService;
  characterCardService?: import('../../services/character-card-service.js').CharacterCardService;
  posterService?: import('../../services/poster-service.js').PosterService;
  letterService?: import('../../services/letter-service.js').LetterService;
  momentsService?: import('../../character-moments/moments-service.js').MomentsService;
  momentsGenerator?: import('../../character-moments/moments-generator.js').MomentsGenerator;
  voteService?: import('../../services/vote-service.js').VoteService;
  chatSessionService?: import('../../services/chat-session-service.js').ChatSessionService;
  sideStoryService?: import('../../services/side-story-service.js').SideStoryService;
  forkService?: import('../../services/fork-service.js').ForkService;
  interactiveOrchestrator?: import('../../interactive/interactive-orchestrator.js').InteractiveNovelOrchestrator;
  unifiedMessageService?: import('../../services/unified-message-service.js').UnifiedMessageService;
  characterOutreachService?: import('../../services/character-outreach-service.js').CharacterOutreachService;
  verifySliderCaptcha?: (challengeId: string, position: number, durationMs: number) => Promise<boolean>;
};

export type ReloadAIDeps = Pick<
  AppDeps,
  'modelClient' | 'chapterPipeline' | 'revisionPipeline' | 'finalizePipeline' | 'batchRevisionPipeline'
>;

export type AppInstance = {
  app: Express;
  server: Server;
  reloadAI: (newDeps: ReloadAIDeps) => void;
};

export type AppBroadcast = (event: AgentEvent) => void;
export type AppBroadcastJson = (frame: Record<string, unknown>) => void;
export type AppRouteHandler = (req: Request, res: Response, next: NextFunction) => void;

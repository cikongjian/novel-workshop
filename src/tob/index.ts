import { createModelClient } from '../models/provider.js';
import { createLogger } from '../utils/logger.js';
import { createTobApp } from './app.js';
import { loadTobConfig } from './config.js';
import { TobPipelineRegistry } from './pipelines/registry.js';
import { longformNovelRunner } from './pipelines/longform-novel-runner.js';
import { multimodalAdaptRunner } from './pipelines/multimodal-adapt-runner.js';
import { shortDramaSopRunner } from './pipelines/shortdrama-sop-runner.js';
import { audioDramaRunner } from './pipelines/audio-drama-runner.js';
import { TobGenerationService } from './services/tob-generation-service.js';
import { createTobPipelineRuntime } from './services/tob-pipeline-runtime.js';
import { TobWorker } from './services/tob-worker.js';
import { TobRepository } from './storage/tob-repository.js';

async function main() {
  const config = loadTobConfig();
  const log = createLogger('tob');

  const repository = new TobRepository(config.dataDir, log.child('repo'));
  await repository.init();

  let modelClient;
  try {
    modelClient = createModelClient(config.appConfig);
    log.info('ToB model client ready', {
      provider: config.appConfig.model.provider,
      model: config.appConfig.model.model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn('ToB model client unavailable', {
      error: message,
      mockGeneration: config.allowMockGeneration,
    });
  }

  const runtime = createTobPipelineRuntime({
    config,
    modelClient,
    logger: log.child('runtime'),
  });
  const pipelineRegistry = new TobPipelineRegistry([
    longformNovelRunner,
    multimodalAdaptRunner,
    shortDramaSopRunner,
    audioDramaRunner,
  ]);

  const generationService = new TobGenerationService({
    repository,
    allowMockGeneration: config.allowMockGeneration,
    logger: log.child('generator'),
    runtime,
    pipelineRegistry,
  });
  const pipelines = generationService.listPipelines();

  const worker = new TobWorker({
    repository,
    generationService,
    logger: log.child('worker'),
    concurrency: config.workerConcurrency,
    pollMs: config.workerPollMs,
  });
  worker.start();

  const { server } = createTobApp({
    logger: log.child('http'),
    apiToken: config.apiToken,
    rateLimitMax: config.rateLimitMax,
    allowMockGeneration: config.allowMockGeneration,
    hasModelClient: Boolean(modelClient),
    workspacePipelineLinked: Boolean(runtime.chapterPipeline && runtime.revisionPipeline),
    repository,
    pipelines,
    dataDir: config.dataDir,
    listSourceNovels: async () => {
      const novels = await runtime.sourceNovelManager.listNovels();
      return novels.map((novel) => ({
        id: novel.id,
        title: novel.title,
        genre: novel.genre,
        status: novel.status,
        chapterCount: novel.chapterCount ?? 0,
        updatedAt: novel.updatedAt,
      }));
    },
    getSourceNovelChapterStats: async (novelId: string) => {
      await runtime.sourceNovelManager.getNovel(novelId);
      const chapters = await runtime.sourceNovelManager.listChapters(novelId);
      const chapterNumbers = chapters.map((chapter) => chapter.chapterNumber).sort((a, b) => a - b);
      return {
        novelId,
        chapterCount: chapterNumbers.length,
        minChapterNumber: chapterNumbers.length > 0 ? chapterNumbers[0] : null,
        maxChapterNumber: chapterNumbers.length > 0 ? chapterNumbers[chapterNumbers.length - 1] : null,
      };
    },
  });

  server.listen(config.port, config.host, () => {
    log.info('ToB server started', {
      url: `http://${config.host}:${config.port}`,
      dataDir: config.dataDir,
      concurrency: config.workerConcurrency,
    });
  });

  const shutdown = () => {
    log.info('ToB shutdown signal received');
    worker.stop();
    server.close(() => {
      log.info('ToB server stopped');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  const log = createLogger('tob:fatal');
  log.error('ToB process failed to start', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});

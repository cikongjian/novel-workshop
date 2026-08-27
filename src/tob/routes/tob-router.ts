import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TobRepository } from '../storage/tob-repository.js';
import type { TobGeneratePayload, TobPipelineSummary } from '../types.js';
import type { NovelGenre, NovelStatus } from '../../novel/types.js';
import type { AgentEvent } from '../../agents/types.js';

type TobRouterDeps = {
  repository: TobRepository;
  allowMockGeneration: boolean;
  hasModelClient: boolean;
  workspacePipelineLinked: boolean;
  pipelines: TobPipelineSummary[];
  dataDir: string;
  listSourceNovels: () => Promise<Array<{
    id: string;
    title: string;
    genre: NovelGenre;
    status: NovelStatus;
    chapterCount: number;
    updatedAt: string;
  }>>;
  getSourceNovelChapterStats: (novelId: string) => Promise<{
    novelId: string;
    chapterCount: number;
    minChapterNumber: number | null;
    maxChapterNumber: number | null;
  }>;
  broadcaster: {
    broadcast: (event: AgentEvent) => void;
    broadcastJson: (frame: Record<string, unknown>) => void;
  };
};

const LONGFORM_PIPELINE_KEY = 'longform-novel';
const MULTIMODAL_PIPELINE_KEY = 'multimodal-adapt';
const SHORTDRAMA_SOP_PIPELINE_KEY = 'shortdrama-sop';
const QUALITY_PROFILES = new Set<TobGeneratePayload['qualityProfile']>(['balanced', 'hook-first']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseOptionalPositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error('INVALID_POSITIVE_INTEGER');
  }
  return value;
}

function parseGeneratePayload(input: unknown, projectSourceNovelId?: string): TobGeneratePayload {
  const body = (input ?? {}) as Record<string, unknown>;
  const pipelineKey = isNonEmptyString(body.pipelineKey) ? body.pipelineKey.trim() : LONGFORM_PIPELINE_KEY;
  const prompt = isNonEmptyString(body.prompt) ? body.prompt.trim() : '';
  const constraints = isNonEmptyString(body.constraints) ? body.constraints.trim() : undefined;
  const sourceNovelId = isNonEmptyString(body.sourceNovelId) ? body.sourceNovelId.trim() : undefined;
  const sourceChapterStart = parseOptionalPositiveInt(body.sourceChapterStart);
  const sourceChapterEnd = parseOptionalPositiveInt(body.sourceChapterEnd);
  const adaptationMode = body.adaptationMode;
  const qualityProfile = body.qualityProfile;

  if (sourceChapterStart !== undefined && sourceChapterEnd !== undefined && sourceChapterStart > sourceChapterEnd) {
    throw new Error('INVALID_CHAPTER_RANGE');
  }

  if (pipelineKey === LONGFORM_PIPELINE_KEY && !prompt) {
    throw new Error('PROMPT_REQUIRED');
  }

  const needsSourceNovel = pipelineKey === MULTIMODAL_PIPELINE_KEY || pipelineKey === SHORTDRAMA_SOP_PIPELINE_KEY;

  if (needsSourceNovel) {
    const resolvedSourceNovelId = sourceNovelId || projectSourceNovelId;
    if (!resolvedSourceNovelId) {
      throw new Error('SOURCE_NOVEL_ID_REQUIRED');
    }
  }

  if (pipelineKey === MULTIMODAL_PIPELINE_KEY) {
    if (adaptationMode !== undefined && adaptationMode !== 'short-drama' && adaptationMode !== 'comic') {
      throw new Error('INVALID_ADAPTATION_MODE');
    }
  }

  if (adaptationMode !== undefined && adaptationMode !== 'short-drama' && adaptationMode !== 'comic') {
    throw new Error('INVALID_ADAPTATION_MODE');
  }

  if (qualityProfile !== undefined) {
    if (typeof qualityProfile !== 'string' || !QUALITY_PROFILES.has(qualityProfile as TobGeneratePayload['qualityProfile'])) {
      throw new Error('INVALID_QUALITY_PROFILE');
    }
    if (pipelineKey !== SHORTDRAMA_SOP_PIPELINE_KEY) {
      throw new Error('QUALITY_PROFILE_NOT_SUPPORTED');
    }
  }

  return {
    pipelineKey,
    prompt,
    constraints,
    sourceNovelId,
    sourceChapterStart,
    sourceChapterEnd,
    adaptationMode: adaptationMode as TobGeneratePayload['adaptationMode'],
    qualityProfile: qualityProfile as TobGeneratePayload['qualityProfile'],
  };
}

function extractOutputField(markdown: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^-\\s*${escaped}:\\s*(.+)$`, 'mi');
  const match = markdown.match(pattern);
  if (!match) return undefined;
  const value = match[1].trim();
  return value.length > 0 ? value : undefined;
}

function extractOutputFieldByLabels(markdown: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const value = extractOutputField(markdown, label);
    if (value) return value;
  }
  return undefined;
}

function resolveNovelArtifactPath(dataDir: string, novelId: string, relativePath: string): string | undefined {
  const novelRoot = path.resolve(dataDir, 'novels', novelId);
  const artifactAbsolute = path.resolve(novelRoot, path.normalize(relativePath));
  if (artifactAbsolute === novelRoot || artifactAbsolute.startsWith(`${novelRoot}${path.sep}`)) {
    return artifactAbsolute;
  }
  return undefined;
}

export function createTobRouter(deps: TobRouterDeps): Router {
  const router = Router();
  const pipelineKeys = new Set(deps.pipelines.map((pipeline) => pipeline.key));

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      features: {
        project: true,
        queue: true,
        intervention: true,
        modelConfigured: deps.hasModelClient,
        mockGeneration: deps.allowMockGeneration,
        workspacePipelineLinked: deps.workspacePipelineLinked,
      },
    });
  });

  router.get('/pipelines', (_req, res) => {
    res.json({ pipelines: deps.pipelines });
  });

  router.get('/source-novels', async (_req, res) => {
    const novels = await deps.listSourceNovels();
    res.json({ novels });
  });

  router.get('/source-novels/:novelId/chapters', async (req, res) => {
    try {
      const stats = await deps.getSourceNovelChapterStats(req.params.novelId);
      res.json({ stats });
    } catch (error) {
      if (error instanceof Error && error.message.includes('不存在')) {
        res.status(404).json({ error: 'source novel not found' });
        return;
      }
      throw error;
    }
  });

  router.get('/projects', (_req, res) => {
    res.json({ projects: deps.repository.listProjects() });
  });

  router.post('/projects', async (req, res) => {
    const { name, brief } = req.body as { name?: string; brief?: string };
    if (!isNonEmptyString(name)) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const project = await deps.repository.createProject({ name, brief });
    res.status(201).json({ project });
  });

  router.get('/projects/:projectId', (req, res) => {
    const project = deps.repository.getProject(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: 'project not found' });
      return;
    }
    res.json({ project });
  });

  router.get('/projects/:projectId/jobs', (req, res) => {
    const project = deps.repository.getProject(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: 'project not found' });
      return;
    }
    const jobs = deps.repository.listProjectJobs(project.id);
    res.json({ jobs });
  });

  router.post('/projects/:projectId/jobs', async (req, res) => {
    const project = deps.repository.getProject(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: 'project not found' });
      return;
    }

    let payload: TobGeneratePayload;
    try {
      payload = parseGeneratePayload(req.body, project.sourceNovelId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'PROMPT_REQUIRED') {
        res.status(400).json({ error: 'prompt is required for longform-novel pipeline' });
        return;
      }
      if (message === 'SOURCE_NOVEL_ID_REQUIRED') {
        res.status(400).json({ error: 'sourceNovelId is required for source-driven pipelines' });
        return;
      }
      if (message === 'INVALID_ADAPTATION_MODE') {
        res.status(400).json({ error: "adaptationMode must be 'short-drama' or 'comic'" });
        return;
      }
      if (message === 'INVALID_QUALITY_PROFILE') {
        res.status(400).json({ error: "qualityProfile must be 'balanced' or 'hook-first'" });
        return;
      }
      if (message === 'QUALITY_PROFILE_NOT_SUPPORTED') {
        res.status(400).json({ error: 'qualityProfile is only supported by shortdrama-sop pipeline' });
        return;
      }
      if (message === 'INVALID_CHAPTER_RANGE') {
        res.status(400).json({ error: 'sourceChapterStart must be <= sourceChapterEnd' });
        return;
      }
      if (message === 'INVALID_POSITIVE_INTEGER') {
        res.status(400).json({ error: 'sourceChapterStart/sourceChapterEnd must be positive integers' });
        return;
      }
      throw error;
    }

    if (!pipelineKeys.has(payload.pipelineKey ?? LONGFORM_PIPELINE_KEY)) {
      res.status(400).json({ error: 'pipeline not found' });
      return;
    }

    try {
      const job = await deps.repository.createGenerateJob(req.params.projectId, payload);
      res.status(201).json({ job });
    } catch (error) {
      if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: 'project not found' });
        return;
      }
      throw error;
    }
  });

  router.get('/jobs/:jobId', (req, res) => {
    const job = deps.repository.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'job not found' });
      return;
    }
    res.json({ job });
  });

  router.get('/jobs/:jobId/output', async (req, res) => {
    const job = deps.repository.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'job not found' });
      return;
    }
    if (job.status !== 'succeeded') {
      res.status(409).json({ error: 'job not ready' });
      return;
    }
    try {
      const markdown = await deps.repository.readJobOutput(job);
      res.json({ markdown });
    } catch {
      res.status(404).json({ error: 'output not found' });
    }
  });

  router.post('/jobs/:jobId/interventions', async (req, res) => {
    const { instruction, pipelineKey } = req.body as { instruction?: string; pipelineKey?: string };
    if (!isNonEmptyString(instruction)) {
      res.status(400).json({ error: 'instruction is required' });
      return;
    }
    if (isNonEmptyString(pipelineKey) && !pipelineKeys.has(pipelineKey.trim())) {
      res.status(400).json({ error: 'pipeline not found' });
      return;
    }

    try {
      const job = await deps.repository.createInterventionJob(req.params.jobId, {
        instruction,
        pipelineKey: isNonEmptyString(pipelineKey) ? pipelineKey.trim() : undefined,
      });
      res.status(201).json({ job });
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      if (error.message === 'JOB_NOT_FOUND') {
        res.status(404).json({ error: 'job not found' });
        return;
      }
      if (error.message === 'SOURCE_JOB_NOT_READY') {
        res.status(409).json({ error: 'job must be succeeded before intervention' });
        return;
      }
      if (error.message === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: 'project not found' });
        return;
      }
      throw error;
    }
  });

  router.get('/jobs/:jobId/audio-drama/download', (req, res) => {
    const job = deps.repository.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'job not found' });
      return;
    }
    if (job.status !== 'succeeded') {
      res.status(409).json({ error: 'job not ready' });
      return;
    }
    if (!job.pipeline || job.pipeline.pipelineKey !== 'audio-drama') {
      res.status(400).json({ error: 'not an audio drama job' });
      return;
    }

    const outputFormat = (job.payload as any).outputFormat ?? 'mp3';
    const audioFile = path.join(deps.dataDir, 'audio-dramas', job.projectId, job.id, `audio-drama.${outputFormat}`);
    const downloadName = `audio-drama-${job.id}.${outputFormat}`;

    res.download(audioFile, downloadName, (err) => {
      if (err) {
        if (!res.headersSent) {
          res.status(404).json({ error: 'audio file not found' });
        }
      }
    });
  });

  router.get('/jobs/:jobId/shortdrama-sop/delivery-pack', async (req, res) => {
    const job = deps.repository.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'job not found' });
      return;
    }
    if (job.status !== 'succeeded') {
      res.status(409).json({ error: 'job not ready' });
      return;
    }
    if (!job.pipeline || job.pipeline.pipelineKey !== SHORTDRAMA_SOP_PIPELINE_KEY) {
      res.status(400).json({ error: 'not a shortdrama-sop job' });
      return;
    }

    let markdown: string;
    try {
      markdown = await deps.repository.readJobOutput(job);
    } catch {
      res.status(404).json({ error: 'output not found' });
      return;
    }

    const deliveryPackPath = extractOutputFieldByLabels(markdown, ['Delivery Pack', '交付包']);
    if (!deliveryPackPath) {
      res.status(404).json({ error: 'delivery pack not found in output' });
      return;
    }
    const novelId = job.pipeline.novelId;
    const artifactAbsolute = resolveNovelArtifactPath(deps.dataDir, novelId, deliveryPackPath);
    if (!artifactAbsolute) {
      res.status(400).json({ error: 'invalid delivery pack path' });
      return;
    }

    try {
      const raw = await fs.readFile(artifactAbsolute, 'utf-8');
      res.json({
        deliveryPackPath,
        pack: JSON.parse(raw) as unknown,
      });
    } catch {
      res.status(404).json({ error: 'delivery pack file not found' });
    }
  });

  router.get('/jobs/:jobId/shortdrama-sop/delivery-pack/download', async (req, res) => {
    const job = deps.repository.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'job not found' });
      return;
    }
    if (job.status !== 'succeeded') {
      res.status(409).json({ error: 'job not ready' });
      return;
    }
    if (!job.pipeline || job.pipeline.pipelineKey !== SHORTDRAMA_SOP_PIPELINE_KEY) {
      res.status(400).json({ error: 'not a shortdrama-sop job' });
      return;
    }

    let markdown: string;
    try {
      markdown = await deps.repository.readJobOutput(job);
    } catch {
      res.status(404).json({ error: 'output not found' });
      return;
    }
    const deliveryPackPath = extractOutputFieldByLabels(markdown, ['Delivery Pack', '交付包']);
    if (!deliveryPackPath) {
      res.status(404).json({ error: 'delivery pack not found in output' });
      return;
    }

    const novelId = job.pipeline.novelId;
    const artifactAbsolute = resolveNovelArtifactPath(deps.dataDir, novelId, deliveryPackPath);
    if (!artifactAbsolute) {
      res.status(400).json({ error: 'invalid delivery pack path' });
      return;
    }

    const filename = `shortdrama-delivery-${job.id}.json`;
    res.download(artifactAbsolute, filename, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: 'delivery pack file not found' });
      }
    });
  });

  router.post('/jobs/:jobId/cancel', async (req, res) => {
    try {
      await deps.repository.cancelJob(req.params.jobId);
      const job = deps.repository.getJob(req.params.jobId);
      res.json({ job });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'JOB_NOT_FOUND') {
        res.status(404).json({ error: 'job not found' });
        return;
      }
      if (message === 'JOB_ALREADY_FINISHED') {
        res.status(409).json({ error: 'job already finished' });
        return;
      }
      throw error;
    }
  });

  return router;
}

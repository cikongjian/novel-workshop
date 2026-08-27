import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  CreateWechatArticleProjectInput,
  WechatArticleProject,
  WechatArticleReviewReport,
} from './wechat-article-types.js';

type WechatArticleProjectStorePayload = {
  projects: WechatArticleProject[];
};

const DEFAULT_STORE: WechatArticleProjectStorePayload = {
  projects: [],
};

function normalizeProject(input: Partial<WechatArticleProject>): WechatArticleProject {
  const now = new Date().toISOString();
  return {
    id: input.id ?? randomUUID(),
    title: input.title ?? '',
    targetAudience: input.targetAudience ?? '',
    articleType: input.articleType ?? '',
    corePromise: input.corePromise ?? '',
    sourceNotes: input.sourceNotes ?? '',
    targetWords: input.targetWords ?? 1800,
    status: input.status ?? 'planning',
    latestScore: typeof input.latestScore === 'number' ? input.latestScore : null,
    latestDraft: input.latestDraft ?? '',
    latestTitleOptions: Array.isArray(input.latestTitleOptions)
      ? input.latestTitleOptions.filter((item): item is string => typeof item === 'string')
      : [],
    latestReview: input.latestReview ?? null,
    revisionCount: typeof input.revisionCount === 'number' ? input.revisionCount : 0,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

export class WechatArticleProjectStore {
  constructor(private readonly dataDir: string) {}

  async listProjects(): Promise<WechatArticleProject[]> {
    const payload = await this.readStore();
    return [...payload.projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async createProject(input: CreateWechatArticleProjectInput): Promise<WechatArticleProject> {
    const payload = await this.readStore();
    const now = new Date().toISOString();
    const project: WechatArticleProject = {
      id: randomUUID(),
      title: input.title.trim(),
      targetAudience: input.targetAudience.trim(),
      articleType: input.articleType.trim(),
      corePromise: input.corePromise.trim(),
      sourceNotes: input.sourceNotes?.trim() ?? '',
      targetWords: input.targetWords,
      status: 'planning',
      latestScore: null,
      latestDraft: '',
      latestTitleOptions: [],
      latestReview: null,
      revisionCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    payload.projects.unshift(project);
    await this.writeStore(payload);
    return project;
  }

  async getProject(projectId: string): Promise<WechatArticleProject | null> {
    const payload = await this.readStore();
    return payload.projects.find((item) => item.id === projectId) ?? null;
  }

  async saveDraft(projectId: string, params: {
    draft: string;
    titleOptions: string[];
  }): Promise<WechatArticleProject | null> {
    const payload = await this.readStore();
    const project = payload.projects.find((item) => item.id === projectId);
    if (!project) return null;

    project.latestDraft = params.draft;
    project.latestTitleOptions = params.titleOptions;
    project.latestReview = null;
    project.latestScore = null;
    project.status = 'drafting';
    project.updatedAt = new Date().toISOString();
    await this.writeStore(payload);
    return project;
  }

  async saveRevisedDraft(projectId: string, params: {
    draft: string;
    titleOptions: string[];
  }): Promise<WechatArticleProject | null> {
    const payload = await this.readStore();
    const project = payload.projects.find((item) => item.id === projectId);
    if (!project) return null;

    project.latestDraft = params.draft;
    project.latestTitleOptions = params.titleOptions;
    project.latestReview = null;
    project.latestScore = null;
    project.revisionCount += 1;
    project.status = 'drafting';
    project.updatedAt = new Date().toISOString();
    await this.writeStore(payload);
    return project;
  }

  async saveManualDraft(projectId: string, params: {
    draft: string;
  }): Promise<WechatArticleProject | null> {
    const payload = await this.readStore();
    const project = payload.projects.find((item) => item.id === projectId);
    if (!project) return null;

    project.latestDraft = params.draft;
    project.latestReview = null;
    project.latestScore = null;
    project.revisionCount += 1;
    project.status = 'drafting';
    project.updatedAt = new Date().toISOString();
    await this.writeStore(payload);
    return project;
  }

  async saveReview(projectId: string, review: WechatArticleReviewReport): Promise<WechatArticleProject | null> {
    const payload = await this.readStore();
    const project = payload.projects.find((item) => item.id === projectId);
    if (!project) return null;

    project.latestReview = review;
    project.latestScore = review.overallScore;
    project.status = review.pass ? 'approved' : 'reviewing';
    project.updatedAt = new Date().toISOString();
    await this.writeStore(payload);
    return project;
  }

  private getStorePath(): string {
    return path.join(this.dataDir, 'wechat-article', 'projects.json');
  }

  private async ensureStoreFile(): Promise<void> {
    const filePath = this.getStorePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify(DEFAULT_STORE, null, 2), 'utf-8');
    }
  }

  private async readStore(): Promise<WechatArticleProjectStorePayload> {
    await this.ensureStoreFile();
    const raw = await fs.readFile(this.getStorePath(), 'utf-8');
    try {
      const parsed = JSON.parse(raw) as Partial<WechatArticleProjectStorePayload>;
      return {
        projects: Array.isArray(parsed.projects) ? parsed.projects.map((item) => normalizeProject(item)) : [],
      };
    } catch {
      return { ...DEFAULT_STORE };
    }
  }

  private async writeStore(payload: WechatArticleProjectStorePayload): Promise<void> {
    await fs.writeFile(this.getStorePath(), JSON.stringify(payload, null, 2), 'utf-8');
  }
}

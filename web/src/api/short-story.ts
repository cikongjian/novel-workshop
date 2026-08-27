import { http } from './http';

/**
 * 短篇大师 API
 */

export interface CreateShortStoryRequest {
  title: string;
  template: string;
  targetWordCount: number;
  targetChapters: number;
  chapterWordCount?: number;
  paywall?: {
    enabled: boolean;
    type: 'chapter' | 'percentage' | 'wordCount';
    freeChapters?: number;
    freePercentage?: number;
    freeWordCount?: number;
    paywallMessage?: string;
  };
  customConfig?: any;
}

export interface CreateShortStoryResponse {
  success: boolean;
  novelId: string;
  blueprint: any;
}

export interface GenerateShortChapterRequest {
  novelId: string;
  chapterNumber: number;
  direction?: string;
}

export interface GenerateShortChapterResponse {
  success: boolean;
  result: {
    chapterContent: string;
    readerFeedback: string;
  };
  billingBypassed?: boolean;
}

export interface BatchGenerateShortStoryRequest {
  novelId: string;
  startChapter: number;
  endChapter?: number;
}

export interface BatchGenerateShortStoryResponse {
  success: boolean;
  totalChapters?: number;
  billingBypassed?: boolean;
  results: Array<{
    chapterNumber: number;
    success: boolean;
    wordCount?: number;
    score?: string;
    error?: string;
  }>;
}

export interface ShortStoryBlueprint {
  targetWordCount: number;
  targetChapters: number;
  template: string;
  payoffDensity: string;
  paceMode: string;
  styleGuide: string;
  hook: {
    openingPunch: string;
    coreLoop: string;
    climaxChain: string;
    chapterEndStrategy: string;
  };
  protagonist: {
    name: string;
    startState: string;
    endState: string;
    goldFinger: string;
  };
  antagonists: Array<{
    name: string;
    role: string;
    defeatChapter: number;
    defeatMethod: string;
  }>;
  paywall: {
    enabled: boolean;
    type: 'chapter' | 'percentage' | 'wordCount';
    freeChapters?: number;
    freePercentage?: number;
    freeWordCount?: number;
    paywallMessage: string;
  };
}

export interface ShortStoryProgress {
  currentChapter: number;
  totalChapters: number;
  currentWordCount: number;
  targetWordCount: number;
  estimatedCompletion: number;
  paidChapters: number;
}

export interface ShortStoryTemplate {
  value: string;
  label: string;
  description: string;
  tags: string[];
  recommendedWordCount: number;
  recommendedChapters: number;
  dimensions: Array<{
    label: string;
    value: string;
  }>;
  blueprint?: Partial<ShortStoryBlueprint>;
}

export interface ShortStoryListItem {
  id: string;
  title: string;
  status: string;
  template: string;
  targetWordCount: number;
  targetChapters: number;
  chapterCount: number;
  wordCount: number;
  updatedAt: string;
}

export async function listShortStories(): Promise<{
  success: boolean;
  items: ShortStoryListItem[];
}> {
  const response = await http.get('/short-story');
  return response.data;
}

/**
 * 创建短篇小说
 */
export async function createShortStory(
  data: CreateShortStoryRequest
): Promise<CreateShortStoryResponse> {
  const response = await http.post('/short-story/create', data);
  return response.data;
}

/**
 * 生成单章
 */
export async function generateShortChapter(
  data: GenerateShortChapterRequest
): Promise<GenerateShortChapterResponse> {
  const response = await http.post('/short-story/generate-chapter', data);
  return response.data;
}

/**
 * 批量生成
 */
export async function batchGenerateShortStory(
  data: BatchGenerateShortStoryRequest
): Promise<BatchGenerateShortStoryResponse> {
  const response = await http.post('/short-story/batch-generate', data);
  return response.data;
}

/**
 * 获取短篇蓝图
 */
export async function getShortStoryBlueprint(
  novelId: string
): Promise<{ success: boolean; blueprint: ShortStoryBlueprint }> {
  const response = await http.get(`/short-story/${novelId}/blueprint`);
  return response.data;
}

/**
 * 获取短篇进度
 */
export async function getShortStoryProgress(
  novelId: string
): Promise<{ success: boolean; progress: ShortStoryProgress }> {
  const response = await http.get(`/short-story/${novelId}/progress`);
  return response.data;
}

/**
 * 获取模板列表
 */
export async function getShortStoryTemplates(): Promise<{
  success: boolean;
  templates: ShortStoryTemplate[];
}> {
  const response = await http.get('/short-story/templates');
  return response.data;
}


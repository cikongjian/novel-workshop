import axios from 'axios';
import { ref } from 'vue';
import {
  generateCangjieSeedIdea,
  type CangjieChecklistItem,
  type CangjieConversationTurn,
  type CangjieSeedIdea,
} from '../api/cangjie';
import { createShuangwenAsync } from '../api/novels';
import { userApiApi } from '../api/user-api';
import { DEFAULT_CHAPTER_WORD_TARGET } from '../config/chapter-generation-options';
import { extractApiErrorMessage } from '../utils/api-error';
import { syncUserApiProfileState } from '../utils/user-api-local';

export type CangjieNovelCreationInput = {
  messages: CangjieConversationTurn[];
  checklist: CangjieChecklistItem[];
};

export type CangjieNovelCreationResult = {
  novelId: string;
  idea: CangjieSeedIdea;
};

async function syncDefaultUserApiProfile() {
  try {
    const profiles = await userApiApi.listProfiles();
    syncUserApiProfileState(profiles);
  } catch (err) {
    console.warn('同步默认用户 API 配置失败', err);
  }
}

export function getCangjieCreationErrorMessage(err: unknown): string {
  const message = extractApiErrorMessage(err, '开书失败，请稍后重试');
  if (axios.isAxiosError(err) && err.response?.status === 402) {
    return `${message}。本平台使用自填 API，请先确认模型配置可用。`;
  }
  return message;
}

export function useCangjieNovelCreation() {
  const creatingNovel = ref(false);

  async function createNovel(input: CangjieNovelCreationInput): Promise<CangjieNovelCreationResult> {
    const selectedChecklist = input.checklist
      .map(item => ({
        ...item,
        title: item.title.trim(),
        content: item.content.trim(),
        selected: true,
      }))
      .filter(item => item.title && item.content);

    if (!selectedChecklist.length) throw new Error('先确认至少一个故事核心');

    creatingNovel.value = true;
    try {
      const idea = await generateCangjieSeedIdea(input.messages, selectedChecklist);
      await syncDefaultUserApiProfile();
      const result = await createShuangwenAsync({
        genre: 'custom',
        seedIdea: idea.seedIdea,
        title: idea.title,
        titleHint: idea.title,
        synopsis: idea.synopsis,
        synopsisHint: idea.synopsis,
        outlineChapters: 20,
        targetChapters: 120,
        includeMarketing: false,
        sampleChapter: true,
        maxWordCount: DEFAULT_CHAPTER_WORD_TARGET,
        createChapterShells: false,
      });

      if (!result.novelId) throw new Error('小说创建失败');
      return { novelId: result.novelId, idea };
    } finally {
      creatingNovel.value = false;
    }
  }

  return {
    creatingNovel,
    createNovel,
  };
}

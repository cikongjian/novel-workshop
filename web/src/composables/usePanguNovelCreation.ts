import axios from 'axios';
import { ref } from 'vue';
import { createShuangwenAsync } from '../api/novels';
import { userApiApi } from '../api/user-api';
import { DEFAULT_CHAPTER_WORD_TARGET } from '../config/chapter-generation-options';
import { extractApiErrorMessage } from '../utils/api-error';
import { syncUserApiProfileState } from '../utils/user-api-local';

const PANGU_SEED_MAX_LENGTH = 800;

function normalizeSeedIdea(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, PANGU_SEED_MAX_LENGTH);
}

async function syncDefaultUserApiProfile() {
  try {
    const profiles = await userApiApi.listProfiles();
    syncUserApiProfileState(profiles);
  } catch {
  }
}

export function getPanguCreationErrorMessage(err: unknown): string {
  const message = extractApiErrorMessage(err, '开书失败，请稍后重试');
  if (axios.isAxiosError(err) && err.response?.status === 402) {
    return `${message}。本平台使用自填 API，请先确认模型配置可用。`;
  }
  return message;
}

export function usePanguNovelCreation() {
  const creatingNovel = ref(false);

  async function createNovel(input: string): Promise<string> {
    const seedIdea = normalizeSeedIdea(input);
    if (!seedIdea) throw new Error('先写下一个开篇灵感');

    creatingNovel.value = true;
    try {
      await syncDefaultUserApiProfile();
      const result = await createShuangwenAsync({
        genre: 'custom',
        seedIdea,
        synopsisHint: seedIdea,
        outlineChapters: 20,
        targetChapters: 120,
        includeMarketing: false,
        sampleChapter: true,
        maxWordCount: DEFAULT_CHAPTER_WORD_TARGET,
        createChapterShells: false,
      });

      if (!result.novelId) throw new Error('小说创建失败');
      return result.novelId;
    } finally {
      creatingNovel.value = false;
    }
  }

  return {
    creatingNovel,
    createNovel,
  };
}

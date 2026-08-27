import { ref } from 'vue';
import { http } from '../api/http';
import { createShuangwenAsync } from '../api/novels';
import { DEFAULT_CHAPTER_WORD_TARGET } from '../config/chapter-generation-options';
import type { DnaResult } from './useShuangwenDna';
import type { QuizOption, QuizQuestion } from '../data/quiz-questions';
import type { NovelGenre } from '../types';

export type DnaAnswerPayload = {
  questionId: string | number;
  question: string;
  selectedOption: string;
  type: string;
};

export type DnaFateProfile = {
  coreFate: string;
  readerPleasure: string[];
  themeTraits: string[];
  protagonistArchetype: string;
  conflictBias: string;
  emotionalTone: string;
  storyKeywords: string[];
  titleDirection: string;
  openingPromise: string;
};

export type DnaSeedIdeaCard = {
  title: string;
  synopsis: string;
  seedIdea: string;
  protagonist: string;
  world: string;
  conflict: string;
  opening: string;
  dnaBrief: string;
};

export type DnaNovelCreationInput = {
  result: DnaResult;
  questions: QuizQuestion[];
  displayOptions: QuizOption[][];
  answers: number[];
  name: string;
  gender: '男' | '女';
  theme: string;
  genre: string;
  constitutionTags: string[];
};

type DnaSeedIdeaResponse = {
  fateProfile?: DnaFateProfile;
  idea?: DnaSeedIdeaCard;
};

function buildRadar(result: DnaResult): Record<string, number> {
  return Object.fromEntries(result.dims.map(dim => [dim.key, dim.value]));
}

function buildAnswers(
  questions: QuizQuestion[],
  displayOptions: QuizOption[][],
  answers: number[],
): DnaAnswerPayload[] {
  return questions.map((question, index) => {
    const option = displayOptions[index]?.[answers[index]];
    return {
      questionId: question.id,
      question: question.question,
      selectedOption: option?.text ?? '',
      type: question.type,
    };
  }).filter(item => item.selectedOption);
}

export function useDnaNovelCreation() {
  const fateProfile = ref<DnaFateProfile | null>(null);
  const creatingNovel = ref(false);

  function buildPayload(input: DnaNovelCreationInput) {
    return {
      answers: buildAnswers(input.questions, input.displayOptions, input.answers),
      radar: buildRadar(input.result),
      name: input.name.trim(),
      gender: input.gender,
      theme: input.theme.trim(),
      genre: input.genre,
      constitutionTags: input.constitutionTags,
      fateProfile: fateProfile.value ?? undefined,
    };
  }

  function resetAiState() {
    fateProfile.value = null;
  }

  async function createNovel(input: DnaNovelCreationInput): Promise<string> {
    creatingNovel.value = true;
    try {
      const { data } = await http.post<DnaSeedIdeaResponse>('/fun/dna/seed-idea', {
        ...buildPayload(input),
        genre: input.genre,
      });
      if (data.fateProfile) fateProfile.value = data.fateProfile;
      if (!data.idea?.seedIdea) throw new Error('DNA 脑洞生成失败');

      const result = await createShuangwenAsync({
        genre: input.genre as NovelGenre,
        seedIdea: data.idea.seedIdea,
        constitutionTags: input.constitutionTags,
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
    fateProfile,
    creatingNovel,
    resetAiState,
    createNovel,
  };
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGenerateConstitution } = vi.hoisted(() => ({
  mockGenerateConstitution: vi.fn(),
}));

vi.mock('../../../../agents/constitution-master.js', () => ({
  ConstitutionMasterAgent: class {
    generateConstitution = mockGenerateConstitution;
  },
}));

import { generateAndPersistConstitution } from './constitution-service.js';

describe('generateAndPersistConstitution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bumps the version and persists through saveConstitution', async () => {
    mockGenerateConstitution.mockResolvedValue({
      version: 0,
      sourceDigest: 'digest',
      mainPromise: '关系推进',
      secondaryPromises: ['心动'],
      clauses: [],
      keywords: {
        payoffKeywords: ['心动'],
        sceneKeywords: ['同框'],
        suspenseDriftKeywords: ['调查'],
        maxSuspenseShare: 0.3,
      },
      generatedAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z',
    });

    const novelManager = {
      getNovel: vi.fn().mockResolvedValue({
        id: 'novel-1',
        genre: 'romance',
        title: '先婚后爱',
        synopsis: '先婚后爱',
        tags: ['甜宠'],
        constitutionTags: ['sweet'],
        constitution: {
          version: 2,
          sourceDigest: 'old',
          mainPromise: '旧承诺',
          secondaryPromises: [],
          clauses: [],
          keywords: {
            payoffKeywords: [],
            sceneKeywords: [],
            suspenseDriftKeywords: [],
            maxSuspenseShare: 0.5,
          },
          generatedAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:00.000Z',
        },
      }),
      saveConstitution: vi.fn(),
    };

    const constitution = await generateAndPersistConstitution({
      novel: {
        id: 'novel-1',
        genre: 'romance',
        title: '先婚后爱',
        synopsis: '先婚后爱',
        tags: ['甜宠'],
        constitutionTags: ['sweet'],
        constitution: {
          version: 2,
          sourceDigest: 'old',
          mainPromise: '旧承诺',
          secondaryPromises: [],
          clauses: [],
          keywords: {
            payoffKeywords: [],
            sceneKeywords: [],
            suspenseDriftKeywords: [],
            maxSuspenseShare: 0.5,
          },
          generatedAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:00.000Z',
        },
      } as any,
      novelManager: novelManager as any,
      modelClient: {} as any,
      source: 'auto-bootstrap',
    });

    expect(constitution.version).toBe(3);
    expect(novelManager.getNovel).toHaveBeenCalledWith('novel-1');
    expect(novelManager.saveConstitution).toHaveBeenCalledWith('novel-1', constitution, 'auto-bootstrap');
  });
});

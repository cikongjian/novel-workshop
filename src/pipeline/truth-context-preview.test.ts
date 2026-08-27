import { describe, expect, it } from 'vitest';
import type { TruthFileBundle } from '../memory/truth-files/index.js';
import {
  buildTruthContextPreview,
  isTruthContextPreviewEnabled,
} from './truth-context-preview.js';

function makeBundle(): TruthFileBundle {
  return {
    currentState: {
      chapterNumber: 15,
      characters: [
        {
          name: 'Lin Zhi',
          location: 'return van',
          goal: 'bring the blank star back to the apartment',
          goalProgress: 60,
          emotionalState: 'quiet but shaken',
          physicalCondition: 'palm marked by the star edge',
          alive: true,
          present: true,
          keyItems: ['blank star', 'note'],
          powerChange: '',
        },
        {
          name: 'Gu Yanzhou',
          location: 'return van',
          goal: 'wait for her answer',
          goalProgress: 80,
          emotionalState: 'calm pressure',
          physicalCondition: 'right shoulder injury still limits movement',
          alive: true,
          present: true,
          keyItems: ['old Z star'],
          powerChange: '',
        },
      ],
      world: {
        timelineMarker: 'day 15 evening',
        environment: 'brand event finished',
        recentChanges: [],
      },
      factions: [],
      tensionLevel: 6,
      readerQuestions: ['what will she carve'],
      nextChapterConstraints: [
        'Gu Yanzhou must not suddenly recover his right shoulder',
        'the old Z star is still on the living-room table',
      ],
      generatedAt: '2026-07-01T00:00:00.000Z',
    },
    pendingHooks: {
      currentChapter: 15,
      hooks: [
        {
          hint: 'the blank star still needs an inscription',
          plantedInChapter: 13,
          scope: 'arc',
          priority: 'high',
          chaptersElapsed: 2,
          chaptersUntilOverdue: 1,
          urgency: 'warning',
          isOverdue: false,
        },
      ],
      stats: { total: 1, critical: 0, warning: 1, normal: 0 },
      generatedAt: '2026-07-01T00:00:00.000Z',
    },
    characterMatrix: {
      revealedSecrets: [
        {
          characterName: 'Lin Zhi',
          secrets: ['she now knows he checked the old camera footage'],
        },
      ],
      hiddenSecrets: [],
      infoEdges: [
        {
          from: 'Gu Yanzhou',
          to: 'Lin Zhi',
          sharedKnowledge: ['sixteen minutes forty two seconds'],
          asymmetricKnowledge: ['why he checked the footage'],
          relationType: 'romance',
        },
      ],
      generatedAt: '2026-07-01T00:00:00.000Z',
    },
  };
}

describe('truth context preview', () => {
  it('stays enabled by default unless the feature flag explicitly disables it', () => {
    expect(isTruthContextPreviewEnabled({})).toBe(true);
    expect(isTruthContextPreviewEnabled({ ENABLE_TRUTH_CONTEXT_PREVIEW: 'true' })).toBe(true);
    expect(isTruthContextPreviewEnabled({ ENABLE_TRUTH_CONTEXT_PREVIEW: 'false' })).toBe(false);
    expect(isTruthContextPreviewEnabled({ ENABLE_TRUTH_CONTEXT_PREVIEW: '0' })).toBe(false);

    const preview = buildTruthContextPreview({
      bundle: makeBundle(),
      currentChapter: 16,
      enabled: false,
    });

    expect(preview).toEqual({ enabled: false, text: '', chars: 0, sections: [] });
  });

  it('renders compact truth context when enabled', () => {
    const preview = buildTruthContextPreview({
      bundle: makeBundle(),
      currentChapter: 16,
      enabled: true,
    });

    expect(preview.enabled).toBe(true);
    expect(preview.sections).toEqual(['currentState', 'pendingHooks', 'characterMatrix']);
    expect(preview.text).toContain('Gu Yanzhou');
    expect(preview.text).toContain('right shoulder');
    expect(preview.text).toContain('blank star still needs an inscription');
    expect(preview.text).toContain('why he checked the footage');
  });

  it('drops stale current-state context but can keep other truth sections', () => {
    const preview = buildTruthContextPreview({
      bundle: makeBundle(),
      currentChapter: 30,
      enabled: true,
    });

    expect(preview.sections).not.toContain('currentState');
    expect(preview.sections).toContain('pendingHooks');
  });

  it('trims long output to the configured budget', () => {
    const bundle = makeBundle();
    bundle.currentState!.nextChapterConstraints = Array.from({ length: 20 }, (_, index) =>
      `constraint ${index} ${'x'.repeat(80)}`,
    );

    const preview = buildTruthContextPreview({
      bundle,
      currentChapter: 16,
      enabled: true,
      maxChars: 500,
    });

    expect(preview.chars).toBeLessThanOrEqual(500);
    expect(preview.text).toContain('[trimmed for budget]');
  });
});

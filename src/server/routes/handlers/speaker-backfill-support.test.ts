import { describe, expect, it } from 'vitest';
import { buildCharacterAliasMap } from './speaker-backfill-character-support.js';
import { createMarkerNormalizers } from './speaker-backfill-marker-normalizer.js';
import { buildSpeakerSystemPrompt } from './speaker-backfill-prompt.js';
import { splitSpeakerSections } from './speaker-backfill-section-splitter.js';

describe('speaker backfill support', () => {
  it('builds alias map with title-stripped aliases', () => {
    const { nameNormMap, charInfoLines } = buildCharacterAliasMap([
      {
        name: '大元帅凌战',
        aliases: ['凌帅'],
      },
    ]);

    expect(nameNormMap.get('凌帅')).toBe('大元帅凌战');
    expect(nameNormMap.get('凌战')).toBe('大元帅凌战');
    expect(charInfoLines).toEqual(['- 大元帅凌战（别名/简称：凌帅、凌战）']);
  });

  it('normalizes aliases and fills missing speaker markers', () => {
    const characters = [
      {
        name: '大元帅凌战',
        aliases: ['凌战'],
      },
      {
        name: '苏婉',
        aliases: [],
      },
    ];
    const { nameNormMap } = buildCharacterAliasMap(characters);
    const { normalizeMarkers, fillMissingMarkers } = createMarkerNormalizers(characters, nameNormMap, true);

    expect(normalizeMarkers('( #凌战 )“来了。”')).toBe('(#大元帅凌战)“来了。”');
    expect(fillMissingMarkers('苏婉笑道，“知道了。”')).toContain('苏婉笑道，(#苏婉)“知道了。”');
  });

  it('builds prompts for both constrained and open modes', () => {
    expect(buildSpeakerSystemPrompt(true, ['- 林清风'])).toContain('可用角色列表');
    expect(buildSpeakerSystemPrompt(false, [])).toContain('临时自由识别模式');
  });

  it('splits large speaker sections by divider and paragraph', () => {
    const largeParagraph = '甲'.repeat(1200);
    const content = `${largeParagraph}\n\n${largeParagraph}\n***\n乙`;

    expect(splitSpeakerSections(content)).toEqual([
      largeParagraph,
      largeParagraph,
      '乙',
    ]);
  });
});

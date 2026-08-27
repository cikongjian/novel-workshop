import { describe, expect, it } from 'vitest';
import {
  buildPositionBackfillPrompt,
  buildTtsBackfillPrompt,
  parseBackfillJsonArray,
  selectPositionBackfillCandidates,
  selectTtsBackfillCandidates,
} from './backfill-route-support.js';

describe('character backfill route support', () => {
  const characters = [
    {
      id: '1',
      name: '林夜',
      aliases: ['阿夜'],
      role: 'protagonist',
      gender: '',
      age: undefined,
      speechStyle: '',
      position: '',
      appearance: '黑衣持刃',
      personality: '克制',
      backstory: '旧城遗民',
      currentState: '追查真相',
    },
    {
      id: '2',
      name: '苏婉',
      aliases: [],
      role: 'supporting',
      gender: '女',
      age: '青年',
      speechStyle: '温和',
      position: '医师',
      appearance: '',
      personality: '',
      backstory: '',
      currentState: '',
    },
  ] as any;

  it('selects only missing tts fields unless forced', () => {
    expect(selectTtsBackfillCandidates(characters, false).map(item => item.id)).toEqual(['1']);
    expect(selectTtsBackfillCandidates(characters, true).map(item => item.id)).toEqual(['1', '2']);
  });

  it('selects only missing positions unless forced or filtered', () => {
    expect(selectPositionBackfillCandidates(characters, false).map(item => item.id)).toEqual(['1']);
    expect(selectPositionBackfillCandidates(characters, false, ['2']).map(item => item.id)).toEqual([]);
    expect(selectPositionBackfillCandidates(characters, true, ['2']).map(item => item.id)).toEqual(['2']);
  });

  it('builds tts and position prompts with json role lists', () => {
    const ttsPrompt = buildTtsBackfillPrompt([characters[0]], false);
    const positionPrompt = buildPositionBackfillPrompt({
      novel: {
        title: '长夜余烬',
        genre: 'fantasy',
        synopsis: '废土追凶',
      },
      characters: [characters[0]],
      force: true,
    });

    expect(ttsPrompt).toContain('需要补全的字段');
    expect(ttsPrompt).toContain('"name": "林夜"');
    expect(positionPrompt).toContain('小说标题：长夜余烬');
    expect(positionPrompt).toContain('"position": "（请重新推断）"');
  });

  it('parses raw json and markdown code block json', () => {
    expect(parseBackfillJsonArray('[{\"id\":\"1\",\"position\":\"医师\"}]')).toEqual([
      { id: '1', position: '医师' },
    ]);
    expect(parseBackfillJsonArray('```json\n[{\"id\":\"2\",\"gender\":\"男\"}]\n```')).toEqual([
      { id: '2', gender: '男' },
    ]);
  });
});

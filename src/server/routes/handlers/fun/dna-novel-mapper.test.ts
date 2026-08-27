import { describe, expect, it } from 'vitest';
import { CharacterProfile, OutlineData, WorldEntry } from '../../../../novel/types.js';
import type { DnaCreateNovelBody, DnaFateProfile, DnaStoryDesign } from './dna-schemas.js';
import {
  buildDnaBlueprint,
  buildDnaCharacter,
  buildDnaEnhancedOutline,
  buildDnaWorldEntries,
} from './dna-novel-mapper.js';

const input: DnaCreateNovelBody = {
  name: '苏素琪',
  gender: '女',
  theme: '都市/现代 · 娱乐圈',
  genre: 'modern',
  title: '被雪藏后，我成了娱乐圈教母',
  constitutionTags: ['female-career', 'shame-system'],
  radar: { ambition: 90, revenge: 86 },
  answers: [
    {
      questionId: 'q1',
      question: '被羞辱时你最想怎么反击？',
      selectedOption: '当众打脸，让所有人看清实力',
      type: 'shame-system',
    },
    {
      questionId: 'q2',
      question: '你最想掌控哪种资源？',
      selectedOption: '资源、人脉和话语权',
      type: 'female-career',
    },
  ],
};

const fateProfile: DnaFateProfile = {
  coreFate: '苏素琪被雪藏后必须重建娱乐圈资源秩序',
  readerPleasure: ['female-career', 'shame-system'],
  themeTraits: ['娱乐圈', '资源置换', '公众反击'],
  protagonistArchetype: '被雪藏的女明星转型幕后操盘手',
  conflictBias: '旧资本封杀她，她反手掌控新资源',
  emotionalTone: '冷静、强目标感、每次反击都要公开兑现',
  storyKeywords: ['雪藏', '娱乐圈', '教母'],
  titleDirection: '突出雪藏后的身份反转',
  openingPromise: '第一章必须让封杀变成她夺权的入口',
  decisionEvidence: [
    {
      question: '被羞辱时你最想怎么反击？',
      selectedOption: '当众打脸，让所有人看清实力',
      storyUse: '开局发布会被羞辱后，她用一次现场救场完成公开打脸',
    },
    {
      question: '你最想掌控哪种资源？',
      selectedOption: '资源、人脉和话语权',
      storyUse: '她不再只做演员，而是开始重组资源、人脉和话语权',
    },
  ],
  characterDna: ['越被羞辱越要公开兑现战果', '优先夺回资源、人脉和话语权'],
  worldConstraints: ['娱乐圈资源由资本、热搜和项目档期共同控制', '公开羞辱必须带来舆论代价'],
  openingObligations: ['首章出现雪藏压迫', '前三章完成一次公开打脸'],
};

const design: DnaStoryDesign = {
  title: '被雪藏后，我成了娱乐圈教母',
  genre: 'modern',
  synopsis: '苏素琪被雪藏后，从台前退到幕后，重写娱乐圈资源规则。',
  sellingPoint: '封杀她的人以为她退场，她却开始决定谁能上桌。',
  protagonist: {
    name: '苏素琪',
    gender: '女',
    role: 'protagonist',
    personality: '冷静、强目标感、公开反击',
    appearance: '',
    backstory: '被资本雪藏后仍握着关键人脉。',
    goal: '建立自己的娱乐资源联盟',
    dnaTraits: ['公开打脸', '掌控资源、人脉和话语权'],
    weakness: '对公开羞辱零容忍',
    belief: '只有掌握资源分配权，才算真正翻身',
  },
  storyBlueprint: {
    premise: '雪藏不是终点，而是幕后夺权的开始。',
    mainConflict: '旧资本封杀她，新人和粉丝都在等她证明价值。',
    worldview: '娱乐圈里资源、人脉、热搜和项目档期决定命运。',
    powerSystem: '资源置换、舆论战、项目操盘',
    backgroundCharter: ['娱乐圈资源由资本、热搜和项目档期共同控制', '公开羞辱必须带来舆论代价'],
    characterDnaRules: ['公开打脸', '掌控资源、人脉和话语权'],
    decisionMappings: [
      {
        source: '被羞辱时你最想怎么反击？ -> 当众打脸，让所有人看清实力',
        novelUse: '开局发布会被羞辱后，她用一次现场救场完成公开打脸',
      },
      {
        source: '你最想掌控哪种资源？ -> 资源、人脉和话语权',
        novelUse: '她不再只做演员，而是开始重组资源、人脉和话语权',
      },
    ],
    openingHook: '发布会上被当众切割，她反手救下濒临翻车的直播。',
    volumeArc: '第一卷从雪藏危机推进到幕后资源联盟成型。',
    chapterOutline: [
      {
        chapterNumber: 1,
        title: '雪藏发布会',
        summary: '她被当众羞辱，却用现场救场完成第一次公开打脸。',
      },
      {
        chapterNumber: 2,
        title: '谁能上桌',
        summary: '她开始重组资源、人脉和话语权。',
      },
    ],
  },
};

describe('dna novel mapper', () => {
  it('persists question choices into blueprint, character, world, and outline', () => {
    const blueprint = buildDnaBlueprint(input, fateProfile, design);
    const character = buildDnaCharacter(input, fateProfile, design);
    const worldEntries = buildDnaWorldEntries(input, fateProfile, design);
    const outline = buildDnaEnhancedOutline(design);

    expect(blueprint).toMatchObject({
      dna: {
        answers: input.answers,
        decisionEvidence: fateProfile.decisionEvidence,
        decisionMappings: design.storyBlueprint.decisionMappings,
      },
    });
    expect(JSON.stringify(character)).toContain('资源、人脉和话语权');
    expect(JSON.stringify(character)).toContain('公开打脸');
    expect(JSON.stringify(worldEntries)).toContain('娱乐圈资源由资本、热搜和项目档期共同控制');
    expect(JSON.stringify(worldEntries)).toContain('被羞辱时你最想怎么反击');
    expect(outline.chapters[0]?.notes).toContain('当众打脸');
    expect(outline.chapters[1]?.keyEvents.join('\n')).toContain('资源、人脉和话语权');
    expect(() => CharacterProfile.parse(character)).not.toThrow();
    expect(() => OutlineData.parse(outline)).not.toThrow();
    expect(() => worldEntries.forEach(entry => WorldEntry.parse(entry))).not.toThrow();
  });
});

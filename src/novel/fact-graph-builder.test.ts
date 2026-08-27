import { describe, expect, it } from 'vitest';
import { extractFactsFromChapter } from './fact-graph-builder.js';

describe('fact-graph builder attribution', () => {
  it('assigns death to the character nearest to the death phrase', () => {
    const facts = extractFactsFromChapter({
      chapterContent: '林城眼睁睁看着赵岳当场身亡，四周顿时一片死寂。',
      chapterNumber: 12,
      characterNames: ['林城', '赵岳'],
    });

    expect(facts.characterStateChanges).toHaveLength(1);
    expect(facts.characterStateChanges[0]?.characterName).toBe('赵岳');
    expect(facts.characterStateChanges[0]?.newState).toBe('dead');
    expect(facts.factEvents.some(event => event.eventType === 'state-change' && event.entityName === '赵岳')).toBe(true);
  });

  it('inherits a single subject from the adjacent sentence for physical death evidence', () => {
    const facts = extractFactsFromChapter({
      chapterContent: '王厉瞪大眼睛，踉跄着后退。喉咙发出咕噜声，身体往后倒，抽搐两下便不动了。“杀人了，王厉死了！”',
      chapterNumber: 1,
      characterNames: ['王厉'],
    });

    expect(facts.characterStateChanges).toContainEqual(expect.objectContaining({
      characterName: '王厉',
      newState: 'dead',
      certainty: 'confirmed',
      sourceType: 'direct',
    }));
  });

  it('does not inherit an ambiguous subject from a sentence with multiple characters', () => {
    const facts = extractFactsFromChapter({
      chapterContent: '王厉抓住赵岳，两人一同滚下石阶。身体抽搐两下便不动了。',
      chapterNumber: 1,
      characterNames: ['王厉', '赵岳'],
    });

    expect(facts.characterStateChanges).toEqual([]);
  });

  it('extracts an explicit resurrection as alive instead of another death', () => {
    const facts = extractFactsFromChapter({
      chapterContent: '王厉被灵丹救活，重新苏醒后推门走出静室。',
      chapterNumber: 5,
      characterNames: ['王厉'],
    });

    expect(facts.characterStateChanges).toContainEqual(expect.objectContaining({
      characterName: '王厉',
      newState: 'alive',
      certainty: 'confirmed',
    }));
    expect(facts.characterStateChanges.some(change => change.newState === 'dead')).toBe(false);
  });

  it('does not treat lexical death compounds as character deaths', () => {
    const facts = extractFactsFromChapter({
      chapterContent: '刘驼子眼神一沉：“找死。”齐安会带人封死东路。黄三说矿难埋死了两个矿工。',
      chapterNumber: 5,
      characterNames: ['刘驼子', '齐安', '黄三'],
    });

    expect(facts.characterStateChanges.filter(change => change.newState === 'dead')).toEqual([]);
  });

  it('does not inherit an attacker as the unnamed victim in the next sentence', () => {
    const facts = extractFactsFromChapter({
      chapterContent: '周元一拳轰在狼头侧面。年轻狼飞进乱石堆，四肢抽搐两下不动了。',
      chapterNumber: 5,
      characterNames: ['周元'],
    });

    expect(facts.characterStateChanges.filter(change => change.newState === 'dead')).toEqual([]);
  });

  it('keeps possessive references offstage when another character performs the action', () => {
    const facts = extractFactsFromChapter({
      chapterContent: '周元伸手入怀，摸出王厉储物袋里的一张障眼符。',
      chapterNumber: 3,
      characterNames: ['周元', '王厉'],
    });
    const appearances = Object.fromEntries(
      facts.characterAppearances.map(appearance => [appearance.characterName, appearance.mentionType]),
    );

    expect(appearances).toMatchObject({ 周元: 'onstage', 王厉: 'reference' });
  });

  it('assigns location arrival to the character nearest to the arrival verb', () => {
    const facts = extractFactsFromChapter({
      chapterContent: '林城远远望着赵岳进入祖祠，自己却停在门外。',
      chapterNumber: 13,
      characterNames: ['林城', '赵岳'],
    });

    expect(facts.locationVisits).toHaveLength(1);
    expect(facts.locationVisits[0]?.characterName).toBe('赵岳');
    expect(facts.locationVisits[0]?.location).toBe('祖祠');
    expect(facts.factEvents.some(event => event.eventType === 'location-visit' && event.entityName === '祖祠')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { inferStateCertainty } from './fact-graph-semantics.js';

describe('fact graph death certainty', () => {
  it('keeps explicit death statements confirmed even when the mention is classified as a reference', () => {
    expect(inferStateCertainty('dead', '王厉当场身亡', 'reference')).toBe('confirmed');
  });

  it('does not promote rumors or dreams to confirmed deaths', () => {
    expect(inferStateCertainty('dead', '有人说王厉已经死了', 'reference')).toBe('rumored');
    expect(inferStateCertainty('dead', '他梦见王厉当场身亡', 'dream')).toBe('suspected');
  });
});

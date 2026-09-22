import { describe, it, expect } from 'vitest';
import { newAssessment, totalCount, groupsFound, hasFindings, STEPS } from './assessment.js';

describe('assessment model', () => {
  it('creates a blank assessment', () => {
    const a = newAssessment('seed-1');
    expect(a.streamId).toBe('seed-1');
    expect(a.counts).toEqual({});
    expect(typeof a.createdAt).toBe('string');
  });

  it('totalCount sums all recorded organisms', () => {
    expect(totalCount({ mayfly: 3, worm: 2 })).toBe(5);
    expect(totalCount({})).toBe(0);
  });

  it('groupsFound counts distinct groups with count >= 1', () => {
    expect(groupsFound({ mayfly: 3, worm: 0, snail: 1 })).toBe(2);
    expect(groupsFound({})).toBe(0);
  });

  it('hasFindings is true only when at least one group is found', () => {
    expect(hasFindings({})).toBe(false);
    expect(hasFindings({ mayfly: 0 })).toBe(false);
    expect(hasFindings({ mayfly: 1 })).toBe(true);
  });

  it('the core three steps are always ready', () => {
    const core = STEPS.filter((s) => ['stream', 'assess', 'result'].includes(s.key));
    expect(core.every((s) => s.ready)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { scoreAssessment, classify, CLASSES } from './biotic-index.js';
import { getTaxon, TAXA } from './taxa.js';

describe('scoreAssessment', () => {
  it('returns null score when nothing is recorded', () => {
    const r = scoreAssessment({});
    expect(r.score).toBeNull();
    expect(r.classKey).toBeNull();
    expect(r.richness).toBe(0);
  });

  it('treats count 0 as "not found"', () => {
    const r = scoreAssessment({ mayfly: 0, worm: 0 });
    expect(r.richness).toBe(0);
    expect(r.score).toBeNull();
  });

  it('scores a single sensitive group as that group sensitivity', () => {
    const r = scoreAssessment({ stonefly: 3 });
    expect(r.richness).toBe(1);
    expect(r.score).toBe(getTaxon('stonefly').sensitivity); // 10
    expect(r.classKey).toBe('natural');
  });

  it('averages sensitivity across the groups found (presence, not count)', () => {
    // stonefly(10) + mayfly(9) + caddisfly(8) => mean 9.0
    const r = scoreAssessment({ stonefly: 1, mayfly: 50, caddisfly: 2 });
    expect(r.richness).toBe(3);
    expect(r.score).toBe(9.0);
    expect(r.classKey).toBe('natural');
  });

  it('count does not change the score, only presence does', () => {
    const a = scoreAssessment({ mayfly: 1, worm: 1 });
    const b = scoreAssessment({ mayfly: 999, worm: 1 });
    expect(a.score).toBe(b.score);
  });

  it('tolerant-only community scores very poor', () => {
    // worm(1) + bloodworm(2) + leech(2) => mean 1.67 -> very_poor
    const r = scoreAssessment({ worm: 5, bloodworm: 5, leech: 2 });
    expect(r.score).toBeCloseTo(1.7, 1);
    expect(r.classKey).toBe('very_poor');
  });

  it('mixed community lands in a middle class', () => {
    // mayfly(9) + snail(4) + worm(1) => mean 4.67 -> fair
    const r = scoreAssessment({ mayfly: 1, snail: 1, worm: 1 });
    expect(r.score).toBeCloseTo(4.7, 1);
    expect(r.classKey).toBe('fair');
  });

  it('lists contributions for every group found', () => {
    const r = scoreAssessment({ mayfly: 2, worm: 3 });
    expect(r.contributions).toHaveLength(2);
    const ids = r.contributions.map((c) => c.id).sort();
    expect(ids).toEqual(['mayfly', 'worm']);
    expect(r.contributions.find((c) => c.id === 'mayfly').count).toBe(2);
  });

  it('ignores unknown taxon ids gracefully', () => {
    const r = scoreAssessment({ mayfly: 1, not_a_real_bug: 9 });
    expect(r.richness).toBe(1);
    expect(r.score).toBe(9);
  });
});

describe('classify', () => {
  it('maps boundary scores to the correct class', () => {
    expect(classify(10).key).toBe('natural');
    expect(classify(7.5).key).toBe('natural');
    expect(classify(7.4).key).toBe('good');
    expect(classify(6.0).key).toBe('good');
    expect(classify(4.5).key).toBe('fair');
    expect(classify(3.0).key).toBe('poor');
    expect(classify(2.9).key).toBe('very_poor');
    expect(classify(0).key).toBe('very_poor');
  });

  it('every class has the required fields', () => {
    for (const c of CLASSES) {
      expect(c).toHaveProperty('key');
      expect(c).toHaveProperty('label');
      expect(c).toHaveProperty('color');
      expect(c).toHaveProperty('blurb');
      expect(typeof c.min).toBe('number');
    }
  });
});

describe('taxa data integrity', () => {
  it('every taxon has a unique id', () => {
    const ids = TAXA.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sensitivity weights are within the 1..10 scale', () => {
    for (const t of TAXA) {
      expect(t.sensitivity).toBeGreaterThanOrEqual(1);
      expect(t.sensitivity).toBeLessThanOrEqual(10);
    }
  });

  it('covers all three tiers', () => {
    const tiers = new Set(TAXA.map((t) => t.tier));
    expect(tiers).toContain('sensitive');
    expect(tiers).toContain('moderate');
    expect(tiers).toContain('tolerant');
  });
});

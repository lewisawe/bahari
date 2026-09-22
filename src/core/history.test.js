import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadUserHistory,
  saveAssessment,
  clearUserHistory,
  mergedHistory,
  trend,
} from './history.js';

// in-memory storage stub implementing the localStorage interface
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe('user history persistence', () => {
  let store;
  beforeEach(() => {
    store = memStorage();
  });

  it('starts empty', () => {
    expect(loadUserHistory(store)).toEqual({});
  });

  it('saves and reloads an assessment under a stream', () => {
    saveAssessment('seed-1', { date: '2026-07-01', score: 7.2, classKey: 'good' }, store);
    const all = loadUserHistory(store);
    expect(all['seed-1']).toHaveLength(1);
    expect(all['seed-1'][0].mine).toBe(true);
    expect(all['seed-1'][0].score).toBe(7.2);
  });

  it('appends multiple assessments in order', () => {
    saveAssessment('seed-1', { date: '2026-06-01', score: 5 }, store);
    saveAssessment('seed-1', { date: '2026-07-01', score: 7 }, store);
    expect(loadUserHistory(store)['seed-1']).toHaveLength(2);
  });

  it('clears history', () => {
    saveAssessment('seed-1', { date: '2026-07-01', score: 7 }, store);
    clearUserHistory(store);
    expect(loadUserHistory(store)).toEqual({});
  });

  it('degrades gracefully with no storage', () => {
    expect(loadUserHistory(null)).toEqual({});
    // should not throw
    expect(() => saveAssessment('x', { date: '2026-01-01', score: 1 }, null)).not.toThrow();
  });
});

describe('mergedHistory', () => {
  it('merges seed + user entries sorted by date, tagging provenance', () => {
    const seed = [{ date: '2026-05-01', score: 4 }];
    const mine = [{ date: '2026-07-01', score: 7 }, { date: '2026-06-01', score: 5 }];
    const merged = mergedHistory(seed, mine);
    expect(merged.map((e) => e.date)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01']);
    expect(merged[0].synthetic).toBe(true);
    expect(merged[2].mine).toBe(true);
  });
});

describe('trend', () => {
  it('reports insufficient with < 2 points', () => {
    expect(trend([{ score: 5 }]).direction).toBe('insufficient');
    expect(trend([]).direction).toBe('insufficient');
  });

  it('detects improvement', () => {
    const t = trend([{ score: 4 }, { score: 5 }, { score: 7 }]);
    expect(t.direction).toBe('improving');
    expect(t.delta).toBe(3);
  });

  it('detects decline', () => {
    const t = trend([{ score: 8 }, { score: 5 }]);
    expect(t.direction).toBe('declining');
    expect(t.delta).toBe(-3);
  });

  it('treats small change as stable', () => {
    expect(trend([{ score: 6 }, { score: 6.2 }]).direction).toBe('stable');
  });

  it('ignores null scores', () => {
    const t = trend([{ score: null }, { score: 4 }, { score: 6 }]);
    expect(t.points).toEqual([4, 6]);
    expect(t.direction).toBe('improving');
  });
});

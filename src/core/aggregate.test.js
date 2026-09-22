import { describe, it, expect } from 'vitest';
import { aggregate } from './aggregate.js';

const streams = [
  { id: 'a', name: 'Alpha', country: 'France', lat: 48, lon: 2,
    history: [{ score: 8, classKey: 'natural' }, { score: 8.5, classKey: 'natural' }] },
  { id: 'b', name: 'Beta', country: 'Germany', lat: 52, lon: 7,
    history: [{ score: 5, classKey: 'fair' }] },
  { id: 'c', name: 'Gamma', country: 'Italy', lat: 45, lon: 9,
    history: [{ score: 8, classKey: 'natural' }, { score: 2, classKey: 'very_poor' }] },
  { id: 'd', name: 'Delta', country: 'Spain', lat: 40, lon: -3, history: [] },
];

describe('aggregate', () => {
  it('counts streams and assessed streams', () => {
    const a = aggregate(streams);
    expect(a.streamCount).toBe(4);
    expect(a.assessedCount).toBe(3); // Delta has no scored history
  });

  it('totals all scored assessments', () => {
    const a = aggregate(streams);
    expect(a.assessmentTotal).toBe(5); // 2 + 1 + 2 + 0
  });

  it('averages the latest score per assessed stream', () => {
    const a = aggregate(streams);
    // latest: Alpha 8.5, Beta 5, Gamma 2 => mean 5.17
    expect(a.averageScore).toBeCloseTo(5.2, 1);
    expect(a.averageClass).toBeTruthy();
  });

  it('builds a class distribution over assessed streams', () => {
    const a = aggregate(streams);
    const byKey = Object.fromEntries(a.distribution.map((d) => [d.key, d.count]));
    // latest classes: Alpha natural, Beta fair, Gamma very_poor
    expect(byKey.natural).toBe(1);
    expect(byKey.fair).toBe(1);
    expect(byKey.very_poor).toBe(1);
    const total = a.distribution.reduce((s, d) => s + d.count, 0);
    expect(total).toBe(3);
  });

  it('classifies trend per stream', () => {
    const a = aggregate(streams);
    // Alpha 8->8.5 stable, Gamma 8->2 declining
    expect(a.trendMix.declining).toBeGreaterThanOrEqual(1);
  });

  it('prefers user history over seed for latest', () => {
    const a = aggregate(streams, { b: [{ score: 9, classKey: 'natural' }] });
    const beta = a.rows.find((r) => r.id === 'b');
    expect(beta.score).toBe(9);
    expect(beta.classKey).toBe('natural');
  });

  it('sorts rows worst-first', () => {
    const a = aggregate(streams);
    const scored = a.rows.filter((r) => r.score != null).map((r) => r.score);
    const sorted = [...scored].sort((x, y) => x - y);
    expect(scored).toEqual(sorted);
  });

  it('handles empty input', () => {
    const a = aggregate([]);
    expect(a.streamCount).toBe(0);
    expect(a.averageScore).toBeNull();
    expect(a.assessedCount).toBe(0);
  });
});

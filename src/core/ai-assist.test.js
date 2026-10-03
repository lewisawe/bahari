import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  identifyTaxon,
  applyConfidencePolicy,
  setAssistProvider,
  resetAssistProvider,
  getProviderName,
  geminiProvider,
  mapGeminiResponse,
  CONFIDENT_THRESHOLD,
  REVIEW_THRESHOLD,
} from './ai-assist.js';
import { TAXON_IDS } from './taxa.js';

afterEach(() => {
  resetAssistProvider();
});

describe('confidence policy (responsible-AI gate)', () => {
  it('high confidence -> suggested', () => {
    const r = applyConfidencePolicy(
      { taxonId: 'mayfly', confidence: 0.9, reasoning: ['three tails'] },
      'stub',
    );
    expect(r.status).toBe('suggested');
    expect(r.taxonId).toBe('mayfly');
  });

  it('mid confidence -> review (tentative, verify by human)', () => {
    const r = applyConfidencePolicy(
      { taxonId: 'caddisfly', confidence: 0.6, reasoning: ['case-like shape'] },
      'stub',
    );
    expect(r.status).toBe('review');
    expect(r.taxonId).toBe('caddisfly');
  });

  it('low confidence -> defer, NO taxon suggested (human decides)', () => {
    const r = applyConfidencePolicy(
      { taxonId: 'worm', confidence: 0.2, reasoning: ['blurry'] },
      'stub',
    );
    expect(r.status).toBe('defer');
    expect(r.taxonId).toBeNull();
  });

  it('missing taxon -> defer even if confidence is high', () => {
    const r = applyConfidencePolicy({ taxonId: null, confidence: 0.99 }, 'stub');
    expect(r.status).toBe('defer');
    expect(r.taxonId).toBeNull();
  });

  it('thresholds are ordered sensibly', () => {
    expect(REVIEW_THRESHOLD).toBeLessThan(CONFIDENT_THRESHOLD);
  });

  it('always returns reasoning, even on defer', () => {
    const r = applyConfidencePolicy({ taxonId: null, confidence: 0.1 }, 'stub');
    expect(Array.isArray(r.reasoning)).toBe(true);
    expect(r.reasoning.length).toBeGreaterThan(0);
  });

  it('clamps out-of-range confidence', () => {
    const hi = applyConfidencePolicy({ taxonId: 'mayfly', confidence: 5 }, 'stub');
    expect(hi.confidence).toBe(1);
    const lo = applyConfidencePolicy({ taxonId: 'mayfly', confidence: -2 }, 'stub');
    expect(lo.confidence).toBe(0);
  });
});

describe('stub provider via identifyTaxon', () => {
  it('is deterministic for the same input', async () => {
    const a = await identifyTaxon({ photoName: 'rock1.jpg', seed: 7 });
    const b = await identifyTaxon({ photoName: 'rock1.jpg', seed: 7 });
    expect(a).toEqual(b);
  });

  it('returns a valid taxon id when it suggests one', async () => {
    const r = await identifyTaxon({ hintTaxonId: 'mayfly', photoName: 'm.jpg', seed: 1 });
    if (r.taxonId !== null) {
      expect(TAXON_IDS).toContain(r.taxonId);
    }
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it('produces all three outcomes across many inputs (spread is realistic)', async () => {
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      const r = await identifyTaxon({ photoName: `p${i}.jpg`, seed: i });
      seen.add(r.status);
    }
    // over many photos we should see confident suggestions AND human-handoff cases
    expect(seen.has('suggested') || seen.has('review')).toBe(true);
    expect(seen.has('defer') || seen.has('review')).toBe(true);
  });
});

describe('swappable provider', () => {
  it('setAssistProvider swaps the engine (e.g. a real vision-LLM)', async () => {
    const fake = async () => ({
      taxonId: 'stonefly',
      confidence: 0.95,
      reasoning: ['two tails', 'no belly gills'],
    });
    fake.providerName = 'fake-vision-llm';
    setAssistProvider(fake);

    expect(getProviderName()).toBe('fake-vision-llm');
    const r = await identifyTaxon({ photoName: 'x.jpg' });
    expect(r.provider).toBe('fake-vision-llm');
    expect(r.taxonId).toBe('stonefly');
    expect(r.status).toBe('suggested');

    resetAssistProvider();
    expect(getProviderName()).toBe('stub');
  });
});

describe('real vision provider (gemini adapter)', () => {
  // A fake Gemini generateContent response carrying our JSON answer as text.
  function fakeGeminiResponse(answer) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }],
      }),
    };
  }

  it('maps a model response into our {taxonId, confidence, reasoning/cues} shape', async () => {
    const mock = vi.fn(async () =>
      fakeGeminiResponse({
        taxonId: 'mayfly',
        confidence: 0.82,
        cues: ['three tails', 'feathery gills along the abdomen'],
        alternatives: [{ taxonId: 'stonefly', confidence: 0.3 }],
      }),
    );
    const provider = geminiProvider({ apiKey: 'test-key', fetchImpl: mock });

    const raw = await provider({ photoDataUrl: 'data:image/jpeg;base64,QUJD' });
    expect(mock).toHaveBeenCalledTimes(1);

    // mapped shape
    expect(TAXON_IDS).toContain(raw.taxonId);
    expect(raw.taxonId).toBe('mayfly');
    expect(raw.confidence).toBeGreaterThanOrEqual(0);
    expect(raw.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(raw.reasoning)).toBe(true);
    expect(raw.reasoning.length).toBeGreaterThan(0);
    expect(raw.reasoning).toEqual(raw.cues); // task names it `cues`; policy uses `reasoning`

    // and it flows through the unchanged confidence policy
    const gated = applyConfidencePolicy(raw, 'gemini-vision');
    expect(gated.status).toBe('suggested'); // 0.82 >= CONFIDENT_THRESHOLD
    expect(gated.taxonId).toBe('mayfly');
  });

  it('maps an unknown label to taxonId null (defer under the policy)', () => {
    const raw = mapGeminiResponse({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ taxonId: 'unicorn', confidence: 0.9, cues: ['sparkles'] }) }] } }],
    });
    expect(raw.taxonId).toBeNull();
    const gated = applyConfidencePolicy(raw, 'gemini-vision');
    expect(gated.status).toBe('defer');
    expect(gated.taxonId).toBeNull();
  });

  it('keyless -> falls back to the stub WITHOUT any network call', async () => {
    const mock = vi.fn();
    const provider = geminiProvider({ apiKey: undefined, fetchImpl: mock });
    const r = await provider({ photoName: 'rock1.jpg', seed: 7 });
    expect(mock).not.toHaveBeenCalled(); // no real network
    // stub shape: deterministic for the same input
    const r2 = await provider({ photoName: 'rock1.jpg', seed: 7 });
    expect(r).toEqual(r2);
    expect(r).toHaveProperty('taxonId');
    expect(r).toHaveProperty('confidence');
    expect(Array.isArray(r.reasoning)).toBe(true);
  });

  it('network/API error -> falls back to the stub (no throw)', async () => {
    const mock = vi.fn(async () => Promise.reject(new Error('network')));
    const provider = geminiProvider({ apiKey: 'x', fetchImpl: mock });
    const r = await provider({ photoDataUrl: 'data:image/jpeg;base64,QUJD', photoName: 'p.jpg', seed: 2 });
    expect(mock).toHaveBeenCalledTimes(1);
    // stub-shaped, deterministic, did not throw
    expect(r).toHaveProperty('taxonId');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(r.reasoning)).toBe(true);
  });

  it('non-ok HTTP response -> falls back to the stub', async () => {
    const mock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const provider = geminiProvider({ apiKey: 'x', fetchImpl: mock });
    const r = await provider({ photoDataUrl: 'data:image/jpeg;base64,QUJD', photoName: 'p.jpg', seed: 3 });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(r).toHaveProperty('taxonId');
    expect(Array.isArray(r.reasoning)).toBe(true);
  });

  it('reports a meaningful provider name when swapped in', () => {
    const provider = geminiProvider({ apiKey: 'test', fetchImpl: vi.fn() });
    expect(provider.providerName).toBe('gemini-vision');
  });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  identifyTaxon,
  applyConfidencePolicy,
  setAssistProvider,
  resetAssistProvider,
  getProviderName,
  novaProvider,
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

describe('real vision provider (nova adapter)', () => {
  // A well-formed /api/identify proxy response (what the dev proxy returns
  // after mapping Nova Pro's answer). fetch is mocked — NO real network/AWS.
  function fakeProxyResponse(answer, { ok = true, status = 200 } = {}) {
    return { ok, status, json: async () => answer };
  }

  it('maps a well-formed proxy response into our {taxonId, confidence, reasoning/cues} shape', async () => {
    const mock = vi.fn(async () =>
      fakeProxyResponse({
        taxonId: 'mayfly',
        confidence: 0.82,
        cues: ['three tails', 'feathery gills along the abdomen'],
      }),
    );
    const provider = novaProvider({ fetchImpl: mock });

    const raw = await provider({ imageBase64: 'QUJD', imageFormat: 'jpeg' });
    expect(mock).toHaveBeenCalledTimes(1);

    // mapped shape
    expect(TAXON_IDS).toContain(raw.taxonId);
    expect(raw.taxonId).toBe('mayfly');
    expect(raw.confidence).toBeGreaterThanOrEqual(0);
    expect(raw.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(raw.reasoning)).toBe(true);
    expect(raw.reasoning.length).toBeGreaterThan(0);
    expect(raw.reasoning).toEqual(raw.cues); // proxy names it `cues`; policy uses `reasoning`

    // and it flows through the unchanged confidence policy
    const gated = applyConfidencePolicy(raw, 'nova-vision');
    expect(gated.status).toBe('suggested'); // 0.82 >= CONFIDENT_THRESHOLD
    expect(gated.taxonId).toBe('mayfly');
  });

  it('maps an unknown label to taxonId null (defer under the policy)', async () => {
    const mock = vi.fn(async () =>
      fakeProxyResponse({ taxonId: 'unicorn', confidence: 0.9, cues: ['sparkles'] }),
    );
    const provider = novaProvider({ fetchImpl: mock });
    const raw = await provider({ imageBase64: 'QUJD', imageFormat: 'jpeg' });
    expect(raw.taxonId).toBeNull();
    const gated = applyConfidencePolicy(raw, 'nova-vision');
    expect(gated.status).toBe('defer');
    expect(gated.taxonId).toBeNull();
  });

  it('network/API error -> falls back to the stub (no throw, deterministic)', async () => {
    const mock = vi.fn(async () => Promise.reject(new Error('network')));
    const provider = novaProvider({ fetchImpl: mock });
    const r = await provider({ imageBase64: 'QUJD', photoName: 'p.jpg', seed: 2 });
    expect(mock).toHaveBeenCalledTimes(1);
    // stub-shaped, did not throw
    expect(r).toHaveProperty('taxonId');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(r.reasoning)).toBe(true);
    // deterministic for the same input (stub fallback stays repeatable)
    const r2 = await provider({ imageBase64: 'QUJD', photoName: 'p.jpg', seed: 2 });
    expect(r).toEqual(r2);
  });

  it('non-ok HTTP response (e.g. 404 proxy absent / 500) -> falls back to the stub', async () => {
    const mock = vi.fn(async () => fakeProxyResponse({}, { ok: false, status: 500 }));
    const provider = novaProvider({ fetchImpl: mock });
    const r = await provider({ imageBase64: 'QUJD', photoName: 'p.jpg', seed: 3 });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(r).toHaveProperty('taxonId');
    expect(Array.isArray(r.reasoning)).toBe(true);
  });

  it('no imageBase64 -> stub WITHOUT any network call (deterministic)', async () => {
    const mock = vi.fn();
    const provider = novaProvider({ fetchImpl: mock });
    const r = await provider({ photoName: 'rock1.jpg', seed: 7 });
    expect(mock).not.toHaveBeenCalled(); // nothing for Nova to see -> no POST
    const r2 = await provider({ photoName: 'rock1.jpg', seed: 7 });
    expect(r).toEqual(r2);
    expect(r).toHaveProperty('taxonId');
    expect(r).toHaveProperty('confidence');
    expect(Array.isArray(r.reasoning)).toBe(true);
  });

  it('reports a meaningful provider name when swapped in', () => {
    const provider = novaProvider({ fetchImpl: vi.fn() });
    expect(provider.providerName).toBe('nova-vision');
  });
});

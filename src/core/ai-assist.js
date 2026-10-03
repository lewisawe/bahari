// Bahari — explainable, human-in-the-loop identification assist.
// Human counts remain authoritative. Providers return advisory evidence only.

import { TAXA, getTaxon } from './taxa.js';

export const CONFIDENT_THRESHOLD = 0.75;
export const REVIEW_THRESHOLD = 0.5;

const NOVA_DEFAULT_ENDPOINT = '/api/identify';
const NOVA_TIMEOUT_MS = 15_000;
const MAX_CUES = 8;
const MAX_CUE_LENGTH = 200;
const MAX_ALTERNATIVES = 5;

let provider = stubProvider;

export function setAssistProvider(fn) {
  provider = fn;
}

export function resetAssistProvider() {
  provider = stubProvider;
}

export function getProviderName() {
  return provider.providerName || 'stub';
}

export function novaProvider(opts = {}) {
  const { fetchImpl, endpoint = NOVA_DEFAULT_ENDPOINT } = opts;
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : undefined);

  async function fn(input = {}) {
    if (!doFetch || !input.imageBase64) return fallbackResult(input);

    const controller = new AbortController();
    let timeoutFired = false;
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        timeoutFired = true;
        controller.abort();
        const error = new Error('Nova request timed out');
        error.name = 'AbortError';
        reject(error);
      }, NOVA_TIMEOUT_MS);
    });

    try {
      const response = await Promise.race([
        doFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: input.imageBase64,
            imageFormat: input.imageFormat,
          }),
          signal: controller.signal,
        }),
        timeout,
      ]);
      if (!response?.ok) return fallbackResult(input);

      const data = await response.json();
      if (!isNovaGuess(data)) return fallbackResult(input);

      const cues = normalizeCues(data.cues);
      return {
        taxonId: normalizeKnownId(data.taxonId),
        confidence: clamp01(data.confidence),
        reasoning: cues,
        cues,
        alternatives: [],
        provider: 'nova-vision',
      };
    } catch (error) {
      // Only an AbortError raised after this provider's timer fires is its
      // 15-second timeout. Other aborts remain ordinary transport failures.
      if (error?.name === 'AbortError' && timeoutFired) return fallbackResult(input);
      return fallbackResult(input);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  fn.providerName = 'nova-vision';
  return fn;
}

function isNovaGuess(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (value.taxonId === null || typeof value.taxonId === 'string') &&
    typeof value.confidence === 'number' && Number.isFinite(value.confidence) &&
    (value.cues === undefined ||
      (Array.isArray(value.cues) && value.cues.every((cue) => typeof cue === 'string')));
}

function normalizeKnownId(label) {
  if (typeof label !== 'string') return null;
  const id = label.trim().toLowerCase();
  return getTaxon(id) ? id : null;
}

function normalizeCues(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((cue) => typeof cue === 'string' ? cue.trim().slice(0, MAX_CUE_LENGTH) : '')
    .filter(Boolean)
    .slice(0, MAX_CUES);
}

export async function identifyTaxon(input = {}) {
  const raw = await provider(input);
  return applyConfidencePolicy(raw, raw?.provider);
}

export function applyConfidencePolicy(raw, providerName = raw?.provider || 'stub') {
  const confidence = clamp01(raw?.confidence ?? 0);
  const taxonId = normalizeKnownId(raw?.taxonId);
  const reasoning = normalizeCues(raw?.reasoning ?? raw?.cues);
  const alternatives = Array.isArray(raw?.alternatives)
    ? raw.alternatives
      .map((alternative) => ({
        taxonId: normalizeKnownId(alternative?.taxonId),
        confidence: clamp01(alternative?.confidence),
      }))
      .filter((alternative) => alternative.taxonId)
      .slice(0, MAX_ALTERNATIVES)
    : [];

  if (!taxonId || confidence < REVIEW_THRESHOLD) {
    return {
      status: 'defer',
      taxonId: null,
      confidence,
      reasoning: reasoning.length > 0
        ? reasoning
        : ['The image is unclear or ambiguous. A person should decide this one.'],
      alternatives,
      provider: providerName,
    };
  }

  return {
    status: confidence >= CONFIDENT_THRESHOLD ? 'suggested' : 'review',
    taxonId,
    confidence,
    reasoning,
    alternatives,
    provider: providerName,
  };
}

function clamp01(value) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, number));
}

const CUES = {
  stonefly: ['Two long tails visible', 'Two claws on each leg', 'No gills along the belly'],
  mayfly: ['Three tails detected', 'Feathery gills along the abdomen', 'Slender streamlined body'],
  caddisfly: ['Appears to carry a case of sand/plant bits', 'Soft grub-like body', 'Legs clustered at the front'],
  riffle_beetle: ['Hard rounded shell', 'Short legs', 'Small, crawling on a stone'],
  dragonfly: ['Large eyes', 'Sturdy segmented body', 'Broad abdomen'],
  freshwater_shrimp: ['Body flattened side-to-side', 'Curved "C" posture', 'Many small legs'],
  snail: ['Coiled shell', 'Muscular foot', 'Slow glide posture'],
  true_fly_larva: ['Soft legless grub', 'Segmented body', 'No obvious tails'],
  leech: ['Flattened stretchy body', 'Sucker at the ends', 'No legs'],
  bloodworm: ['Bright red colour', 'Thin worm-like body', 'Figure-of-eight wriggle'],
  worm: ['Very thin thread-like body', 'No legs or gills', 'Found in silt'],
};

function stubProvider(input = {}) {
  const seedString = `${input.photoName || ''}${input.seed ?? ''}`;
  const random = mulberry32(hashString(seedString) || (Date.now() & 0xffff));
  let primaryId = TAXA[Math.floor(random() * TAXA.length)].id;
  let confidence = 0.35 + random() * 0.6;
  const lookalikes = LOOKALIKES[primaryId] || [];
  let alternatives = [];

  if (lookalikes.length) {
    const alternativeId = lookalikes[Math.floor(random() * lookalikes.length)];
    if (random() < 0.35) {
      alternatives = [{ taxonId: primaryId, confidence: round2(confidence * 0.8) }];
      primaryId = alternativeId;
      confidence = Math.min(confidence, 0.45 + random() * 0.25);
    } else {
      alternatives = [{
        taxonId: alternativeId,
        confidence: round2(confidence * (0.4 + random() * 0.3)),
      }];
    }
  }

  const reasoning = (CUES[primaryId] || ['Visual features detected']).slice();
  if (confidence < REVIEW_THRESHOLD) reasoning.push('Some key features are not clearly visible.');

  return {
    taxonId: primaryId,
    confidence: round2(confidence),
    reasoning,
    alternatives,
    provider: 'stub',
  };
}
stubProvider.providerName = 'stub';

function fallbackResult(input) {
  return { ...stubProvider(input), provider: 'stub-fallback' };
}

const LOOKALIKES = {
  stonefly: ['mayfly'],
  mayfly: ['stonefly'],
  bloodworm: ['worm', 'true_fly_larva'],
  worm: ['leech', 'bloodworm'],
  true_fly_larva: ['bloodworm'],
  caddisfly: ['true_fly_larva'],
  leech: ['worm'],
};

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

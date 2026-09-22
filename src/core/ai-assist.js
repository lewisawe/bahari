// Bahari — explainable, human-in-the-loop AI identification assist.
//
// DESIGN PRINCIPLE (Track 3: "use AI responsibly ... without replacing human
// judgment"): the assist is a *suggestion engine*, never the decision-maker.
// It always returns visible reasoning and a calibrated confidence, and when it
// is not confident enough it explicitly REFUSES to suggest an ID and hands the
// decision to the human. The citizen confirms or overrides every result — the
// AI never writes a count on its own.
//
// The assist is swappable: `identifyTaxon` delegates to a provider. The default
// provider is a self-contained STUB (no API key, works offline, deterministic
// for a given input) so the demo never depends on a live model. A real
// vision-LLM provider can be dropped in via `setAssistProvider` without
// changing any UI code.
//
// Confidence policy:
//   >= CONFIDENT_THRESHOLD  -> show as a confident suggestion (still confirmable)
//   >= REVIEW_THRESHOLD      -> show as a tentative suggestion, nudge human to verify
//   <  REVIEW_THRESHOLD      -> REFUSE: no auto-suggestion, ask the human to decide
//
// Return shape (stable contract for UI + future real provider):
//   {
//     status: 'suggested' | 'review' | 'defer',
//     taxonId: string | null,        // best-guess group id, or null when defer
//     confidence: number,            // 0..1
//     reasoning: string[],           // human-readable visual cues
//     alternatives: {taxonId, confidence}[],  // runner-up guesses
//     provider: string,              // which engine produced this
//   }

import { TAXA, getTaxon } from './taxa.js';

export const CONFIDENT_THRESHOLD = 0.75;
export const REVIEW_THRESHOLD = 0.5;

/**
 * @typedef {Object} AssistResult
 * @property {'suggested'|'review'|'defer'} status
 * @property {string|null} taxonId
 * @property {number} confidence
 * @property {string[]} reasoning
 * @property {{taxonId:string, confidence:number}[]} alternatives
 * @property {string} provider
 */

/**
 * Provider interface: async (input) => rawGuess
 * rawGuess = { taxonId, confidence, reasoning:string[], alternatives?:[{taxonId,confidence}] }
 * The stub below is the default. A real vision-LLM provider implements the same
 * shape (send the photo, parse the model's structured answer).
 */
let provider = stubProvider;

export function setAssistProvider(fn) {
  provider = fn;
}

/** Restore the built-in stub provider (used after swapping to a real one). */
export function resetAssistProvider() {
  provider = stubProvider;
}

export function getProviderName() {
  return provider.providerName || 'stub';
}

/**
 * Ask the assist to identify the organism in `input`.
 * @param {{photoName?:string, hintTaxonId?:string, seed?:number}} input
 * @returns {Promise<AssistResult>}
 */
export async function identifyTaxon(input = {}) {
  const raw = await provider(input);
  return applyConfidencePolicy(raw, getProviderName());
}

/**
 * Turn a raw provider guess into a policy-gated result. Pure + exported so it
 * can be unit-tested independently of any provider.
 * @param {{taxonId:string, confidence:number, reasoning:string[], alternatives?:any[]}} raw
 * @param {string} providerName
 * @returns {AssistResult}
 */
export function applyConfidencePolicy(raw, providerName = 'stub') {
  const confidence = clamp01(raw?.confidence ?? 0);
  const reasoning = Array.isArray(raw?.reasoning) ? raw.reasoning : [];
  const alternatives = (raw?.alternatives || []).map((a) => ({
    taxonId: a.taxonId,
    confidence: clamp01(a.confidence),
  }));

  // Below the review threshold => defer to the human, no suggestion.
  if (!raw?.taxonId || confidence < REVIEW_THRESHOLD) {
    return {
      status: 'defer',
      taxonId: null,
      confidence,
      reasoning:
        reasoning.length > 0
          ? reasoning
          : ['The image is unclear or ambiguous. A person should decide this one.'],
      alternatives,
      provider: providerName,
    };
  }

  const status = confidence >= CONFIDENT_THRESHOLD ? 'suggested' : 'review';
  return { status, taxonId: raw.taxonId, confidence, reasoning, alternatives, provider: providerName };
}

function clamp01(n) {
  n = Number(n) || 0;
  return Math.max(0, Math.min(1, n));
}

// ---------------------------------------------------------------------------
// Default STUB provider.
//
// Produces realistic, explainable suggestions without any network/model. It is
// deterministic given an input (so demos are repeatable) but varies across
// inputs so it feels real. The reasoning strings are taxon-appropriate visual
// cues drawn from the same recognition hints citizens see, which keeps the
// explanation honest rather than fabricated.
// ---------------------------------------------------------------------------

// Distinguishing visual cues per taxon, phrased as "what the model saw".
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
  // Deterministic pseudo-random from the input so the same photo gives the same
  // answer within a session, but different photos differ.
  const seedStr = (input.photoName || '') + (input.hintTaxonId || '') + (input.seed ?? '');
  const rnd = mulberry32(hashStr(seedStr) || Date.now() & 0xffff);

  // If the caller gives a hint (e.g. which card the photo was attached to), bias
  // toward it — mimics a model that's usually right but not always.
  let primaryId = input.hintTaxonId && getTaxon(input.hintTaxonId)
    ? input.hintTaxonId
    : TAXA[Math.floor(rnd() * TAXA.length)].id;

  // Draw a confidence. Deliberately produce a spread so the demo shows all three
  // outcomes (confident / review / defer) across a few photos.
  let confidence = 0.35 + rnd() * 0.6; // 0.35 .. 0.95

  // Occasionally the model "confuses" look-alikes: swap to an alternative and
  // drop confidence, so the human-in-the-loop handoff is demonstrable.
  const lookalikes = LOOKALIKES[primaryId] || [];
  let alternatives = [];
  if (lookalikes.length) {
    const alt = lookalikes[Math.floor(rnd() * lookalikes.length)];
    if (rnd() < 0.35) {
      // model leans toward the look-alike -> lower confidence, ambiguous
      alternatives = [{ taxonId: primaryId, confidence: round2(confidence * 0.8) }];
      primaryId = alt;
      confidence = Math.min(confidence, 0.45 + rnd() * 0.25);
    } else {
      alternatives = [{ taxonId: alt, confidence: round2(confidence * (0.4 + rnd() * 0.3)) }];
    }
  }

  const reasoning = (CUES[primaryId] || ['Visual features detected']).slice();
  if (confidence < REVIEW_THRESHOLD) {
    reasoning.push('Some key features are not clearly visible.');
  }

  return {
    taxonId: primaryId,
    confidence: round2(confidence),
    reasoning,
    alternatives,
  };
}
stubProvider.providerName = 'stub';

// Look-alike groups a non-expert (or a model) might confuse.
const LOOKALIKES = {
  stonefly: ['mayfly'],
  mayfly: ['stonefly'],
  bloodworm: ['worm', 'true_fly_larva'],
  worm: ['leech', 'bloodworm'],
  true_fly_larva: ['bloodworm'],
  caddisfly: ['true_fly_larva'],
  leech: ['worm'],
};

// --- tiny deterministic RNG helpers ---
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

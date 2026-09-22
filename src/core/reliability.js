// Bahari — data-reliability scoring.
//
// WHY: the dominant, repeatedly-documented barrier to citizen-science data
// being used by scientists is unknown reliability — researchers can't tell which
// submissions to trust. Bahari attaches a transparent reliability score + flags
// so a researcher (or a downstream system) can filter and weight submissions.
//
//   Frontiers in Climate — citizen science data quality:
//     https://www.frontiersin.org/articles/10.3389/fclim.2021.615032/full
//   Common technical errors in citizen field data:
//     https://journals.asm.org/doi/10.1128/jmbe.v17i1.999
//
// IMPORTANT: reliability is SEPARATE from the ecological (biotic) score. A
// pristine stream can still have a low-reliability submission (e.g. no photo,
// only one group), and a degraded stream can have a high-reliability one. We
// never let reliability change the biotic score; it only describes trust.
//
// The score is a transparent sum of weighted checks (0..100). Each check
// contributes points and, when failed, an explanatory flag. Everything is
// inspectable — no hidden model.

import { TAXA, getTaxon } from './taxa.js';
import { groupsFound, totalCount } from './assessment.js';

/**
 * @typedef {Object} ReliabilityCheck
 * @property {string} id
 * @property {string} label       short human label
 * @property {number} weight      max points this check can contribute
 * @property {number} points      points awarded (0..weight)
 * @property {'pass'|'warn'|'fail'} status
 * @property {string} detail      plain-language explanation
 */

/**
 * @typedef {Object} ReliabilityResult
 * @property {number} score        0..100
 * @property {'high'|'moderate'|'low'} band
 * @property {ReliabilityCheck[]} checks
 * @property {string[]} flags      detail strings for checks that warn/fail
 */

export const BANDS = [
  { key: 'high', label: 'High', min: 75, color: '#1a7f5a',
    blurb: 'Well-supported submission. Suitable for research use with normal review.' },
  { key: 'moderate', label: 'Moderate', min: 50, color: '#f2b134',
    blurb: 'Usable, but some gaps. A reviewer should check the flagged items.' },
  { key: 'low', label: 'Low', min: 0, color: '#c0392b',
    blurb: 'Limited confidence. Best treated as indicative until verified.' },
];

// Plausibility limits per taxon: an upper bound on a believable single-sample
// count. Very high counts of a single group in a quick citizen sample are a
// data-entry / method red flag (not impossible, but worth reviewing).
const PLAUSIBLE_MAX = 60;

/**
 * Compute reliability for a submission.
 * @param {{
 *   counts: Object.<string, number>,
 *   photoConfirmed?: boolean,        // did the user attach/confirm a photo for any find?
 *   aiAssisted?: boolean,            // was an AI suggestion involved (informational)
 *   location?: {lat:number, lon:number}|null,
 *   locationOnStream?: boolean,      // did geo-check place them on/near water?
 *   durationSec?: number|null,       // how long the assessment took (rushed?)
 * }} submission
 * @returns {ReliabilityResult}
 */
export function scoreReliability(submission = {}) {
  const {
    counts = {},
    photoConfirmed = false,
    location = null,
    locationOnStream = null,
    durationSec = null,
  } = submission;

  const checks = [];

  // 1. Location present + plausibly on a stream (25)
  checks.push(locationCheck(location, locationOnStream));

  // 2. Effort / richness — more groups examined = more informative (25)
  checks.push(richnessCheck(counts));

  // 3. Photo evidence for verification (20)
  checks.push(photoCheck(photoConfirmed));

  // 4. Count plausibility — implausibly high single-group counts flag review (20)
  checks.push(plausibilityCheck(counts));

  // 5. Effort time — extremely rushed submissions are less reliable (10)
  checks.push(durationCheck(durationSec));

  const score = Math.round(checks.reduce((a, c) => a + c.points, 0));
  const band = bandFor(score);
  const flags = checks.filter((c) => c.status !== 'pass').map((c) => c.detail);

  return { score, band: band.key, bandInfo: band, checks, flags };
}

export function bandFor(score) {
  for (const b of BANDS) if (score >= b.min) return b;
  return BANDS[BANDS.length - 1];
}

// --- individual checks -----------------------------------------------------

function locationCheck(location, onStream) {
  const w = 25;
  if (!location) {
    return mk('location', 'Location', w, 0, 'fail',
      'No location recorded — the reading can\u2019t be placed on a stream.');
  }
  if (onStream === false) {
    return mk('location', 'Location', w, 10, 'warn',
      'Location doesn\u2019t appear to be on or beside water — please confirm the spot.');
  }
  // present, and either confirmed-on-stream or unknown-but-present
  const pts = onStream === true ? w : Math.round(w * 0.8);
  const status = onStream === true ? 'pass' : 'warn';
  const detail = onStream === true
    ? 'Location recorded and consistent with a stream.'
    : 'Location recorded; on-stream check not confirmed.';
  return mk('location', 'Location', w, pts, status, detail);
}

function richnessCheck(counts) {
  const w = 25;
  const n = groupsFound(counts);
  if (n === 0) return mk('richness', 'Groups examined', w, 0, 'fail',
    'No groups recorded.');
  if (n === 1) return mk('richness', 'Groups examined', w, 10, 'warn',
    'Only one group recorded — a single group gives a weak picture of the stream.');
  if (n === 2) return mk('richness', 'Groups examined', w, 18, 'warn',
    'Only two groups recorded — more groups improve reliability.');
  // 3+ groups is a solid citizen sample
  return mk('richness', 'Groups examined', w, w, 'pass',
    `${n} groups recorded — a solid range for a citizen sample.`);
}

function photoCheck(photoConfirmed) {
  const w = 20;
  if (photoConfirmed) {
    return mk('photo', 'Photo evidence', w, w, 'pass',
      'Photo evidence attached — supports later verification.');
  }
  return mk('photo', 'Photo evidence', w, 8, 'warn',
    'No photo attached — findings can\u2019t be visually verified later.');
}

function plausibilityCheck(counts) {
  const w = 20;
  const offenders = [];
  for (const [id, c] of Object.entries(counts)) {
    const n = Number(c) || 0;
    if (n > PLAUSIBLE_MAX) {
      const t = getTaxon(id);
      offenders.push(`${t ? t.commonName : id} (${n})`);
    }
  }
  if (offenders.length === 0) {
    return mk('plausibility', 'Count plausibility', w, w, 'pass',
      'Counts are within a believable range for a single sample.');
  }
  return mk('plausibility', 'Count plausibility', w, 6, 'warn',
    `Unusually high count for a single sample: ${offenders.join(', ')} — worth a reviewer check.`);
}

function durationCheck(durationSec) {
  const w = 10;
  if (durationSec == null) {
    // unknown — give most of the benefit of the doubt, no strong flag
    return mk('duration', 'Effort time', w, Math.round(w * 0.8), 'pass',
      'Assessment time not recorded.');
  }
  if (durationSec < 20) {
    return mk('duration', 'Effort time', w, 3, 'warn',
      'Very quick submission — a rushed assessment can miss groups.');
  }
  return mk('duration', 'Effort time', w, w, 'pass',
    'Enough time taken for a considered assessment.');
}

function mk(id, label, weight, points, status, detail) {
  return { id, label, weight, points: Math.max(0, Math.min(weight, points)), status, detail };
}

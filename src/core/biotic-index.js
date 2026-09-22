// Bahari — biotic index scorer.
//
// Implements the average-sensitivity method (miniSASS / ASPT / SIGNAL family):
//
//     score = sum(sensitivity of each group found) / number of groups found
//
// The score is the mean pollution-sensitivity of the groups a citizen found.
// Finding many sensitive groups (mayfly, stonefly, caddisfly) pulls the average
// up = healthier water; finding only tolerant groups (worms, bloodworms) pulls
// it down = degraded water. The score is mapped to plain-language ecological
// classes. See taxa.js for the weights and their sources.
//
// Presence is what counts for the score (as in miniSASS): a group is "found" if
// its recorded count is >= 1. Counts are still kept for the reliability check
// and for display, but do not change the biotic score itself.

import { TAXA, getTaxon } from './taxa.js';

/**
 * Ecological quality classes, from healthiest to most degraded.
 * Thresholds are on the 1..10 sensitivity scale (score = mean sensitivity).
 * `min` is inclusive: a class applies when score >= min (checked high to low).
 */
export const CLASSES = [
  { key: 'natural', label: 'Natural', min: 7.5, color: '#1a7f5a',
    blurb: 'Sensitive species present. Water quality appears natural / near-natural.' },
  { key: 'good', label: 'Good', min: 6.0, color: '#4caf50',
    blurb: 'A healthy mix including some sensitive species. Water quality appears good.' },
  { key: 'fair', label: 'Fair', min: 4.5, color: '#f2b134',
    blurb: 'Mostly moderate-tolerance species. Some stress on the stream is likely.' },
  { key: 'poor', label: 'Poor', min: 3.0, color: '#e8743b',
    blurb: 'Few sensitive species. The stream shows signs of pollution or disturbance.' },
  { key: 'very_poor', label: 'Very poor', min: 0, color: '#c0392b',
    blurb: 'Only tolerant species found. Strong signs of pollution or degradation.' },
];

/**
 * @typedef {Object.<string, number>} Counts  map of taxonId -> count
 */

/**
 * @typedef {Object} BioticResult
 * @property {number|null} score        mean sensitivity, or null if no groups found
 * @property {string|null} classKey     ecological class key, or null
 * @property {object|null} classInfo    full class object, or null
 * @property {number} richness          number of distinct groups found
 * @property {Array}  contributions     per-taxon {id, commonName, sensitivity, count} for groups found
 * @property {string} method            human-readable description of the calculation
 */

/**
 * Compute the biotic index from recorded taxa counts.
 * @param {Counts} counts  map of taxonId -> count (0 / missing = not found)
 * @returns {BioticResult}
 */
export function scoreAssessment(counts = {}) {
  const found = [];
  for (const taxon of TAXA) {
    const c = Number(counts[taxon.id]) || 0;
    if (c >= 1) {
      found.push({
        id: taxon.id,
        commonName: taxon.commonName,
        scientificGroup: taxon.scientificGroup,
        sensitivity: taxon.sensitivity,
        count: c,
      });
    }
  }

  const richness = found.length;
  if (richness === 0) {
    return {
      score: null,
      classKey: null,
      classInfo: null,
      richness: 0,
      contributions: [],
      method: 'No groups recorded yet — the score is the average sensitivity of the groups you find.',
    };
  }

  const sum = found.reduce((acc, f) => acc + f.sensitivity, 0);
  const score = round1(sum / richness);
  const classInfo = classify(score);

  return {
    score,
    classKey: classInfo.key,
    classInfo,
    richness,
    contributions: found,
    method:
      `Average sensitivity of the ${richness} group${richness === 1 ? '' : 's'} you found: ` +
      `(${found.map((f) => f.sensitivity).join(' + ')}) \u00f7 ${richness} = ${score} on a 1\u201310 scale.`,
  };
}

/**
 * Map a numeric score to its ecological class.
 * @param {number} score
 * @returns {object} class object from CLASSES
 */
export function classify(score) {
  for (const c of CLASSES) {
    if (score >= c.min) return c;
  }
  return CLASSES[CLASSES.length - 1];
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

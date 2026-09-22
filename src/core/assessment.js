// Bahari — assessment model + step flow definition.
//
// A single assessment moves through an ordered set of steps. Days 3-6 add
// their steps here (ai-assist, reliability, one-health, fhir) without touching
// the flow machinery. Keeping this framework-free keeps it testable.

/**
 * @typedef {Object} Assessment
 * @property {string|null} streamId   selected seed stream id
 * @property {Object.<string,number>} counts  taxonId -> count
 * @property {string|null} photoName  optional photo filename (Day 3)
 * @property {string} createdAt       ISO timestamp
 */

/** The ordered demo flow. */
export const STEPS = [
  { key: 'stream', label: 'Stream', ready: true },
  { key: 'assess', label: 'Find', ready: true }, // AI assist (Day 3) folded in here
  { key: 'result', label: 'Result', ready: true },
  { key: 'onehealth', label: 'One Health', ready: true },
  { key: 'fhir', label: 'Share', ready: true },
];

export function newAssessment(streamId = null) {
  return {
    streamId,
    counts: {},
    photoName: null,
    photoConfirmed: false, // did the user attach/confirm a photo for any find?
    aiAssisted: false, // was an AI suggestion involved (informational)
    startedAt: Date.now(), // for effort-time reliability check
    createdAt: new Date().toISOString(),
  };
}

/** Elapsed seconds since the assessment was started. */
export function elapsedSeconds(assessment) {
  if (!assessment?.startedAt) return null;
  return Math.max(0, Math.round((Date.now() - assessment.startedAt) / 1000));
}

/** Total number of individual organisms recorded (used later for reliability). */
export function totalCount(counts = {}) {
  return Object.values(counts).reduce((a, n) => a + (Number(n) || 0), 0);
}

/** Number of distinct groups found (count >= 1). */
export function groupsFound(counts = {}) {
  return Object.values(counts).filter((n) => (Number(n) || 0) >= 1).length;
}

/** Has the user recorded anything usable yet? */
export function hasFindings(counts = {}) {
  return groupsFound(counts) >= 1;
}

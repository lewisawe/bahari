// Bahari — "your stream" history persistence.
//
// Completed assessments are appended to a per-stream history in the browser's
// localStorage, so a citizen returning to the same stream sees their readings
// build into a trend over time (the repeat-engagement loop). Seed streams ship
// with clearly-labeled sample history; user assessments are stored separately
// and merged for display, so we never mutate the seed data.
//
// The merge + trend logic is pure and testable; the storage read/write is a
// thin wrapper that degrades gracefully if localStorage is unavailable.

const KEY = 'bahari.history.v1';

/**
 * @typedef {Object} HistoryEntry
 * @property {string} date       YYYY-MM-DD
 * @property {number|null} score
 * @property {string|null} classKey
 * @property {Object.<string,number>} [counts]
 * @property {boolean} [synthetic]  true for seed sample data
 * @property {boolean} [mine]       true for this user's own assessments
 */

/** Read the whole user-history map: { [streamId]: HistoryEntry[] }. */
export function loadUserHistory(storage = safeStorage()) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Persist a completed assessment to a stream's user history. Returns updated map. */
export function saveAssessment(streamId, entry, storage = safeStorage()) {
  const all = loadUserHistory(storage);
  const list = all[streamId] ? [...all[streamId]] : [];
  list.push({ ...entry, mine: true });
  all[streamId] = list;
  if (storage) {
    try {
      storage.setItem(KEY, JSON.stringify(all));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }
  return all;
}

/** Clear all user history (used by a "reset demo" affordance / tests). */
export function clearUserHistory(storage = safeStorage()) {
  if (storage) {
    try {
      storage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Merge seed (sample) history with the user's own entries for one stream,
 * sorted by date ascending. Pure — no storage access.
 * @param {HistoryEntry[]} seedHistory
 * @param {HistoryEntry[]} userHistory
 * @returns {HistoryEntry[]}
 */
export function mergedHistory(seedHistory = [], userHistory = []) {
  const seed = seedHistory.map((e) => ({ ...e, synthetic: true }));
  const mine = userHistory.map((e) => ({ ...e, mine: true }));
  return [...seed, ...mine].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/**
 * Compute a simple trend across a history series (ignoring null scores).
 * @param {HistoryEntry[]} history
 * @returns {{direction:'improving'|'declining'|'stable'|'insufficient', delta:number|null, points:number[]}}
 */
export function trend(history = []) {
  const points = history
    .map((e) => e.score)
    .filter((s) => typeof s === 'number');
  if (points.length < 2) {
    return { direction: 'insufficient', delta: null, points };
  }
  const delta = round1(points[points.length - 1] - points[0]);
  let direction = 'stable';
  if (delta >= 0.5) direction = 'improving';
  else if (delta <= -0.5) direction = 'declining';
  return { direction, delta, points };
}

function safeStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* access can throw in some privacy modes */
  }
  return null;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

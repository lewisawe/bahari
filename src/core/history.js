// Legacy completion history. New writes use device-records.js; this reader stays
// available for the one-time atomic migration.

export const LEGACY_HISTORY_KEY = 'bahari.history.v1';

export function loadLegacyHistory(storage = safeStorage()) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(LEGACY_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export const loadUserHistory = loadLegacyHistory;

export function saveAssessment(streamId, entry, storage = safeStorage()) {
  const all = loadLegacyHistory(storage);
  const list = Array.isArray(all[streamId]) ? [...all[streamId]] : [];
  list.push({ ...entry, mine: true });
  all[streamId] = list;
  if (storage) {
    try {
      storage.setItem(LEGACY_HISTORY_KEY, JSON.stringify(all));
    } catch {
      // Legacy compatibility writes intentionally degrade without throwing.
    }
  }
  return all;
}

export function clearUserHistory(storage = safeStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(LEGACY_HISTORY_KEY);
  } catch {
    // Storage can be unavailable in privacy modes.
  }
}

export function mergedHistory(seedHistory = [], userHistory = []) {
  const seed = seedHistory.map((entry) => ({ ...entry, synthetic: true }));
  const mine = userHistory.map((entry) => ({ ...entry, mine: true }));
  return [...seed, ...mine]
    .map((entry, stableIndex) => ({ entry, stableIndex }))
    .sort((a, b) => {
      const byDate = String(a.entry.date).localeCompare(String(b.entry.date));
      if (byDate) return byDate;
      const aOrder = Number.isFinite(a.entry.sourceOrder) ? a.entry.sourceOrder : a.stableIndex;
      const bOrder = Number.isFinite(b.entry.sourceOrder) ? b.entry.sourceOrder : b.stableIndex;
      return aOrder - bOrder || a.stableIndex - b.stableIndex;
    })
    .map(({ entry }) => entry);
}

export function trend(history = []) {
  const points = history.map((entry) => entry.score).filter((score) => typeof score === 'number');
  if (points.length < 2) return { direction: 'insufficient', delta: null, points };
  const delta = round1(points[points.length - 1] - points[0]);
  let direction = 'stable';
  if (delta >= 0.5) direction = 'improving';
  else if (delta <= -0.5) direction = 'declining';
  return { direction, delta, points };
}

function safeStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

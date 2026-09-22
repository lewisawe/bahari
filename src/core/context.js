// Bahari — environmental context helpers.
//
// The One Health translation is more meaningful with a little context: the
// season, whether it rained recently (runoff pushes contaminants into streams),
// and the surrounding land use (urban/agricultural streams carry different
// risks than natural ones). All context is either derived locally (season) or
// pulled from a free, keyless public API (weather), with a clearly-labeled
// fallback so the app works offline.

/**
 * Northern-hemisphere season from a date. (Seed streams are European.)
 * @param {Date|string|number} date
 * @returns {'winter'|'spring'|'summer'|'autumn'}
 */
export function seasonFor(date = new Date()) {
  const m = new Date(date).getMonth(); // 0=Jan
  if (m <= 1 || m === 11) return 'winter'; // Dec, Jan, Feb
  if (m <= 4) return 'spring'; // Mar, Apr, May
  if (m <= 7) return 'summer'; // Jun, Jul, Aug
  return 'autumn'; // Sep, Oct, Nov
}

export const LAND_USES = [
  { key: 'urban', label: 'Urban / city' },
  { key: 'agricultural', label: 'Farmland / agricultural' },
  { key: 'mixed', label: 'Mixed / suburban' },
  { key: 'natural', label: 'Natural / parkland' },
];

/**
 * Fetch recent-rain context from Open-Meteo (free, no API key). Returns a small
 * normalized object; on any failure returns a labeled fallback so callers never
 * break. Not pure (network) — kept separate from the rules engine.
 *
 * Open-Meteo: https://open-meteo.com/
 *
 * @param {{lat:number, lon:number}} loc
 * @returns {Promise<{recentRainMm:number|null, heavyRain:boolean, source:string}>}
 */
export async function fetchRecentRain(loc) {
  const fallback = { recentRainMm: null, heavyRain: false, source: 'unavailable (offline fallback)' };
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lon !== 'number') return fallback;
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&daily=precipitation_sum&past_days=3&forecast_days=1&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return fallback;
    const json = await res.json();
    const sums = json?.daily?.precipitation_sum;
    if (!Array.isArray(sums) || sums.length === 0) return fallback;
    const past = sums.filter((n) => typeof n === 'number');
    const recentRainMm = round1(past.slice(0, 3).reduce((a, n) => a + n, 0));
    return {
      recentRainMm,
      heavyRain: recentRainMm >= HEAVY_RAIN_MM,
      source: 'Open-Meteo (past 3 days precipitation)',
    };
  } catch {
    return fallback;
  }
}

export const HEAVY_RAIN_MM = 20; // 3-day total that plausibly drives runoff

/**
 * Assemble a context object for the rules engine. Pure given its inputs.
 * @param {{date?:any, landUse?:string, rain?:{recentRainMm:number|null, heavyRain:boolean, source:string}}} opts
 */
export function buildContext({ date = new Date(), landUse = 'mixed', rain = null } = {}) {
  return {
    season: seasonFor(date),
    landUse,
    heavyRain: rain?.heavyRain ?? false,
    recentRainMm: rain?.recentRainMm ?? null,
    rainSource: rain?.source ?? 'not checked',
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

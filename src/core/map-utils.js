// Bahari — pure helpers for the map layer (testable without a DOM).

import { healthColorForClass } from './health-colors.js';

/**
 * The latest known score/class for a stream, preferring the user's own saved
 * assessments over seed sample history. Returns null if nothing scored.
 * @param {{history?: Array}} stream  seed stream (may carry sample history)
 * @param {Array} [userHistory]       this user's saved entries for the stream
 * @returns {{score:number, classKey:string}|null}
 */
export function latestForStream(stream, userHistory = []) {
  const seed = (stream?.history || []).filter((e) => typeof e.score === 'number');
  const mine = (userHistory || []).filter((e) => typeof e.score === 'number');
  const all = [...seed, ...mine];
  if (all.length === 0) return null;
  const last = all[all.length - 1];
  return { score: last.score, classKey: last.classKey };
}

/** Marker fill color for a stream's latest class (falls back to neutral). */
export function markerColor(stream, userHistory = []) {
  const latest = latestForStream(stream, userHistory);
  return healthColorForClass(latest?.classKey);
}

/** Compute a map center + zoom that frames all streams (simple bbox centroid). */
export function fitView(streams = []) {
  const pts = streams.filter((s) => typeof s.lat === 'number' && typeof s.lon === 'number');
  if (pts.length === 0) return { center: [50, 5], zoom: 4 };
  const lats = pts.map((s) => s.lat);
  const lons = pts.map((s) => s.lon);
  const center = [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lons) + Math.max(...lons)) / 2,
  ];
  const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons));
  // rough zoom from span in degrees
  let zoom = 4;
  if (span < 1) zoom = 8;
  else if (span < 5) zoom = 6;
  else if (span < 15) zoom = 5;
  return { center, zoom };
}

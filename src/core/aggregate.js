// Bahari — aggregate analytics for the researcher dashboard.
//
// Turns the full set of streams (seed sample history + the user's own saved
// assessments) into catchment-scale insight: how many streams sit in each
// health class, average score, trend mix, and total assessment count. Pure and
// testable; the dashboard renders whatever this returns.

import { latestForStream } from './map-utils.js';
import { trend } from './history.js';
import { classify } from './biotic-index.js';

const CLASS_ORDER = ['natural', 'good', 'fair', 'poor', 'very_poor'];
const CLASS_LABEL = {
  natural: 'Natural',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  very_poor: 'Very poor',
};

/**
 * @param {Array} streams  seed streams (each may carry sample history)
 * @param {Object.<string,Array>} [historyByStream]  merged history per stream id
 * @returns {{
 *   streamCount:number,
 *   assessedCount:number,
 *   assessmentTotal:number,
 *   averageScore:number|null,
 *   averageClass:string|null,
 *   distribution:{key:string,label:string,count:number,pct:number,color:string}[],
 *   trendMix:{improving:number,declining:number,stable:number},
 *   rows:{id:string,name:string,country:string,score:number|null,classKey:string|null,trend:string,assessments:number}[]
 * }}
 */
export function aggregate(streams = [], historyByStream = {}) {
  const rows = [];
  const distCount = Object.fromEntries(CLASS_ORDER.map((k) => [k, 0]));
  const trendMix = { improving: 0, declining: 0, stable: 0 };
  let scoreSum = 0;
  let assessed = 0;
  let assessmentTotal = 0;

  for (const s of streams) {
    const hist = historyByStream[s.id] || s.history || [];
    const scored = hist.filter((e) => typeof e.score === 'number');
    assessmentTotal += scored.length;

    const latest = latestForStream(s, historyByStream[s.id]);
    const t = trend(hist);
    if (t.direction === 'improving' || t.direction === 'declining' || t.direction === 'stable') {
      trendMix[t.direction] += 1;
    }

    if (latest) {
      assessed += 1;
      scoreSum += latest.score;
      if (distCount[latest.classKey] != null) distCount[latest.classKey] += 1;
    }

    rows.push({
      id: s.id,
      name: s.name,
      country: s.country,
      score: latest?.score ?? null,
      classKey: latest?.classKey ?? null,
      trend: t.direction,
      assessments: scored.length,
    });
  }

  const averageScore = assessed > 0 ? round1(scoreSum / assessed) : null;
  const averageClass = averageScore != null ? classify(averageScore).key : null;

  const distribution = CLASS_ORDER.map((k) => ({
    key: k,
    label: CLASS_LABEL[k],
    count: distCount[k],
    pct: assessed > 0 ? Math.round((distCount[k] / assessed) * 100) : 0,
    color: colorForClass(k),
  }));

  // sort rows worst-first so a researcher sees problem streams at the top
  rows.sort((a, b) => (a.score ?? 99) - (b.score ?? 99));

  return {
    streamCount: streams.length,
    assessedCount: assessed,
    assessmentTotal,
    averageScore,
    averageClass,
    distribution,
    trendMix,
    rows,
  };
}

function colorForClass(k) {
  return {
    natural: '#3ecf8e',
    good: '#3ecf8e',
    fair: '#f5c451',
    poor: '#ff9d5c',
    very_poor: '#ff6b6b',
  }[k] || '#a7a7a7';
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

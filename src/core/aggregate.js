// Bahari — aggregate analytics for the researcher dashboard.
//
// Turns identity-annotated assessment history into record-level trust evidence,
// then projects the active evidence set back into catchment-scale analytics.
// Reliability never changes the ecological score or class.

import { latestFromHistory } from './map-utils.js';
import { trend } from './history.js';
import { classify } from './biotic-index.js';
import { scoreReliability } from './reliability.js';

const CLASS_ORDER = ['natural', 'good', 'fair', 'poor', 'very_poor'];
const CLASS_LABEL = {
  natural: 'Natural',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  very_poor: 'Very poor',
};
const HIGH_CONCERN_CLASSES = new Set(['poor', 'very_poor']);

/**
 * @param {Array} streams  seed streams (each may carry sample history)
 * @param {Object.<string,Array>} [historyByStream] authoritative history per stream id
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
    const suppliedHistory = Object.prototype.hasOwnProperty.call(historyByStream, s.id)
      ? historyByStream[s.id]
      : s.history || [];
    const hist = Array.isArray(suppliedHistory) ? suppliedHistory : [];
    const scored = hist.filter((e) => Number.isFinite(e?.score));
    assessmentTotal += scored.length;

    const latest = latestFromHistory(hist);
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

export function normalizeThreshold(value, previous = 75) {
  const n = Number(value);
  if (!Number.isFinite(n)) return previous;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function meetsReliabilityThreshold(record, threshold) {
  return Number.isFinite(record?.reliability?.score) &&
    record.reliability.score >= normalizeThreshold(threshold, 75);
}

export function buildEvidenceRecords(streams = [], historyByStream = {}) {
  const records = [];

  for (const stream of streams) {
    const history = Array.isArray(historyByStream[stream.id]) ? historyByStream[stream.id] : [];
    for (const entry of history) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        Array.isArray(entry) ||
        !isValidEvidenceId(entry.id) ||
        !Number.isInteger(entry.sourceOrder) ||
        !Number.isFinite(entry.score)
      ) continue;

      const submission = entry.submission && typeof entry.submission === 'object'
        ? entry.submission
        : {};
      const counts = submission.counts && typeof submission.counts === 'object'
        ? submission.counts
        : entry.counts && typeof entry.counts === 'object'
          ? entry.counts
          : {};
      const location = isFiniteLocation(submission.location) ? submission.location : null;
      const locationOnStream = typeof submission.locationOnStream === 'boolean'
        ? submission.locationOnStream
        : null;
      const photoConfirmed = submission.photoConfirmed === true;
      const durationSec = Number.isFinite(submission.durationSec) && submission.durationSec >= 0
        ? submission.durationSec
        : null;
      const reliability = scoreReliability({
        counts,
        location,
        locationOnStream,
        photoConfirmed,
        durationSec,
      });
      const classKey = typeof entry.classKey === 'string'
        ? entry.classKey
        : classify(entry.score).key;
      const provenance = entry.mine === true ? 'local' : 'seed';

      records.push({
        id: entry.id,
        streamId: stream.id,
        streamName: stream.name,
        country: stream.country,
        date: typeof entry.date === 'string' ? entry.date : '',
        score: entry.score,
        classKey,
        counts: { ...counts },
        submission: {
          counts: { ...counts },
          location,
          locationOnStream,
          photoConfirmed,
          durationSec,
        },
        provenance,
        mine: provenance === 'local',
        synthetic: provenance === 'seed',
        reliability,
        highConcern: HIGH_CONCERN_CLASSES.has(classKey),
        sourcePresence: {
          location: location !== null,
          locationOnStream: locationOnStream !== null,
          photo: photoConfirmed,
          duration: durationSec !== null,
        },
        sourceOrder: entry.sourceOrder,
      });
    }
  }

  return records;
}

export function summarizeTrust(records = [], threshold = 75) {
  const summary = {
    total: records.length,
    meetsThreshold: 0,
    belowThreshold: 0,
    highConcernStrong: 0,
    highConcernWeak: 0,
  };

  for (const record of records) {
    const strong = meetsReliabilityThreshold(record, threshold);
    if (strong) summary.meetsThreshold += 1;
    else summary.belowThreshold += 1;
    if (record.highConcern && strong) summary.highConcernStrong += 1;
    if (record.highConcern && !strong) summary.highConcernWeak += 1;
  }

  return summary;
}

export function filterEvidenceRecords(records = [], { trustedOnly = false, threshold = 75 } = {}) {
  if (!trustedOnly) return [...records];
  return records.filter((record) => meetsReliabilityThreshold(record, threshold));
}

export function historyByStreamFromEvidence(records = [], streams = []) {
  const historyByStream = Object.fromEntries(streams.map((stream) => [stream.id, []]));
  for (const record of records) {
    if (!Object.prototype.hasOwnProperty.call(historyByStream, record.streamId)) continue;
    historyByStream[record.streamId].push({
      id: record.id,
      date: record.date,
      score: record.score,
      classKey: record.classKey,
      counts: { ...record.counts },
      submission: {
        ...record.submission,
        counts: { ...record.counts },
      },
      mine: record.mine,
      synthetic: record.synthetic,
      sourceOrder: record.sourceOrder,
    });
  }
  return historyByStream;
}

export function buildPriorityRows(records = [], streams = [], threshold = 75) {
  const latestByStream = new Map();

  records.forEach((record, inputOrder) => {
    const current = latestByStream.get(record.streamId);
    if (
      !current ||
      String(record.date).localeCompare(String(current.record.date)) > 0 ||
      String(record.date).localeCompare(String(current.record.date)) === 0 && inputOrder > current.inputOrder
    ) {
      latestByStream.set(record.streamId, { record, inputOrder });
    }
  });

  const streamById = new Map(streams.map((stream) => [stream.id, stream]));
  return [...latestByStream.values()]
    .map(({ record }) => {
      const stream = streamById.get(record.streamId);
      const strong = meetsReliabilityThreshold(record, threshold);
      return {
        ...record,
        streamName: stream?.name ?? record.streamName ?? record.streamId,
        country: stream?.country ?? record.country ?? '',
        strong,
        meetsThreshold: strong,
      };
    })
    .sort((a, b) =>
      a.score - b.score ||
      Number(b.strong) - Number(a.strong) ||
      b.reliability.score - a.reliability.score ||
      a.streamName.localeCompare(b.streamName)
    );
}

function isValidEvidenceId(value) {
  return typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 128;
}

function isFiniteLocation(value) {
  return value && typeof value === 'object' &&
    Number.isFinite(value.lat) && Number.isFinite(value.lon);
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

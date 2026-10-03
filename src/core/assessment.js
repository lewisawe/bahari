// Bahari assessment model and ordered five-step flow.

export const STEPS = [
  { key: 'stream', label: 'Stream', ready: true },
  { key: 'assess', label: 'Find', ready: true },
  { key: 'result', label: 'Result', ready: true },
  { key: 'onehealth', label: 'One Health', ready: true },
  { key: 'fhir', label: 'Share', ready: true },
];

export function createAssessmentId() {
  return createStableId('assessment');
}

export function createPhotoId() {
  return createStableId('photo');
}

export function newAssessment(streamId = null) {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  return {
    id: createAssessmentId(),
    schemaVersion: 1,
    streamId,
    counts: {},
    photo: null,
    photoConfirmed: false,
    aiAssisted: false,
    aiReview: null,
    location: null,
    locationOnStream: null,
    startedAt: now,
    createdAt: iso,
    updatedAt: iso,
  };
}

export function elapsedSeconds(assessment, now = Date.now()) {
  if (!Number.isFinite(assessment?.startedAt)) return null;
  return Math.max(0, Math.round((now - assessment.startedAt) / 1000));
}

export function totalCount(counts = {}) {
  return Object.values(counts).reduce((total, count) => total + (Number(count) || 0), 0);
}

export function groupsFound(counts = {}) {
  return Object.values(counts).filter((count) => (Number(count) || 0) >= 1).length;
}

export function hasFindings(counts = {}) {
  return groupsFound(counts) >= 1;
}

function createStableId(prefix) {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

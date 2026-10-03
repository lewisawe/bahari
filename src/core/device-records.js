import { scoreAssessment } from './biotic-index.js';
import { LAND_USES } from './context.js';
import { validateBundle } from './fhir.js';
import { applyConfidencePolicy } from './ai-assist.js';
import { getTaxon } from './taxa.js';
import { blobToBase64 } from './photo.js';

export const DEVICE_DB_NAME = 'bahari-field-v1';
export const DEVICE_STORAGE_KEY = 'bahari.field-meta.v1';
export const LOCAL_STORAGE_LIMIT = 100 * 1024;
export const LEGACY_MIGRATION_KEY = 'legacyHistoryMigratedV1';

const LAND_USE_KEYS = new Set(LAND_USES.map(({ key }) => key));
const STORAGE_CODES = new Set([
  'storage-unavailable',
  'storage-blocked',
  'storage-corrupt',
  'storage-quota',
  'storage-write',
]);

export class DeviceStorageError extends Error {
  constructor(code, operation, cause) {
    super(code);
    this.name = 'DeviceStorageError';
    this.code = STORAGE_CODES.has(code) ? code : 'storage-write';
    this.operation = operation;
    if (cause !== undefined) this.cause = cause;
  }
}

export async function openDeviceRecords(options = {}) {
  const idb = options.indexedDB ?? globalThis.indexedDB;
  const storage = options.localStorage ?? safeLocalStorage();
  let warning = null;

  if (idb) {
    try {
      const db = await openDatabase(idb);
      return { adapter: createIndexedDbAdapter(db), mode: 'indexeddb', warning: null };
    } catch (error) {
      warning = asStorageError(error, error?.name === 'BlockedError' ? 'storage-blocked' : 'storage-unavailable', 'open-indexeddb');
      warnOperation('open-indexeddb', error);
    }
  }

  if (storage && storageIsWritable(storage)) {
    return { adapter: createLocalStorageAdapter(storage), mode: 'localstorage', warning };
  }

  if (!warning) warning = new DeviceStorageError('storage-unavailable', 'open-storage');
  return { adapter: createMemoryAdapter(), mode: 'memory', warning };
}

export function reconstructRecord(raw, streams = [], onWarning = () => {}) {
  const warnings = [];
  const warn = (code = 'storage-corrupt') => {
    const error = new DeviceStorageError(code, 'reconstruct-record');
    warnings.push(error);
    onWarning(error);
  };
  if (!isObject(raw) || !validId(raw.id) || raw.schemaVersion !== 1) return null;
  if (raw.status !== 'pending' && raw.status !== 'saved') return null;
  if (!Number.isInteger(raw.lastStepIndex)) return null;
  if (!validIso(raw.createdAt) || !validIso(raw.updatedAt)) return null;
  if (!isObject(raw.assessment) || raw.assessment.id !== raw.id || raw.assessment.schemaVersion !== 1) return null;

  const knownStreams = new Set(streams.map((stream) => stream.id));
  const streamId = raw.assessment.streamId;
  if (streamId !== null && (!validId(streamId) || !knownStreams.has(streamId))) return null;

  const isLegacy = raw.status === 'saved' && raw.id.startsWith('legacy-');
  const startedAt = raw.assessment.startedAt;
  if (!(Number.isFinite(startedAt) && startedAt >= 0) && !(isLegacy && startedAt === null)) return null;

  let completedAt = raw.completedAt;
  if (raw.status === 'pending') {
    if (completedAt !== null) return null;
  } else {
    if (!validIso(completedAt)) return null;
    if (Number.isFinite(startedAt) && Date.parse(completedAt) < startedAt) return null;
  }

  const counts = normalizeCounts(raw.assessment.counts);
  let landUse = raw.landUse;
  if (!LAND_USE_KEYS.has(landUse)) {
    if (landUse !== undefined && !isLegacy) warn();
    landUse = 'mixed';
  }

  let rain = normalizeRain(raw.rain);
  if (raw.rain !== null && raw.rain !== undefined && rain === null) warn();

  const photo = normalizePhoto(raw.assessment.photo);
  if (raw.assessment.photo != null && !photo) warn();
  const location = finiteLocation(raw.assessment.location) ? {
    lat: raw.assessment.location.lat,
    lon: raw.assessment.location.lon,
  } : null;
  if (raw.assessment.location != null && !location) warn();
  const locationOnStream = typeof raw.assessment.locationOnStream === 'boolean'
    ? raw.assessment.locationOnStream
    : null;

  const assessment = {
    id: raw.id,
    schemaVersion: 1,
    streamId,
    counts,
    photo,
    photoConfirmed: raw.assessment.photoConfirmed === true && photo !== null,
    aiAssisted: false,
    aiReview: null,
    location,
    locationOnStream,
    startedAt,
    createdAt: validIso(raw.assessment.createdAt) ? raw.assessment.createdAt : raw.createdAt,
    updatedAt: validIso(raw.assessment.updatedAt) ? raw.assessment.updatedAt : raw.updatedAt,
  };

  const aiReview = normalizeAiReview(raw.assessment.aiReview, assessment);
  if (aiReview) {
    assessment.aiReview = aiReview;
    assessment.aiAssisted = true;
  } else if (raw.assessment.aiReview != null || raw.assessment.aiAssisted === true) {
    warn();
  }

  const biotic = scoreAssessment(counts);
  const score = raw.status === 'saved' ? biotic.score : null;
  const classKey = raw.status === 'saved' ? biotic.classKey : null;
  if (raw.status === 'saved' && score === null) return null;

  const durationSec = raw.status === 'saved'
    ? durationAtCompletion(startedAt, completedAt)
    : null;
  const submission = {
    counts,
    photoConfirmed: assessment.photoConfirmed,
    aiAssisted: assessment.aiAssisted,
    location,
    locationOnStream,
    durationSec,
  };

  let fhirBundle = null;
  if (raw.status === 'saved' && isObject(raw.fhirBundle)) {
    try {
      if (validateBundle(raw.fhirBundle).valid) fhirBundle = raw.fhirBundle;
      else warn();
    } catch {
      warn();
    }
  }

  const record = {
    id: raw.id,
    schemaVersion: 1,
    status: raw.status,
    lastStepIndex: Math.min(4, Math.max(0, raw.lastStepIndex)),
    assessment,
    landUse,
    rain,
    submission,
    score,
    classKey,
    fhirBundle,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    completedAt,
  };
  Object.defineProperty(record, 'reconstructionWarnings', { value: warnings, enumerable: false });
  return record;
}

export function reconstructRecords(rawRecords, streams = [], onWarning = () => {}) {
  if (!Array.isArray(rawRecords)) {
    onWarning(new DeviceStorageError('storage-corrupt', 'list-records'));
    return [];
  }
  return rawRecords.map((raw) => reconstructRecord(raw, streams, onWarning)).filter(Boolean);
}

export function historyEntryFromRecord(record) {
  const normalized = record?.status === 'saved' ? record : null;
  if (!normalized || !validIso(normalized.completedAt)) return null;
  return {
    id: normalized.assessment.id,
    date: normalized.completedAt.slice(0, 10),
    score: normalized.score,
    classKey: normalized.classKey,
    counts: { ...normalized.assessment.counts },
    submission: {
      ...normalized.submission,
      counts: { ...normalized.assessment.counts },
      durationSec: durationAtCompletion(normalized.assessment.startedAt, normalized.completedAt),
    },
    mine: true,
    assessmentCreatedAt: normalized.assessment.createdAt,
  };
}

export function historyMapFromRecords(records = []) {
  const map = {};
  for (const record of records) {
    const entry = historyEntryFromRecord(record);
    const streamId = record?.assessment?.streamId;
    if (!entry || !validId(streamId)) continue;
    (map[streamId] ||= []).push(entry);
  }
  return map;
}

export function recordFingerprint(record) {
  return JSON.stringify(canonicalize(record, new Set(['updatedAt'])));
}

export function selectRecordExportSource({
  id,
  activeRecordId,
  latestSnapshot,
  lastDurableFingerprint,
  storedRecord,
}) {
  if (
    id === activeRecordId &&
    latestSnapshot?.id === id &&
    recordFingerprint(latestSnapshot) !== lastDurableFingerprint
  ) return latestSnapshot;
  return storedRecord ?? (latestSnapshot?.id === id ? latestSnapshot : null);
}

export async function buildRecordExport(record, { includePhoto = false, photoBlob = null } = {}) {
  if (!record) throw new TypeError('A record is required');
  const output = cloneJson(record);
  output.photo = {
    ...(record.assessment.photo ?? {}),
    included: false,
  };
  if (includePhoto && photoBlob instanceof Blob) {
    output.photo.included = true;
    output.photo.base64 = await blobToBase64(photoBlob);
  }
  return output;
}

export async function migrateLegacyHistory(adapter, legacyHistory, streams = []) {
  if (!adapter?.migrateLegacy) return { migrated: 0, warnings: [] };
  const { records, warnings } = buildLegacyRecords(legacyHistory, streams);
  const result = await adapter.migrateLegacy(records);
  return { migrated: result.migrated, warnings };
}

export function createMemoryAdapter(initial = {}) {
  const records = new Map((initial.records ?? []).map((record) => [record.id, cloneValue(record)]));
  const photos = new Map();
  let migrated = initial.legacyHistoryMigratedV1 === true;
  return {
    mode: 'memory',
    async listRecords() { return [...records.values()].map(cloneValue); },
    async getRecord(id) { return records.has(id) ? cloneValue(records.get(id)) : null; },
    async getPhoto(recordId) {
      const value = [...photos.values()].find((photo) => photo.recordId === recordId);
      return value ? cloneValue(value) : null;
    },
    async putRecord(record, photoChange) {
      records.set(record.id, cloneValue(record));
      applyPhotoChange(photos, record.id, photoChange);
      return { durable: false };
    },
    async deleteRecord(id) {
      records.delete(id);
      for (const [photoId, photo] of photos) if (photo.recordId === id) photos.delete(photoId);
      return { durable: false };
    },
    async migrateLegacy(nextRecords) {
      if (migrated) return { migrated: 0, durable: false };
      for (const record of nextRecords) records.set(record.id, cloneValue(record));
      migrated = true;
      return { migrated: nextRecords.length, durable: false };
    },
  };
}

export function createLocalStorageAdapter(storage) {
  function read() {
    const raw = storage.getItem(DEVICE_STORAGE_KEY);
    if (!raw) return { metadata: { legacyHistoryMigratedV1: false }, records: [] };
    let payload;
    try { payload = JSON.parse(raw); } catch (error) { warnOperation('read-localstorage', error); throw storageError('storage-corrupt', 'read-localstorage', error); }
    if (!isObject(payload) || !Array.isArray(payload.records)) { const error = storageError('storage-corrupt', 'read-localstorage'); warnOperation('read-localstorage', error); throw error; }
    return {
      metadata: { legacyHistoryMigratedV1: payload.metadata?.legacyHistoryMigratedV1 === true },
      records: payload.records,
    };
  }
  function write(payload, operation) {
    const serialized = JSON.stringify(payload);
    if (new TextEncoder().encode(serialized).byteLength > LOCAL_STORAGE_LIMIT) {
      const error = storageError('storage-quota', operation);
      warnOperation(operation, error);
      throw error;
    }
    try { storage.setItem(DEVICE_STORAGE_KEY, serialized); }
    catch (error) { warnOperation(operation, error); throw storageError(isQuotaError(error) ? 'storage-quota' : 'storage-write', operation, error); }
  }
  return {
    mode: 'localstorage',
    async listRecords() { return read().records.map(cloneValue); },
    async getRecord(id) { return cloneValue(read().records.find((record) => record.id === id) ?? null); },
    async getPhoto() { return null; },
    async putRecord(record) {
      const payload = read();
      const compact = compactRecord(record);
      const index = payload.records.findIndex((item) => item.id === record.id);
      if (index >= 0) payload.records[index] = compact;
      else payload.records.push(compact);
      write(payload, 'put-record');
      return { durable: true };
    },
    async deleteRecord(id) {
      const payload = read();
      payload.records = payload.records.filter((record) => record.id !== id);
      write(payload, 'delete-record');
      return { durable: true };
    },
    async migrateLegacy(records) {
      const payload = read();
      if (payload.metadata.legacyHistoryMigratedV1) return { migrated: 0, durable: true };
      const byId = new Map(payload.records.map((record) => [record.id, record]));
      for (const record of records) byId.set(record.id, compactRecord(record));
      payload.records = [...byId.values()];
      payload.metadata.legacyHistoryMigratedV1 = true;
      write(payload, 'migrate-legacy');
      return { migrated: records.length, durable: true };
    },
  };
}

function createIndexedDbAdapter(db) {
  return {
    mode: 'indexeddb',
    async listRecords() {
      return requestInTransaction(db, ['records'], 'readonly', ({ records }) => request(records.getAll()), 'list-records');
    },
    async getRecord(id) {
      return requestInTransaction(db, ['records'], 'readonly', ({ records }) => request(records.get(id)), 'get-record').then((value) => value ?? null);
    },
    async getPhoto(recordId) {
      return requestInTransaction(db, ['photos'], 'readonly', ({ photos }) => request(photos.index('recordId').get(recordId)), 'get-photo').then((value) => value ?? null);
    },
    async putRecord(record, photoChange) {
      await requestInTransaction(db, ['records', 'photos'], 'readwrite', async ({ records, photos }) => {
        await request(records.put(cloneValue(record)));
        if (photoChange !== undefined) {
          const current = await request(photos.index('recordId').getAllKeys(record.id));
          for (const key of current) await request(photos.delete(key));
          if (photoChange) await request(photos.put(photoDescriptor(record.id, photoChange)));
        }
      }, 'put-record');
      return { durable: true };
    },
    async deleteRecord(id) {
      await requestInTransaction(db, ['records', 'photos'], 'readwrite', async ({ records, photos }) => {
        await request(records.delete(id));
        const current = await request(photos.index('recordId').getAllKeys(id));
        for (const key of current) await request(photos.delete(key));
      }, 'delete-record');
      return { durable: true };
    },
    async migrateLegacy(records) {
      return requestInTransaction(db, ['records', 'meta'], 'readwrite', async ({ records: store, meta }) => {
        const marker = await request(meta.get(LEGACY_MIGRATION_KEY));
        if (marker?.value === true) return { migrated: 0, durable: true };
        for (const record of records) await request(store.put(cloneValue(record)));
        await request(meta.put({ key: LEGACY_MIGRATION_KEY, value: true }));
        return { migrated: records.length, durable: true };
      }, 'migrate-legacy');
    },
  };
}

function openDatabase(idb) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = idb.open(DEVICE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const records = db.createObjectStore('records', { keyPath: 'id' });
      records.createIndex('status', 'status');
      records.createIndex('updatedAt', 'updatedAt');
      records.createIndex('streamId', 'assessment.streamId');
      const photos = db.createObjectStore('photos', { keyPath: 'id' });
      photos.createIndex('recordId', 'recordId');
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onblocked = () => {
      if (!settled) { settled = true; reject(new DeviceStorageError('storage-blocked', 'open-indexeddb')); }
    };
    req.onerror = () => {
      if (!settled) { settled = true; reject(req.error); }
    };
    req.onsuccess = () => {
      if (!settled) { settled = true; resolve(req.result); }
      else req.result.close();
    };
  });
}

function requestInTransaction(db, names, mode, work, operation) {
  return new Promise((resolve, reject) => {
    let result;
    let workError = null;
    const tx = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((name) => [name, tx.objectStore(name)]));
    Promise.resolve().then(() => work(stores)).then((value) => { result = value; }).catch((error) => {
      workError = error;
      try { tx.abort(); } catch { /* transaction may already be inactive */ }
    });
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(storageError(isQuotaError(workError || tx.error) ? 'storage-quota' : 'storage-write', operation, workError || tx.error));
    tx.onerror = () => { /* onabort owns the rejection */ };
  }).catch((error) => {
    warnOperation(operation, error);
    throw error;
  });
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function buildLegacyRecords(history, streams) {
  const knownStreams = new Set(streams.map((stream) => stream.id));
  const records = [];
  const warnings = [];
  if (!isObject(history)) return { records, warnings };
  for (const [streamId, entries] of Object.entries(history)) {
    if (!knownStreams.has(streamId) || !Array.isArray(entries)) continue;
    entries.forEach((entry, index) => {
      if (!isObject(entry) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !validIso(`${entry.date}T12:00:00.000Z`)) {
        warnings.push(new DeviceStorageError('storage-corrupt', 'migrate-legacy'));
        return;
      }
      const completedAt = `${entry.date}T12:00:00.000Z`;
      const id = `legacy-${streamId}-${entry.date}-${index}`;
      const counts = normalizeCounts(entry.counts);
      const biotic = scoreAssessment(counts);
      if (biotic.score === null && typeof entry.score !== 'number') {
        warnings.push(new DeviceStorageError('storage-corrupt', 'migrate-legacy'));
        return;
      }
      const assessment = {
        id,
        schemaVersion: 1,
        streamId,
        counts,
        photo: null,
        photoConfirmed: false,
        aiAssisted: false,
        aiReview: null,
        location: null,
        locationOnStream: null,
        startedAt: null,
        createdAt: completedAt,
        updatedAt: completedAt,
      };
      const score = biotic.score ?? entry.score;
      const classKey = biotic.classKey ?? entry.classKey ?? null;
      records.push({
        id,
        schemaVersion: 1,
        status: 'saved',
        lastStepIndex: 4,
        assessment,
        landUse: 'mixed',
        rain: null,
        submission: { counts, photoConfirmed: false, aiAssisted: false, location: null, locationOnStream: null, durationSec: null },
        score,
        classKey,
        fhirBundle: null,
        createdAt: completedAt,
        updatedAt: completedAt,
        completedAt,
      });
    });
  }
  return { records, warnings };
}

function normalizeCounts(value) {
  const counts = {};
  if (!isObject(value)) return counts;
  for (const [id, count] of Object.entries(value)) {
    if (getTaxon(id) && Number.isSafeInteger(count) && count >= 0) counts[id] = count;
  }
  return counts;
}

function normalizeRain(value) {
  if (value === null || value === undefined) return null;
  if (!isObject(value) || typeof value.heavyRain !== 'boolean') return null;
  if (value.recentRainMm !== null && !(Number.isFinite(value.recentRainMm) && value.recentRainMm >= 0)) return null;
  if (typeof value.source !== 'string' || value.source.length > 160) return null;
  return { heavyRain: value.heavyRain, recentRainMm: value.recentRainMm, source: value.source };
}

function normalizePhoto(value) {
  if (value === null || value === undefined) return null;
  if (!isObject(value) || !validId(value.id)) return null;
  if (typeof value.name !== 'string' || !['image/jpeg', 'image/png'].includes(value.type)) return null;
  if (!Number.isSafeInteger(value.size) || value.size < 1 || value.size > 10 * 1024 * 1024) return null;
  if (!Number.isFinite(value.lastModified) || value.lastModified < 0) return null;
  return { id: value.id, name: value.name, type: value.type, size: value.size, lastModified: value.lastModified };
}

function normalizeAiReview(value, assessment) {
  if (!isObject(value) || !isObject(value.human) || !isObject(value.model) || !assessment.photo) return null;
  const humanId = value.human.taxonId;
  if (!getTaxon(humanId) || !(assessment.counts[humanId] > 0) || value.human.source !== 'citizen-count' || !validIso(value.human.confirmedAt)) return null;
  const model = value.model;
  if (model.photoId !== assessment.photo.id || (model.taxonId !== null && !getTaxon(model.taxonId))) return null;
  if (!Number.isFinite(model.confidence) || model.confidence < 0 || model.confidence > 1 || !validIso(model.analyzedAt)) return null;
  if (!['nova-vision', 'stub', 'stub-fallback'].includes(model.provider)) return null;
  if (!Array.isArray(model.cues) || model.cues.length > 8 || model.cues.some((cue) => typeof cue !== 'string' || cue.length > 200)) return null;
  if (!Array.isArray(model.alternatives) || model.alternatives.length > 5) return null;
  if (model.alternatives.some((alternative) =>
    !isObject(alternative) ||
    !getTaxon(alternative.taxonId) ||
    typeof alternative.confidence !== 'number' ||
    !Number.isFinite(alternative.confidence)
  )) return null;
  const raw = { taxonId: model.taxonId, confidence: model.confidence, reasoning: model.cues, alternatives: model.alternatives, provider: model.provider };
  const policy = applyConfidencePolicy(raw, model.provider);
  if (policy.status !== model.policyStatus) return null;
  const outcome = policy.status === 'defer' ? 'defer' : policy.taxonId === humanId ? 'agreement' : 'disagreement';
  if (outcome !== value.outcome) return null;
  return cloneJson({
    ...value,
    model: {
      ...model,
      alternatives: policy.alternatives,
    },
  });
}

function durationAtCompletion(startedAt, completedAt) {
  if (!Number.isFinite(startedAt)) return null;
  return Math.max(0, Math.round((Date.parse(completedAt) - startedAt) / 1000));
}

function compactRecord(record) {
  const compact = cloneJson({ ...record, fhirBundle: null });
  return compact;
}

function photoDescriptor(recordId, change) {
  const metadata = change.metadata ?? change;
  const blob = change.blob;
  return { id: metadata.id, recordId, blob, name: metadata.name, type: metadata.type, size: metadata.size, lastModified: metadata.lastModified };
}

function applyPhotoChange(photos, recordId, change) {
  if (change === undefined) return;
  for (const [id, photo] of photos) if (photo.recordId === recordId) photos.delete(id);
  if (change) {
    const descriptor = photoDescriptor(recordId, change);
    photos.set(descriptor.id, descriptor);
  }
}

function canonicalize(value, excluded) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, excluded));
  if (!isObject(value)) return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (!excluded.has(key)) result[key] = canonicalize(value[key], excluded);
    return result;
  }, {});
}

function cloneValue(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return cloneJson(value);
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function finiteLocation(value) {
  return isObject(value) && Number.isFinite(value.lat) && Number.isFinite(value.lon);
}

function validId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeLocalStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function storageIsWritable(storage) {
  const key = `${DEVICE_STORAGE_KEY}.probe`;
  try { storage.setItem(key, '1'); storage.removeItem(key); return true; }
  catch (error) { warnOperation('open-localstorage', error); return false; }
}

function storageError(code, operation, cause) {
  return new DeviceStorageError(code, operation, cause);
}

function asStorageError(error, code, operation) {
  return error instanceof DeviceStorageError ? error : new DeviceStorageError(code, operation, error);
}

function isQuotaError(error) {
  return error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

function warnOperation(operation, error) {
  console.warn(`[Bahari storage] ${operation}: ${error?.name || 'Error'}`);
}

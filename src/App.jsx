import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import seed from './data/seed-streams.json';
import { STEPS, elapsedSeconds, newAssessment } from './core/assessment.js';
import { buildContext, fetchRecentRain } from './core/context.js';
import { identifyTaxon } from './core/ai-assist.js';
import { blobToBase64 } from './core/photo.js';
import { scoreAssessment } from './core/biotic-index.js';
import { loadLegacyHistory, mergedHistory } from './core/history.js';
import {
  buildRecordExport,
  DeviceStorageError,
  historyEntryFromRecord,
  migrateLegacyHistory,
  openDeviceRecords,
  recordFingerprint,
  reconstructRecord,
  reconstructRecords,
  selectRecordExportSource,
} from './core/device-records.js';
import { applyWaitingUpdate, getUpdateState, subscribeUpdateState } from './core/service-worker-client.js';
import { Stepper2 } from './ui/primitives.jsx';
import { I18nProvider, useT } from './i18n/I18n.jsx';
import { LANGUAGES } from './i18n/strings.js';
import StepStream from './steps/StepStream.jsx';
import StepAssess from './steps/StepAssess.jsx';
import StepResult from './steps/StepResult.jsx';
import StepOneHealth from './steps/StepOneHealth.jsx';
import StepFhir from './steps/StepFhir.jsx';
import Dashboard from './Dashboard.jsx';
import Landing from './Landing.jsx';
import FieldRecords from './ui/FieldRecords.jsx';
import DeviceStatus from './ui/DeviceStatus.jsx';

export default function App() {
  return <I18nProvider><AppInner /></I18nProvider>;
}

function AppInner() {
  const { t, lang, setLang } = useT();
  const streams = seed.streams || [];
  const firstRecordRef = useRef(null);
  if (!firstRecordRef.current) firstRecordRef.current = createPendingRecord(newAssessment(streams[0]?.id ?? null));

  const [view, setView] = useState('home');
  const [stepIndex, setStepIndex] = useState(0);
  const [assessmentRecord, setAssessmentRecord] = useState(firstRecordRef.current);
  const [records, setRecords] = useState([]);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [storageMode, setStorageMode] = useState('memory');
  const [storageWarning, setStorageWarning] = useState(null);
  const [unsavedIds, setUnsavedIds] = useState(() => new Set([firstRecordRef.current.id]));
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [updateState, setUpdateState] = useState(getUpdateState());
  const [operationError, setOperationError] = useState(null);
  const [updateFailure, setUpdateFailure] = useState(false);

  const assessmentRef = useRef(firstRecordRef.current.assessment);
  const activeAiRequestRef = useRef(null);
  const aiRequestIdRef = useRef(0);
  const adapterRef = useRef(null);
  const storageModeRef = useRef('memory');
  const activeTrackedRef = useRef(false);
  const latestSnapshotRef = useRef(firstRecordRef.current);
  const activeRecordIdRef = useRef(firstRecordRef.current.id);
  const activePhotoBlobRef = useRef(null);
  const activeWeatherRequestRef = useRef(null);
  const weatherRequestIdRef = useRef(0);
  const pendingCountSaveRef = useRef(null);
  const pendingJobsRef = useRef(new Map());
  const pendingPhotoMutationsRef = useRef(new Map());
  const photoMutationIdRef = useRef(0);
  const runningIdsRef = useRef(new Set());
  const queuedFingerprintsRef = useRef(new Map());
  const inFlightFingerprintsRef = useRef(new Map());
  const lastDurableFingerprintByRecord = useRef(new Map());
  const drainSaveRef = useRef(null);

  const upsertRecord = useCallback((record) => {
    setRecords((current) => {
      const next = current.filter((item) => item.id !== record.id);
      next.push(record);
      return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }, []);

  const markUnsaved = useCallback((id, unsaved) => {
    setUnsavedIds((current) => {
      const next = new Set(current);
      if (unsaved) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const enqueueSave = useCallback(({ record, photoChange, reason = 'autosave' }) => {
    const fingerprint = recordFingerprint(record);
    const id = record.id;
    if (photoChange !== undefined) {
      pendingPhotoMutationsRef.current.set(id, {
        id: ++photoMutationIdRef.current,
        change: photoChange,
      });
    }
    if (
      photoChange === undefined &&
      !pendingPhotoMutationsRef.current.has(id) && (
        lastDurableFingerprintByRecord.current.get(id) === fingerprint ||
        queuedFingerprintsRef.current.get(id) === fingerprint ||
        inFlightFingerprintsRef.current.get(id) === fingerprint
      )
    ) return;
    pendingJobsRef.current.set(id, {
      record,
      reason,
      fingerprint,
    });
    queuedFingerprintsRef.current.set(id, fingerprint);
    markUnsaved(id, true);
    queueMicrotask(() => drainSaveRef.current?.(id));
  }, [markUnsaved]);

  drainSaveRef.current = async (id) => {
    if (runningIdsRef.current.has(id) || !adapterRef.current) return;
    const job = pendingJobsRef.current.get(id);
    if (!job) return;
    const photoMutation = pendingPhotoMutationsRef.current.get(id);
    pendingJobsRef.current.delete(id);
    queuedFingerprintsRef.current.delete(id);
    runningIdsRef.current.add(id);
    inFlightFingerprintsRef.current.set(id, job.fingerprint);
    try {
      const result = await adapterRef.current.putRecord(job.record, photoMutation?.change);
      if (result.durable) {
        if (pendingPhotoMutationsRef.current.get(id)?.id === photoMutation?.id) {
          pendingPhotoMutationsRef.current.delete(id);
        }
        lastDurableFingerprintByRecord.current.set(id, job.fingerprint);
        const latest = id === activeRecordIdRef.current ? latestSnapshotRef.current : job.record;
        if (
          recordFingerprint(latest) === job.fingerprint &&
          !pendingPhotoMutationsRef.current.has(id) &&
          !pendingJobsRef.current.has(id)
        ) markUnsaved(id, false);
      } else {
        markUnsaved(id, true);
      }
      setStorageWarning(result.durable ? null : storageWarning || new Error('memory-only'));
    } catch (error) {
      setStorageWarning(error);
      markUnsaved(id, true);
    } finally {
      runningIdsRef.current.delete(id);
      inFlightFingerprintsRef.current.delete(id);
      if (pendingJobsRef.current.has(id)) queueMicrotask(() => drainSaveRef.current?.(id));
    }
  };

  // The trailing count save is bound to the record captured when it was scheduled, so an
  // active-record transition can never redirect it through latestSnapshotRef. Returns the
  // record id that was enqueued, or null when nothing was pending or it was cancelled.
  const flushCountSave = useCallback(({ cancelFor = null } = {}) => {
    const pending = pendingCountSaveRef.current;
    if (!pending) return null;
    clearTimeout(pending.timer);
    pendingCountSaveRef.current = null;
    if (cancelFor === pending.id) return null;
    enqueueSave({ record: pending.record, reason: pending.reason });
    return pending.id;
  }, [enqueueSave]);

  const settleRecordSave = useCallback(async (id) => {
    while (pendingJobsRef.current.has(id) || runningIdsRef.current.has(id)) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }, []);

  const stageSnapshot = useCallback((record, { save = 'immediate', photoChange, reason } = {}) => {
    // A newer snapshot of the same record supersedes its trailing save; any other record's
    // pending snapshot is enqueued before the active refs move on.
    flushCountSave({ cancelFor: record.id });
    activeTrackedRef.current = true;
    latestSnapshotRef.current = record;
    assessmentRef.current = record.assessment;
    activeRecordIdRef.current = record.id;
    setAssessmentRecord(record);
    upsertRecord(record);
    markUnsaved(record.id, recordFingerprint(record) !== lastDurableFingerprintByRecord.current.get(record.id));
    if (save === 'debounced') {
      const countReason = reason || 'counts';
      const timer = setTimeout(() => {
        if (pendingCountSaveRef.current?.timer !== timer) return;
        pendingCountSaveRef.current = null;
        enqueueSave({ record, reason: countReason });
      }, 600);
      pendingCountSaveRef.current = { timer, id: record.id, record, reason: countReason };
    } else if (save === 'immediate') {
      enqueueSave({ record, photoChange, reason });
    }
  }, [enqueueSave, flushCountSave, markUnsaved, upsertRecord]);

  const refreshRecords = useCallback(async () => {
    if (!adapterRef.current) return;
    try {
      const normalized = reconstructRecords(await adapterRef.current.listRecords(), streams, setStorageWarning);
      const active = latestSnapshotRef.current;
      if (activeTrackedRef.current && active && !normalized.some((record) => record.id === active.id)) normalized.push(active);
      setRecords(normalized.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch (error) {
      setStorageWarning(error);
    }
  }, [streams]);

  const resumeRecord = useCallback(async (id, { consumeQuery = false } = {}) => {
    if (!adapterRef.current) return false;
    // Flush the outgoing record's trailing count save before this resume replaces the refs.
    if (flushCountSave() === id) await settleRecordSave(id);
    try {
      const raw = await adapterRef.current.getRecord(id);
      const record = reconstructRecord(raw, streams, setStorageWarning);
      if (!record) throw new Error('invalid record');
      let storedPhoto = null;
      try { storedPhoto = await adapterRef.current.getPhoto(id); }
      catch (error) { setStorageWarning(error); }
      const blob = photoBlobForRecord(storedPhoto, record);
      if (storedPhoto && !blob) {
        setStorageWarning(new DeviceStorageError('storage-corrupt', 'resume-photo'));
      }
      let restored = record;
      if (record.assessment.photo && !blob && record.assessment.aiReview) {
        restored = {
          ...record,
          assessment: { ...record.assessment, aiReview: null, aiAssisted: false },
          submission: { ...record.submission, aiAssisted: false },
        };
      }
      activeWeatherRequestRef.current = null;
      activeAiRequestRef.current = null;
      activeTrackedRef.current = true;
      activeRecordIdRef.current = restored.id;
      latestSnapshotRef.current = restored;
      assessmentRef.current = restored.assessment;
      activePhotoBlobRef.current = blob;
      setPhotoBlob(blob);
      setAssessmentRecord(restored);
      setStepIndex(restored.status === 'saved' ? Math.max(3, restored.lastStepIndex) : restored.lastStepIndex);
      setView('assess');
      setOperationError(null);
      if (storageModeRef.current !== 'memory') {
        const durableFingerprint = recordFingerprint(record);
        lastDurableFingerprintByRecord.current.set(restored.id, durableFingerprint);
        markUnsaved(restored.id, recordFingerprint(restored) !== durableFingerprint);
      }
      upsertRecord(restored);
      if (consumeQuery) clearResumeQuery();
      return true;
    } catch {
      setOperationError(t('records.error.resume'));
      return false;
    }
  }, [flushCountSave, markUnsaved, settleRecordSave, storageMode, streams, t, upsertRecord]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const opened = await openDeviceRecords();
      if (cancelled) return;
      adapterRef.current = opened.adapter;
      storageModeRef.current = opened.mode;
      setStorageMode(opened.mode);
      setStorageWarning(opened.warning);
      try {
        const migration = await migrateLegacyHistory(opened.adapter, loadLegacyHistory, streams);
        if (migration.warnings.length) setStorageWarning(migration.warnings[0]);
      } catch (error) {
        setStorageWarning(error);
      }
      await refreshRecords();
      const resumeId = new URL(location.href).searchParams.get('resume');
      if (resumeId) await resumeRecord(resumeId, { consumeQuery: true });
      for (const id of pendingJobsRef.current.keys()) drainSaveRef.current?.(id);
    })();
    return () => { cancelled = true; };
  }, []); // initialization is intentionally once per app session

  useEffect(() => subscribeUpdateState(setUpdateState), []);
  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    const flushHidden = () => {
      if (document.visibilityState === 'hidden' && latestSnapshotRef.current) {
        enqueueSave({ record: latestSnapshotRef.current, reason: 'hidden' });
      }
    };
    document.addEventListener('visibilitychange', flushHidden);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      document.removeEventListener('visibilitychange', flushHidden);
    };
  }, [enqueueSave]);

  const assessment = assessmentRecord.assessment;
  const landUse = assessmentRecord.landUse;
  const rain = assessmentRecord.rain;
  const step = STEPS[stepIndex];
  const stream = streams.find((item) => item.id === assessment.streamId) || null;
  const context = useMemo(() => buildContext({ date: assessment.createdAt, landUse, rain }), [assessment.createdAt, landUse, rain]);
  const submission = useMemo(() => buildSubmission(assessment, assessmentRecord.completedAt), [assessment, assessmentRecord.completedAt]);

  const preparedHistory = useMemo(() => prepareHistory(streams, records), [records, streams]);
  const historyByStream = preparedHistory.historyByStream;
  const historyWarningCount = preparedHistory.warningCount;

  function patchRecord({ assessmentPatch, ...recordPatch }, options) {
    const current = latestSnapshotRef.current;
    if (current.status === 'saved') return;
    const updatedAt = new Date().toISOString();
    const nextAssessment = assessmentPatch ? { ...current.assessment, ...assessmentPatch, updatedAt } : current.assessment;
    const nextSubmission = recordPatch.submission ?? buildSubmission(nextAssessment, current.completedAt);
    stageSnapshot({ ...current, ...recordPatch, submission: nextSubmission, assessment: nextAssessment, updatedAt }, options);
  }

  function invalidateAiRequest() {
    activeAiRequestRef.current = null;
  }

  function changeCounts(counts) {
    if (latestSnapshotRef.current.status === 'saved') return;
    const currentAssessment = assessmentRef.current;
    let aiReview = currentAssessment.aiReview;
    let aiAssisted = currentAssessment.aiAssisted;
    const activeHumanTaxonId = activeAiRequestRef.current?.humanTaxonId;
    if (activeHumanTaxonId && !(counts[activeHumanTaxonId] > 0)) invalidateAiRequest();
    if (aiReview && !(counts[aiReview.human?.taxonId] > 0)) {
      aiReview = null;
      aiAssisted = false;
    }
    patchRecord({ assessmentPatch: { counts, aiReview, aiAssisted } }, { save: 'debounced', reason: 'counts' });
  }

  function handlePhotoChange({ metadata, blob }) {
    if (latestSnapshotRef.current.status === 'saved') return;
    invalidateAiRequest();
    activePhotoBlobRef.current = blob;
    setPhotoBlob(blob);
    patchRecord(
      { assessmentPatch: { photo: metadata, photoConfirmed: true, aiReview: null, aiAssisted: false } },
      { photoChange: { metadata, blob }, reason: 'photo' },
    );
  }

  function handlePhotoRemove() {
    if (latestSnapshotRef.current.status === 'saved') return;
    invalidateAiRequest();
    activePhotoBlobRef.current = null;
    setPhotoBlob(null);
    patchRecord(
      { assessmentPatch: { photo: null, photoConfirmed: false, aiReview: null, aiAssisted: false } },
      { photoChange: null, reason: 'photo-remove' },
    );
  }

  async function handleAiAnalysis({ humanTaxonId, photoId }) {
    const current = latestSnapshotRef.current;
    const currentAssessment = assessmentRef.current;
    const blob = activePhotoBlobRef.current;
    if (
      current.status !== 'pending' ||
      currentAssessment.photo?.id !== photoId ||
      !(currentAssessment.counts?.[humanTaxonId] > 0) ||
      !(blob instanceof Blob)
    ) return null;

    const tuple = { requestId: ++aiRequestIdRef.current, photoId, humanTaxonId };
    activeAiRequestRef.current = tuple;
    let result;
    try {
      const imageBase64 = await blobToBase64(blob);
      const imageFormat = currentAssessment.photo.type === 'image/png' ? 'png' : 'jpeg';
      result = await identifyTaxon({
        imageBase64,
        imageFormat,
        photoName: currentAssessment.photo.name,
        seed: currentAssessment.photo.name.length,
      });
    } catch (error) {
      if (activeAiRequestRef.current !== tuple) return null;
      activeAiRequestRef.current = null;
      console.warn(`[Bahari AI] analysis: ${error?.name || 'Error'}`);
      throw error;
    }

    const active = activeAiRequestRef.current;
    const latestAssessment = assessmentRef.current;
    if (
      !active ||
      active.requestId !== tuple.requestId ||
      active.photoId !== tuple.photoId ||
      active.humanTaxonId !== tuple.humanTaxonId ||
      latestAssessment.photo?.id !== tuple.photoId ||
      !(latestAssessment.counts?.[tuple.humanTaxonId] > 0)
    ) return null;

    activeAiRequestRef.current = null;
    const analyzedAt = new Date().toISOString();
    const aiReview = {
      human: {
        taxonId: tuple.humanTaxonId,
        source: 'citizen-count',
        confirmedAt: analyzedAt,
      },
      model: {
        photoId: tuple.photoId,
        taxonId: result.taxonId,
        confidence: result.confidence,
        policyStatus: result.status,
        provider: result.provider,
        cues: result.reasoning,
        alternatives: result.alternatives,
        analyzedAt,
      },
      outcome: result.status === 'defer'
        ? 'defer'
        : result.taxonId === tuple.humanTaxonId
          ? 'agreement'
          : 'disagreement',
    };
    patchRecord(
      { assessmentPatch: { aiReview, aiAssisted: true } },
      { save: 'immediate', reason: 'ai-review' },
    );
    return aiReview;
  }

  function go(nextIndex) {
    const bounded = Math.max(0, Math.min(STEPS.length - 1, nextIndex));
    const current = latestSnapshotRef.current;
    if (current.status === 'saved') {
      if (bounded <= 1) {
        startRecord(current.assessment.streamId, bounded);
      } else if (bounded === 4 && current.lastStepIndex !== 4) {
        stageSnapshot(
          { ...current, lastStepIndex: 4, updatedAt: new Date().toISOString() },
          { reason: 'step-transition' },
        );
        setStepIndex(4);
      } else {
        setStepIndex(bounded);
      }
      return;
    }
    patchRecord({ lastStepIndex: bounded }, { reason: 'step-transition' });
    setStepIndex(bounded);
  }

  async function goOneHealth() {
    const current = latestSnapshotRef.current;
    if (current.status === 'saved') {
      setStepIndex(3);
      return;
    }
    const biotic = scoreAssessment(current.assessment.counts);
    if (biotic.score === null) return;
    const completedAt = current.completedAt ?? new Date().toISOString();
    const savedRecord = {
      ...current,
      status: 'saved',
      lastStepIndex: 3,
      submission: buildSubmission(current.assessment, completedAt),
      score: biotic.score,
      classKey: biotic.classKey,
      completedAt,
      updatedAt: new Date().toISOString(),
    };
    stageSnapshot(savedRecord, { reason: 'completion' });
    setStepIndex(3);
    if (!stream || savedRecord.rain !== null) return;

    const tuple = { assessmentId: savedRecord.id, streamId: stream.id, requestId: ++weatherRequestIdRef.current };
    activeWeatherRequestRef.current = tuple;
    try {
      const nextRain = await fetchRecentRain({ lat: stream.lat, lon: stream.lon });
      const active = activeWeatherRequestRef.current;
      const latest = latestSnapshotRef.current;
      if (!active || active.requestId !== tuple.requestId || active.assessmentId !== latest.id || active.streamId !== latest.assessment.streamId) return;
      const postRain = { ...latest, rain: nextRain, updatedAt: new Date().toISOString() };
      stageSnapshot(postRain, { reason: 'weather' });
    } catch (error) {
      if (activeWeatherRequestRef.current?.requestId === tuple.requestId) {
        setStorageWarning(error);
        console.warn(`[Bahari weather] lookup: ${error?.name || 'Error'}`);
      }
    }
  }

  function startRecord(streamId, initialStepIndex = 0) {
    // Restart, dashboard stream selection, and post-delete recovery all land here: the
    // outgoing record's trailing count save must survive the ref swap below.
    flushCountSave();
    activeWeatherRequestRef.current = null;
    activeAiRequestRef.current = null;
    const boundedStepIndex = Math.max(0, Math.min(STEPS.length - 1, initialStepIndex));
    const record = {
      ...createPendingRecord(newAssessment(streamId)),
      lastStepIndex: boundedStepIndex,
    };
    activeRecordIdRef.current = record.id;
    latestSnapshotRef.current = record;
    assessmentRef.current = record.assessment;
    activePhotoBlobRef.current = null;
    setPhotoBlob(null);
    setAssessmentRecord(record);
    setStepIndex(boundedStepIndex);
    setView('assess');
    stageSnapshot(record, { reason: 'new-assessment' });
  }

  function enterAssessment() {
    if (view === 'assess') return;
    const current = latestSnapshotRef.current;
    if (current?.status === 'saved') startRecord(current.assessment.streamId);
    else setView('assess');
  }

  function restart() { startRecord(assessment.streamId); }
  function openStreamFromDashboard(streamId) { startRecord(streamId); }

  async function deleteRecord(record) {
    const name = streams.find((item) => item.id === record.assessment.streamId)?.name || t('records.unknownStream');
    if (!window.confirm(t('records.confirmDelete', { name }))) return;
    // Deleting a record must not resurrect its own trailing count save, but another
    // record's pending snapshot still has to reach storage.
    flushCountSave({ cancelFor: record.id });
    try {
      await adapterRef.current?.deleteRecord(record.id);
      setRecords((current) => current.filter((item) => item.id !== record.id));
      setUnsavedIds((current) => { const next = new Set(current); next.delete(record.id); return next; });
      lastDurableFingerprintByRecord.current.delete(record.id);
      pendingJobsRef.current.delete(record.id);
      pendingPhotoMutationsRef.current.delete(record.id);
      queuedFingerprintsRef.current.delete(record.id);
      if (activeRecordIdRef.current === record.id) startRecord(record.assessment.streamId);
      setOperationError(null);
    } catch {
      setOperationError(t('records.error.delete'));
    }
  }

  async function exportRecord(id, includePhoto = false) {
    try {
      const latest = latestSnapshotRef.current;
      let source = id === activeRecordIdRef.current && latest?.id === id ? latest : null;
      if (!source) {
        const rawStored = await adapterRef.current?.getRecord(id);
        const stored = rawStored
          ? reconstructRecord(rawStored, streams, setStorageWarning)
          : records.find((record) => record.id === id);
        source = selectRecordExportSource({
          id,
          activeRecordId: activeRecordIdRef.current,
          latestSnapshot: latest,
          lastDurableFingerprint: lastDurableFingerprintByRecord.current.get(id),
          storedRecord: stored,
        });
      }

      let blob = null;
      if (includePhoto) {
        if (id === activeRecordIdRef.current && blobMatchesPhoto(activePhotoBlobRef.current, source?.assessment?.photo)) {
          blob = activePhotoBlobRef.current;
        }
        if (!blob) {
          try {
            const storedPhoto = await adapterRef.current?.getPhoto(id);
            blob = photoBlobForRecord(storedPhoto, source);
            if (storedPhoto && !blob) {
              setStorageWarning(new DeviceStorageError('storage-corrupt', 'export-photo'));
            }
          } catch (error) {
            setStorageWarning(error);
          }
        }
      }
      const payload = await buildRecordExport(source, { includePhoto, photoBlob: blob });
      downloadJson(payload, `bahari-record-${id}.json`);
      setOperationError(null);
    } catch {
      setOperationError(t('records.error.export'));
    }
  }

  const handleBundleReady = useCallback((bundle) => {
    const bundleRecordId = assessmentRecord.id;
    const current = latestSnapshotRef.current;
    if (
      !current ||
      current.id !== bundleRecordId ||
      current.id !== activeRecordIdRef.current ||
      current.status !== 'saved' ||
      current.lastStepIndex !== 4
    ) return;
    const snapshot = { ...current, fhirBundle: bundle, completedAt: current.completedAt, updatedAt: new Date().toISOString() };
    if (recordFingerprint(snapshot) === recordFingerprint(current)) return;
    latestSnapshotRef.current = snapshot;
    setAssessmentRecord(snapshot);
    upsertRecord(snapshot);
    enqueueSave({ record: snapshot, reason: 'fhir-bundle' });
  }, [assessmentRecord.id, enqueueSave, upsertRecord]);

  async function flushLatestSnapshot() {
    while (true) {
      const current = latestSnapshotRef.current;
      if (!current) return { durable: true, recordId: null, fingerprint: null };
      if (!adapterRef.current) throw new Error('storage unavailable');

      while (runningIdsRef.current.has(current.id)) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      if (latestSnapshotRef.current?.id !== current.id) {
        markUnsaved(current.id, true);
        return { durable: false, recordId: current.id, fingerprint: null };
      }

      const snapshot = latestSnapshotRef.current;
      const fingerprint = recordFingerprint(snapshot);
      const pending = pendingJobsRef.current.get(snapshot.id);
      const photoMutation = pendingPhotoMutationsRef.current.get(snapshot.id);

      runningIdsRef.current.add(snapshot.id);
      inFlightFingerprintsRef.current.set(snapshot.id, fingerprint);
      let result;
      try {
        result = await adapterRef.current.putRecord(snapshot, photoMutation?.change);
      } finally {
        runningIdsRef.current.delete(snapshot.id);
        inFlightFingerprintsRef.current.delete(snapshot.id);
      }

      if (!result.durable) {
        markUnsaved(snapshot.id, true);
        return { durable: false, recordId: snapshot.id, fingerprint };
      }

      if (pendingPhotoMutationsRef.current.get(snapshot.id)?.id === photoMutation?.id) {
        pendingPhotoMutationsRef.current.delete(snapshot.id);
      }
      if (pendingJobsRef.current.get(snapshot.id) === pending && pending?.fingerprint === fingerprint) {
        pendingJobsRef.current.delete(snapshot.id);
        queuedFingerprintsRef.current.delete(snapshot.id);
      }
      lastDurableFingerprintByRecord.current.set(snapshot.id, fingerprint);
      const latest = latestSnapshotRef.current;
      const latestFingerprint = latest?.id === snapshot.id ? recordFingerprint(latest) : null;
      if (
        latestFingerprint === fingerprint &&
        activeRecordIdRef.current === snapshot.id &&
        !pendingPhotoMutationsRef.current.has(snapshot.id) &&
        !pendingJobsRef.current.has(snapshot.id)
      ) {
        markUnsaved(snapshot.id, false);
        return { durable: true, recordId: snapshot.id, fingerprint };
      }

      markUnsaved(snapshot.id, true);
      if (!latest || latest.id !== snapshot.id || activeRecordIdRef.current !== snapshot.id) {
        if (pendingJobsRef.current.has(snapshot.id)) {
          queueMicrotask(() => drainSaveRef.current?.(snapshot.id));
        }
        return { durable: false, recordId: snapshot.id, fingerprint };
      }
    }
  }

  async function handleApplyUpdate() {
    setUpdateFailure(false);
    const applied = await applyWaitingUpdate({
      flushLatestSnapshot,
      activeRecordId: activeRecordIdRef.current,
      isLatestSnapshot: ({ recordId, fingerprint }) => {
        const latest = latestSnapshotRef.current;
        return Boolean(
          latest &&
          latest.id === recordId &&
          activeRecordIdRef.current === recordId &&
          recordFingerprint(latest) === fingerprint
        );
      },
    });
    if (!applied) setUpdateFailure(true);
  }

  const currentFingerprint = recordFingerprint(assessmentRecord);
  const durable = lastDurableFingerprintByRecord.current.get(assessmentRecord.id) === currentFingerprint;
  const unsaved = unsavedIds.has(assessmentRecord.id);

  return (
    <div className="min-h-screen font-sans text-snow flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[999] focus:top-2 focus:left-2 focus:bg-snow focus:text-ink focus:px-3 focus:py-2 focus:rounded">{t('common.skip')}</a>
      <header className="grid-motif bg-ink border-b border-steel px-5 pt-4 pb-3 sticky top-0 z-[500]">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button onClick={() => setView('home')} className="flex min-h-11 items-center gap-2.5 text-left" aria-label="Bahari home">
            <span className="w-7 h-7 rounded grid place-items-center bg-accent text-ink font-bold text-sm" aria-hidden="true">B</span>
            <div><h1 className="text-base font-semibold tracking-tight leading-none">Bahari</h1><p className="eyebrow mt-1">{t('app.tagline')}</p></div>
          </button>
          <div className="flex items-center gap-3">
            {view === 'assess' && <Stepper2 steps={STEPS} activeIndex={stepIndex} />}
            {view === 'overview' && <span className="eyebrow">{t('dash.eyebrow')}</span>}
            <LangToggle lang={lang} setLang={setLang} />
          </div>
        </div>
        {view !== 'home' && <nav aria-label={t('nav.views')} className="max-w-xl mx-auto mt-3 grid grid-cols-3 gap-1 bg-section border border-steel rounded p-1">
          <ViewTab active={view === 'assess'} onClick={enterAssessment}>{t('nav.assess')}</ViewTab>
          <ViewTab active={view === 'overview'} onClick={() => setView('overview')}>{t('nav.overview')}</ViewTab>
          <ViewTab active={view === 'records'} onClick={() => setView('records')}>{t('nav.records')}</ViewTab>
        </nav>}
      </header>

      {view !== 'home' && <DeviceStatus online={online} durable={durable} unsaved={unsaved} mode={storageMode} warning={storageWarning} updateState={updateState} updateFailure={updateFailure} onApplyUpdate={handleApplyUpdate} />}

      {view === 'home' ? <main id="main" className="flex-1 w-full"><Landing onStart={enterAssessment} onExplore={() => setView('overview')} /></main> : (
        <main id="main" className={`flex-1 w-full mx-auto px-5 py-8 ${view === 'overview' ? 'max-w-5xl' : 'max-w-xl'}`}>
          {view === 'overview' ? <Dashboard key="overview" streams={streams} historyByStream={historyByStream} historyWarningCount={historyWarningCount} onOpenStream={openStreamFromDashboard} /> : view === 'records' ? (
            <FieldRecords records={records} streams={streams} activeRecordId={assessmentRecord.id} unsavedIds={unsavedIds} onResume={resumeRecord} onExport={exportRecord} onDelete={deleteRecord} operationError={operationError} />
          ) : <div key={`step-${stepIndex}`} className="anim-fade-up">
            {step.key === 'stream' && <StepStream streamId={assessment.streamId} onPick={(id) => patchRecord({ assessmentPatch: { streamId: id }, rain: null }, { reason: 'stream' })} landUse={landUse} onLandUse={(value) => patchRecord({ landUse: value }, { reason: 'land-use' })} historyByStream={historyByStream} onNext={() => go(1)} />}
            {step.key === 'assess' && <StepAssess counts={assessment.counts} photo={assessment.photo} photoReady={Boolean(photoBlob && assessment.photo)} aiReview={assessment.aiReview} onChange={changeCounts} onPhotoChange={handlePhotoChange} onPhotoRemove={handlePhotoRemove} onAnalyze={handleAiAnalysis} onBack={() => go(0)} onNext={() => go(2)} />}
            {step.key === 'result' && <StepResult counts={assessment.counts} streamName={stream?.name} submission={submission} onBack={() => go(1)} onNext={goOneHealth} onRestart={restart} />}
            {step.key === 'onehealth' && <StepOneHealth counts={assessment.counts} context={context} onBack={() => go(2)} onNext={() => go(4)} />}
            {step.key === 'fhir' && <StepFhir stream={stream} counts={assessment.counts} submission={submission} context={context} aiReview={assessment.aiReview} photoId={assessment.photo?.id ?? null} onBundleReady={handleBundleReady} onBack={() => go(3)} onRestart={restart} />}
          </div>}
        </main>
      )}
      <footer className="border-t border-steel text-center py-3 px-5"><span className="eyebrow">Bahari · IEEE OneAquaHealth 2026 · stream to One Health</span></footer>
    </div>
  );
}

function prepareHistory(streams, records) {
  const historyByStream = {};
  let warningCount = 0;

  for (const stream of streams) {
    const sourceSeedRows = Array.isArray(stream.history) ? stream.history : [];
    const seedRows = sourceSeedRows
      .map((entry, originalSeedIndex) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !Number.isFinite(entry.score)) {
          warningCount += 1;
          return null;
        }
        return {
          ...entry,
          id: isValidEvidenceId(entry.id) ? entry.id : `seed:${stream.id}:${originalSeedIndex}`,
          sourceOrder: originalSeedIndex,
        };
      })
      .filter(Boolean);

    const recordsForStream = records
      .filter((record) => record?.status === 'saved' && record.assessment?.streamId === stream.id)
      .slice()
      .sort((a, b) =>
        a.assessment.createdAt.localeCompare(b.assessment.createdAt) ||
        a.id.localeCompare(b.id)
      );

    const localRows = recordsForStream
      .map((record, localIndex) => {
        const entry = historyEntryFromRecord(record);
        if (!entry || !isValidEvidenceId(record.assessment?.id) || !Number.isFinite(entry.score)) {
          warningCount += 1;
          return null;
        }
        return {
          ...entry,
          id: record.assessment.id,
          sourceOrder: seedRows.length + localIndex,
        };
      })
      .filter(Boolean);

    historyByStream[stream.id] = mergedHistory(seedRows, localRows);
  }

  return { historyByStream, warningCount };
}

function isValidEvidenceId(value) {
  return typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 128;
}

function createPendingRecord(assessment) {
  return {
    id: assessment.id,
    schemaVersion: 1,
    status: 'pending',
    lastStepIndex: 0,
    assessment,
    landUse: 'mixed',
    rain: null,
    submission: buildSubmission(assessment, null),
    score: null,
    classKey: null,
    fhirBundle: null,
    createdAt: assessment.createdAt,
    updatedAt: assessment.updatedAt,
    completedAt: null,
  };
}

function buildSubmission(assessment, completedAt) {
  const durationSec = completedAt && Number.isFinite(assessment.startedAt)
    ? Math.max(0, Math.round((Date.parse(completedAt) - assessment.startedAt) / 1000))
    : elapsedSeconds(assessment);
  return {
    counts: assessment.counts,
    photoConfirmed: assessment.photoConfirmed,
    aiAssisted: assessment.aiAssisted,
    location: assessment.location,
    locationOnStream: assessment.locationOnStream,
    durationSec,
  };
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function photoBlobForRecord(storedPhoto, record) {
  const metadata = record?.assessment?.photo;
  if (
    !storedPhoto ||
    !metadata ||
    storedPhoto.id !== metadata.id ||
    storedPhoto.recordId !== record.id ||
    storedPhoto.name !== metadata.name ||
    storedPhoto.type !== metadata.type ||
    storedPhoto.size !== metadata.size ||
    storedPhoto.lastModified !== metadata.lastModified ||
    !blobMatchesPhoto(storedPhoto.blob, metadata)
  ) return null;
  return storedPhoto.blob;
}

function blobMatchesPhoto(blob, metadata) {
  return Boolean(
    blob instanceof Blob &&
    metadata &&
    blob.size === metadata.size &&
    blob.type === metadata.type
  );
}

function clearResumeQuery() {
  const url = new URL(location.href);
  url.searchParams.delete('resume');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function ViewTab({ active, onClick, children }) {
  return <button onClick={onClick} aria-pressed={active} className={'min-h-11 rounded px-2 py-2 text-sm font-medium transition-colors ' + (active ? 'bg-card text-snow' : 'text-ash hover:text-snow')}>{children}</button>;
}

function LangToggle({ lang, setLang }) {
  return <div className="flex items-center gap-0.5 bg-section border border-steel rounded p-0.5" role="group" aria-label="Language">{LANGUAGES.map((item) => <button key={item.code} onClick={() => setLang(item.code)} aria-pressed={lang === item.code} aria-label={item.name} className={'font-mono text-[10px] uppercase tracking-code min-w-11 min-h-11 px-1.5 py-1 rounded-tag transition-colors ' + (lang === item.code ? 'bg-card text-snow' : 'text-ash hover:text-snow')}>{item.label}</button>)}</div>;
}

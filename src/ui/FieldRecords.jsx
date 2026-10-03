import React, { useState } from 'react';
import { useT } from '../i18n/I18n.jsx';
import { Eyebrow } from './primitives.jsx';

export default function FieldRecords({ records, streams, activeRecordId, unsavedIds, onResume, onExport, onDelete, operationError }) {
  const { t } = useT();
  const [includePhotos, setIncludePhotos] = useState({});
  const pending = records.filter((record) => record.status === 'pending');
  const saved = records.filter((record) => record.status === 'saved');
  const names = new Map(streams.map((stream) => [stream.id, stream.name]));

  return (
    <section aria-labelledby="field-records-title" className="space-y-6 anim-fade-up">
      <div>
        <Eyebrow>{t('records.eyebrow')}</Eyebrow>
        <h2 id="field-records-title" className="text-2xl font-semibold tracking-tight mt-2">{t('records.title')}</h2>
        <p className="text-sm text-ash mt-2 leading-relaxed">{t('records.privacy')}</p>
      </div>
      {operationError && <p role="alert" className="rounded border border-health-bad/50 bg-health-bad/10 p-3 text-sm text-snow">{operationError}</p>}
      <RecordGroup title={t('records.pending')} empty={t('records.pendingEmpty')} records={pending}>
        {(record) => <RecordRow key={record.id} record={record} streamName={names.get(record.assessment.streamId)} active={record.id === activeRecordId} unsaved={unsavedIds.has(record.id)} includePhoto={includePhotos[record.id] === true} setIncludePhoto={(checked) => setIncludePhotos((current) => ({ ...current, [record.id]: checked }))} onResume={onResume} onExport={onExport} onDelete={onDelete} t={t} />}
      </RecordGroup>
      <RecordGroup title={t('records.saved')} empty={t('records.savedEmpty')} records={saved}>
        {(record) => <RecordRow key={record.id} record={record} streamName={names.get(record.assessment.streamId)} active={record.id === activeRecordId} unsaved={unsavedIds.has(record.id)} includePhoto={includePhotos[record.id] === true} setIncludePhoto={(checked) => setIncludePhotos((current) => ({ ...current, [record.id]: checked }))} onExport={onExport} onDelete={onDelete} t={t} />}
      </RecordGroup>
    </section>
  );
}

function RecordGroup({ title, empty, records, children }) {
  return <section className="space-y-2"><h3 className="text-sm font-semibold text-snow">{title} <span className="font-mono text-xs text-fog">{records.length}</span></h3>{records.length ? <div className="space-y-2">{records.map(children)}</div> : <p className="rounded border border-steel bg-section p-4 text-sm text-fog">{empty}</p>}</section>;
}

function RecordRow({ record, streamName, active, unsaved, includePhoto, setIncludePhoto, onResume, onExport, onDelete, t }) {
  const photoAvailable = Boolean(record.assessment.photo);
  return (
    <article className={`field-record-row rounded border p-4 ${active ? 'border-accent bg-card' : 'border-steel bg-section'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-snow">{streamName || t('records.unknownStream')}</p>
          <p className="font-mono text-[11px] text-ash mt-1">{new Date(record.updatedAt).toLocaleString()}</p>
        </div>
        <span className="rounded-tag border border-graphite px-2 py-1 font-mono text-[10px] uppercase tracking-code text-ash">{t(`records.state.${record.status}`)}</span>
      </div>
      {unsaved && <p className="mt-2 text-xs text-health-fair">{t('records.unsaved')}</p>}
      <label className={`mt-3 flex min-h-11 items-center gap-2 text-xs ${photoAvailable ? 'text-ash' : 'text-fog'}`}>
        <input type="checkbox" checked={includePhoto} disabled={!photoAvailable} onChange={(event) => setIncludePhoto(event.target.checked)} className="h-5 w-5 accent-[#6798ff]" />
        {t('records.includePhoto')}
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {record.status === 'pending' && <button type="button" onClick={() => onResume(record.id)} className="record-action bg-snow text-ink">{t('records.resume')}</button>}
        <button type="button" onClick={() => onExport(record.id, includePhoto)} className="record-action border border-graphite text-snow">{t('records.export')}</button>
        <button type="button" onClick={() => onDelete(record)} className="record-action border border-health-bad/50 text-health-bad">{t('records.delete')}</button>
      </div>
    </article>
  );
}

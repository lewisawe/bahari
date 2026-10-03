import React, { Suspense, lazy, useMemo, useState } from 'react';
import {
  aggregate,
  buildEvidenceRecords,
  buildPriorityRows,
  filterEvidenceRecords,
  historyByStreamFromEvidence,
  meetsReliabilityThreshold,
  normalizeThreshold,
  summarizeTrust,
} from './core/aggregate.js';
import { Eyebrow } from './ui/primitives.jsx';
import ScoreRing from './ui/ScoreRing.jsx';
import { healthColorForClass } from './core/health-colors.js';
import { useT } from './i18n/I18n.jsx';
import MapSkeleton from './ui/MapSkeleton.jsx';

const StreamMap = lazy(() => import('./ui/StreamMap.jsx'));

export default function Dashboard({
  streams = [],
  historyByStream = {},
  historyWarningCount = 0,
  onOpenStream,
}) {
  const { t } = useT();
  const [trustedOnly, setTrustedOnly] = useState(false);
  const [minimumReliability, setMinimumReliability] = useState(75);
  const [selectedStreamId, setSelectedStreamId] = useState(null);

  const allRecords = useMemo(
    () => buildEvidenceRecords(streams, historyByStream),
    [historyByStream, streams],
  );
  const trustSummary = summarizeTrust(allRecords, minimumReliability);
  const activeRecords = filterEvidenceRecords(allRecords, {
    trustedOnly,
    threshold: minimumReliability,
  });
  const activeHistoryByStream = historyByStreamFromEvidence(activeRecords, streams);
  const allHistoryByStream = historyByStreamFromEvidence(allRecords, streams);
  const allAggregate = aggregate(streams, allHistoryByStream);
  const activeAggregate = aggregate(streams, activeHistoryByStream);
  const priorityRows = buildPriorityRows(activeRecords, streams, minimumReliability);
  const recheckRecords = allRecords.filter(
    (record) => !meetsReliabilityThreshold(record, minimumReliability),
  );
  const recheckGroups = groupRecordsByStream(recheckRecords, streams);
  const selectedStream = streams.find((stream) => stream.id === selectedStreamId) ?? null;
  const selectedActiveRecord = selectedStreamId
    ? activeRecords.find((record) => record.streamId === selectedStreamId) ?? null
    : null;
  const mapStreams = streams.map((stream) => ({
    ...stream,
    history: activeHistoryByStream[stream.id] ?? [],
  }));
  const isEmpty = activeAggregate.assessmentTotal === 0;

  function changeThreshold(event) {
    setMinimumReliability((previous) => normalizeThreshold(event.target.value, previous));
  }

  return (
    <div className="space-y-5">
      <div className="anim-fade-up">
        <Eyebrow>{t('dash.eyebrow')}</Eyebrow>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tightest mt-1 text-balance">
          {t('dash.title')}
        </h2>
        <p className="text-sm text-ash mt-2 max-w-[68ch]">{t('dash.intro')}</p>
      </div>

      <section aria-labelledby="trust-console-title" className="trust-console anim-fade-up">
        <div className="trust-console__header">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-code text-accent">
              {t('dash.trust.kicker')}
            </p>
            <h3 id="trust-console-title" className="text-xl font-semibold tracking-tight mt-1">
              {t('dash.trust.title')}
            </h3>
            <p className="text-sm text-ash mt-1 max-w-[56ch]">{t('dash.trust.intro')}</p>
          </div>
          <div className="flex items-center gap-3 rounded bg-ink border border-steel px-3 py-2">
            <ScoreRing
              score={minimumReliability}
              max={100}
              color="#6798ff"
              size={72}
              stroke={5}
              glow={false}
              label={t('dash.trust.thresholdLabel', { score: minimumReliability })}
            />
            <div>
              <span className="font-mono text-[10px] uppercase tracking-code text-ash">
                {t('dash.trust.minimum')}
              </span>
              <output
                htmlFor="minimum-reliability"
                className="block text-lg font-semibold tabular-nums text-snow"
              >
                {minimumReliability}/100
              </output>
            </div>
          </div>
        </div>

        <fieldset className="trust-controls">
          <legend className="sr-only">{t('dash.trust.controls')}</legend>
          <label htmlFor="minimum-reliability" className="trust-range-label">
            <span>{t('dash.trust.rangeLabel')}</span>
            <input
              id="minimum-reliability"
              type="range"
              min="0"
              max="100"
              step="5"
              value={minimumReliability}
              onChange={changeThreshold}
              className="trust-range"
            />
          </label>
          <label className="trust-checkbox">
            <input
              type="checkbox"
              checked={trustedOnly}
              onChange={(event) => setTrustedOnly(event.target.checked)}
            />
            <span>
              <strong>{t('dash.trust.trustedOnly')}</strong>
              <small>{t('dash.trust.trustedOnlyHelp')}</small>
            </span>
          </label>
        </fieldset>

        <div className="trust-rail" role="group" aria-label={t('dash.trust.highConcern')}>
          <div className="trust-rail__segment trust-rail__segment--strong">
            <span className="trust-rail__value">{trustSummary.highConcernStrong}</span>
            <span>{t('dash.trust.highConcernStrong')}</span>
          </div>
          <div className="trust-rail__segment trust-rail__segment--weak">
            <span className="trust-rail__value">{trustSummary.highConcernWeak}</span>
            <span>{t('dash.trust.highConcernWeak')}</span>
          </div>
        </div>

        <p className="text-xs text-ash" aria-live="polite">
          {t('dash.trust.included', {
            active: activeRecords.length,
            all: allRecords.length,
            below: trustSummary.belowThreshold,
          })}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-code text-fog">
          {t('dash.trust.reference', {
            submissions: allAggregate.assessmentTotal,
            streams: allAggregate.assessedCount,
            average: allAggregate.averageScore ?? t('dash.notAvailable'),
          })}
        </p>
        {historyWarningCount > 0 && (
          <p role="status" className="rounded bg-card border border-health-fair px-3 py-2 text-sm text-snow">
            {t('dash.trust.historyWarning', { count: historyWarningCount })}
          </p>
        )}
      </section>

      <Suspense fallback={<MapSkeleton height={360} label={t('map.loading')} />}>
        <StreamMap
          streams={mapStreams}
          historyByStream={activeHistoryByStream}
          selectedId={selectedStreamId}
          onSelect={setSelectedStreamId}
          height={360}
          fitAll
        />
      </Suspense>

      {selectedStream && (
        <section className="selected-stream-strip" aria-labelledby="selected-stream-title">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-code text-accent">
              {t('dash.selected.label')}
            </p>
            <h3 id="selected-stream-title" className="text-base font-semibold text-snow mt-0.5">
              {selectedStream.name}
            </h3>
            <p className="text-xs text-ash mt-1">
              {selectedActiveRecord
                ? t('dash.selected.activeRecord', {
                    score: selectedActiveRecord.score,
                    reliability: selectedActiveRecord.reliability.score,
                  })
                : t('dash.selected.noActiveRecord')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenStream?.(selectedStream.id)}
            className="min-h-11 rounded bg-snow text-ink px-4 py-2 text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            {t('dash.selected.assess')}
          </button>
        </section>
      )}

      {isEmpty && (
        <p className="rounded bg-section border border-steel px-4 py-3 text-sm text-ash anim-fade-up">
          {t('dash.empty')}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 anim-stagger">
        <Stat value={activeAggregate.streamCount} label={t('dash.stat.points')} />
        <Stat value={activeAggregate.assessmentTotal} label={t('dash.stat.assessments')} />
        <Stat
          value={activeAggregate.averageScore == null ? t('dash.notAvailable') : activeAggregate.averageScore}
          label={t('dash.stat.average')}
          color={healthColorForClass(activeAggregate.averageClass)}
        />
        <Stat value={activeAggregate.assessedCount} label={t('dash.stat.streams')} />
      </div>

      <section className="rounded bg-section border border-steel p-4" aria-labelledby="health-distribution-title">
        <h3 id="health-distribution-title" className="text-sm font-medium text-snow mb-3">
          {t('dash.distribution')}
        </h3>
        <div className="space-y-2">
          {activeAggregate.distribution.map((distribution) => (
            <div key={distribution.key} className="flex items-center gap-3">
              <span className="w-24 text-xs text-ash shrink-0">
                {t(`health.class.${distribution.key}`)}
              </span>
              <div className="flex-1 h-3 rounded-full bg-ink overflow-hidden">
                <div
                  className="anim-meter h-full rounded-full"
                  style={{ '--meter': `${distribution.pct}%`, background: distribution.color }}
                />
              </div>
              <span className="font-mono text-[11px] text-ash w-16 text-right shrink-0">
                {distribution.count} · {distribution.pct}%
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 font-mono text-[10px] uppercase tracking-code text-fog">
          <span>{t('dash.trend.improving', { count: activeAggregate.trendMix.improving })}</span>
          <span>{t('dash.trend.stable', { count: activeAggregate.trendMix.stable })}</span>
          <span>{t('dash.trend.declining', { count: activeAggregate.trendMix.declining })}</span>
        </div>
      </section>

      <section className="rounded bg-section border border-steel overflow-hidden" aria-labelledby="priority-title">
        <div className="px-4 py-3 border-b border-steel flex items-end justify-between gap-4">
          <div>
            <h3 id="priority-title" className="text-base font-semibold text-snow">
              {t('dash.priority.title')}
            </h3>
            <p className="text-xs text-ash mt-1">{t('dash.priority.intro')}</p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-code text-fog shrink-0">
            {t('dash.priority.count', { count: priorityRows.length })}
          </span>
        </div>
        {priorityRows.length === 0 ? (
          <p className="px-4 py-5 text-sm text-ash">{t('dash.priority.empty')}</p>
        ) : (
          <div className="max-h-[44vh] overflow-auto" tabIndex="0">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-code text-fog">
                  <th className="px-4 py-2 font-normal">{t('dash.table.stream')}</th>
                  <th className="px-2 py-2 font-normal">{t('dash.table.health')}</th>
                  <th className="px-2 py-2 font-normal">{t('dash.table.reliability')}</th>
                  <th className="px-4 py-2 font-normal text-right">{t('dash.table.evidence')}</th>
                </tr>
              </thead>
              <tbody>
                {priorityRows.map((row) => (
                  <tr key={row.id} className="border-t border-steel/60">
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedStreamId(row.streamId)}
                        className="priority-select"
                        aria-label={t('dash.priority.select', { name: row.streamName })}
                      >
                        <span className="text-snow">{row.streamName}</span>
                        <span className="font-mono text-[10px] text-fog">{row.country}</span>
                      </button>
                    </td>
                    <td className="px-2 py-2.5">
                      <span
                        className="font-mono font-medium"
                        style={{ color: healthColorForClass(row.classKey) }}
                      >
                        {row.score} · {t(`health.class.${row.classKey}`)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-snow tabular-nums">
                      {row.reliability.score}/100
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <EvidenceBadge strong={row.strong} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="trust-details">
        <summary>
          <span>{t('dash.recheck.title')}</span>
          <span className="font-mono text-xs text-ash">{recheckRecords.length}</span>
        </summary>
        <div className="trust-details__body">
          <p className="text-sm text-ash">{t('dash.recheck.intro', { score: minimumReliability })}</p>
          {recheckGroups.length === 0 ? (
            <p className="text-sm text-ash mt-4">{t('dash.recheck.empty')}</p>
          ) : (
            <div className="space-y-5 mt-4">
              {recheckGroups.map((group) => (
                <section key={group.streamId} aria-labelledby={`recheck-${group.streamId}`}>
                  <h4 id={`recheck-${group.streamId}`} className="text-sm font-semibold text-snow">
                    {group.name}
                  </h4>
                  <ul className="space-y-2 mt-2">
                    {group.records.map((record) => {
                      const reasons = record.reliability.checks.filter((check) => check.status !== 'pass');
                      const unavailable = record.reliability.checks.filter(
                        (check) => check.id === 'duration' && check.status === 'pass' && !record.sourcePresence.duration,
                      );
                      return (
                        <li key={record.id} className="recheck-record">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-mono text-[11px] text-ash">{record.date}</span>
                            <span style={{ color: healthColorForClass(record.classKey) }}>
                              {t(`health.class.${record.classKey}`)} · {record.score}
                            </span>
                            <span className="font-mono text-xs text-snow">
                              {t('dash.table.reliability')} {record.reliability.score}/100
                            </span>
                            <EvidenceBadge strong={false} t={t} />
                          </div>
                          {reasons.length > 0 && (
                            <ul className="mt-3 space-y-2">
                              {reasons.map((check) => (
                                <li key={check.id} className="text-xs text-ash">
                                  <strong className="text-snow">{t(check.labelKey)}:</strong>{' '}
                                  {t(check.detailKey, check.detailParams)}
                                </li>
                              ))}
                            </ul>
                          )}
                          {unavailable.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-steel">
                              <p className="font-mono text-[10px] uppercase tracking-code text-fog">
                                {t('dash.recheck.unavailable')}
                              </p>
                              {unavailable.map((check) => (
                                <p key={check.id} className="text-xs text-ash mt-1">
                                  <strong className="text-snow">{t(check.labelKey)}:</strong>{' '}
                                  {t(check.detailKey, check.detailParams)}
                                </p>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </details>

      <p className="text-[11px] text-fog">{t('dash.provenance')}</p>
    </div>
  );
}

function EvidenceBadge({ strong, t }) {
  return (
    <span className={`evidence-badge ${strong ? 'evidence-badge--strong' : 'evidence-badge--weak'}`}>
      {strong ? t('dash.trust.meets') : t('dash.trust.recheck')}
    </span>
  );
}

function Stat({ value, label, color }) {
  return (
    <div className="rounded bg-card border border-steel p-3">
      <div className="text-2xl font-semibold tabular-nums" style={{ color: color || '#ffffff' }}>
        {value}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-code text-ash mt-1">{label}</div>
    </div>
  );
}

function groupRecordsByStream(records, streams) {
  const streamById = new Map(streams.map((stream) => [stream.id, stream]));
  const groups = new Map();
  for (const record of records) {
    if (!groups.has(record.streamId)) {
      groups.set(record.streamId, {
        streamId: record.streamId,
        name: streamById.get(record.streamId)?.name ?? record.streamName ?? record.streamId,
        records: [],
      });
    }
    groups.get(record.streamId).records.push(record);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

import React, { Suspense, lazy, useState } from 'react';
import seed from '../data/seed-streams.json';
import { PrimaryButton, Eyebrow, healthColor } from '../ui/primitives.jsx';
import { LAND_USES } from '../core/context.js';
import { trend } from '../core/history.js';
import { useT } from '../i18n/I18n.jsx';
import Sparkline from '../ui/Sparkline.jsx';

const StreamMap = lazy(() => import('../ui/StreamMap.jsx'));

export default function StepStream({ streamId, onPick, landUse, onLandUse, historyByStream = {}, onNext }) {
  const { t } = useT();
  const streams = seed.streams || [];
  const selected = streams.find((s) => s.id === streamId) || null;
  const [showMap, setShowMap] = useState(true);

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>{t('step.stream.eyebrow')}</Eyebrow>
        <h2 className="text-2xl font-semibold tracking-tight mt-1">{t('step.stream.title')}</h2>
        <p className="text-sm text-ash mt-1">{t('step.stream.intro')}</p>
      </div>

      <div className="flex items-center justify-between">
        <Eyebrow>{t('step.stream.points', { n: streams.length })}</Eyebrow>
        <button
          onClick={() => setShowMap((v) => !v)}
          className="font-mono text-[11px] uppercase tracking-code text-accent hover:underline"
        >
          {showMap ? t('step.stream.hideMap') : t('step.stream.showMap')}
        </button>
      </div>

      {showMap && (
        <Suspense
          fallback={
            <div className="h-[260px] rounded border border-steel bg-section grid place-items-center text-ash text-sm">
              Loading map…
            </div>
          }
        >
          <StreamMap
            streams={streams}
            selectedId={streamId}
            onSelect={onPick}
            historyByStream={historyByStream}
            fitAll
          />
        </Suspense>
      )}

      <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
        {streams.map((s) => {
          const last = s.history?.[s.history.length - 1];
          const active = s.id === streamId;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              aria-pressed={active}
              className={
                'w-full text-left rounded border px-4 py-3 transition-colors ' +
                (active
                  ? 'border-accent bg-card'
                  : 'border-steel bg-section hover:border-graphite')
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-snow truncate">{s.name}</div>
                  <div className="font-mono text-[11px] text-ash mt-0.5">
                    {s.country} · {s.lat.toFixed(3)}, {s.lon.toFixed(3)}
                  </div>
                </div>
                {last?.score != null && <LastScore score={last.score} classKey={last.classKey} />}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <p className="text-[11px] text-fog">
          Location data: {selected.dataProvenance}. Past assessments shown are
          sample data; your own saved assessments are added to the trend.
        </p>
      )}

      {selected && <StreamHistory history={historyByStream[selected.id] || []} />}

      {/* Land-use context (feeds the One Health translation) */}
      <div>
        <label className="block text-sm font-medium text-snow mb-2">
          {t('step.stream.landUse')}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {LAND_USES.map((l) => {
            const active = landUse === l.key;
            return (
              <button
                key={l.key}
                onClick={() => onLandUse(l.key)}
                aria-pressed={active}
                className={
                  'rounded border px-3 py-2 text-sm font-medium transition-colors ' +
                  (active
                    ? 'border-accent bg-card text-snow'
                    : 'border-steel bg-section text-ash hover:border-graphite')
                }
              >
                {l.label}
              </button>
            );
          })}
        </div>
      </div>

      <PrimaryButton disabled={!streamId} onClick={onNext}>
        {t('step.stream.start')}
      </PrimaryButton>
    </div>
  );
}

function LastScore({ score, classKey }) {
  const color = healthColor(classKey);
  return (
    <span
      className="shrink-0 font-mono text-xs font-medium px-2 py-1 rounded-tag text-ink"
      style={{ background: color }}
      title="Most recent sample assessment"
    >
      {score}
    </span>
  );
}

function StreamHistory({ history }) {
  const scored = history.filter((e) => typeof e.score === 'number');
  if (scored.length < 1) return null;
  const t = trend(history);
  const mineCount = history.filter((e) => e.mine).length;

  const trendLabel = {
    improving: { t: 'Improving', c: '#3ecf8e', arrow: '\u2197' },
    declining: { t: 'Declining', c: '#ff6b6b', arrow: '\u2198' },
    stable: { t: 'Stable', c: '#a7a7a7', arrow: '\u2192' },
    insufficient: { t: 'Building history', c: '#7c7c7c', arrow: '' },
  }[t.direction];

  return (
    <div className="rounded bg-section border border-steel p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-snow">This stream over time</div>
          <div className="font-mono text-[11px] text-ash mt-0.5">
            {scored.length} assessment{scored.length === 1 ? '' : 's'}
            {mineCount > 0 ? ` · ${mineCount} yours` : ' · sample data'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: trendLabel.c }}>
            {trendLabel.arrow} {trendLabel.t}
          </span>
          <Sparkline points={t.points} color="#6798ff" />
        </div>
      </div>
    </div>
  );
}

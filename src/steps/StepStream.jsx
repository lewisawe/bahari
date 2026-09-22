import React from 'react';
import seed from '../data/seed-streams.json';
import { PrimaryButton } from '../ui/primitives.jsx';
import { LAND_USES } from '../core/context.js';
import { trend } from '../core/history.js';
import Sparkline from '../ui/Sparkline.jsx';

// Step 1 — pick the stream you're standing at.
// Real GBIF-seeded locations; shows "your stream" history (seed sample + your
// own saved assessments) as a trend. Also captures land-use context.

export default function StepStream({ streamId, onPick, landUse, onLandUse, historyByStream = {}, onNext }) {
  const streams = seed.streams || [];
  const selected = streams.find((s) => s.id === streamId) || null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Which stream are you at?</h2>
        <p className="text-sm text-slate-500">
          Pick a monitoring point. These are real locations from the GBIF open
          biodiversity database.
        </p>
      </div>

      <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
        {streams.map((s) => {
          const last = s.history?.[s.history.length - 1];
          const active = s.id === streamId;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              className={
                'w-full text-left rounded-xl border px-4 py-3 transition ' +
                (active
                  ? 'border-bahari-bright bg-bahari-pale ring-1 ring-bahari-bright'
                  : 'border-slate-200 bg-white hover:border-slate-300')
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {s.country} · {s.lat.toFixed(3)}, {s.lon.toFixed(3)}
                  </div>
                </div>
                {last?.score != null && (
                  <LastScore score={last.score} classKey={last.classKey} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <p className="text-[11px] text-slate-400">
          Location data: {selected.dataProvenance}. Past assessments shown are
          sample data; your own saved assessments are added to the trend.
        </p>
      )}

      {/* "Your stream" history + trend for the selected stream */}
      {selected && <StreamHistory history={historyByStream[selected.id] || []} />}

      {/* Land-use context (feeds the One Health translation) */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          What's around this stream?
        </label>
        <div className="grid grid-cols-2 gap-2">
          {LAND_USES.map((l) => {
            const active = landUse === l.key;
            return (
              <button
                key={l.key}
                onClick={() => onLandUse(l.key)}
                className={
                  'rounded-lg border px-3 py-2 text-sm font-medium transition ' +
                  (active
                    ? 'border-bahari-bright bg-bahari-pale text-bahari-deep'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')
                }
              >
                {l.label}
              </button>
            );
          })}
        </div>
      </div>

      <PrimaryButton disabled={!streamId} onClick={onNext}>
        Start assessment
      </PrimaryButton>
    </div>
  );
}

function LastScore({ score, classKey }) {
  const color =
    classKey === 'natural' || classKey === 'good'
      ? '#1a7f5a'
      : classKey === 'fair'
        ? '#f2b134'
        : '#c0392b';
  return (
    <span
      className="shrink-0 text-xs font-bold px-2 py-1 rounded-lg text-white"
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
    improving: { t: 'Improving', c: '#1a7f5a', arrow: '\u2197' },
    declining: { t: 'Declining', c: '#c0392b', arrow: '\u2198' },
    stable: { t: 'Stable', c: '#64748b', arrow: '\u2192' },
    insufficient: { t: 'Building history', c: '#94a3b8', arrow: '' },
  }[t.direction];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-slate-700">This stream over time</div>
          <div className="text-[11px] text-slate-400">
            {scored.length} assessment{scored.length === 1 ? '' : 's'}
            {mineCount > 0 ? ` · ${mineCount} yours` : ' · sample data'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: trendLabel.c }}>
            {trendLabel.arrow} {trendLabel.t}
          </span>
          <Sparkline points={t.points} />
        </div>
      </div>
    </div>
  );
}


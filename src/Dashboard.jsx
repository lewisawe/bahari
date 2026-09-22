import React, { Suspense, lazy } from 'react';
import { aggregate } from './core/aggregate.js';
import { Eyebrow } from './ui/primitives.jsx';
import { healthColorForClass } from './core/health-colors.js';

const StreamMap = lazy(() => import('./ui/StreamMap.jsx'));

// Researcher / aggregate dashboard — the "data-to-insight at scale" view.
// Shows every stream on a map + catchment-level stats, turning many citizen
// assessments into a monitoring picture. Read-only.

export default function Dashboard({ streams = [], historyByStream = {}, onOpenStream }) {
  const a = aggregate(streams, historyByStream);

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>Researcher view</Eyebrow>
        <h2 className="text-2xl font-semibold tracking-tight mt-1">Catchment overview</h2>
        <p className="text-sm text-ash mt-1">
          Every monitoring point, aggregated. Citizen assessments become a
          catchment-scale picture researchers and authorities can act on.
        </p>
      </div>

      {/* map of all streams */}
      <Suspense
        fallback={
          <div className="h-[300px] rounded border border-steel bg-section grid place-items-center text-ash text-sm">
            Loading map…
          </div>
        }
      >
        <StreamMap
          streams={streams}
          historyByStream={historyByStream}
          onSelect={onOpenStream}
          height={300}
          fitAll
        />
      </Suspense>

      {/* stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat value={a.streamCount} label="Monitoring points" />
        <Stat value={a.assessmentTotal} label="Assessments" />
        <Stat
          value={a.averageScore == null ? '—' : a.averageScore}
          label="Avg health score"
          color={healthColorForClass(a.averageClass)}
        />
        <Stat value={a.assessedCount} label="Streams assessed" />
      </div>

      {/* health-class distribution */}
      <div className="rounded bg-section border border-steel p-4">
        <h3 className="text-sm font-medium text-snow mb-3">Health distribution</h3>
        <div className="space-y-2">
          {a.distribution.map((d) => (
            <div key={d.key} className="flex items-center gap-3">
              <span className="w-20 text-xs text-ash shrink-0">{d.label}</span>
              <div className="flex-1 h-3 rounded-full bg-ink overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${d.pct}%`, background: d.color }}
                />
              </div>
              <span className="font-mono text-[11px] text-ash w-16 text-right shrink-0">
                {d.count} · {d.pct}%
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 font-mono text-[10px] uppercase tracking-code text-fog">
          <span>↗ {a.trendMix.improving} improving</span>
          <span>→ {a.trendMix.stable} stable</span>
          <span>↘ {a.trendMix.declining} declining</span>
        </div>
      </div>

      {/* worst-first stream table */}
      <div className="rounded bg-section border border-steel overflow-hidden">
        <div className="px-4 py-2.5 border-b border-steel">
          <h3 className="text-sm font-medium text-snow">Streams (most stressed first)</h3>
        </div>
        <div className="max-h-[40vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-code text-fog">
                <th className="px-4 py-2 font-normal">Stream</th>
                <th className="px-2 py-2 font-normal">Score</th>
                <th className="px-2 py-2 font-normal">Trend</th>
                <th className="px-4 py-2 font-normal text-right">Runs</th>
              </tr>
            </thead>
            <tbody>
              {a.rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => onOpenStream?.(r.id)}
                  className="border-t border-steel/60 hover:bg-card cursor-pointer"
                >
                  <td className="px-4 py-2.5">
                    <div className="text-snow">{r.name}</div>
                    <div className="font-mono text-[10px] text-fog">{r.country}</div>
                  </td>
                  <td className="px-2 py-2.5">
                    {r.score == null ? (
                      <span className="text-fog">—</span>
                    ) : (
                      <span
                        className="font-mono font-medium"
                        style={{ color: healthColorForClass(r.classKey) }}
                      >
                        {r.score}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-ash">{trendGlyph(r.trend)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ash">{r.assessments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-fog">
        Stream locations and taxa are real (GBIF). Historical assessment values in
        the sample are synthetic and clearly labeled; a citizen's own saved
        assessments are real.
      </p>
    </div>
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

function trendGlyph(direction) {
  return { improving: '↗', declining: '↘', stable: '→', insufficient: '·' }[direction] || '·';
}

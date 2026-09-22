import React from 'react';
import { scoreReliability } from '../core/reliability.js';

// Shows how trustworthy this submission is (separate from ecological health).
// This is the piece that lets researchers filter/weight citizen data.

const BAND_COLOR = { high: '#3ecf8e', moderate: '#f5c451', low: '#ff6b6b' };
const STATUS_COLOR = { pass: '#3ecf8e', warn: '#f5c451', fail: '#ff6b6b' };

export default function ReliabilityCard({ submission }) {
  const r = scoreReliability(submission);
  const b = r.bandInfo;
  const color = BAND_COLOR[r.band] || '#a7a7a7';

  return (
    <div
      className="rounded bg-section border border-steel p-4"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium text-snow">Data reliability</h3>
          <p className="text-xs text-ash">
            How much a researcher can trust this record, separate from stream health.
          </p>
        </div>
        <div
          className="shrink-0 w-14 h-14 rounded-full grid place-items-center border-2"
          style={{ borderColor: color }}
          title={`${b.label} reliability`}
        >
          <span className="text-lg font-semibold tabular-nums" style={{ color }}>
            {r.score}
          </span>
        </div>
      </div>

      <div className="text-sm font-medium mb-1" style={{ color }}>
        {b.label} reliability
      </div>
      <p className="text-xs text-ash mb-3">{b.blurb}</p>

      {/* per-check breakdown — fully transparent */}
      <ul className="space-y-1.5">
        {r.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-xs">
            <StatusDot status={c.status} />
            <div className="flex-1">
              <span className="font-medium text-snow">{c.label}</span>
              <span className="font-mono text-ash">
                {' '}
                · {c.points}/{c.weight}
              </span>
              <div className="text-fog">{c.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusDot({ status }) {
  const color = STATUS_COLOR[status] || '#a7a7a7';
  const glyph = status === 'pass' ? '\u2713' : status === 'warn' ? '!' : '\u2715';
  return (
    <span
      className="shrink-0 mt-0.5 w-4 h-4 rounded-full grid place-items-center text-ink text-[10px] font-bold"
      style={{ background: color }}
    >
      {glyph}
    </span>
  );
}

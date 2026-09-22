import React from 'react';
import { scoreReliability } from '../core/reliability.js';

// Shows how trustworthy this submission is (separate from ecological health).
// This is the piece that lets researchers filter/weight citizen data.

export default function ReliabilityCard({ submission }) {
  const r = scoreReliability(submission);
  const b = r.bandInfo;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700">Data reliability</h3>
          <p className="text-xs text-slate-500">
            How much a researcher can trust this record — separate from stream health.
          </p>
        </div>
        <div
          className="shrink-0 w-14 h-14 rounded-full grid place-items-center text-white"
          style={{ background: b.color }}
          title={`${b.label} reliability`}
        >
          <span className="text-lg font-black tabular-nums">{r.score}</span>
        </div>
      </div>

      <div className="text-sm font-semibold mb-1" style={{ color: b.color }}>
        {b.label} reliability
      </div>
      <p className="text-xs text-slate-600 mb-3">{b.blurb}</p>

      {/* per-check breakdown — fully transparent */}
      <ul className="space-y-1.5">
        {r.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-xs">
            <StatusDot status={c.status} />
            <div className="flex-1">
              <span className="font-medium text-slate-700">{c.label}</span>
              <span className="text-slate-400"> · {c.points}/{c.weight}</span>
              <div className="text-slate-500">{c.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusDot({ status }) {
  const color = status === 'pass' ? '#1a7f5a' : status === 'warn' ? '#f2b134' : '#c0392b';
  const glyph = status === 'pass' ? '\u2713' : status === 'warn' ? '!' : '\u2715';
  return (
    <span
      className="shrink-0 mt-0.5 w-4 h-4 rounded-full grid place-items-center text-white text-[10px] font-bold"
      style={{ background: color }}
    >
      {glyph}
    </span>
  );
}

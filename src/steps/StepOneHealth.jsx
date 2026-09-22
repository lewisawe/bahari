import React from 'react';
import { scoreAssessment } from '../core/biotic-index.js';
import { translateOneHealth } from '../core/one-health.js';
import { GhostButton, PrimaryButton } from '../ui/primitives.jsx';

// Step 4 — One Health translation.
// Turns the ecological class + context into qualitative, explainable, caveated
// considerations for people and animals. This is the loop most tools leave open.

const AUDIENCE = {
  ecosystem: { label: 'Ecosystem', icon: '\u{1F30A}' },
  human: { label: 'People', icon: '\u{1F9CD}' },
  animal: { label: 'Animals', icon: '\u{1F43E}' },
};

const LEVEL_STYLE = {
  info: { c: '#1a7f5a', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Info' },
  watch: { c: '#b8860b', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Watch' },
  caution: { c: '#c0392b', bg: 'bg-rose-50', border: 'border-rose-200', label: 'Caution' },
};

export default function StepOneHealth({ counts, context, onBack, onNext }) {
  const biotic = scoreAssessment(counts);
  const oh = translateOneHealth({ classKey: biotic.classKey, context });
  const overall = LEVEL_STYLE[oh.overall];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">One Health considerations</h2>
        <p className="text-sm text-slate-500">
          What this stream signal may mean for people, animals, and the ecosystem —
          the connected view behind “One Health.”
        </p>
      </div>

      {/* overall banner */}
      <div className={`rounded-2xl border ${overall.border} ${overall.bg} p-4`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: overall.c }}>
            {overall.label}
          </span>
        </div>
        <p className="text-sm text-slate-700">{oh.summary}</p>
      </div>

      {/* context row */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        <Chip>Season: {context.season}</Chip>
        <Chip>Land use: {context.landUse}</Chip>
        <Chip>
          Recent rain:{' '}
          {context.recentRainMm == null ? 'not available' : `${context.recentRainMm} mm/3d`}
          {context.heavyRain ? ' (heavy)' : ''}
        </Chip>
      </div>

      {/* flags grouped by audience */}
      <div className="space-y-2">
        {oh.flags.map((f) => (
          <FlagCard key={f.id} flag={f} />
        ))}
      </div>

      {/* the honesty note, prominent */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
        <p className="text-[11px] text-slate-500">
          <b>Important:</b> These are precautionary considerations derived from
          which invertebrates were found — an indirect ecological indicator, not a
          water-quality test or a medical diagnosis. Confirm with proper sampling
          before acting.
        </p>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-2">
        <GhostButton onClick={onBack}>Back</GhostButton>
        <PrimaryButton onClick={onNext}>Create shareable record</PrimaryButton>
      </div>
    </div>
  );
}

function FlagCard({ flag }) {
  const s = LEVEL_STYLE[flag.level];
  const a = AUDIENCE[flag.audience] || AUDIENCE.ecosystem;
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-3`}>
      <div className="flex items-start gap-2.5">
        <span className="text-lg leading-none mt-0.5" aria-hidden>
          {a.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-800">{flag.title}</span>
            <span
              className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{ color: s.c, background: 'white' }}
            >
              {s.label}
            </span>
          </div>
          <p className="text-xs text-slate-700 mt-1">{flag.reason}</p>
          {flag.note && <p className="text-[11px] text-slate-500 mt-1">{flag.note}</p>}
          <details className="mt-1.5">
            <summary className="text-[11px] text-bahari-mid cursor-pointer">
              Why &amp; limits
            </summary>
            <p className="text-[11px] text-slate-500 mt-1">
              <b>Basis:</b> {flag.basis}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              <b>Limits:</b> {flag.limits}
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }) {
  return (
    <span className="px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-600">
      {children}
    </span>
  );
}

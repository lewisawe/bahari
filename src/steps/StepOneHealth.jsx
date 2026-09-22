import React from 'react';
import { scoreAssessment } from '../core/biotic-index.js';
import { translateOneHealth } from '../core/one-health.js';
import { GhostButton, PrimaryButton, Eyebrow } from '../ui/primitives.jsx';

// Step 4 — One Health translation.
// Qualitative, explainable, caveated considerations for people and animals.
// Dark tonal cards; the level color is an accent stroke, not a fill.

const AUDIENCE = {
  ecosystem: { label: 'Ecosystem', icon: '\u{1F30A}' },
  human: { label: 'People', icon: '\u{1F9CD}' },
  animal: { label: 'Animals', icon: '\u{1F43E}' },
};

const LEVEL = {
  info: { c: '#3ecf8e', label: 'Info' },
  watch: { c: '#f5c451', label: 'Watch' },
  caution: { c: '#ff6b6b', label: 'Caution' },
};

export default function StepOneHealth({ counts, context, onBack, onNext }) {
  const biotic = scoreAssessment(counts);
  const oh = translateOneHealth({ classKey: biotic.classKey, context });
  const overall = LEVEL[oh.overall];

  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>Step 4 · One Health</Eyebrow>
        <h2 className="text-2xl font-semibold tracking-tight mt-1">One Health considerations</h2>
        <p className="text-sm text-ash mt-1">
          What this stream signal may mean for people, animals, and the ecosystem,
          the connected view behind One Health.
        </p>
      </div>

      {/* overall banner — flat card with accent left border */}
      <div
        className="rounded bg-card border border-steel p-4"
        style={{ borderLeft: `3px solid ${overall.c}` }}
      >
        <span
          className="font-mono text-[11px] uppercase tracking-code"
          style={{ color: overall.c }}
        >
          {overall.label}
        </span>
        <p className="text-sm text-snow mt-1">{oh.summary}</p>
      </div>

      {/* context row */}
      <div className="flex flex-wrap gap-2">
        <Chip>Season: {context.season}</Chip>
        <Chip>Land use: {context.landUse}</Chip>
        <Chip>
          Rain:{' '}
          {context.recentRainMm == null ? 'n/a' : `${context.recentRainMm}mm/3d`}
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
      <div className="rounded bg-section border border-steel p-3">
        <p className="text-[11px] text-ash">
          <b className="text-snow">Important:</b> These are precautionary considerations
          derived from which invertebrates were found, an indirect ecological indicator,
          not a water-quality test or a medical diagnosis. Confirm with proper sampling
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
  const s = LEVEL[flag.level];
  const a = AUDIENCE[flag.audience] || AUDIENCE.ecosystem;
  return (
    <div
      className="rounded bg-section border border-steel p-3"
      style={{ borderLeft: `3px solid ${s.c}` }}
    >
      <div className="flex items-start gap-2.5">
        <span className="text-lg leading-none mt-0.5" aria-hidden>
          {a.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-snow">{flag.title}</span>
            <span
              className="font-mono text-[10px] uppercase tracking-code px-1.5 py-0.5 rounded-tag border"
              style={{ color: s.c, borderColor: `${s.c}66` }}
            >
              {s.label}
            </span>
          </div>
          <p className="text-xs text-ash mt-1">{flag.reason}</p>
          {flag.note && <p className="text-[11px] text-fog mt-1">{flag.note}</p>}
          <details className="mt-1.5">
            <summary className="text-[11px] text-accent cursor-pointer">Why &amp; limits</summary>
            <p className="text-[11px] text-fog mt-1">
              <b className="text-ash">Basis:</b> {flag.basis}
            </p>
            <p className="text-[11px] text-fog mt-0.5">
              <b className="text-ash">Limits:</b> {flag.limits}
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-code px-2 py-1 rounded-tag bg-section border border-steel text-ash">
      {children}
    </span>
  );
}

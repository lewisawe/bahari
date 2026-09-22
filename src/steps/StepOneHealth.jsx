import React from 'react';
import { scoreAssessment } from '../core/biotic-index.js';
import { translateOneHealth } from '../core/one-health.js';
import { GhostButton, PrimaryButton, Eyebrow } from '../ui/primitives.jsx';
import { useT } from '../i18n/I18n.jsx';

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
  const { t } = useT();
  const biotic = scoreAssessment(counts);
  const oh = translateOneHealth({ classKey: biotic.classKey, context });
  const overall = LEVEL[oh.overall];

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>{t('step.oneHealth.eyebrow')}</Eyebrow>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">{t('step.oneHealth.title')}</h2>
        <p className="text-sm text-ash mt-1.5 leading-relaxed">
          What this stream signal may mean for people, animals, and the ecosystem,
          the connected view behind One Health.
        </p>
      </div>

      {/* overall banner — flat card, level color carried by a dot + label */}
      <div className="rounded bg-card border border-steel p-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: overall.c }} aria-hidden="true" />
          <span
            className="font-mono text-[11px] uppercase tracking-code"
            style={{ color: overall.c }}
          >
            {overall.label}
          </span>
        </div>
        <p className="text-sm text-snow mt-2 leading-relaxed">{oh.summary}</p>
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
        <GhostButton onClick={onBack}>{t('common.back')}</GhostButton>
        <PrimaryButton onClick={onNext}>{t('step.oneHealth.next')}</PrimaryButton>
      </div>
    </div>
  );
}

function FlagCard({ flag }) {
  const s = LEVEL[flag.level];
  const a = AUDIENCE[flag.audience] || AUDIENCE.ecosystem;
  return (
    <div className="rounded bg-section border border-steel p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="text-lg leading-none mt-0.5" aria-hidden>
          {a.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-snow">{flag.title}</span>
            <span
              className="font-mono text-[10px] uppercase tracking-code px-1.5 py-0.5 rounded-tag border inline-flex items-center gap-1"
              style={{ color: s.c, borderColor: `${s.c}66` }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.c }} aria-hidden="true" />
              {s.label}
            </span>
          </div>
          <p className="text-xs text-ash mt-1.5 leading-relaxed">{flag.reason}</p>
          {flag.note && <p className="text-[11px] text-fog mt-1">{flag.note}</p>}
          <details className="mt-2">
            <summary className="text-[11px] text-accent cursor-pointer">Why &amp; limits</summary>
            <p className="text-[11px] text-fog mt-1.5 leading-relaxed">
              <b className="text-ash">Basis:</b> {flag.basis}
            </p>
            <p className="text-[11px] text-fog mt-1 leading-relaxed">
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

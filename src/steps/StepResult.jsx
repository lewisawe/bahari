import React from 'react';
import { scoreAssessment } from '../core/biotic-index.js';
import { GhostButton, PrimaryButton, Eyebrow, healthColor } from '../ui/primitives.jsx';
import { useT } from '../i18n/I18n.jsx';
import ReliabilityCard from '../ui/ReliabilityCard.jsx';

export default function StepResult({ counts, streamName, submission, onBack, onNext, onRestart }) {
  const { t } = useT();
  const result = scoreAssessment(counts);
  const c = result.classInfo;

  if (result.score === null) {
    return (
      <div className="space-y-4">
        <p className="text-ash">{result.method}</p>
        <GhostButton onClick={onBack}>{t('common.back')}</GhostButton>
      </div>
    );
  }

  const color = healthColor(result.classKey);

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>{t('step.result.eyebrow')}</Eyebrow>
        <h2 className="text-2xl font-semibold tracking-tight mt-1">{t('step.result.title')}</h2>
        {streamName && <p className="text-sm text-ash mt-1">{streamName}</p>}
      </div>

      {/* Headline result — flat card, accent left-border in the health color */}
      <div
        className="rounded bg-card border border-steel p-5"
        style={{ borderLeft: `3px solid ${color}` }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-full grid place-items-center border-2"
            style={{ borderColor: color }}
          >
            <span className="text-3xl font-semibold tabular-nums" style={{ color }}>
              {result.score}
            </span>
          </div>
          <div>
            <div className="text-2xl font-semibold" style={{ color }}>
              {c.label}
            </div>
            <div className="text-ash text-sm mt-0.5">{c.blurb}</div>
          </div>
        </div>
      </div>

      {/* What you found */}
      <div>
        <h3 className="text-sm font-medium text-snow mb-2">
          What drove this ({result.richness} group{result.richness === 1 ? '' : 's'})
        </h3>
        <div className="space-y-1.5">
          {[...result.contributions]
            .sort((a, b) => b.sensitivity - a.sensitivity)
            .map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 bg-section rounded border border-steel px-3 py-2"
              >
                <div className="flex-1 text-sm text-snow">{f.commonName}</div>
                <div className="font-mono text-[11px] text-ash">×{f.count}</div>
                <SensBar value={f.sensitivity} />
              </div>
            ))}
        </div>
      </div>

      {/* Transparent method */}
      <details className="bg-section rounded border border-steel px-4 py-3">
        <summary className="text-sm font-medium text-snow cursor-pointer">
          {t('step.result.method')}
        </summary>
        <p className="text-sm text-ash mt-2">{result.method}</p>
        <p className="text-xs text-fog mt-2">
          Method: average pollution-sensitivity of the groups found (miniSASS /
          SASS5 / SIGNAL family). Sensitive groups score high, tolerant groups
          score low. Presence is what counts, not how many.
        </p>
      </details>

      {/* Data reliability */}
      {submission && <ReliabilityCard submission={submission} />}

      <div className="space-y-2">
        <PrimaryButton onClick={onNext}>{t('step.result.next')}</PrimaryButton>
        <div className="grid grid-cols-2 gap-2">
          <GhostButton onClick={onBack}>{t('step.result.edit')}</GhostButton>
          <GhostButton onClick={onRestart}>{t('step.result.restart')}</GhostButton>
        </div>
      </div>
    </div>
  );
}

function SensBar({ value }) {
  const color = value >= 7 ? '#3ecf8e' : value >= 4 ? '#f5c451' : '#ff6b6b';
  return (
    <div
      className="w-16 h-1.5 rounded-full bg-steel overflow-hidden"
      title={`Sensitivity ${value}/10`}
    >
      <div className="h-full rounded-full" style={{ width: `${value * 10}%`, background: color }} />
    </div>
  );
}

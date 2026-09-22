import React, { useState } from 'react';
import { TAXA } from '../core/taxa.js';
import { groupsFound } from '../core/assessment.js';
import { TierBadge, PrimaryButton, GhostButton, Eyebrow } from '../ui/primitives.jsx';
import { useT } from '../i18n/I18n.jsx';
import AssistPanel from '../ui/AssistPanel.jsx';

// Step 2 — guided "what did you find?" recording.

const TIER_ORDER = [
  { key: 'sensitive', title: 'Clean-water lovers', hint: 'Only live where water is healthy.' },
  { key: 'moderate', title: 'In-betweeners', hint: 'Cope with some stress.' },
  { key: 'tolerant', title: 'Tough survivors', hint: 'Live even in polluted water.' },
];

export default function StepAssess({ counts, onChange, onPhotoConfirmed, onBack, onNext }) {
  const { t } = useT();
  const found = groupsFound(counts);
  const [showAssist, setShowAssist] = useState(false);

  function setCount(id, next) {
    onChange({ ...counts, [id]: Math.max(0, next) });
  }

  function confirmFromAssist(id) {
    setCount(id, (counts[id] ?? 0) + 1);
    onPhotoConfirmed?.();
    setShowAssist(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>{t('step.assess.eyebrow')}</Eyebrow>
        <h2 className="text-2xl font-semibold tracking-tight mt-1">{t('step.assess.title')}</h2>
        <p className="text-sm text-ash mt-1">
          Flip a few stones and scoop the streambed. Tap <b className="text-snow">+</b> for
          each kind of creature you see. Not sure? Skip it, record only what you're
          confident about.
        </p>
      </div>

      {/* Optional AI identification help */}
      {showAssist ? (
        <AssistPanel onConfirm={confirmFromAssist} onClose={() => setShowAssist(false)} />
      ) : (
        <button
          onClick={() => setShowAssist(true)}
          className="w-full rounded border border-dashed border-accent/50 bg-accent/5 text-accent text-sm font-medium py-3 hover:bg-accent/10 transition-colors"
        >
          {t('step.assess.aiCta')}
        </button>
      )}

      {TIER_ORDER.map((group) => (
        <div key={group.key} className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-snow">{group.title}</h3>
            <span className="font-mono text-[10px] uppercase tracking-code text-fog">
              {group.hint}
            </span>
          </div>
          <div className="space-y-2">
            {TAXA.filter((t) => t.tier === group.key).map((t) => (
              <TaxonCard
                key={t.id}
                taxon={t}
                count={counts[t.id] ?? 0}
                onDec={() => setCount(t.id, (counts[t.id] ?? 0) - 1)}
                onInc={() => setCount(t.id, (counts[t.id] ?? 0) + 1)}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="sticky bottom-0 bg-gradient-to-t from-ink via-ink to-transparent pt-4 pb-1 space-y-2">
        <p className="text-center font-mono text-[11px] text-ash" aria-live="polite">
          {found === 0
            ? 'Record at least one group to see stream health.'
            : `${found} group${found === 1 ? '' : 's'} recorded.`}
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <GhostButton onClick={onBack}>{t('common.back')}</GhostButton>
          <PrimaryButton disabled={found === 0} onClick={onNext}>
            {t('step.assess.next')}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function TaxonCard({ taxon, count, onDec, onInc }) {
  const [open, setOpen] = useState(false);
  const active = count >= 1;
  return (
    <div
      className={
        'rounded border px-3 py-2.5 transition-colors ' +
        (active ? 'border-accent bg-card' : 'border-steel bg-section')
      }
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-snow text-sm">{taxon.commonName}</span>
            <TierBadge tier={taxon.tier} />
          </div>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="text-xs text-accent hover:underline mt-1"
          >
            {open ? 'Hide' : 'How do I know?'}
          </button>
        </div>
        <Counter count={count} onDec={onDec} onInc={onInc} label={taxon.commonName} />
      </div>
      {open && (
        <p className="text-xs text-ash mt-2 bg-ink rounded px-3 py-2 border border-steel">
          {taxon.recognise}
          <span className="block font-mono text-[10px] text-fog mt-1">
            Group: {taxon.scientificGroup}
          </span>
        </p>
      )}
    </div>
  );
}

function Counter({ count, onDec, onInc, label }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={onDec}
        disabled={count === 0}
        aria-label={`One fewer ${label}`}
        className="w-9 h-9 rounded border border-steel bg-ink text-ash text-xl grid place-items-center disabled:opacity-30 hover:border-graphite transition-colors"
      >
        −
      </button>
      <span className="w-6 text-center font-medium tabular-nums text-snow" aria-live="polite">
        {count}
      </span>
      <button
        onClick={onInc}
        aria-label={`One more ${label}`}
        className="w-9 h-9 rounded bg-snow text-ink text-xl grid place-items-center hover:bg-white/90 transition-colors"
      >
        +
      </button>
    </div>
  );
}

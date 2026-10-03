import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TAXA } from '../core/taxa.js';
import { groupsFound } from '../core/assessment.js';
import { TierBadge, PrimaryButton, GhostButton, Eyebrow } from '../ui/primitives.jsx';
import { useT } from '../i18n/I18n.jsx';
import AssistPanel from '../ui/AssistPanel.jsx';

const TIER_ORDER = [
  { key: 'sensitive', title: 'Clean-water lovers', hint: 'Only live where water is healthy.' },
  { key: 'moderate', title: 'In-betweeners', hint: 'Cope with some stress.' },
  { key: 'tolerant', title: 'Tough survivors', hint: 'Live even in polluted water.' },
];

export default function StepAssess({
  counts,
  photo,
  photoReady,
  aiReview,
  onChange,
  onPhotoChange,
  onPhotoRemove,
  onAnalyze,
  onBack,
  onNext,
}) {
  const { t } = useT();
  const found = groupsFound(counts);
  const positiveTaxa = TAXA.filter((taxon) => counts[taxon.id] > 0);
  const [showAssist, setShowAssist] = useState(false);
  const pendingFocusTaxonIdRef = useRef(null);
  const taxonControlRefs = useRef(new Map());
  const stepHeadingRef = useRef(null);

  useEffect(() => {
    if (positiveTaxa.length === 0) setShowAssist(false);
  }, [positiveTaxa.length]);

  useLayoutEffect(() => {
    if (showAssist || !pendingFocusTaxonIdRef.current) return;
    const taxonId = pendingFocusTaxonIdRef.current;
    pendingFocusTaxonIdRef.current = null;
    const targets = taxonControlRefs.current.get(taxonId);
    (
      targets?.increment ??
      targets?.decrement ??
      targets?.heading ??
      stepHeadingRef.current
    )?.focus();
  }, [showAssist]);

  function setCount(id, next) {
    onChange({ ...counts, [id]: Math.max(0, next) });
  }

  function registerTaxonControl(taxonId, key, node) {
    const targets = taxonControlRefs.current.get(taxonId) || {
      increment: null,
      decrement: null,
      heading: null,
    };
    targets[key] = node;
    taxonControlRefs.current.set(taxonId, targets);
  }

  function handleEditHuman(taxonId) {
    pendingFocusTaxonIdRef.current = taxonId;
    setShowAssist(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>{t('step.assess.eyebrow')}</Eyebrow>
        <h2 ref={stepHeadingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight mt-2">
          {t('step.assess.title')}
        </h2>
        <p className="text-sm text-ash mt-1.5 leading-relaxed">
          Flip a few stones and scoop the streambed. Tap <b className="text-snow">+</b> for
          each kind of creature you see. Not sure? Skip it, record only what you&apos;re
          confident about.
        </p>
      </div>

      {showAssist ? (
        <AssistPanel
          positiveTaxa={positiveTaxa}
          photo={photo}
          photoReady={photoReady}
          aiReview={aiReview}
          onPhotoChange={onPhotoChange}
          onPhotoRemove={onPhotoRemove}
          onAnalyze={onAnalyze}
          onEditHuman={handleEditHuman}
          onClose={() => setShowAssist(false)}
        />
      ) : (
        <div>
          <button
            onClick={() => setShowAssist(true)}
            disabled={positiveTaxa.length === 0}
            aria-describedby={positiveTaxa.length === 0 ? 'assist-requirement' : undefined}
            className="w-full min-h-11 rounded border border-dashed border-accent/50 bg-accent/5 px-4 py-3 text-accent text-sm font-medium hover:bg-accent/10 disabled:border-steel disabled:bg-section disabled:text-fog disabled:cursor-not-allowed transition-colors"
          >
            {t('step.assess.aiCta')}
          </button>
          {positiveTaxa.length === 0 && (
            <p id="assist-requirement" className="text-xs text-ash text-center mt-2">
              {t('step.assess.aiNeedsFinding')}
            </p>
          )}
        </div>
      )}

      {TIER_ORDER.map((group) => (
        <div key={group.key} className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium text-snow">{group.title}</h3>
            <span className="font-mono text-[10px] uppercase tracking-code text-fog text-right">
              {group.hint}
            </span>
          </div>
          <div className="space-y-2">
            {TAXA.filter((taxon) => taxon.tier === group.key).map((taxon) => (
              <TaxonCard
                key={taxon.id}
                taxon={taxon}
                count={counts[taxon.id] ?? 0}
                onDec={() => setCount(taxon.id, (counts[taxon.id] ?? 0) - 1)}
                onInc={() => setCount(taxon.id, (counts[taxon.id] ?? 0) + 1)}
                registerControl={registerTaxonControl}
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

function TaxonCard({ taxon, count, onDec, onInc, registerControl }) {
  const [open, setOpen] = useState(false);
  const active = count >= 1;
  return (
    <div className={'rounded border px-3 py-2.5 transition-colors ' + (active ? 'border-accent bg-card' : 'border-steel bg-section')}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4
              ref={(node) => registerControl(taxon.id, 'heading', node)}
              tabIndex={-1}
              className="font-medium text-snow text-sm"
            >
              {taxon.commonName}
            </h4>
            <span key={active ? 'on' : 'off'} className={active ? 'anim-pop inline-flex' : 'inline-flex'}>
              <TierBadge tier={taxon.tier} />
            </span>
          </div>
          <button onClick={() => setOpen((value) => !value)} aria-expanded={open} className="min-h-11 text-xs text-accent hover:underline underline-offset-4">
            {open ? 'Hide' : 'How do I know?'}
          </button>
        </div>
        <Counter
          count={count}
          onDec={onDec}
          onInc={onInc}
          label={taxon.commonName}
          decrementRef={(node) => registerControl(taxon.id, 'decrement', node)}
          incrementRef={(node) => registerControl(taxon.id, 'increment', node)}
        />
      </div>
      {open && (
        <p className="text-xs text-ash mt-2 bg-ink rounded px-3 py-2 border border-steel">
          {taxon.recognise}
          <span className="block font-mono text-[10px] text-fog mt-1">Group: {taxon.scientificGroup}</span>
        </p>
      )}
    </div>
  );
}

function Counter({ count, onDec, onInc, label, decrementRef, incrementRef }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        ref={decrementRef}
        onClick={onDec}
        disabled={count === 0}
        aria-label={`One fewer ${label}`}
        className="w-11 h-11 rounded border border-steel bg-ink text-ash text-xl grid place-items-center disabled:opacity-30 hover:border-graphite active:scale-90 transition-[border-color,transform]"
      >
        −
      </button>
      <span className="w-6 text-center" aria-live="polite">
        <span key={count} className="inline-block font-medium tabular-nums text-snow anim-bump">{count}</span>
      </span>
      <button
        ref={incrementRef}
        onClick={onInc}
        aria-label={`One more ${label}`}
        className="w-11 h-11 rounded bg-snow text-ink text-xl grid place-items-center hover:bg-white/90 active:scale-90 transition-[background-color,transform]"
      >
        +
      </button>
    </div>
  );
}

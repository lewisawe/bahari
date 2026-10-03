import React, { useRef, useState } from 'react';
import { getProviderName } from '../core/ai-assist.js';
import { validatePhotoFile } from '../core/photo.js';
import { getTaxon } from '../core/taxa.js';
import { useT } from '../i18n/I18n.jsx';
import ConfidenceMeter from './ConfidenceMeter.jsx';

export default function AssistPanel({
  positiveTaxa,
  photo,
  photoReady,
  aiReview,
  onPhotoChange,
  onPhotoRemove,
  onAnalyze,
  onEditHuman,
  onClose,
}) {
  const { t } = useT();
  const [selectedHumanTaxonId, setSelectedHumanTaxonId] = useState(
    aiReview?.human?.taxonId ?? (positiveTaxa.length === 1 ? positiveTaxa[0].id : null),
  );
  const [phase, setPhase] = useState(aiReview ? 'done' : 'idle');
  const [photoError, setPhotoError] = useState(null);
  const validationIdRef = useRef(0);

  const humanTaxonId = positiveTaxa.length === 1
    ? positiveTaxa[0].id
    : positiveTaxa.some((taxon) => taxon.id === selectedHumanTaxonId)
      ? selectedHumanTaxonId
      : null;
  const displayedReview = aiReview?.human?.taxonId && positiveTaxa.some(
    (taxon) => taxon.id === aiReview.human.taxonId,
  ) ? aiReview : null;

  async function handlePhotoPick(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const validationId = ++validationIdRef.current;
    setPhotoError(null);
    setPhase('validating');
    try {
      const validated = await validatePhotoFile(file);
      if (validationId !== validationIdRef.current) return;
      await onPhotoChange(validated);
      setPhase('idle');
    } catch (error) {
      if (validationId !== validationIdRef.current) return;
      setPhotoError(photoErrorKey(error?.code));
      setPhase(displayedReview ? 'done' : 'idle');
    }
  }

  async function handleAnalyze() {
    if (!humanTaxonId || !photo?.id || !photoReady) return;
    setPhotoError(null);
    setPhase('thinking');
    try {
      const accepted = await onAnalyze({ humanTaxonId, photoId: photo.id });
      setPhase(accepted ? 'done' : 'idle');
    } catch {
      setPhotoError('assist.error.analysis');
      setPhase('idle');
    }
  }

  function handleTryAnother() {
    validationIdRef.current += 1;
    setPhotoError(null);
    setPhase('idle');
    onPhotoRemove();
  }

  return (
    <section className="rounded bg-card border border-accent/40 p-4 space-y-4 anim-fade-up" aria-labelledby="assist-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="assist-title" className="text-base font-semibold text-snow">{t('assist.title')}</h3>
          <p className="font-mono text-[10px] uppercase tracking-code text-ash mt-1">{t('assist.tag')}</p>
        </div>
        <button onClick={onClose} className="min-h-11 px-2 text-ash text-sm hover:text-snow transition-colors">
          {t('assist.close')}
        </button>
      </div>

      {!displayedReview && (
        <>
          <p className="text-sm text-ash leading-relaxed">{t('assist.intro')}</p>

          <div className="rounded bg-section border border-steel p-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ash">{t('assist.yourIdentification')}</p>
            {positiveTaxa.length > 1 ? (
              <fieldset className="space-y-2">
                <legend className="text-sm text-snow mb-2">{t('assist.chooseHuman')}</legend>
                {positiveTaxa.map((taxon) => (
                  <label key={taxon.id} className="flex min-h-11 items-center gap-3 rounded border border-steel px-3 py-2 text-sm text-snow hover:border-graphite">
                    <input
                      type="radio"
                      name="assist-human-taxon"
                      value={taxon.id}
                      checked={humanTaxonId === taxon.id}
                      onChange={() => setSelectedHumanTaxonId(taxon.id)}
                    />
                    <span>{taxon.commonName}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <p className="text-base font-medium text-snow">{positiveTaxa[0]?.commonName}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block">
              <span className="block text-sm font-medium text-snow mb-2">{t('assist.photoLabel')}</span>
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={handlePhotoPick}
                disabled={phase === 'validating' || phase === 'thinking'}
                className="block w-full min-h-11 text-xs text-ash file:mr-3 file:min-h-11 file:rounded file:border file:border-steel file:bg-section file:px-3 file:py-2 file:text-snow file:font-medium disabled:opacity-50"
              />
            </label>
            {photo && <p className="font-mono text-[11px] text-fog">{t('assist.selected', { name: photo.name })}</p>}
            {!photoReady && photo && <p className="text-xs text-ash">{t('assist.photoUnavailable')}</p>}
            {photoError && <p role="alert" className="text-sm text-health-bad">{t(photoError)}</p>}
          </div>

          {phase === 'validating' && <p className="text-sm text-ash" aria-live="polite">{t('assist.validating')}</p>}
          {phase === 'thinking' ? (
            <ScanningState label={t('assist.scanning')} />
          ) : (
            <button
              onClick={handleAnalyze}
              disabled={!humanTaxonId || !photo?.id || !photoReady || phase === 'validating'}
              className="w-full min-h-11 rounded bg-snow text-ink text-sm font-semibold px-4 py-2.5 hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('assist.checkPhoto')}
            </button>
          )}
        </>
      )}

      {displayedReview && phase !== 'thinking' && (
        <AssistResult
          review={displayedReview}
          onTryAnother={handleTryAnother}
          onEditHuman={onEditHuman}
        />
      )}

      <p className="font-mono text-[10px] text-fog pt-3 border-t border-steel">
        {t('assist.engine', { name: displayedReview?.model?.provider ?? getProviderName() })}
      </p>
    </section>
  );
}

function ScanningState({ label }) {
  return (
    <div className="scan-frame rounded border border-accent/40 bg-section grid place-items-center h-24">
      <div className="flex items-center gap-2 text-sm text-ash" role="status" aria-live="polite">
        <span className="w-2 h-2 rounded-full bg-accent anim-pop" aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}

function AssistResult({ review, onTryAnother, onEditHuman }) {
  const { t } = useT();
  const human = getTaxon(review.human.taxonId);
  const model = review.model.taxonId ? getTaxon(review.model.taxonId) : null;
  const pct = Math.round(review.model.confidence * 100);
  const band = review.model.policyStatus === 'suggested'
    ? { color: '#3ecf8e', label: t('assist.band.suggested') }
    : review.model.policyStatus === 'review'
      ? { color: '#f5c451', label: t('assist.band.review') }
      : { color: '#ff6b6b', label: t('assist.band.defer') };

  return (
    <div className="space-y-4 anim-fade-up">
      <div role="status" className="rounded border border-accent/50 bg-accent/5 p-3">
        <p className="text-lg font-semibold text-snow">{t(`assist.outcome.${review.outcome}`)}</p>
        <p className="text-xs text-ash mt-1">{t(`assist.outcomeHelp.${review.outcome}`)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded bg-section border border-steel p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ash">{t('assist.yourIdentification')}</p>
          <p className="text-base font-semibold text-snow mt-2">{human?.commonName}</p>
          <p className="text-xs text-fog mt-1">{t('assist.humanEvidence')}</p>
        </div>
        <div className="rounded bg-section border border-steel p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ash">{t('assist.modelIdentification')}</p>
          <p className="text-base font-semibold text-snow mt-2">{model?.commonName ?? t('assist.noSuggestion')}</p>
          <p className="text-xs text-fog mt-1">{t('assist.provider', { name: review.model.provider })}</p>
        </div>
      </div>

      <ConfidenceMeter pct={pct} color={band.color} label={band.label} unit={t('assist.confidence')} />

      {review.model.cues.length > 0 && (
        <div className="rounded bg-section border border-steel p-3">
          <h4 className="text-sm font-medium text-snow">{t('assist.visualCues')}</h4>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-ash">
            {review.model.cues.map((cue, index) => <li key={`${cue}-${index}`}>{cue}</li>)}
          </ul>
          {review.model.alternatives.length > 0 && (
            <p className="text-xs text-fog mt-3">
              {t('assist.couldAlsoBe', {
                names: review.model.alternatives
                  .map((alternative) => getTaxon(alternative.taxonId)?.commonName)
                  .filter(Boolean)
                  .join(', '),
              })}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button onClick={onTryAnother} className="min-h-11 rounded border border-steel bg-card px-3 py-2.5 text-sm font-medium text-snow hover:border-graphite transition-colors">
          {t('assist.tryAnother')}
        </button>
        <button onClick={() => onEditHuman(review.human.taxonId)} className="min-h-11 rounded bg-snow px-3 py-2.5 text-sm font-semibold text-ink hover:bg-white/90 transition-colors">
          {t('assist.editHuman')}
        </button>
      </div>
    </div>
  );
}

function photoErrorKey(code) {
  switch (code) {
    case 'photo-invalid-type': return 'assist.error.photoType';
    case 'photo-invalid-size': return 'assist.error.photoSize';
    case 'photo-decode-unavailable': return 'assist.error.photoUnavailable';
    case 'photo-decode-failed': return 'assist.error.photoDecode';
    default: return 'assist.error.photoInvalid';
  }
}

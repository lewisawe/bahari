import React, { useEffect, useMemo, useState } from 'react';
import { buildBundle, inspectBundle, validateBundle } from '../core/fhir.js';
import { GhostButton, PrimaryButton, Eyebrow } from '../ui/primitives.jsx';
import { HEALTH_COLORS } from '../core/health-colors.js';
import { useT } from '../i18n/I18n.jsx';

const GOOD = HEALTH_COLORS.good; // '#3ecf8e'
const BAD = HEALTH_COLORS.very_poor; // '#ff6b6b'

export default function StepFhir({
  stream,
  counts,
  submission,
  context,
  aiReview,
  photoId,
  onBundleReady,
  onBack,
  onRestart,
}) {
  const { t } = useT();
  const [showRaw, setShowRaw] = useState(false);

  const bundle = useMemo(
    () => buildBundle({ stream, counts, submission, context, aiReview, photoId }),
    [stream, counts, submission, context, aiReview, photoId],
  );
  const validation = useMemo(() => validateBundle(bundle), [bundle]);
  const inspector = useMemo(() => inspectBundle(bundle), [bundle]);

  useEffect(() => {
    onBundleReady?.(bundle);
  }, [bundle, onBundleReady]);

  function download() {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/fhir+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safe = (stream?.name || 'stream').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.download = `bahari-fhir-${safe}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="anim-fade-up">
        <Eyebrow>{t('step.fhir.eyebrow')}</Eyebrow>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">{t('step.fhir.title')}</h2>
        <p className="text-sm text-ash mt-1.5 leading-relaxed">{t('step.fhir.intro')}</p>
      </div>

      {validation.valid ? (
        <div
          className="relative rounded border p-6 anim-fade-up overflow-hidden"
          style={{ borderColor: `${GOOD}66`, background: `${GOOD}14` }}
        >
          <span
            aria-hidden="true"
            className="anim-glow pointer-events-none absolute -top-10 -left-6 w-40 h-40 rounded-full"
            style={{ background: `radial-gradient(circle, ${GOOD}3d 0%, transparent 70%)` }}
          />
          <div className="relative flex items-center gap-4">
            <CheckSeal color={GOOD} />
            <div>
              <div className="text-xl font-semibold" style={{ color: GOOD }}>
                {t('step.fhir.valid')}
              </div>
              <p className="font-mono text-[11px] text-ash mt-1.5 leading-relaxed">
                {t('step.fhir.verifiedCaption')}
              </p>
            </div>
          </div>
          <p className="relative text-[11px] text-fog mt-4 leading-relaxed">
            {t('step.fhir.historicalNote')}
          </p>
          <BundleInspector inspector={inspector} t={t} />
        </div>
      ) : (
        <div className="rounded bg-card border p-4" style={{ borderColor: `${BAD}66` }}>
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full grid place-items-center text-ink text-sm font-bold"
              style={{ background: BAD }}
              aria-hidden="true"
            >
              {'\u2715'}
            </span>
            <span className="font-medium text-snow">{t('step.fhir.invalid')}</span>
          </div>
          <ul className="mt-2 text-xs text-health-bad list-disc pl-5">
            {validation.errors.map((error, index) => <li key={index}>{error}</li>)}
          </ul>
        </div>
      )}

      <div>
        <button
          onClick={() => setShowRaw((value) => !value)}
          aria-expanded={showRaw}
          className="min-h-11 text-sm font-medium text-accent hover:underline focus-visible:outline-none"
        >
          {t(showRaw ? 'step.fhir.raw.hide' : 'step.fhir.raw.show')}
        </button>
        {showRaw && (
          <pre className="mt-2 max-h-72 overflow-auto rounded bg-ink border border-steel text-ash font-mono text-[11px] leading-relaxed p-3">
            {JSON.stringify(bundle, null, 2)}
          </pre>
        )}
      </div>

      <div className="space-y-2">
        <PrimaryButton onClick={download}>{t('step.fhir.download')}</PrimaryButton>
        <div className="grid grid-cols-2 gap-2">
          <GhostButton onClick={onBack}>{t('common.back')}</GhostButton>
          <GhostButton onClick={onRestart}>{t('step.result.restart')}</GhostButton>
        </div>
      </div>
    </div>
  );
}

function BundleInspector({ inspector, t }) {
  return (
    <details className="relative mt-5 border-t pt-4" style={{ borderColor: `${GOOD}40` }}>
      <summary className="min-h-11 cursor-pointer font-medium text-sm text-snow py-3 focus-visible:outline-none">
        {t('step.fhir.inspector.summary')}
      </summary>
      <div className="space-y-5 pt-2 text-xs text-ash">
        <InspectorSection title={t('step.fhir.inspector.resources')}>
          <ul className="space-y-2">
            {inspector.resources.map((resource) => (
              <li key={resource.fullUrl} className="rounded bg-ink/40 border border-steel p-3">
                <span className="font-medium text-snow">{resource.label}</span>
                <span className="font-mono text-fog"> · {resource.resourceType}</span>
                <div className="font-mono text-[10px] text-fog mt-1 break-all">{resource.fullUrl}</div>
              </li>
            ))}
          </ul>
        </InspectorSection>

        {inspector.profiles.length > 0 && (
          <InspectorSection title={t('step.fhir.inspector.profiles')}>
            <ul className="space-y-2">
              {inspector.profiles.map((profile) => (
                <li key={`${profile.fullUrl}:${profile.profile}`}>
                  <span className="font-medium text-snow">{profile.label}</span>
                  <span className="text-fog"> · {profile.resourceType}</span>
                  <div className="font-mono text-[10px] text-fog mt-0.5 break-all">{profile.profile}</div>
                </li>
              ))}
            </ul>
          </InspectorSection>
        )}

        {inspector.relationships.length > 0 && (
          <InspectorSection title={t('step.fhir.inspector.relationships')}>
            <ul className="space-y-2">
              {inspector.relationships.map((relationship, index) => (
                <li key={`${relationship.sourceFullUrl}:${relationship.relationship}:${relationship.targetReference}:${index}`}>
                  <span className="text-snow">{relationship.sourceLabel}</span>
                  <span className="font-mono text-fog"> · {relationship.relationship} · </span>
                  <span className="text-snow">{relationship.targetLabel}</span>
                  <span className={relationship.resolved ? 'text-health-good' : 'text-health-bad'}>
                    {' '}· {t(relationship.resolved ? 'step.fhir.inspector.resolved' : 'step.fhir.inspector.unresolved')}
                  </span>
                </li>
              ))}
            </ul>
          </InspectorSection>
        )}

        {inspector.oneHealth && (
          <InspectorSection title={t('step.fhir.inspector.oneHealth')}>
            <p className="text-snow">{inspector.oneHealth.label}</p>
            {inspector.oneHealth.value?.text && <p className="mt-1">{inspector.oneHealth.value.text}</p>}
          </InspectorSection>
        )}

        <InspectorSection title={t('step.fhir.inspector.ai')}>
          {inspector.aiProvenance ? (
            <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 gap-y-2">
              <InspectorFact label={t('step.fhir.inspector.human')} value={inspector.aiProvenance.humanTaxon.label} />
              <InspectorFact label={t('step.fhir.inspector.model')} value={inspector.aiProvenance.modelTaxon?.label ?? t('step.fhir.inspector.deferred')} />
              <InspectorFact label={t('step.fhir.inspector.confidence')} value={String(inspector.aiProvenance.confidence)} />
              <InspectorFact label={t('step.fhir.inspector.policy')} value={inspector.aiProvenance.policyStatus} />
              <InspectorFact label={t('step.fhir.inspector.outcome')} value={inspector.aiProvenance.outcome} />
              <InspectorFact label={t('step.fhir.inspector.provider')} value={inspector.aiProvenance.provider} />
            </dl>
          ) : (
            <p>{t('step.fhir.inspector.aiMissing')}</p>
          )}
        </InspectorSection>
      </div>
    </details>
  );
}

function InspectorSection({ title, children }) {
  return (
    <section>
      <h3 className="eyebrow mb-2">{title}</h3>
      {children}
    </section>
  );
}

function InspectorFact({ label, value }) {
  return (
    <>
      <dt className="text-fog">{label}</dt>
      <dd className="font-mono text-snow break-words">{value}</dd>
    </>
  );
}

function CheckSeal({ color }) {
  return (
    <span
      className="anim-pop relative shrink-0 grid place-items-center w-14 h-14 rounded-full"
      style={{ background: `${color}26`, border: `2px solid ${color}` }}
      aria-hidden="true"
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
        <path
          className="anim-check-draw"
          d="M4 12.5 L10 18 L20 6"
          stroke={color}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="30"
          style={{ '--check-length': 30 }}
        />
      </svg>
    </span>
  );
}

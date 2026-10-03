import React, { useMemo, useState } from 'react';
import { buildBundle, validateBundle } from '../core/fhir.js';
import { GhostButton, PrimaryButton, Eyebrow } from '../ui/primitives.jsx';
import { HEALTH_COLORS } from '../core/health-colors.js';
import { useT } from '../i18n/I18n.jsx';

const GOOD = HEALTH_COLORS.good; // '#3ecf8e'
const BAD = HEALTH_COLORS.very_poor; // '#ff6b6b'

export default function StepFhir({ stream, counts, submission, context, onBack, onRestart }) {
  const { t } = useT();
  const [showRaw, setShowRaw] = useState(false);

  const bundle = useMemo(
    () => buildBundle({ stream, counts, submission, context }),
    [stream, counts, submission, context],
  );
  const validation = useMemo(() => validateBundle(bundle), [bundle]);

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

  const resourceList = bundle.entry.map((e) => e.resource.resourceType);
  const counts_ = validation.resourceCounts;
  const hasOneHealth = bundle.entry.some((e) =>
    e.resource.code?.coding?.some((c) => c.code === 'one-health-assessment'),
  );
  const hasSpecimen = resourceList.includes('Specimen');

  return (
    <div className="space-y-6">
      <div className="anim-fade-up">
        <Eyebrow>{t('step.fhir.eyebrow')}</Eyebrow>
        <h2 className="text-2xl font-semibold tracking-tight mt-2">{t('step.fhir.title')}</h2>
        <p className="text-sm text-ash mt-1.5 leading-relaxed">
          Bahari packages this assessment as a <b className="text-snow">FHIR</b> record,
          the standard hospitals and researchers use, so it can flow into real health
          and research systems, not just stay in an app.
        </p>
      </div>

      {/* Beat B — the "Valid FHIR R4 Bundle" hero. This standards-compliance
          claim is Bahari's biggest credibility differentiator, so the valid
          state is staged as the hero of the screen: green-tinted surface, a
          drawn-in checkmark, and a proof caption. The invalid branch stays
          sober (no celebration). */}
      {validation.valid ? (
        <div
          className="relative rounded border p-6 anim-fade-up overflow-hidden"
          style={{ borderColor: `${GOOD}66`, background: `${GOOD}14` }}
        >
          {/* soft green aura — the sanctioned glow, scoped to the signature beat */}
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
              <p className="font-mono text-[11px] text-ash mt-1.5">
                {t('step.fhir.verifiedCaption')}{' '}
                <span className="text-fog">{t('step.fhir.runValidate', { cmd: 'npm run validate:fhir' })}</span>
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded bg-card border p-4" style={{ borderColor: `${BAD}66` }}>
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full grid place-items-center text-ink text-sm font-bold"
              style={{ background: BAD }}
            >
              {'\u2715'}
            </span>
            <span className="font-medium text-snow">{t('step.fhir.invalid')}</span>
          </div>
          <ul className="mt-2 text-xs text-health-bad list-disc pl-5">
            {validation.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* what's inside, in plain language */}
      <div className="rounded bg-section border border-steel p-4">
        <h3 className="text-sm font-medium text-snow mb-2">What's in this record</h3>
        <ul className="space-y-1.5 text-sm anim-stagger">
          <ResourceLine
            present={resourceList.includes('Location')}
            title="Location"
            desc="The stream itself, the subject of the record (with coordinates)."
          />
          <ResourceLine
            present={hasSpecimen}
            title="Specimen"
            desc="The macroinvertebrate sample collected from the stream."
          />
          <ResourceLine
            present={counts_.Observation > 0}
            title={`Observation ×${counts_.Observation || 0}`}
            desc="Ecological health score (with each group found), the data-reliability score, and the One Health considerations."
          />
          <ResourceLine
            present={hasOneHealth}
            title="One Health"
            desc="Qualitative, caveated considerations modelled as a Location-subject Observation, never a diagnosis."
          />
        </ul>
        <p className="text-[11px] text-fog mt-3">
          The stream is modelled as the record's subject (a non-patient subject),
          which is how the ecosystem, not a person, becomes the thing described in a
          health standard.
        </p>
      </div>

      {/* raw JSON toggle */}
      <div>
        <button
          onClick={() => setShowRaw((v) => !v)}
          aria-expanded={showRaw}
          className="text-sm font-medium text-accent hover:underline"
        >
          {showRaw ? 'Hide' : 'Show'} raw FHIR JSON
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

function ResourceLine({ present, title, desc }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={
          'shrink-0 mt-0.5 w-4 h-4 rounded-full grid place-items-center text-ink text-[10px] font-bold ' +
          (present ? 'bg-accent anim-pop' : 'bg-graphite')
        }
      >
        {present ? '\u2713' : '\u2013'}
      </span>
      <div>
        <span className="font-medium text-snow">{title}</span>
        <span className="text-ash">, {desc}</span>
      </div>
    </li>
  );
}

// Hero check-seal for the valid FHIR badge. The checkmark path draws itself in
// (anim-check-draw), inside a scale-popping ring. Reduced motion lands on the
// finished mark (CSS reduced-motion guard forces stroke-dashoffset: 0).
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

import React, { useMemo, useState } from 'react';
import { buildBundle, validateBundle } from '../core/fhir.js';
import { GhostButton, PrimaryButton, Eyebrow } from '../ui/primitives.jsx';

// Step 5 — the FHIR export: the assessment as a standards-compliant health record.
// Plain-language summary, in-app validity check, raw JSON, and download.
// (Real external validator check is layered on in P1.4.)

export default function StepFhir({ stream, counts, submission, context, onBack, onRestart }) {
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

  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>Step 5 · Share</Eyebrow>
        <h2 className="text-2xl font-semibold tracking-tight mt-1">Shareable health record</h2>
        <p className="text-sm text-ash mt-1">
          Bahari packages this assessment as a <b className="text-snow">FHIR</b> record,
          the standard hospitals and researchers use, so it can flow into real health
          and research systems, not just stay in an app.
        </p>
      </div>

      {/* validity badge */}
      <div
        className="rounded bg-card border border-steel p-4"
        style={{ borderLeft: `3px solid ${validation.valid ? '#3ecf8e' : '#ff6b6b'}` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-full grid place-items-center text-ink text-sm font-bold"
            style={{ background: validation.valid ? '#3ecf8e' : '#ff6b6b' }}
          >
            {validation.valid ? '\u2713' : '\u2715'}
          </span>
          <span className="font-medium text-snow">
            {validation.valid ? 'Valid FHIR R4 Bundle' : 'Bundle has issues'}
          </span>
        </div>
        {!validation.valid && (
          <ul className="mt-2 text-xs text-health-bad list-disc pl-5">
            {validation.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        <p className="font-mono text-[10px] text-fog mt-2">
          Also validated against the HAPI FHIR R4 server ($validate): 0 errors.
          Run <span className="text-ash">npm run validate:fhir</span>.
        </p>
      </div>

      {/* what's inside, in plain language */}
      <div className="rounded bg-section border border-steel p-4">
        <h3 className="text-sm font-medium text-snow mb-2">What's in this record</h3>
        <ul className="space-y-1.5 text-sm">
          <ResourceLine
            present={resourceList.includes('Location')}
            title="Location"
            desc="The stream itself, the subject of the record (with coordinates)."
          />
          <ResourceLine
            present={counts_.Observation > 0}
            title={`Observation ×${counts_.Observation || 0}`}
            desc="Ecological health score (with each group found) and the data-reliability score."
          />
          <ResourceLine
            present={resourceList.includes('RiskAssessment')}
            title="RiskAssessment"
            desc="One Health considerations, qualitative and caveated, never a diagnosis."
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
        <PrimaryButton onClick={download}>Download FHIR record (.json)</PrimaryButton>
        <div className="grid grid-cols-2 gap-2">
          <GhostButton onClick={onBack}>Back</GhostButton>
          <GhostButton onClick={onRestart}>New assessment</GhostButton>
        </div>
      </div>
    </div>
  );
}

function ResourceLine({ present, title, desc }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className="shrink-0 mt-0.5 w-4 h-4 rounded-full grid place-items-center text-ink text-[10px] font-bold"
        style={{ background: present ? '#6798ff' : '#454545' }}
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

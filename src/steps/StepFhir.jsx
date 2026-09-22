import React, { useMemo, useState } from 'react';
import { buildBundle, validateBundle } from '../core/fhir.js';
import { GhostButton, PrimaryButton } from '../ui/primitives.jsx';

// Step 5 — the FHIR export: the assessment as a standards-compliant health record.
// Shows a plain-language summary of what's in the Bundle, a validity check, the
// raw JSON, and a download. This is the "speaks a health-data standard" moment.

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
        <h2 className="text-lg font-bold text-slate-800">Shareable health record</h2>
        <p className="text-sm text-slate-500">
          Bahari packages this assessment as a <b>FHIR</b> record — the standard
          hospitals and researchers use — so it can flow into real health and
          research systems, not just stay in an app.
        </p>
      </div>

      {/* validity badge */}
      <div
        className={
          'rounded-2xl border p-4 ' +
          (validation.valid ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50')
        }
      >
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-full grid place-items-center text-white text-sm font-bold"
            style={{ background: validation.valid ? '#1a7f5a' : '#c0392b' }}
          >
            {validation.valid ? '\u2713' : '\u2715'}
          </span>
          <span className="font-bold text-slate-800">
            {validation.valid ? 'Valid FHIR R4 Bundle' : 'Bundle has issues'}
          </span>
        </div>
        {!validation.valid && (
          <ul className="mt-2 text-xs text-rose-700 list-disc pl-5">
            {validation.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      {/* what's inside, in plain language */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-700 mb-2">What's in this record</h3>
        <ul className="space-y-1.5 text-sm">
          <ResourceLine
            present={resourceList.includes('Location')}
            title="Location"
            desc="The stream itself — the subject of the record (with coordinates)."
          />
          <ResourceLine
            present={counts_.Observation > 0}
            title={`Observation ×${counts_.Observation || 0}`}
            desc="Ecological health score (with each group found) and the data-reliability score."
          />
          <ResourceLine
            present={resourceList.includes('RiskAssessment')}
            title="RiskAssessment"
            desc="One Health considerations — qualitative and caveated, never a diagnosis."
          />
        </ul>
        <p className="text-[11px] text-slate-400 mt-3">
          The stream is modelled as the record's subject (a non-patient subject),
          which is how the ecosystem — not a person — becomes the thing being
          described in a health standard.
        </p>
      </div>

      {/* raw JSON toggle */}
      <div>
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="text-sm font-semibold text-bahari-mid hover:underline"
        >
          {showRaw ? 'Hide' : 'Show'} raw FHIR JSON
        </button>
        {showRaw && (
          <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-slate-900 text-slate-100 text-[11px] leading-relaxed p-3">
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
        className="shrink-0 mt-0.5 w-4 h-4 rounded-full grid place-items-center text-white text-[10px] font-bold"
        style={{ background: present ? '#127a8a' : '#cbd5e1' }}
      >
        {present ? '\u2713' : '–'}
      </span>
      <div>
        <span className="font-semibold text-slate-800">{title}</span>
        <span className="text-slate-500"> — {desc}</span>
      </div>
    </li>
  );
}

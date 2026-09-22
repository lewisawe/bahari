import React from 'react';
import { scoreAssessment } from '../core/biotic-index.js';
import { GhostButton, PrimaryButton } from '../ui/primitives.jsx';
import ReliabilityCard from '../ui/ReliabilityCard.jsx';

// Step 3 — the ecological health result + data-reliability.
// Big clear class + score, plain-language meaning, the transparent calculation,
// the finds that drove it, and a separate data-reliability panel. (Days 5-6 add
// One Health + FHIR after this screen.)

export default function StepResult({ counts, streamName, submission, onBack, onNext, onRestart }) {
  const result = scoreAssessment(counts);
  const c = result.classInfo;

  if (result.score === null) {
    return (
      <div className="space-y-4">
        <p className="text-slate-600">{result.method}</p>
        <GhostButton onClick={onBack}>Back to recording</GhostButton>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Stream health</h2>
        {streamName && <p className="text-sm text-slate-500">{streamName}</p>}
      </div>

      {/* Headline result */}
      <div
        className="rounded-2xl p-5 text-white"
        style={{ background: `linear-gradient(135deg, ${c.color}, ${shade(c.color)})` }}
      >
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-white/20 grid place-items-center backdrop-blur">
            <span className="text-3xl font-black tabular-nums">{result.score}</span>
          </div>
          <div>
            <div className="text-2xl font-black">{c.label}</div>
            <div className="text-white/90 text-sm mt-0.5">{c.blurb}</div>
          </div>
        </div>
      </div>

      {/* What you found */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-2">
          What drove this ({result.richness} group{result.richness === 1 ? '' : 's'})
        </h3>
        <div className="space-y-1.5">
          {[...result.contributions]
            .sort((a, b) => b.sensitivity - a.sensitivity)
            .map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 bg-white rounded-lg border border-slate-200 px-3 py-2"
              >
                <div className="flex-1 text-sm font-medium text-slate-800">{f.commonName}</div>
                <div className="text-xs text-slate-500">×{f.count} seen</div>
                <SensBar value={f.sensitivity} />
              </div>
            ))}
        </div>
      </div>

      {/* Transparent method */}
      <details className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
        <summary className="text-sm font-semibold text-slate-700 cursor-pointer">
          How this score is calculated
        </summary>
        <p className="text-sm text-slate-600 mt-2">{result.method}</p>
        <p className="text-xs text-slate-400 mt-2">
          Method: average pollution-sensitivity of the groups found (miniSASS /
          SASS5 / SIGNAL family). Sensitive groups score high, tolerant groups
          score low. Presence is what counts, not how many.
        </p>
      </details>

      {/* Data reliability — how much a researcher can trust this record */}
      {submission && <ReliabilityCard submission={submission} />}

      <div className="space-y-2">
        <PrimaryButton onClick={onNext}>See One Health considerations</PrimaryButton>
        <div className="grid grid-cols-2 gap-2">
          <GhostButton onClick={onBack}>Edit finds</GhostButton>
          <GhostButton onClick={onRestart}>New assessment</GhostButton>
        </div>
      </div>
    </div>
  );
}

function SensBar({ value }) {
  return (
    <div className="w-16 h-2 rounded-full bg-slate-200 overflow-hidden" title={`Sensitivity ${value}/10`}>
      <div
        className="h-full rounded-full"
        style={{
          width: `${value * 10}%`,
          background: value >= 7 ? '#1a7f5a' : value >= 4 ? '#f2b134' : '#c0392b',
        }}
      />
    </div>
  );
}

// darken a hex color for the gradient end
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 30);
  const g = Math.max(0, ((n >> 8) & 255) - 30);
  const b = Math.max(0, (n & 255) - 30);
  return `rgb(${r},${g},${b})`;
}

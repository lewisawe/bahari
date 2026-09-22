import React, { useState } from 'react';
import { identifyTaxon, getProviderName } from '../core/ai-assist.js';
import { getTaxon } from '../core/taxa.js';

// Explainable, human-in-the-loop AI assist panel.
//
// The human always decides: the AI suggests + explains + states confidence, and
// on low confidence it refuses to suggest and asks the person to choose. Every
// path ends in the citizen confirming (which records a count) or dismissing.
// Nothing is auto-recorded by the AI.

export default function AssistPanel({ onConfirm, onClose, presetHint }) {
  const [phase, setPhase] = useState('idle'); // idle | thinking | done
  const [result, setResult] = useState(null);
  const [photoName, setPhotoName] = useState(null);

  async function runAssist(hintTaxonId) {
    const name = photoName || `photo-${Date.now()}.jpg`;
    setPhotoName(name);
    setPhase('thinking');
    const r = await identifyTaxon({ photoName: name, hintTaxonId, seed: name.length });
    setResult(r);
    setPhase('done');
  }

  function onPickPhoto(e) {
    const f = e.target.files?.[0];
    setPhotoName(f ? f.name : `sample-${Date.now()}.jpg`);
  }

  return (
    <div className="rounded bg-card border border-accent/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-snow">AI identification help</span>
          <span className="font-mono text-[10px] uppercase tracking-code bg-ink text-ash px-1.5 py-0.5 rounded-tag border border-steel">
            assist · not the decision
          </span>
        </div>
        <button onClick={onClose} className="text-ash text-sm hover:text-snow">
          Close
        </button>
      </div>

      <p className="text-xs text-ash">
        Add a photo of one creature and the AI will suggest what it might be, show
        its reasoning, and how sure it is. <b className="text-snow">You</b> confirm
        the final answer.
      </p>

      {/* photo input */}
      <label className="block">
        <span className="sr-only">Photo of a creature</span>
        <input
          type="file"
          accept="image/*"
          onChange={onPickPhoto}
          className="block w-full text-xs text-ash file:mr-3 file:rounded file:border file:border-steel file:bg-section file:px-3 file:py-2 file:text-snow file:font-medium"
        />
      </label>
      {photoName && <div className="font-mono text-[11px] text-fog">Selected: {photoName}</div>}

      {phase === 'idle' && (
        <button
          onClick={() => runAssist(presetHint)}
          className="w-full rounded bg-snow text-ink text-sm font-medium py-2.5 hover:bg-white/90 transition-colors"
        >
          Ask the AI
        </button>
      )}

      {phase === 'thinking' && (
        <div className="text-sm text-ash py-2 animate-pulse">Looking at the photo…</div>
      )}

      {phase === 'done' && result && (
        <AssistResult
          result={result}
          onConfirm={(id) => onConfirm?.(id)}
          onRetry={() => setPhase('idle')}
        />
      )}

      <div className="font-mono text-[10px] text-fog pt-2 border-t border-steel">
        Engine: {getProviderName()} · a specialist model can be swapped in without
        changing this screen.
      </div>
    </div>
  );
}

function AssistResult({ result, onConfirm, onRetry }) {
  const suggested = result.taxonId ? getTaxon(result.taxonId) : null;
  const pct = Math.round(result.confidence * 100);

  const band =
    result.status === 'suggested'
      ? { c: '#3ecf8e', label: 'Fairly confident' }
      : result.status === 'review'
        ? { c: '#f5c451', label: 'Not sure, please verify' }
        : { c: '#ff6b6b', label: 'Cannot tell, you decide' };

  return (
    <div className="space-y-3">
      {/* confidence + status */}
      <div className="flex-1">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-medium" style={{ color: band.c }}>
            {band.label}
          </span>
          <span className="font-mono text-ash tabular-nums">{pct}% sure</span>
        </div>
        <div className="h-1.5 rounded-full bg-steel overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: band.c }} />
        </div>
      </div>

      {/* the suggestion (or explicit deferral) */}
      {result.status !== 'defer' && suggested ? (
        <div className="rounded bg-section border border-steel p-3">
          <div className="text-sm text-snow">
            Might be a <b>{suggested.commonName}</b>
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {result.reasoning.map((r, i) => (
              <li key={i} className="text-xs text-ash flex gap-1.5">
                <span className="text-accent">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
          {result.alternatives?.length > 0 && (
            <div className="text-[11px] text-fog mt-2">
              Could also be:{' '}
              {result.alternatives
                .map((a) => getTaxon(a.taxonId)?.commonName)
                .filter(Boolean)
                .join(', ')}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded bg-section border border-health-bad/40 p-3">
          <div className="text-sm font-medium text-health-bad">
            The AI is not confident enough.
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {result.reasoning.map((r, i) => (
              <li key={i} className="text-xs text-ash flex gap-1.5">
                <span className="text-health-bad">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ash mt-2">
            Please decide yourself using the recognition tips, or leave it out if
            unsure.
          </p>
        </div>
      )}

      {/* human decision — the AI never records on its own */}
      <div className="grid grid-cols-2 gap-2">
        {result.status !== 'defer' && suggested ? (
          <button
            onClick={() => onConfirm(suggested.id)}
            className="rounded bg-snow text-ink text-sm font-medium py-2.5 hover:bg-white/90 transition-colors"
          >
            Yes, add {suggested.commonName}
          </button>
        ) : (
          <button
            onClick={onRetry}
            className="rounded bg-card border border-steel text-snow text-sm font-medium py-2.5 hover:border-graphite transition-colors"
          >
            Try another photo
          </button>
        )}
        <button
          onClick={onRetry}
          className="rounded border border-graphite bg-transparent text-snow text-sm font-medium py-2.5 hover:bg-card transition-colors"
        >
          {result.status !== 'defer' ? 'No / not sure' : 'OK'}
        </button>
      </div>
    </div>
  );
}

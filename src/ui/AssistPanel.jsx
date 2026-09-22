import React, { useState } from 'react';
import { identifyTaxon, getProviderName, CONFIDENT_THRESHOLD, REVIEW_THRESHOLD } from '../core/ai-assist.js';
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
    // In the stub, a "photo" is simulated. A real provider would take the file.
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
    <div className="rounded-2xl border border-bahari-bright/40 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-bahari-deep">AI identification help</span>
          <span className="text-[10px] uppercase tracking-wide bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
            assist · not the decision
          </span>
        </div>
        <button onClick={onClose} className="text-slate-400 text-sm hover:text-slate-600">
          Close
        </button>
      </div>

      <p className="text-xs text-slate-500">
        Add a photo of one creature and the AI will suggest what it might be, show
        its reasoning, and how sure it is. <b>You</b> confirm the final answer.
      </p>

      {/* photo input */}
      <label className="block">
        <span className="sr-only">Photo</span>
        <input
          type="file"
          accept="image/*"
          onChange={onPickPhoto}
          className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-bahari-pale file:px-3 file:py-2 file:text-bahari-deep file:font-semibold"
        />
      </label>
      {photoName && <div className="text-[11px] text-slate-400">Selected: {photoName}</div>}

      {phase === 'idle' && (
        <button
          onClick={() => runAssist(presetHint)}
          className="w-full rounded-xl bg-bahari-mid text-white font-semibold py-2.5 active:scale-[0.99]"
        >
          Ask the AI
        </button>
      )}

      {phase === 'thinking' && (
        <div className="text-sm text-slate-500 py-2 animate-pulse">Looking at the photo…</div>
      )}

      {phase === 'done' && result && (
        <AssistResult
          result={result}
          onConfirm={(id) => onConfirm?.(id)}
          onRetry={() => setPhase('idle')}
        />
      )}

      <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
        Engine: {getProviderName()} · A specialist model can be swapped in without
        changing this screen.
      </div>
    </div>
  );
}

function AssistResult({ result, onConfirm, onRetry }) {
  const suggested = result.taxonId ? getTaxon(result.taxonId) : null;
  const pct = Math.round(result.confidence * 100);

  // Colour + framing by policy status.
  const band =
    result.status === 'suggested'
      ? { c: '#1a7f5a', label: 'Fairly confident' }
      : result.status === 'review'
        ? { c: '#f2b134', label: 'Not sure — please verify' }
        : { c: '#c0392b', label: 'Cannot tell — you decide' };

  return (
    <div className="space-y-3">
      {/* confidence + status */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold" style={{ color: band.c }}>
              {band.label}
            </span>
            <span className="text-slate-500 tabular-nums">{pct}% sure</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: band.c }} />
          </div>
        </div>
      </div>

      {/* the suggestion (or explicit deferral) */}
      {result.status !== 'defer' && suggested ? (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <div className="text-sm">
            Might be a <b>{suggested.commonName}</b>
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {result.reasoning.map((r, i) => (
              <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                <span className="text-bahari-mid">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
          {result.alternatives?.length > 0 && (
            <div className="text-[11px] text-slate-500 mt-2">
              Could also be:{' '}
              {result.alternatives
                .map((a) => getTaxon(a.taxonId)?.commonName)
                .filter(Boolean)
                .join(', ')}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3">
          <div className="text-sm font-semibold text-rose-800">The AI is not confident enough.</div>
          <ul className="mt-1.5 space-y-0.5">
            {result.reasoning.map((r, i) => (
              <li key={i} className="text-xs text-rose-700 flex gap-1.5">
                <span>•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-rose-700 mt-2">
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
            className="rounded-xl bg-bahari-mid text-white text-sm font-semibold py-2.5 active:scale-[0.99]"
          >
            Yes, add {suggested.commonName}
          </button>
        ) : (
          <button
            onClick={onRetry}
            className="rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold py-2.5"
          >
            Try another photo
          </button>
        )}
        <button
          onClick={onRetry}
          className="rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold py-2.5"
        >
          {result.status !== 'defer' ? 'No / not sure' : 'OK'}
        </button>
      </div>
    </div>
  );
}

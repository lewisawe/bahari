import React, { useState } from 'react';
import { identifyTaxon, getProviderName } from '../core/ai-assist.js';
import { getTaxon } from '../core/taxa.js';
import { useT } from '../i18n/I18n.jsx';
import ConfidenceMeter from './ConfidenceMeter.jsx';

// Explainable, human-in-the-loop AI assist panel (Beat C).
//
// The human always decides: the AI suggests + explains + states confidence, and
// on low confidence it refuses to suggest and asks the person to choose. Every
// path ends in the citizen confirming (which records a count) or dismissing.
// Nothing is auto-recorded by the AI.
//
// All user-facing copy flows through i18n (EN + FR). The confidence is the
// focal element: a bold animated meter in the band color with the band label
// as the headline — the responsible-AI story, staged.

export default function AssistPanel({ onConfirm, onClose, presetHint }) {
  const { t } = useT();
  const [phase, setPhase] = useState('idle'); // idle | thinking | done
  const [result, setResult] = useState(null);
  const [photoName, setPhotoName] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);

  async function runAssist(hintTaxonId) {
    const name = photoName || `photo-${Date.now()}.jpg`;
    setPhotoName(name);
    setPhase('thinking');
    // Base payload: filename-only path (keeps the shipped stub deterministic).
    const payload = { photoName: name, hintTaxonId, seed: name.length };
    // In the browser, if a real file was picked, also read its bytes so a Nova
    // provider (installed via setAssistProvider) can see the actual image. The
    // extra fields are inert when the default stub is active. Guarded so Node
    // tests (no FileReader / no attached File) keep the exact current behavior.
    if (photoFile && typeof FileReader !== 'undefined') {
      try {
        const { imageBase64, imageFormat } = await readFileAsBase64(photoFile);
        payload.imageBase64 = imageBase64;
        payload.imageFormat = imageFormat;
      } catch {
        // ignore — fall through with the filename-only payload
      }
    }
    const r = await identifyTaxon(payload);
    setResult(r);
    setPhase('done');
  }

  function onPickPhoto(e) {
    const f = e.target.files?.[0];
    setPhotoName(f ? f.name : `sample-${Date.now()}.jpg`);
    setPhotoFile(f || null);
  }

  return (
    <div className="rounded bg-card border border-accent/40 p-4 space-y-3 anim-fade-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-snow">{t('assist.title')}</span>
          <span className="font-mono text-[10px] uppercase tracking-code bg-ink text-ash px-1.5 py-0.5 rounded-tag border border-steel">
            {t('assist.tag')}
          </span>
        </div>
        <button onClick={onClose} className="text-ash text-sm hover:text-snow">
          {t('assist.close')}
        </button>
      </div>

      <p className="text-xs text-ash">
        {t('assist.intro', { you: '' })
          .split('{you}')
          .flatMap((seg, i) =>
            i === 0 ? [seg] : [<b key="you" className="text-snow">{t('assist.you')}</b>, seg],
          )}
      </p>

      {/* photo input */}
      <label className="block">
        <span className="sr-only">{t('assist.photoLabel')}</span>
        <input
          type="file"
          accept="image/*"
          onChange={onPickPhoto}
          className="block w-full text-xs text-ash file:mr-3 file:rounded file:border file:border-steel file:bg-section file:px-3 file:py-2 file:text-snow file:font-medium"
        />
      </label>
      {photoName && (
        <div className="font-mono text-[11px] text-fog">{t('assist.selected', { name: photoName })}</div>
      )}

      {phase === 'idle' && (
        <button
          onClick={() => runAssist(presetHint)}
          className="w-full rounded bg-snow text-ink text-sm font-medium py-2.5 hover:bg-white/90 active:scale-[0.98] transition-[background-color,transform]"
        >
          {t('assist.ask')}
        </button>
      )}

      {phase === 'thinking' && <ScanningState label={t('assist.scanning')} />}

      {phase === 'done' && result && (
        <AssistResult
          result={result}
          onConfirm={(id) => onConfirm?.(id)}
          onRetry={() => setPhase('idle')}
        />
      )}

      <div className="font-mono text-[10px] text-fog pt-2 border-t border-steel">
        {t('assist.engine', { name: getProviderName() })}
      </div>
    </div>
  );
}

// The "AI is looking at the photo" beat: a framed placeholder with a scanning
// sweep so the AI visibly feels like it's examining the image. The sweep is
// decorative and stops under reduced motion (CSS .scan-frame guard). The text
// remains for screen readers / reduced-motion users.
function ScanningState({ label }) {
  return (
    <div className="scan-frame rounded border border-accent/40 bg-section grid place-items-center h-24">
      <div className="flex items-center gap-2 text-sm text-ash" aria-live="polite">
        <span className="w-2 h-2 rounded-full bg-accent anim-pop" aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}

function AssistResult({ result, onConfirm, onRetry }) {
  const { t } = useT();
  const suggested = result.taxonId ? getTaxon(result.taxonId) : null;
  const pct = Math.round(result.confidence * 100);

  // Band color + label — the honest "cannot tell" is a strength, so it is
  // presented with the same confidence as a positive result, not as an error.
  const band =
    result.status === 'suggested'
      ? { c: '#3ecf8e', label: t('assist.band.suggested') }
      : result.status === 'review'
        ? { c: '#f5c451', label: t('assist.band.review') }
        : { c: '#ff6b6b', label: t('assist.band.defer') };

  return (
    <div className="space-y-3 anim-fade-up">
      {/* confidence — the focal element: bold meter + big pct + band headline */}
      <ConfidenceMeter pct={pct} color={band.c} label={band.label} unit={t('assist.confidence')} />

      {/* the suggestion (or explicit deferral) */}
      {result.status !== 'defer' && suggested ? (
        <div className="rounded bg-section border border-steel p-3">
          <div className="text-sm text-snow">
            {t('assist.mightBe', { name: '' })
              .split('{name}')
              .flatMap((seg, i) =>
                i === 0 ? [seg] : [<b key="n">{suggested.commonName}</b>, seg],
              )}
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
              {t('assist.couldAlsoBe', {
                names: result.alternatives
                  .map((a) => getTaxon(a.taxonId)?.commonName)
                  .filter(Boolean)
                  .join(', '),
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded bg-section border p-3" style={{ borderColor: `${band.c}66` }}>
          <div className="text-sm font-medium" style={{ color: band.c }}>
            {t('assist.notConfident')}
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {result.reasoning.map((r, i) => (
              <li key={i} className="text-xs text-ash flex gap-1.5">
                <span style={{ color: band.c }}>•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ash mt-2">{t('assist.deferHelp')}</p>
        </div>
      )}

      {/* human decision — the AI never records on its own */}
      <div className="grid grid-cols-2 gap-2">
        {result.status !== 'defer' && suggested ? (
          <button
            onClick={() => onConfirm(suggested.id)}
            className="rounded bg-snow text-ink text-sm font-medium py-2.5 hover:bg-white/90 active:scale-[0.98] transition-[background-color,transform]"
          >
            {t('assist.addSuggested', { name: suggested.commonName })}
          </button>
        ) : (
          <button
            onClick={onRetry}
            className="rounded bg-card border border-steel text-snow text-sm font-medium py-2.5 hover:border-graphite active:scale-[0.98] transition-[border-color,transform]"
          >
            {t('assist.tryAnother')}
          </button>
        )}
        <button
          onClick={onRetry}
          className="rounded border border-graphite bg-transparent text-snow text-sm font-medium py-2.5 hover:bg-card active:scale-[0.98] transition-[background-color,transform]"
        >
          {result.status !== 'defer' ? t('assist.decline') : t('assist.ok')}
        </button>
      </div>
    </div>
  );
}

/**
 * Read a File/Blob into { imageBase64 (raw base64, no data: prefix),
 * imageFormat ('png'|'jpeg') }. Browser-only (uses FileReader).
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      const imageBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      const type = (file.type || '').toLowerCase();
      const imageFormat = type.includes('png') ? 'png' : 'jpeg';
      resolve({ imageBase64, imageFormat });
    };
    reader.readAsDataURL(file);
  });
}

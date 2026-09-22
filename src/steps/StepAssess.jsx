import React, { useState } from 'react';
import { TAXA } from '../core/taxa.js';
import { groupsFound } from '../core/assessment.js';
import { TierBadge, PrimaryButton, GhostButton } from '../ui/primitives.jsx';
import AssistPanel from '../ui/AssistPanel.jsx';

// Step 2 — guided "what did you find?" recording.
// Mobile-first taxa cards grouped by sensitivity tier, jargon-free, with a
// tap-friendly counter and a "how to recognise" hint. No science jargon shown
// to the citizen beyond an optional expandable note.

const TIER_ORDER = [
  { key: 'sensitive', title: 'Clean-water lovers', hint: 'Only live where water is healthy — great to find.' },
  { key: 'moderate', title: 'In-betweeners', hint: 'Cope with some stress on the stream.' },
  { key: 'tolerant', title: 'Tough survivors', hint: 'Can live even in polluted water.' },
];

export default function StepAssess({ counts, onChange, onPhotoConfirmed, onBack, onNext }) {
  const found = groupsFound(counts);
  const [showAssist, setShowAssist] = useState(false);

  function setCount(id, next) {
    onChange({ ...counts, [id]: Math.max(0, next) });
  }

  // AI confirmed a suggestion -> the HUMAN accepted it, so record one.
  // A confirmed AI photo also counts as photo evidence for reliability.
  function confirmFromAssist(id) {
    setCount(id, (counts[id] ?? 0) + 1);
    onPhotoConfirmed?.();
    setShowAssist(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">What did you find?</h2>
        <p className="text-sm text-slate-500">
          Flip a few stones and scoop the streambed. Tap <b>+</b> for each kind of
          little creature you see. Not sure? Skip it — only record what you're
          confident about.
        </p>
      </div>

      {/* Optional AI identification help */}
      {showAssist ? (
        <AssistPanel
          onConfirm={confirmFromAssist}
          onClose={() => setShowAssist(false)}
        />
      ) : (
        <button
          onClick={() => setShowAssist(true)}
          className="w-full rounded-xl border border-dashed border-bahari-bright/60 bg-bahari-pale/40 text-bahari-deep text-sm font-semibold py-3 hover:bg-bahari-pale active:scale-[0.99]"
        >
          Not sure what you found? Check a photo with AI
        </button>
      )}

      {TIER_ORDER.map((group) => (
        <div key={group.key} className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-bold text-slate-700">{group.title}</h3>
            <span className="text-[11px] text-slate-400">{group.hint}</span>
          </div>
          <div className="space-y-2">
            {TAXA.filter((t) => t.tier === group.key).map((t) => (
              <TaxonCard
                key={t.id}
                taxon={t}
                count={counts[t.id] ?? 0}
                onDec={() => setCount(t.id, (counts[t.id] ?? 0) - 1)}
                onInc={() => setCount(t.id, (counts[t.id] ?? 0) + 1)}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="sticky bottom-0 bg-gradient-to-t from-[#f6fafb] via-[#f6fafb] pt-3 pb-1 space-y-2">
        <p className="text-center text-xs text-slate-500">
          {found === 0
            ? 'Record at least one group to see your stream health.'
            : `${found} group${found === 1 ? '' : 's'} recorded.`}
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <GhostButton onClick={onBack}>Back</GhostButton>
          <PrimaryButton disabled={found === 0} onClick={onNext}>
            See stream health
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function TaxonCard({ taxon, count, onDec, onInc }) {
  const [open, setOpen] = useState(false);
  const active = count >= 1;
  return (
    <div
      className={
        'rounded-xl border px-3 py-2.5 transition ' +
        (active ? 'border-bahari-bright bg-bahari-pale/60' : 'border-slate-200 bg-white')
      }
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 text-sm">{taxon.commonName}</span>
            <TierBadge tier={taxon.tier} />
          </div>
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-bahari-mid hover:underline mt-0.5"
          >
            {open ? 'Hide' : 'How do I know?'}
          </button>
        </div>
        <Counter count={count} onDec={onDec} onInc={onInc} />
      </div>
      {open && (
        <p className="text-xs text-slate-600 mt-2 bg-white rounded-lg px-3 py-2 border border-slate-100">
          {taxon.recognise}
          <span className="block text-[11px] text-slate-400 mt-1">
            Group: {taxon.scientificGroup}
          </span>
        </p>
      )}
    </div>
  );
}

function Counter({ count, onDec, onInc }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={onDec}
        disabled={count === 0}
        aria-label="Fewer"
        className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 text-xl font-bold grid place-items-center disabled:opacity-30 active:scale-95"
      >
        −
      </button>
      <span className="w-6 text-center font-bold tabular-nums text-slate-800">{count}</span>
      <button
        onClick={onInc}
        aria-label="More"
        className="w-9 h-9 rounded-full bg-bahari-mid text-white text-xl font-bold grid place-items-center active:scale-95"
      >
        +
      </button>
    </div>
  );
}

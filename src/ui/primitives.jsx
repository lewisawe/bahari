import React from 'react';

// Small shared UI primitives so the step screens stay consistent + tidy.

export function TierBadge({ tier }) {
  const map = {
    sensitive: { c: 'bg-emerald-100 text-emerald-800', t: 'Sensitive' },
    moderate: { c: 'bg-amber-100 text-amber-800', t: 'Moderate' },
    tolerant: { c: 'bg-rose-100 text-rose-800', t: 'Tolerant' },
  };
  const m = map[tier] || map.moderate;
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${m.c}`}>{m.t}</span>
  );
}

export function Stepper({ label }) {
  return null; // placeholder kept for API symmetry; header shows progress instead
}

export function PrimaryButton({ children, disabled, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        'w-full rounded-xl px-4 py-3 font-semibold text-white transition ' +
        'bg-bahari-mid hover:bg-bahari-deep active:scale-[0.99] ' +
        'disabled:opacity-40 disabled:cursor-not-allowed ' +
        className
      }
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={
        'rounded-xl px-4 py-3 font-medium text-bahari-deep bg-white ' +
        'border border-slate-200 hover:bg-slate-50 active:scale-[0.99] transition ' +
        className
      }
    >
      {children}
    </button>
  );
}

export function Stepper2({ steps, activeIndex }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span
            className={
              'w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold ' +
              (i < activeIndex
                ? 'bg-white text-bahari-deep'
                : i === activeIndex
                  ? 'bg-bahari-bright text-white ring-2 ring-white/50'
                  : 'bg-white/25 text-white/70')
            }
          >
            {i < activeIndex ? '\u2713' : i + 1}
          </span>
          {i < steps.length - 1 && <span className="w-4 h-px bg-white/30" />}
        </li>
      ))}
    </ol>
  );
}

import React from 'react';
import { healthColorForClass } from '../core/health-colors.js';

// Dovetail primitives (see DESIGN.md). Dark command-center: white-filled primary
// buttons, outlined secondary, mono eyebrows, tonal cards, single blue accent.
// Where DESIGN.md example prompts conflict with its Do/Don'ts + tokens, the
// Do/Don'ts win: primary = white fill + near-black text + 8px radius; the blue
// accent never fills a button.

export function healthColor(classKey) {
  return healthColorForClass(classKey);
}

export function Eyebrow({ children, className = '' }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

export function PrimaryButton({ children, disabled, onClick, className = '', type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={
        'w-full rounded px-4 py-2.5 text-sm font-medium transition-colors ' +
        'bg-snow text-ink hover:bg-white/90 active:bg-white/80 ' +
        'disabled:bg-card disabled:text-fog disabled:cursor-not-allowed ' +
        className
      }
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, className = '', type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={
        'rounded px-4 py-2.5 text-sm font-medium transition-colors ' +
        'bg-transparent text-snow border border-graphite hover:bg-card ' +
        className
      }
    >
      {children}
    </button>
  );
}

export function TierBadge({ tier }) {
  const map = {
    sensitive: { c: 'text-health-good border-health-good/40', t: 'Sensitive' },
    moderate: { c: 'text-health-fair border-health-fair/40', t: 'Moderate' },
    tolerant: { c: 'text-health-bad border-health-bad/40', t: 'Tolerant' },
  };
  const m = map[tier] || map.moderate;
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-code px-1.5 py-0.5 rounded-tag border ${m.c}`}
    >
      {m.t}
    </span>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`rounded bg-card border border-steel ${className}`}>{children}</div>
  );
}

export function Stepper2({ steps, activeIndex }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span
            className={
              'w-6 h-6 rounded-full grid place-items-center font-mono text-[11px] ' +
              (i < activeIndex
                ? 'bg-card text-accent border border-accent/50'
                : i === activeIndex
                  ? 'bg-accent text-ink'
                  : 'bg-card text-fog border border-steel')
            }
            aria-current={i === activeIndex ? 'step' : undefined}
          >
            {i < activeIndex ? '\u2713' : i + 1}
          </span>
          {i < steps.length - 1 && <span className="w-4 h-px bg-steel" />}
        </li>
      ))}
    </ol>
  );
}

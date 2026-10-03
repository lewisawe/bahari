import React from 'react';
import { useCountUp } from './motion.js';

// Bold confidence meter (Beat C). The band label is the headline, the big
// counting percentage is the focal number, and a thick bar fills to the value
// in the band color. Reduced motion lands on the final width + number.

export default function ConfidenceMeter({ pct, color, label, unit }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const display = useCountUp(clamped, { duration: 700 });

  return (
    <div
      className="rounded border p-3"
      style={{ borderColor: `${color}59`, background: `${color}0f` }}
    >
      <div className="flex items-end justify-between gap-3">
        <span className="text-base font-semibold leading-tight" style={{ color }}>
          {label}
        </span>
        <span className="shrink-0">
          <span className="text-3xl font-semibold tabular-nums" style={{ color }}>
            {display}%
          </span>
          <span className="ml-1 font-mono text-[10px] uppercase tracking-code text-ash">
            {unit}
          </span>
        </span>
      </div>
      <div
        className="mt-2 h-2.5 rounded-full bg-steel overflow-hidden"
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="anim-meter h-full rounded-full"
          style={{ '--meter': `${clamped}%`, background: color }}
        />
      </div>
    </div>
  );
}

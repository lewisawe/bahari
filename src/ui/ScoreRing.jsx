import React from 'react';
import { useCountUp, useReducedMotion } from './motion.js';

// Shared score/reliability ring. An SVG progress ring tinted with the health
// color that DRAWS from empty to its value, with the numeral COUNTING up and
// (optionally) a soft health-colored glow aura behind it. This is the single
// sanctioned glow in the otherwise shadow-free Dovetail system — scoped to the
// signature result reveal (Beat A) and reused, subordinate, for reliability.
//
// Reduced motion lands on the final resting state: full ring + final numeral,
// no glow pulse (the CSS reduced-motion block + rAF guard both enforce this).

export default function ScoreRing({
  score,
  max = 10,
  color = '#6798ff',
  size = 92,
  stroke = 5,
  glow = true,
  label,
}) {
  const reduced = useReducedMotion();
  const display = useCountUp(score, { duration: 700 });

  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, (Number(score) || 0) / max));
  const offset = circumference * (1 - frac);
  const center = size / 2;

  return (
    <div
      className="relative grid place-items-center shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label || `Score ${score} out of ${max}`}
    >
      {/* glow aura — low-alpha radial of the health color, scoped to this beat */}
      {glow && !reduced && (
        <span
          aria-hidden="true"
          className="anim-glow absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at center, ${color}59 0%, ${color}1f 45%, transparent 72%)`,
          }}
        />
      )}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="relative -rotate-90"
        aria-hidden="true"
      >
        {/* track */}
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="#313131"
          strokeWidth={stroke}
        />
        {/* value arc — draws in from 0 */}
        <circle
          className="anim-ring-draw"
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            '--ring-circumference': circumference,
            '--ring-offset': offset,
          }}
        />
      </svg>
      <span
        className="absolute text-2xl font-semibold tabular-nums"
        style={{ color }}
      >
        {display}
      </span>
    </div>
  );
}

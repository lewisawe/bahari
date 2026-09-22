import React from 'react';

// Tiny inline sparkline for a stream's score history (1..10 scale).
// Pure SVG, no deps. Points are scores in chronological order.

export default function Sparkline({ points = [], width = 120, height = 32, color = '#127a8a' }) {
  const vals = points.filter((n) => typeof n === 'number');
  if (vals.length < 2) return null;

  const min = 1;
  const max = 10;
  const stepX = width / (vals.length - 1);
  const coords = vals.map((v, i) => {
    const x = i * stepX;
    const y = height - ((clamp(v, min, max) - min) / (max - min)) * height;
    return [x, y];
  });
  const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="3" fill={color} />
    </svg>
  );
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

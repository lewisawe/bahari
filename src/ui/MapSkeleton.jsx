import React from 'react';

// Skeleton placeholder sized to the map height so the layout does not pop in
// when Leaflet finishes loading. The shimmer sweep stops under reduced motion
// (handled by the .skeleton CSS guard). The label stays for screen readers.

export default function MapSkeleton({ height = 260, label = 'Loading map…' }) {
  return (
    <div
      className="skeleton rounded border border-steel grid place-items-center"
      style={{ height }}
      role="status"
      aria-live="polite"
    >
      <span className="relative font-mono text-[11px] uppercase tracking-code text-fog">
        {label}
      </span>
    </div>
  );
}

import React, { useEffect, useRef } from 'react';
import { markerColor, fitView } from '../core/map-utils.js';

// Interactive stream map (plain Leaflet + OpenStreetMap tiles, free/no key).
// Markers are colored by each stream's latest health class; clicking selects.
// The map only mounts in a real browser with Leaflet available; callers keep a
// list fallback for no-JS / offline / test environments.

export default function StreamMap({
  streams = [],
  selectedId,
  onSelect,
  historyByStream = {},
  height = 260,
  fitAll = false,
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const LRef = useRef(null);

  // init map once
  useEffect(() => {
    let cancelled = false;
    async function init() {
      // dynamic import so a non-browser/test environment never loads Leaflet
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;

      const { center, zoom } = fitAll ? fitView(streams) : { center: [50, 5], zoom: 4 };
      const map = L.map(elRef.current, {
        center,
        zoom,
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false,
      });
      // OpenStreetMap standard tiles: genuinely free, no key, no watermark.
      // We darken them with a CSS filter (added on the tile pane below) so the
      // map matches the dark Dovetail theme without a paid/keyed dark basemap.
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      // darken only the tile layer, not the markers/controls
      const tilePane = map.getPane('tilePane');
      if (tilePane) {
        tilePane.style.filter = 'invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)';
      }
      mapRef.current = map;
      renderMarkers();
      if (fitAll && streams.length > 1) {
        const b = L.latLngBounds(streams.map((s) => [s.lat, s.lon]));
        map.fitBounds(b.pad(0.2));
      }
    }
    init();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-render markers when data / selection changes
  useEffect(() => {
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams, selectedId, historyByStream]);

  function renderMarkers() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    // clear old
    for (const m of markersRef.current.values()) m.remove();
    markersRef.current.clear();

    for (const s of streams) {
      if (typeof s.lat !== 'number' || typeof s.lon !== 'number') continue;
      const color = markerColor(s, historyByStream[s.id]);
      const selected = s.id === selectedId;
      const marker = L.circleMarker([s.lat, s.lon], {
        radius: selected ? 9 : 6,
        color: selected ? '#ffffff' : color,
        weight: selected ? 2 : 1,
        fillColor: color,
        fillOpacity: 0.9,
      });
      marker.bindTooltip(s.name, { direction: 'top' });
      marker.on('click', () => onSelect?.(s.id));
      marker.addTo(map);
      markersRef.current.set(s.id, marker);
    }
  }

  return (
    <div
      ref={elRef}
      role="application"
      aria-label="Map of stream monitoring points"
      className="w-full rounded border border-steel overflow-hidden bg-section"
      style={{ height }}
    />
  );
}

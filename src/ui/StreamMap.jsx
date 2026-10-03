import React, { useEffect, useRef } from 'react';
import { markerColor, fitView } from '../core/map-utils.js';
import { prefersReducedMotion } from './motion.js';

// Interactive stream map (plain Leaflet + OpenStreetMap tiles, free/no key).
// Markers are colored by each stream's latest health class; clicking selects.
// The map only mounts in a real browser with Leaflet available; callers keep a
// list fallback for no-JS / offline / test environments.

// Zoom used when flying to a single selected stream — close enough to read as
// "zoomed into the stream," not a tiny pan (audit asks for ~12–14).
const SELECT_ZOOM = 13;

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
  const readyRef = useRef(false); // map created + initial framing done
  const lastFlownRef = useRef(undefined); // last selectedId we flew to

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
      // Initial framing is done. From here on, a selectedId change should fly
      // the viewport to that stream (handled by the selection effect below).
      // Seed lastFlown with the current selection so we do NOT yank the view
      // on first mount when fitAll is intentionally framing everything.
      readyRef.current = true;
      lastFlownRef.current = selectedId;
      // If the map opened focused on a single stream (not fitAll), make sure
      // its marker is highlighted/open from the start.
      if (!fitAll) openSelectedTooltip();
    }
    init();
    return () => {
      cancelled = true;
      readyRef.current = false;
      lastFlownRef.current = undefined;
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

  // Fly/pan+zoom to the selected stream whenever the selection changes. This is
  // the direct-manipulation feedback the user reported missing: selecting a
  // stream must move the view it refers to. Independent of marker rebuild.
  useEffect(() => {
    flyToSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function flyToSelected() {
    const map = mapRef.current;
    // Guard: map not yet initialized, or still doing initial framing.
    if (!map || !readyRef.current) return;
    // Guard: no selection, or selection unchanged since we last flew.
    if (selectedId == null) {
      lastFlownRef.current = selectedId;
      return;
    }
    if (selectedId === lastFlownRef.current) return;
    const s = streams.find((x) => x.id === selectedId);
    // Guard: unknown stream or missing/invalid coordinates.
    if (!s || typeof s.lat !== 'number' || typeof s.lon !== 'number') return;

    lastFlownRef.current = selectedId;
    const target = [s.lat, s.lon];
    const zoom = Math.max(map.getZoom() || 0, SELECT_ZOOM);
    // Reduced motion: snap without an animated flight.
    if (prefersReducedMotion()) {
      map.setView(target, zoom, { animate: false });
    } else if (typeof map.flyTo === 'function') {
      map.flyTo(target, zoom, { duration: 0.8 });
    } else {
      map.setView(target, zoom);
    }
    openSelectedTooltip();
  }

  // Open the tooltip on the currently-selected marker (if any) so the flown-to
  // stream is clearly labelled. No-op if the marker/map is absent.
  function openSelectedTooltip() {
    const marker = selectedId != null ? markersRef.current.get(selectedId) : null;
    if (marker && typeof marker.openTooltip === 'function') {
      try {
        marker.openTooltip();
      } catch {
        /* tooltip may not be bound yet; ignore */
      }
    }
  }

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
      role="region"
      aria-label="Map of stream monitoring points"
      className="w-full rounded border border-steel overflow-hidden bg-section"
      style={{ height }}
    />
  );
}

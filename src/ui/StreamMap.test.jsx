// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import StreamMap from './StreamMap.jsx';

// Runtime proof for the P0 fix: selecting a stream must fly/pan+zoom the map to
// that stream's marker. Leaflet never mounts in jsdom, so we mock it with a
// spy-able fake map and assert flyTo/setView fires on a selectedId change (and
// NOT on the initial fitAll mount). We also assert reduced-motion snaps via
// setView instead of an animated flyTo.

const streams = [
  { id: 's1', name: 'Alpha Creek', lat: 10, lon: 20 },
  { id: 's2', name: 'Beta Brook', lat: 40, lon: -5 },
];

let fakeMap;
let reducedMatches = false;

function makeMarker() {
  return {
    bindTooltip: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    openTooltip: vi.fn(),
    remove: vi.fn(),
  };
}

beforeEach(() => {
  reducedMatches = false;
  // matchMedia for prefersReducedMotion()
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: q.includes('reduce') ? reducedMatches : false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));

  fakeMap = {
    getPane: vi.fn(() => ({ style: {} })),
    getZoom: vi.fn(() => 4),
    flyTo: vi.fn(),
    setView: vi.fn(),
    fitBounds: vi.fn(),
    remove: vi.fn(),
  };

  vi.doMock('leaflet/dist/leaflet.css', () => ({}), { virtual: true });
  vi.doMock('leaflet', () => {
    const L = {
      map: vi.fn(() => fakeMap),
      tileLayer: vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })),
      circleMarker: vi.fn(() => makeMarker()),
      latLngBounds: vi.fn(() => ({ pad: vi.fn(() => ({})) })),
    };
    return { default: L };
  });
});

afterEach(() => {
  cleanup();
  vi.resetModules();
  vi.restoreAllMocks();
});

async function renderMap(props) {
  const utils = render(<StreamMap streams={streams} {...props} />);
  // wait for the dynamic import('leaflet') + init() to resolve and create the map
  await waitFor(() => expect(fakeMap.flyTo.mock.calls.length + fakeMap.setView.mock.calls.length >= 0).toBe(true));
  await waitFor(() => expect(fakeMap.getPane).toHaveBeenCalled());
  return utils;
}

describe('StreamMap fly-to on selection (P0)', () => {
  it('does NOT fly on initial fitAll mount', async () => {
    await renderMap({ selectedId: 's1', fitAll: true });
    // initial framing uses fitBounds, not flyTo/setView-to-stream
    expect(fakeMap.fitBounds).toHaveBeenCalled();
    expect(fakeMap.flyTo).not.toHaveBeenCalled();
  });

  it('flies to the stream when selectedId changes', async () => {
    const { rerender } = await renderMap({ selectedId: 's1', fitAll: true });
    expect(fakeMap.flyTo).not.toHaveBeenCalled();

    rerender(<StreamMap streams={streams} selectedId="s2" fitAll />);
    await waitFor(() => expect(fakeMap.flyTo).toHaveBeenCalledTimes(1));

    const [coords, zoom] = fakeMap.flyTo.mock.calls[0];
    expect(coords).toEqual([40, -5]); // Beta Brook lat/lon
    expect(zoom).toBeGreaterThanOrEqual(12);
    expect(zoom).toBeLessThanOrEqual(14);
  });

  it('does not fly for an unknown or null selectedId', async () => {
    const { rerender } = await renderMap({ selectedId: 's1', fitAll: true });
    rerender(<StreamMap streams={streams} selectedId="does-not-exist" fitAll />);
    rerender(<StreamMap streams={streams} selectedId={null} fitAll />);
    await new Promise((r) => setTimeout(r, 20));
    expect(fakeMap.flyTo).not.toHaveBeenCalled();
    expect(fakeMap.setView).not.toHaveBeenCalled();
  });

  it('snaps with setView (no animated flyTo) under reduced motion', async () => {
    reducedMatches = true;
    const { rerender } = await renderMap({ selectedId: 's1', fitAll: true });
    rerender(<StreamMap streams={streams} selectedId="s2" fitAll />);
    await waitFor(() => expect(fakeMap.setView).toHaveBeenCalledTimes(1));
    expect(fakeMap.flyTo).not.toHaveBeenCalled();
    const [coords, zoom, opts] = fakeMap.setView.mock.calls[0];
    expect(coords).toEqual([40, -5]);
    expect(zoom).toBeGreaterThanOrEqual(12);
    expect(opts).toMatchObject({ animate: false });
  });
});

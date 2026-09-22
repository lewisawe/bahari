// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import App from './App.jsx';

// One Health step attempts a live rain fetch; stub it so the smoke test is
// deterministic and offline (the app already falls back gracefully).
beforeEach(() => {
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline in test')));
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Smoke test: since we can't run a live dev server in this environment, this
// mounts the real app and walks the guided flow to prove the screens render
// and wire together without runtime crashes.

describe('Bahari guided flow', () => {
  it('renders the stream picker first', () => {
    render(<App />);
    expect(screen.getByText('Which stream are you at?')).toBeTruthy();
    expect(screen.getByText('Start assessment')).toBeTruthy();
  });

  it('walks stream -> assess -> result and shows a health class', () => {
    render(<App />);

    // Step 1: a stream is preselected; advance.
    fireEvent.click(screen.getByText('Start assessment'));

    // Step 2: record a sensitive group by tapping its "+" once.
    expect(screen.getByText('What did you find?')).toBeTruthy();
    const plusButtons = screen.getAllByLabelText(/One more/i);
    fireEvent.click(plusButtons[0]); // first taxon (stonefly, sensitive)

    // Advance to result.
    fireEvent.click(screen.getByText('See stream health'));

    // Step 3: a health class headline is shown.
    expect(screen.getByText('Stream health')).toBeTruthy();
    expect(screen.getByText('How this score is calculated')).toBeTruthy();
    // reliability panel is present
    expect(screen.getByText('Data reliability')).toBeTruthy();

    // Step 4: advance to One Health considerations.
    fireEvent.click(screen.getByText('See One Health considerations'));
    expect(screen.getByText('One Health considerations')).toBeTruthy();
    // the honesty caveat is present (appears in multiple places by design)
    expect(screen.getAllByText(/not a water-quality test/i).length).toBeGreaterThan(0);

    // Step 5: advance to the FHIR record and confirm it validates.
    fireEvent.click(screen.getByText('Create shareable record'));
    expect(screen.getByText('Shareable health record')).toBeTruthy();
    expect(screen.getByText(/Valid FHIR R4 Bundle/i)).toBeTruthy();
  });

  it('blocks advancing from assess with no findings', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Start assessment'));
    const next = screen.getByText('See stream health');
    expect(next.disabled).toBe(true);
  });

  it('opens the AI assist panel and can run it without crashing', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Start assessment'));
    fireEvent.click(screen.getByText(/Check a photo with AI/i));
    // panel visible
    expect(screen.getByText('AI identification help')).toBeTruthy();
    // run the assist (stub) — should not crash and should show the engine label
    fireEvent.click(screen.getByText('Ask the AI'));
    expect(screen.getByText(/Engine: stub/i)).toBeTruthy();
  });
});

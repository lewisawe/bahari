// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { axe } from 'vitest-axe';
import App from './App.jsx';

// Automated accessibility audit (axe) over the real rendered app. The map is
// lazy/dynamic and does not mount in jsdom, so this covers the DOM the app
// produces without network. We run axe on the two main views.

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

// axe checks we assert on; color-contrast is checked separately in a dedicated
// contrast test file against the palette because jsdom does not compute layout
// colors reliably for the axe color-contrast rule.
const RULES = {
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: true },
  },
};

describe('accessibility (axe)', () => {
  it('landing page has no violations', async () => {
    const { container } = render(<App />);
    const results = await axe(container, RULES);
    expect(results.violations).toEqual([]);
  });

  it('assess view has no violations', async () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getAllByText('Assess a stream')[0]);
    const results = await axe(container, RULES);
    expect(results.violations).toEqual([]);
  });

  it('assess step (find) has no violations', async () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getAllByText('Assess a stream')[0]);
    fireEvent.click(screen.getByText('Start assessment'));
    const results = await axe(container, RULES);
    expect(results.violations).toEqual([]);
  });

  it('dashboard view has no violations', async () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText('Explore the map'));
    const results = await axe(container, RULES);
    expect(results.violations).toEqual([]);
  });

  it('exposes landmark structure (banner, main, contentinfo)', () => {
    render(<App />);
    expect(screen.getByRole('banner')).toBeTruthy(); // header
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy(); // footer
  });
});

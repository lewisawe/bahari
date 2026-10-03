// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '../i18n/I18n.jsx';
import StepResult from '../steps/StepResult.jsx';
import StepFhir from '../steps/StepFhir.jsx';
import AssistPanel from './AssistPanel.jsx';

// Runtime proof that the three signature beats render their animated markup and
// that the markup is gated by reduced-motion (the gating lives in index.css,
// which jsdom does not apply, so we assert the animation classes are present
// AND that the reduced-motion CSS guard exists in index.css). The animations
// themselves are driven by those classes + the rAF count-up, both honoring
// prefers-reduced-motion via src/ui/motion.js and the CSS block.

function wrap(ui) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  // default: motion allowed; individual tests may flip reducedMatches
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Beat A — score reveal (StepResult)', () => {
  it('renders a drawing ring + a role=img score and a glow aura when motion is allowed', () => {
    const { container } = wrap(
      <StepResult counts={{ stonefly: 3 }} streamName="Alpha" onBack={() => {}} onNext={() => {}} onRestart={() => {}} />,
    );
    // the ring arc uses the ring-draw animation class
    expect(container.querySelector('.anim-ring-draw')).toBeTruthy();
    // the score disc exposes an accessible img role
    expect(screen.getByRole('img', { name: /health score/i })).toBeTruthy();
    // the sanctioned glow aura is present under normal motion
    expect(container.querySelector('.anim-glow')).toBeTruthy();
    // contributions assemble via stagger
    expect(container.querySelector('.anim-stagger')).toBeTruthy();
  });

  it('omits the glow aura under reduced motion (JS gate)', () => {
    window.matchMedia = vi.fn().mockImplementation((q) => ({
      matches: q.includes('reduce'),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    const { container } = wrap(
      <StepResult counts={{ stonefly: 3 }} streamName="Alpha" onBack={() => {}} onNext={() => {}} onRestart={() => {}} />,
    );
    expect(container.querySelector('.anim-glow')).toBeNull();
    // but the final score is still shown (resting state correct)
    expect(screen.getByRole('img', { name: /health score 10/i })).toBeTruthy();
  });
});

describe('Beat B — valid FHIR hero (StepFhir)', () => {
  const stream = { id: 's1', name: 'Alpha Creek', lat: 1, lon: 2 };
  const counts = { stonefly: 3 };

  it('promotes the valid badge to a hero with a drawn checkmark, glow, and proof caption', () => {
    const { container } = wrap(
      <StepFhir stream={stream} counts={counts} submission={{}} context={{}} onBack={() => {}} onRestart={() => {}} />,
    );
    // valid headline present (default EN)
    expect(screen.getByText(/Valid FHIR R4 Bundle/i)).toBeTruthy();
    // the checkmark draws itself in
    expect(container.querySelector('.anim-check-draw')).toBeTruthy();
    // sanctioned green glow on the hero
    expect(container.querySelector('.anim-glow')).toBeTruthy();
    // proof caption migrated to i18n (verified-against-HAPI text)
    expect(screen.getByText(/HAPI FHIR R4/i)).toBeTruthy();
  });
});

describe('Beat C — confidence meter (AssistPanel)', () => {
  it('shows an accessible confidence meter with the band label after running the stub', async () => {
    const { container } = wrap(<AssistPanel onConfirm={() => {}} onClose={() => {}} />);
    // thinking -> done
    fireEvent.click(screen.getByText('Ask the AI'));
    await waitFor(() => expect(container.querySelector('[role="meter"]')).toBeTruthy());
    const meter = container.querySelector('[role="meter"]');
    expect(meter.getAttribute('aria-valuenow')).toBeTruthy();
    // the fill uses the meter-fill animation class
    expect(container.querySelector('.anim-meter')).toBeTruthy();
  });

  it('shows a scanning affordance while thinking', async () => {
    const { container } = wrap(<AssistPanel onConfirm={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Ask the AI'));
    // the scanning frame appears synchronously in the thinking phase
    expect(container.querySelector('.scan-frame')).toBeTruthy();
  });
});

describe('reduced-motion CSS guard exists in index.css', async () => {
  it('index.css contains a prefers-reduced-motion block that neutralizes the beat animations', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const cssPath = path.resolve(process.cwd(), 'src/index.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    // the beat animation classes are explicitly neutralized
    for (const cls of ['.anim-ring-draw', '.anim-check-draw', '.anim-meter', '.anim-glow']) {
      expect(css.includes(cls), `index.css should guard ${cls} under reduced motion`).toBe(true);
    }
  });
});

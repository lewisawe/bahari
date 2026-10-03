// Bahari — shared motion helpers for JS-driven animations (count-up, map
// fly-to). CSS animations are gated by the global prefers-reduced-motion block
// in index.css; these helpers give the same honesty to imperative animations.

import { useEffect, useRef, useState } from 'react';

/** True when the user asked for reduced motion. Safe in Node/jsdom (no matchMedia). */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** React hook form, reacting live if the user flips the OS setting. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => prefersReducedMotion());
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    let mq;
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return undefined;
    }
    const onChange = () => setReduced(mq.matches);
    onChange();
    // addEventListener is the modern API; addListener is the legacy fallback.
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

/**
 * Animate an integer count from 0 to `target` over `duration` ms using
 * requestAnimationFrame with an ease-out curve. Honors reduced motion (jumps
 * straight to target). Returns the current integer value. Safe when rAF is
 * unavailable (SSR/jsdom): resolves to target immediately.
 */
export function useCountUp(target, { duration = 700, enabled = true } = {}) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(() => (enabled && !reduced ? 0 : target));
  const rafRef = useRef(0);

  useEffect(() => {
    const finalV = Number.isFinite(target) ? target : 0;
    const canAnimate =
      enabled &&
      !reduced &&
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function';

    if (!canAnimate) {
      setValue(finalV);
      return undefined;
    }

    let start = null;
    const tick = (ts) => {
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * finalV));
      if (t < 1) rafRef.current = window.requestAnimationFrame(tick);
      else setValue(finalV);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafRef.current);
  }, [target, duration, enabled, reduced]);

  return value;
}

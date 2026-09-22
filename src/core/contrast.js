// Bahari — WCAG contrast ratio helper (pure). Used to verify the Dovetail dark
// palette meets AA for the text/background pairs the UI actually uses.

function srgbToLin(c) {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}

/** WCAG contrast ratio between two hex colors (1..21). */
export function contrastRatio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** AA pass for normal text (>=4.5) or large text/UI (>=3). */
export function passesAA(fg, bg, { large = false } = {}) {
  return contrastRatio(fg, bg) >= (large ? 3 : 4.5);
}

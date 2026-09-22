import { describe, it, expect } from 'vitest';
import { STRINGS, translate, LANGUAGES } from './strings.js';

describe('i18n string coverage', () => {
  const enKeys = Object.keys(STRINGS.en).sort();

  it('every language declared in LANGUAGES has a dictionary', () => {
    for (const l of LANGUAGES) {
      expect(STRINGS[l.code]).toBeTruthy();
    }
  });

  it('French covers every English key (no missing translations)', () => {
    const frKeys = Object.keys(STRINGS.fr).sort();
    expect(frKeys).toEqual(enKeys);
  });

  it('no translation is left empty', () => {
    for (const [lang, dict] of Object.entries(STRINGS)) {
      for (const [key, val] of Object.entries(dict)) {
        expect(val, `${lang}.${key}`).toBeTruthy();
      }
    }
  });

  it('preserves placeholders across languages', () => {
    for (const key of enKeys) {
      const enHasVar = /\{(\w+)\}/.test(STRINGS.en[key]);
      const frHasVar = /\{(\w+)\}/.test(STRINGS.fr[key]);
      expect(frHasVar, `placeholder mismatch for ${key}`).toBe(enHasVar);
    }
  });
});

describe('translate', () => {
  it('returns the string for a known key', () => {
    expect(translate('en', 'nav.assess')).toBe('Assess a stream');
    expect(translate('fr', 'nav.assess')).toBe('Évaluer un cours d\u2019eau');
  });

  it('interpolates variables', () => {
    expect(translate('en', 'step.stream.points', { n: 24 })).toBe('24 monitoring points');
    expect(translate('fr', 'step.stream.points', { n: 24 })).toBe('24 points de suivi');
  });

  it('falls back to English for an unknown language', () => {
    expect(translate('de', 'nav.assess')).toBe('Assess a stream');
  });

  it('falls back to the key itself if truly unknown', () => {
    expect(translate('en', 'nonexistent.key')).toBe('nonexistent.key');
  });
});

import React, { createContext, useContext, useEffect, useState } from 'react';
import { translate, DEFAULT_LANG, LANGUAGES } from './strings.js';

// Minimal i18n context. Persists the chosen language and exposes t().

const I18nContext = createContext({ lang: DEFAULT_LANG, setLang: () => {}, t: (k) => k });
const STORAGE_KEY = 'bahari.lang';

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANG);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LANGUAGES.some((l) => l.code === saved)) setLangState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function setLang(code) {
    setLangState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
    if (typeof document !== 'undefined') document.documentElement.lang = code;
  }

  const t = (key, vars) => translate(lang, key, vars);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext);
}

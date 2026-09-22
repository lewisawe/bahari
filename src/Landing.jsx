import React from 'react';
import { PrimaryButton, GhostButton } from './ui/primitives.jsx';
import { useT } from './i18n/I18n.jsx';
import seed from './data/seed-streams.json';

// Landing — the Persuade surface. A visitor lands here, understands the One
// Health story in the first viewport, and moves into the app. Dovetail world:
// dark canvas, grid motif, single cornflower accent, generous section rhythm.

export default function Landing({ onStart, onExplore }) {
  const { t } = useT();
  const streamCount = (seed.streams || []).length;
  const countries = new Set((seed.streams || []).map((s) => s.country)).size;

  return (
    <div>
      {/* Hero */}
      <section className="grid-motif border-b border-steel">
        <div className="max-w-3xl mx-auto px-6 py-24 sm:py-32">
          <p className="eyebrow">{t('landing.eyebrow')}</p>
          <h1 className="mt-4 text-4xl sm:text-6xl font-semibold tracking-tightest leading-[1.05] text-snow">
            {t('landing.h1a')}{' '}
            <span className="text-accent">{t('landing.h1accent')}</span>
          </h1>
          <p className="mt-6 text-lg text-ash max-w-xl leading-relaxed">
            {t('landing.sub')}
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3 sm:max-w-md">
            <PrimaryButton onClick={onStart}>{t('landing.cta')}</PrimaryButton>
            <GhostButton onClick={onExplore} className="whitespace-nowrap">
              {t('landing.ctaExplore')}
            </GhostButton>
          </div>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-code text-fog">
            {t('landing.dataline', { streams: streamCount, countries })}
          </p>
        </div>
      </section>

      {/* How it works — five stages, spaced, not crowded */}
      <section className="border-b border-steel">
        <div className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-snow">
            {t('landing.howTitle')}
          </h2>
          <ol className="mt-10 space-y-8">
            {[1, 2, 3, 4, 5].map((n) => (
              <li key={n} className="flex gap-5">
                <span className="shrink-0 font-mono text-sm text-accent pt-0.5 tabular-nums">
                  {String(n).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="text-base font-medium text-snow">{t(`landing.step${n}.t`)}</h3>
                  <p className="mt-1.5 text-sm text-ash leading-relaxed max-w-lg">
                    {t(`landing.step${n}.d`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The One Health differentiator */}
      <section className="border-b border-steel">
        <div className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-snow max-w-xl">
            {t('landing.oneHealthTitle')}
          </h2>
          <p className="mt-5 text-ash leading-relaxed max-w-xl">
            {t('landing.oneHealthBody')}
          </p>
          <div className="mt-10 grid sm:grid-cols-3 gap-x-8 gap-y-6">
            {['env', 'animal', 'human'].map((k) => (
              <div key={k}>
                <h3 className="text-sm font-medium text-snow">{t(`landing.oh.${k}.t`)}</h3>
                <p className="mt-1.5 text-sm text-ash leading-relaxed">{t(`landing.oh.${k}.d`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Credibility */}
      <section className="border-b border-steel">
        <div className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-snow">
            {t('landing.builtTitle')}
          </h2>
          <div className="mt-8 space-y-6">
            {['data', 'ai', 'fhir', 'access'].map((k) => (
              <div key={k} className="border-t border-steel pt-5 first:border-t-0 first:pt-0">
                <h3 className="text-sm font-medium text-snow">{t(`landing.built.${k}.t`)}</h3>
                <p className="mt-1.5 text-sm text-ash leading-relaxed max-w-xl">
                  {t(`landing.built.${k}.d`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section>
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-snow max-w-xl mx-auto leading-[1.1]">
            {t('landing.closeTitle')}
          </h2>
          <div className="mt-8 max-w-xs mx-auto">
            <PrimaryButton onClick={onStart}>{t('landing.cta')}</PrimaryButton>
          </div>
        </div>
      </section>
    </div>
  );
}

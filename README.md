# Bahari

**A citizen-science stream assessment that speaks a health-data standard.**

IEEE OneAquaHealth Global Hackathon 2026 · Tracks 1, 2, 3, 7.

A citizen flips a rock, counts the streambed creatures, and Bahari turns that into
a guided, explainable, trustworthy ecological health reading, translates it into
caveated One Health considerations for people and animals, and exports it as a
valid FHIR record that real health and research systems can ingest.

## What it does

1. **Pick a stream** on an interactive map of real monitoring points (GBIF data),
   colored by their latest health class.
2. **Find the creatures** through a guided, plain-language flow. An optional AI
   photo check shows its reasoning and confidence, and hands the decision back to
   the person when it is not sure. The AI never records anything on its own.
3. **See the health score** from a transparent, published biotic-index method,
   plus a separate **data-reliability score** researchers can filter on.
4. **Understand it** as qualitative, caveated **One Health** considerations for
   people and animals. It never claims the water causes a disease.
5. **Share it** as a valid **FHIR R4** record, with the stream modeled as the
   record's subject.

Plus a **researcher dashboard**: every stream on a map, with aggregate health
distribution, trends, and a most-stressed-first table.

## Run locally

```bash
npm install
npm test              # 120 tests: science, AI policy, reliability, One Health, FHIR, a11y, i18n, aggregate
npm run dev           # start the dev server (http://localhost:5173)
npm run build         # production build to dist/
npm run seed          # (optional) rebuild the real-data seed from the GBIF API
npm run validate:fhir # validate a generated bundle against the public HAPI FHIR R4 server
```

## Deploy

The build is host-agnostic (relative asset paths), so `dist/` works on any static
host. Netlify config is in `netlify.toml`; for Vercel use the Vite preset with
output `dist`.

## How the science works

Bahari uses the average-sensitivity biotic-index method (miniSASS / ASPT / SIGNAL
family): each indicator group of streambed invertebrates has a
pollution-sensitivity weight; the mean sensitivity of the groups found gives an
ecological score, mapped to plain-language classes. Weights and sources are in
`src/core/taxa.js`, and the calculation is shown transparently in the app.

## Responsible AI

The AI identification assist never records anything on its own. It shows its
visual reasoning and a confidence level, and when confidence is low it defers to
the human. The engine is swappable (`setAssistProvider`): the app ships with a
zero-dependency stub so the demo never depends on a live model, and a real vision
model can be dropped in without any UI change.

## One Health, honestly

The One Health layer is qualitative and caveated by design. Macroinvertebrate
indices measure ecological stress and can be confounded by other stressors, so
Bahari never asserts disease. Every consideration states its reason, its basis,
and its limits.

## FHIR

Each assessment exports as a FHIR R4 Bundle. The stream is modeled as the
subject via a `Group` (a valid non-patient subject), with the geographic point as
a linked `Location`. The ecological result and reliability are `Observation`s;
the One Health considerations are a `RiskAssessment` with qualitative risk only.
The bundle validates cleanly against the public HAPI FHIR R4 server: run
`npm run validate:fhir`.

## Accessibility

The interface is dark-theme WCAG AA: verified color contrast, keyboard focus
rings, semantic landmarks, a skip link, reduced-motion support, and an automated
axe audit in the test suite (0 violations).

## Languages

English and French, with a language toggle. Adding a language is a single
dictionary in `src/i18n/strings.js`.

## Data provenance

- **Real:** stream coordinates, localities, and the indicator groups present at
  each point come from the **GBIF** occurrence API. Recent-rain context comes
  from the free **Open-Meteo** API.
- **Synthetic (clearly flagged):** historical assessment values in the seed are
  generated from the real taxa and marked as sample data. A citizen's own saved
  assessments are real and build the trend.

## Tech

React, Vite, Tailwind CSS, Leaflet (OpenStreetMap tiles), and a set of pure,
tested logic modules for the science, reliability, One Health rules, FHIR export,
aggregation, and contrast. No backend required.

## License

MIT. See `LICENSE`.

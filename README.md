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
5. **Share it** as a valid, IG-aligned **FHIR R4** record, with the stream (a
   `LocationOah`) modeled as the record's subject.

Plus a **researcher dashboard**: every stream on a map, with aggregate health
distribution, trends, and a most-stressed-first table.

The app opens on a landing page that tells the One Health story, then leads into
the assessment flow.

## Run locally

```bash
npm install
npm test              # full vitest suite (147 passing): science, AI policy, reliability, One Health, FHIR, a11y, i18n, aggregate
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
ecological score, mapped to plain-language classes. The per-group weights follow
the published **miniSASS** sensitivity ordering (1–10, higher = more sensitive),
cited and annotated per group in `src/core/taxa.js`; where an exact published
integer is not available for a group (a couple of ties and mid-scale groups), the
value is a transparent surrogate positioned by that published ordering and
labelled as such in source — not a fabricated source. The calculation is shown
transparently in the app.

## Responsible AI

The AI identification assist never records anything on its own. It shows its
visual reasoning and a confidence level, and when confidence is low it defers to
the human (defer < 0.5, review < 0.75, suggested above — the AI never records).
The engine is swappable (`setAssistProvider`): the app ships with a
zero-dependency stub so the demo never depends on a live model.

A real **Amazon Nova Pro vision adapter** (`novaProvider` in
`src/core/ai-assist.js`) is included behind that same interface. It uses the
**Amazon Bedrock Converse API** with model id `us.amazon.nova-pro-v1:0`. The
browser never talks to AWS directly and never bundles the AWS SDK: the adapter
POSTs the photo (base64 + format + optional hint) to a **local Vite dev proxy**
at `/api/identify`, which runs server-side under `npm run dev` and calls Bedrock
using your **local AWS profile** (no keys in the browser, no `VITE_` AWS
variables). The proxy maps Nova Pro's answer into our
`{ taxonId, confidence, cues }` shape — which then flows through the
**unchanged** confidence-gating policy.

Two framings, both honest:

- **Local dev (live):** run with your AWS profile to get real Nova Pro answers:

  ```bash
  AWS_PROFILE=simi-ops AWS_REGION=us-east-1 npm run dev
  ```

  (`AWS_REGION` defaults to `us-east-1` if unset.) The dev proxy exists ONLY on
  the dev server, so the AWS SDK never enters the production client bundle.

- **Static deploy (fallback):** the deployed static site has no proxy, so the
  POST to `/api/identify` fails and the adapter **automatically falls back to the
  stub** for that call. The public demo therefore needs **no backend and no
  keys** — the "no backend required" claim stays true for the deployed site.

Swapping to the real model needs **no UI change** and does not alter the
human-in-the-loop safeguards.

## One Health, honestly

The One Health layer is qualitative and caveated by design. Macroinvertebrate
indices measure ecological stress and can be confounded by other stressors, so
Bahari never asserts disease. Every consideration states its reason, its basis,
and its limits.

## FHIR

Each assessment exports as a FHIR R4 Bundle **aligned with the official
OneAquaHealth HL7 FHIR Implementation Guide** ([github.com/hl7-eu/oah](https://github.com/hl7-eu/oah);
canonical base `http://hl7.eu/fhir/ig/oah`). Each resource carries the matching
IG profile in `meta.profile`:

- The stream is the **subject**, modeled as a **`LocationOah`** `Location`
  (identifier, name, `mode = #instance`, coordinates). Making the ecosystem the
  subject is the IG-correct way to describe a non-patient subject; the old
  `Group` was removed because the IG's `GroupOah` models cohorts of **people**,
  not ecosystems.
- The ecological reading is an **`ObservationIndicatorsOah`** with the Location
  as subject and each indicator group as a component.
- The macroinvertebrate sample is a **`SpecimenOah`**, collected from the
  Location and linked from the biotic Observation.
- The citizen observer is a display-only `performer` (as the IG's own examples
  do), so no personal data is recorded.
- Data reliability is a second Location-subject Observation (derivedFrom the
  biotic one).
- The **One Health** layer is a third, qualitative Location-subject Observation
  (not a `RiskAssessment`): the IG is Observation-centric and base-R4
  `RiskAssessment.subject` cannot be a `Location`. Values are qualitative
  `CodeableConcept`s with reason/basis/limits and a caveat note, never a numeric
  risk or a diagnosis.

Honest scope: Bahari is **aligned with / conformant to the referenced profiles'
key constraints, validated structurally on HAPI R4** (0 structural errors) — it
does not claim full IG conformance on a public server that cannot fetch the draft
IG. Where no standard code exists, custom codes live under
`https://lewisawe.github.io/bahari/fhir/CodeSystem/stream-health`. The bundle
validates with 0 structural errors against the public HAPI FHIR R4 server: run
`npm run validate:fhir`. See `submission/FHIR_VALIDATION.md`.

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

# Implementation Plan — FHIR IG Alignment & Submission Hardening (Bahari)

All paths are absolute under the worktree root:
`/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/fhir-ig-align`
(abbreviated below as `<ROOT>`). Do NOT edit anything outside this worktree.

Baseline verified during planning: `npm test` = **122 passing**, `npm run build`
succeeds. Keep both green at every step.

---

## Key findings from exploration (read before implementing)

1. **The worktree branch `fhir-ig-align` == `main` == commit `ecc2220`.** They
   point to the identical committed tree.

2. **`submission/` is GITIGNORED** (see `<ROOT>/.gitignore`: the lines
   `submission/`, `PLAN.md`, `DESIGN.md`, etc.). The files `submission/PROJECT.md`,
   `submission/TRACKS.md`, `submission/FHIR_VALIDATION.md`, `submission/README.md`,
   `submission/DEMO_SCRIPT.md` exist only as **untracked local files in the main
   working copy** at `/home/sierra/Desktop/projects/hackathons/oneaquahealth/submission/`.
   They are NOT present in this worktree and will NOT appear in the branch's git
   diff even after you create them (gitignore still applies here).
   - Implication: Task 2 doc edits must still be made (the user wants the files
     correct on disk), but a reviewer reading `git diff` will not see them. Create
     the `submission/` files in THIS worktree at the stated paths, seeding each
     from the current main copy (contents reproduced in the steps below so you do
     not need to read outside the worktree). Record in your findings that these
     are gitignored so the reviewer does not flag them as "missing".
   - `README.md` IS tracked and in this worktree — its edits are normal and will
     show in the diff.

3. **FHIR validation reality on public HAPI R4** (probed live during planning,
   `https://hapi.fhir.org/baseR4/$validate`):
   - An `Observation` whose `subject` is a `urn:uuid:` reference validates with
     **0 errors** (HAPI does not resolve the referenced resource's type in a
     single-resource `$validate`, so Location-as-subject is structurally fine).
     This overturns the stale claim in the old `FHIR_VALIDATION.md` that
     `Observation.subject` cannot be a Location. The official IG constrains
     `ObservationIndicatorsOah.subject` to `Reference(LocationOah)`, which proves
     base R4 permits it.
   - A `LocationOah`-shaped Location, a `SpecimenOah`-shaped Specimen, a full
     `Observation` (with `performer`, `specimen`, `component`), and a `Device`
     performer each validate with **0 errors** against base R4 WITHOUT
     `meta.profile`.
   - **CRITICAL:** When `meta.profile` points at an IG canonical the public HAPI
     server CANNOT fetch (e.g. `http://hl7.eu/fhir/ig/oah/StructureDefinition/location-oah`),
     HAPI emits a HARD **error**: `"Invalid profile. Failed to retrieve profile
     with url=..."` and `"Profile reference ... has not been checked ... validator
     is set to not fetch unknown profiles"`. These are **profile-fetch errors, not
     structural errors in our data.**
   - **Design consequence:** `buildBundle()` MUST emit `meta.profile` (that is the
     judge-facing IG-alignment win). But the `validate:fhir` script must separate
     "profile-not-fetchable" errors from genuine structural errors, assert the
     latter is 0, and document the former as expected. See Step 8.

4. **UI consumer:** `<ROOT>/src/steps/StepFhir.jsx` calls `buildBundle` /
   `validateBundle` and renders a plain-language resource list. Its copy ALREADY
   says "Location ... the subject of the record" and "stream is modelled as the
   record's subject (a non-patient subject)". After the re-model this copy becomes
   accurate (Location IS the subject). The `ResourceLine` for `Location`,
   `Observation ×N`, `RiskAssessment` stays valid; there is NO `Group` line to
   remove. Do a light copy check only — do not restyle. Confirm the smoke test
   `src/App.smoke.test.jsx` still passes after the change.

5. **Weights reconciliation decision — RECOMMEND PATH A (cite source).** The
   `taxa.js` groups and weights are: stonefly 10, mayfly 9, caddisfly 8,
   riffle_beetle 7, dragonfly 6, freshwater_shrimp 5, snail 4, true_fly_larva 4,
   leech 2, bloodworm 2, worm 1. This is a monotonic 1–10 pollution-sensitivity
   ordering that mirrors the published **miniSASS** citizen-science sensitivity
   grouping (miniSASS already defines a simplified 1–10 group-sensitivity scale
   for exactly these macroinvertebrate groups). So cite miniSASS's group
   sensitivity scale per group/tier, and for the few where our integer does not
   land on an exact published miniSASS value (e.g. the two "4" ties, the "5"/"6"
   mid groups) add a one-line note that the value is positioned by the published
   sensitivity ORDERING (a documented surrogate within the cited scale). This is
   Path A with a small, honest Path-B fallback for ties — it does NOT fabricate a
   numeric source. Keep weights unchanged so `biotic-index.test.js` stays green
   (see Step 12 — no expected-value changes needed).

---

## Ordering rationale

Task 1 (FHIR) is top priority and is the dependency root for the doc claims in
Task 2, so it goes first and its tests must be green before docs are written.
Tasks 3 (AI adapter) and 4 (weights) are independent of Task 1 and of each other.
Order: FHIR code → FHIR tests → FHIR validation script/doc → positioning docs →
AI adapter → weights → full green sweep.

---

## TASK 1 — Re-model `src/core/fhir.js` to the official OneAquaHealth IG

### Step 1. Replace the placeholder CodeSystem constant and add IG canonicals.
In `<ROOT>/src/core/fhir.js`, replace the `SYS` constant and add profile/system
constants near the top:

```js
// Custom CodeSystem for Bahari-specific concepts that have no standard equivalent.
// Namespaced under the project's real published identity (repo: github.com/lewisawe/bahari).
const SYS = 'https://lewisawe.github.io/bahari/fhir/CodeSystem/stream-health';

// Official OneAquaHealth HL7 FHIR IG (github.com/hl7-eu/oah), canonical base http://hl7.eu/fhir/ig/oah
const IG = 'http://hl7.eu/fhir/ig/oah/StructureDefinition';
const PROFILE_LOCATION  = `${IG}/location-oah`;
const PROFILE_OBS_IND   = `${IG}/observation-indicators-oah`;
const PROFILE_SPECIMEN  = `${IG}/specimen-oah`;
// identifier system for the monitoring site (project-namespaced, non-placeholder)
const SITE_ID_SYSTEM = 'https://lewisawe.github.io/bahari/fhir/monitoring-site';
```

- Files: `<ROOT>/src/core/fhir.js`
- Verify (end of Task 1): `npm test` green; see Step 7–8.

### Step 2. Delete the `Group` entry entirely; make `Location` the subject.
In `buildBundle()`:
- Remove the `groupId` id and the entire `entries.push(...)` block that builds the
  `Group` (type:device) resource. Remove `groupId` from the id list.
- Add a `specimenId` to the id list alongside `locId`, `bioticId`,
  `reliabilityId`, `riskId`.
- Rewrite the `Location` entry to conform to **LocationOah**:

```js
entries.push(entry(locId, {
  resourceType: 'Location',
  meta: { profile: [PROFILE_LOCATION] },
  identifier: [{ system: SITE_ID_SYSTEM, value: stream?.id || 'unknown-site' }], // 1.. required
  status: 'active',
  name: stream?.name || 'Unnamed stream',                                        // 1.. required
  mode: 'instance',                                                              // fixed #instance
  description: `Urban freshwater monitoring point${stream?.country ? ` (${stream.country})` : ''}`,
  physicalType: {
    coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'area', display: 'Area' }],
  },
  // position.latitude 1..1 and position.longitude 1..1 — always emit both when stream present
  position: stream ? { longitude: stream.lon, latitude: stream.lat } : undefined,
}));
```
Note: if `stream` is absent the Location omits `position`; the LocationOah profile
requires it, but base-R4 HAPI validation (how we verify) still passes 0 structural
errors. Keep the guard to avoid runtime errors.

- Files: `<ROOT>/src/core/fhir.js`

### Step 3. Add a `Specimen` (SpecimenOah) for the macroinvertebrate sample.
Insert BEFORE the biotic Observation so references resolve top-down (order does
not affect validity, but keep it readable). Only emit when there is a biotic
result (`biotic.score !== null`), since the specimen represents the sampled
community:

```js
if (biotic.score !== null) {
  entries.push(entry(specimenId, {
    resourceType: 'Specimen',
    meta: { profile: [PROFILE_SPECIMEN] },
    status: 'available',
    type: {
      coding: [{ system: SYS, code: 'macroinvertebrate-kick-sample', display: 'Streambed macroinvertebrate kick-sample' }],
      text: 'Streambed macroinvertebrate kick-sample',
    },
    subject: { reference: locId, display: stream?.name }, // collected from the Location (the stream)
    collection: { collectedDateTime: when },
  }));
}
```
Rationale for `Specimen.subject = Location`: base R4 `Specimen.subject` allows
`Reference(... | Location | ...)`; this ties the physical sample to the site.
Confirmed 0 structural errors on HAPI.

- Files: `<ROOT>/src/core/fhir.js`

### Step 4. Rewrite the biotic `Observation` to conform to ObservationIndicatorsOah.
Replace the current biotic Observation block (the one with
`subject: {reference: groupId}` and `focus: [...]`). Drop `focus` and the Group
reference. New shape:

```js
if (biotic.score !== null) {
  entries.push(entry(bioticId, {
    resourceType: 'Observation',
    meta: { profile: [PROFILE_OBS_IND] },
    status: 'final',                                   // profile fixes #final
    category: [{
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey' }],
    }],
    code: {                                            // 1.. required
      coding: [{ system: SYS, code: 'biotic-index', display: 'Stream macroinvertebrate biotic index' }],
      text: 'Stream ecological health (biotic index)',
    },
    subject: { reference: locId, display: stream?.name },   // KEY: Location is the subject
    effectiveDateTime: when,                                // effective[x] 1..
    performer: [{ reference: performerId, display: 'Citizen observer (Bahari)' }], // 1.. required
    specimen: { reference: specimenId },                    // link to SpecimenOah
    valueQuantity: {                                        // value[x] = Quantity (allowed by profile)
      value: biotic.score, unit: 'sensitivity (1-10)', system: SYS, code: 'biotic-score',
    },
    interpretation: [{
      coding: [{ system: SYS, code: biotic.classKey, display: biotic.classInfo?.label }],
      text: biotic.classInfo?.blurb,
    }],
    method: { text: 'Average pollution-sensitivity of indicator groups found (miniSASS/SASS/SIGNAL family)' },
    // per-taxon counts as components; component.value[x] 1.. (Quantity allowed)
    component: biotic.contributions.map((c) => ({
      code: {
        coding: [{ system: SYS, code: `taxon-${c.id}`, display: c.commonName }],
        text: `${c.commonName} (${c.scientificGroup})`,
      },
      valueQuantity: { value: c.count, unit: 'individuals', system: SYS, code: 'count' },
    })),
  }));
}
```

### Step 5. Add the required `performer` as a contained/entry Device.
The IG requires `performer` 1.. . Model the citizen observer as a `Device` entry
in the bundle (confirmed 0 errors on HAPI). Add a `performerId` to the id list and
push a Device entry (emit it unconditionally so the reliability Observation can
also reference it if desired; minimal shape):

```js
const performerId = `urn:uuid:${idGen()}`;
// ...
entries.push(entry(performerId, {
  resourceType: 'Device',
  deviceName: [{ name: 'Bahari citizen-observer app', type: 'user-friendly-name' }],
  type: { text: 'Citizen-science stream assessment application' },
}));
```
Place this Device entry early (before the biotic Observation) so it is readable.
Document in a code comment WHY a Device represents the citizen observer (keeps
HAPI structurally valid; no Patient/Practitioner PII for an anonymous citizen).

### Step 6. Update the reliability Observation and the RiskAssessment subjects.
- Reliability `Observation`: change `subject: { reference: groupId, ... }` to
  `subject: { reference: locId, display: stream?.name }`. Keep `derivedFrom` →
  `bioticId`. Keep its own `code`/category. (May optionally add
  `meta.profile:[PROFILE_OBS_IND]` and a `performer:[{reference: performerId}]`;
  simpler to leave it as a plain Observation to avoid the profile's `specimen`
  expectations — plain is fine, 0 structural errors. Leave reliability as a plain
  Observation, only switch its `subject` to `locId`.)
- `RiskAssessment`: change `subject: { reference: groupId, ... }` to
  `subject: { reference: locId, display: stream?.name }`. Keep `basis` →
  `bioticId`, keep `prediction[]` with `qualitativeRisk` only, keep the honesty
  `note`. Replace its `code.coding[].system` (currently `SYS`) — keep `SYS` (now
  the non-placeholder URL) as-is; no Group remains.
- Update the `entries` id declarations: final set is `locId`, `performerId`,
  `specimenId` (conditional), `bioticId` (conditional), `reliabilityId`,
  `riskId`. Remove `groupId`.

### Step 7. Update `validateBundle()` structural checks in `fhir.js`.
- Remove the `Group` branch (`Group.type`/`Group.actual` checks).
- Add/adjust checks:
  - `Location`: require `status`, `name`, `mode`, and `position` present (per
    LocationOah key constraints), plus at least one `identifier`.
  - `Observation`: already checks `status`, `code`, `subject`; additionally, for
    the biotic Observation (detect via `code.coding` containing `biotic-index`)
    require `effectiveDateTime` and non-empty `performer`.
  - `Specimen`: require `status` and `type`.
- Keep the reference-resolution walk (`collectReferences`) unchanged — it already
  catches dangling `urn:uuid:` refs, which now must all resolve (Location,
  Device, Specimen, biotic, reliability, risk).
- Files: `<ROOT>/src/core/fhir.js`
- Verify: `npx vitest run src/core/fhir.test.js` — after Step 9 rewrite, green.

### Step 8. Rewrite `scripts/validate-fhir.mjs` to separate profile-fetch errors.
The sample bundle now carries `meta.profile` with unresolvable IG canonicals, so
HAPI will report profile-fetch errors. Change the script so it:
- Classifies each `error`/`fatal` issue: if its `diagnostics`/`details.text`
  matches `/Invalid profile|Profile reference .* has not been checked|could not
  (be )?found|failed to retrieve profile/i`, count it as a **profileFetch** issue;
  otherwise count it as a **structural** error.
- Prints both tallies per resource and a final line:
  `Result: PASS — 0 structural errors (N profile-fetch notices, expected: public
  HAPI cannot load the draft OAH IG)`.
- `process.exit(structuralErrors === 0 ? 0 : 1)` — profile-fetch notices do NOT
  fail the script.
- Also add an OFFLINE guard: wrap the whole run so that if every `fetch` throws
  (network unreachable), the script still (a) builds the bundle, (b) runs the
  local `validateBundle()` on it, (c) prints the bundle's structural validity from
  the local checker, (d) prints a clear "HAPI unreachable — re-run when online"
  line, and (e) exits 0 (do not fail CI/offline). Import `validateBundle`
  alongside `buildBundle`.
- Update the sample `stream` object so it includes an `id` (the LocationOah
  identifier needs `stream.id`); the current sample already sets `id: 'seed-1'`.
- Files: `<ROOT>/scripts/validate-fhir.mjs`
- Verify: `npm run validate:fhir` — exits 0; prints `0 structural errors` (online)
  or the offline fallback with local structural validity true. If online, confirm
  no structural (non-profile) errors on any resource.

### Step 9. Rewrite `src/core/fhir.test.js` for the new structure.
Replace the Group-centric assertions. Keep deterministic `seqIdGen`. New/changed
assertions (keep every unrelated test that still holds):
- Bundle is `collection`, `entry.length >= 4`.
- `types` CONTAINS `Location`, `Observation`, `Specimen`, `Device`,
  `RiskAssessment`; types do NOT contain `Group` and do NOT contain `Patient`.
- No `meta.profile` anywhere references `bahari.example`; the placeholder
  canonical `https://bahari.example/...` appears NOWHERE in the serialized bundle
  (`JSON.stringify(b)` does not match `/bahari\.example/`).
- Location: `meta.profile` includes `http://hl7.eu/fhir/ig/oah/StructureDefinition/location-oah`;
  has non-empty `identifier`, `name`, `mode === 'instance'`, and
  `position.latitude`/`position.longitude` numbers equal to the stream coords.
- Biotic Observation: `meta.profile` includes `.../observation-indicators-oah`;
  `status === 'final'`; `subject.reference === <Location fullUrl>` (KEY — Location
  is the subject, replacing the old Group+focus assertions); `effectiveDateTime`
  present; `performer[0].reference` resolves to the Device entry;
  `specimen.reference` resolves to the Specimen entry; has NO `focus`.
- Specimen: `meta.profile` includes `.../specimen-oah`; `subject.reference ===
  <Location fullUrl>`; `status` and `type` present.
- Components still number 3 for `{stonefly, mayfly, snail}` with counts
  `[1,2,3]` (unchanged logic).
- Reliability Observation: `subject.reference === <Location fullUrl>`;
  `derivedFrom[0].reference === <biotic fullUrl>`.
- RiskAssessment: `subject.reference === <Location fullUrl>`; `basis[0].reference
  === <biotic fullUrl>`; every prediction has `qualitativeRisk` and NOT
  `probabilityDecimal`/`probabilityRange`; honesty note matches
  `/not a water-quality test|not a .*diagnosis/i`.
- `validateBundle(b).valid === true`, `errors` empty; `resourceCounts.Location ===
  1`, `resourceCounts.Observation >= 2`, `resourceCounts.Specimen === 1`,
  `resourceCounts.Device === 1`, `resourceCounts.RiskAssessment === 1`.
- "omits biotic when nothing found" case: with empty counts, there is NO biotic
  Observation AND NO Specimen (specimen is conditional on biotic), and
  `validateBundle` stays valid with no dangling refs. Adjust the existing
  "omits ..." test accordingly.
- Keep the `validateBundle` negative tests (unresolved reference, non-bundle,
  missing required field) — update the "missing required field" test to delete
  `status` from the biotic Observation (still triggers an error).
- Files: `<ROOT>/src/core/fhir.test.js`
- Verify: `npx vitest run src/core/fhir.test.js` — all green.

### Step 10. Light accuracy check of `StepFhir.jsx` copy (no restyle).
Confirm the resource list still matches: Location (now truly the subject),
Observation ×N, RiskAssessment. There is no Group line to remove. Do NOT change
layout/classes. If any copy says "Group", fix wording only (none found during
planning).
- Files: `<ROOT>/src/steps/StepFhir.jsx` (likely no change)
- Verify: `npx vitest run src/App.smoke.test.jsx` — green.

---

## TASK 2 — Positioning docs (vs miniSASS + IG alignment)

NOTE: `submission/` is gitignored and absent from this worktree. For each
`submission/*` file below, CREATE it in this worktree at the given path, seeding
it with the content currently in the main copy (reproduced inline where needed),
then apply the edits. Record in findings that these are gitignored.

### Step 11a. `submission/PROJECT.md` + `submission/TRACKS.md` — add miniSASS differentiation.
Seed both files from main's current versions (structure summarized in findings).
Then:
- In `submission/PROJECT.md`, add a short subsection titled
  **"How Bahari differs from miniSASS"** (place it after "The solution" or inside
  "What makes it complete"). Content: acknowledge miniSASS is a real, funded
  citizen-science app that already does smartphone-photo AI macroinvertebrate ID +
  the same biotic-scoring family and does it well; state Bahari does NOT try to
  out-ML miniSASS on identification; Bahari's unique seam is carrying the citizen
  reading DOWNSTREAM into (a) a transparent, separable data-reliability score
  researchers can filter on, (b) qualitative, caveated One Health human/animal
  considerations, (c) an IG-aligned FHIR R4 record (Location-subject, per the
  official OneAquaHealth HL7 IG) that real health/research systems can ingest.
  One line: "miniSASS stops at a score; Bahari turns a score into an
  interoperable, health-connected record." Honest tone; no disparagement.
- In `submission/TRACKS.md`, add the same differentiation compactly (2–4 lines),
  logically under Track 2 (data-to-insight) or Track 7 (standards).
- Files: `<ROOT>/submission/PROJECT.md`, `<ROOT>/submission/TRACKS.md`

### Step 11b. IG-alignment claims across docs.
Update these files to state the FHIR export now ALIGNS WITH the official
OneAquaHealth HL7 FHIR IG (github.com/hl7-eu/oah; canonical
`http://hl7.eu/fhir/ig/oah`), naming the specific profiles conformed to —
**LocationOah**, **ObservationIndicatorsOah**, **SpecimenOah** — and honestly
noting where Bahari extends/approximates the draft IG (One Health RiskAssessment
is Bahari's own layer; custom codes under
`https://lewisawe.github.io/bahari/fhir/CodeSystem/stream-health` where no
standard code exists). Use the precise honesty phrasing: "aligned with /
conformant to the referenced profiles' key constraints, validated structurally on
HAPI R4" — do NOT claim full profile conformance. Explain Location-as-subject as
the IG-correct way to make the ecosystem the subject, and note the `Group` was
REMOVED because `GroupOah` models person cohorts (type #person, actual false),
not ecosystems.

Apply to:
- `<ROOT>/submission/FHIR_VALIDATION.md` — rewrite the modeling summary and the
  "what external validation caught" section to the NEW model (Location subject,
  Specimen added, Device performer, Group removed). Replace the placeholder
  CodeSystem URL with the new one. Replace the stale "Observation.subject cannot
  be Location" claim with the correct explanation (base R4 permits it; the IG
  constrains it to `Reference(LocationOah)`). Update the pasted validator result
  block to reflect the new resource set (Location, Device, Specimen,
  Observation ×2, RiskAssessment) and state that remaining notices are (i)
  terminology warnings for custom codes and (ii) IG-profile-not-fetchable notices
  on the public server, neither of which is a structural error. If `npm run
  validate:fhir` was runnable, paste the real new tallies; otherwise mark the
  block "to be re-run — see note" and keep the structural-0 claim backed by the
  local checker.
- `<ROOT>/README.md` — update the **"FHIR"** section: Location is the subject
  (LocationOah), the ecological reading is an ObservationIndicatorsOah with the
  Location as subject, the sample is a SpecimenOah, the citizen observer is a
  Device performer, reliability is a second Observation, One Health is a
  RiskAssessment (qualitative). Name the IG and canonical. Keep the
  `npm run validate:fhir` line. Also update **"Responsible AI"** per Task 3 Step
  15 and **"How the science works"** per Task 4 Step 14.
- `<ROOT>/submission/TRACKS.md` Track 7 — currently says "using a `Location`"
  but the committed code used Group; make Track 7 consistent with the NEW code:
  Location is the subject per LocationOah, name the three profiles, note Group
  removal and why, keep the HAPI structural-validation claim honest.
- Files: `<ROOT>/submission/FHIR_VALIDATION.md`, `<ROOT>/README.md`,
  `<ROOT>/submission/TRACKS.md`
- Verify: `grep -rn "bahari.example" <ROOT>/README.md <ROOT>/submission` returns
  nothing; `grep -rn "hl7.eu/fhir/ig/oah" <ROOT>/README.md <ROOT>/submission`
  finds the canonical in README, FHIR_VALIDATION.md, TRACKS.md. Claims match
  what `fhir.js` now emits.

---

## TASK 3 — Real vision-provider adapter behind `setAssistProvider`

### Step 13a. Add `geminiProvider` factory to `src/core/ai-assist.js`.
Add an exported factory that returns a provider function matching the existing
provider contract (`async (input) => { taxonId, confidence, reasoning:string[],
alternatives?:[{taxonId,confidence}] }`), consumed by `applyConfidencePolicy`.
Requirements:
- Reads the API key from `import.meta.env.VITE_GEMINI_API_KEY`. NEVER hardcode or
  commit a key.
- Accepts options for injectability/testing: `geminiProvider({ apiKey, fetchImpl,
  endpoint } = {})` where `apiKey` defaults to
  `import.meta.env?.VITE_GEMINI_API_KEY`, `fetchImpl` defaults to global `fetch`,
  `endpoint` has a sensible default. (Injectable `fetchImpl` lets the unit test
  mock the network with no real calls.)
- The returned function sends the image (`input.photoDataUrl` or `input.photoName`
  payload — accept a base64/dataURL field; document the expected input field) to
  the vision model and MAPS the model response into
  `{ taxonId, confidence, cues[] -> reasoning[] }` using the existing `TAXA` ids
  (map model label → nearest `taxonId`; unknown label → `taxonId: null`). Preserve
  the `{ taxonId, confidence, cues }` shape the task names by setting
  `reasoning = cues`.
- Set `providerName = 'gemini-vision'` on the returned function.
- Add `createAssistProvider()` (or extend behavior) so that if no key is present
  OR the mapped call throws/rejects, it AUTOMATICALLY FALLS BACK to the built-in
  `stubProvider` for that call, so the app runs offline/keyless. Implement the
  fallback INSIDE the gemini provider function: try the real call; on missing key
  or any error, `return stubProvider(input)`. Keep `getProviderName()` meaningful
  (it may still report 'gemini-vision'; the per-call fallback is internal).
- Do NOT change `applyConfidencePolicy`, the thresholds, or the human-in-the-loop
  policy — that differentiator stays exactly as-is.
- Files: `<ROOT>/src/core/ai-assist.js`

### Step 13b. Add focused unit tests (mock fetch; no real network).
Add to `<ROOT>/src/core/ai-assist.test.js` a new describe block
`'real vision provider (gemini adapter)'`:
- **response-mapping:** build `geminiProvider({ apiKey: 'test', fetchImpl: mock })`
  where `mock` resolves a fake model JSON; assert the mapped result has a valid
  `taxonId` in `TAXON_IDS` (or null), a numeric `confidence` in [0,1], and
  `reasoning` as a string array; then push it through `applyConfidencePolicy` and
  assert the status gating still works.
- **keyless fallback:** `geminiProvider({ apiKey: undefined })` (no key) →
  calling it returns a stub-shaped result (deterministic for a given
  `photoName`/`seed`) WITHOUT invoking `fetchImpl` (assert the mock fetch was not
  called).
- **error fallback:** `geminiProvider({ apiKey: 'x', fetchImpl: () =>
  Promise.reject(new Error('network')) })` → falls back to stub shape, no throw.
- Keep all existing ai-assist tests passing (do not alter the stub).
- Files: `<ROOT>/src/core/ai-assist.test.js`
- Verify: `npx vitest run src/core/ai-assist.test.js` — all green, no real network.

### Step 15. README "Responsible AI" update.
In `<ROOT>/README.md` "Responsible AI", describe the real adapter + automatic
keyless/error fallback and how to supply a key (`VITE_GEMINI_API_KEY` env var),
making clear the architecture supports a production vision model with NO UI
change and the confidence-gating policy is unchanged. (Combine with Step 11b
README edits in one pass.)
- Files: `<ROOT>/README.md`

---

## TASK 4 — Reconcile biotic sensitivity weights (PATH A: cite source)

### Step 14. Annotate `taxa.js` weights with the miniSASS citation (Path A + tie note).
In `<ROOT>/src/core/taxa.js`:
- Update the header comment: state the per-group sensitivity values follow the
  published **miniSASS** citizen-science group-sensitivity scale (1–10 ordering of
  these macroinvertebrate groups), already linked in the existing Sources block;
  keep the existing miniSASS/SASS5/SIGNAL links.
- Add a concise inline comment per taxon (or per tier) tying its integer to the
  published sensitivity ORDER, e.g. `sensitivity: 10, // Plecoptera — most
  pollution-sensitive group in the miniSASS scale`. For the groups whose exact
  integer is a positioning choice within the ordering (the two `4` ties
  snail/true_fly_larva, and the mid `5`/`6`), add a short note that the value is a
  documented surrogate positioned by the published sensitivity ordering — NOT a
  fabricated exact source. This is Path A with an honest Path-B micro-fallback for
  ties.
- Do NOT change any numeric weight (preserves `biotic-index.test.js` expected
  values exactly).
- Also add one sentence to `<ROOT>/README.md` "How the science works": the
  weights follow the published miniSASS sensitivity ordering (cited in
  `taxa.js`), with tie positions documented as a transparent surrogate.
- Files: `<ROOT>/src/core/taxa.js`, `<ROOT>/README.md`
- Verify: `npx vitest run src/core/biotic-index.test.js` — green with NO
  expected-value edits (weights unchanged).

---

## FINAL VERIFICATION (run after all steps)

1. `cd <ROOT> && npm test` — expect **>= 122 passing**, 0 failing. (fhir.test.js
   and ai-assist.test.js gain tests; counts rise.)
2. `cd <ROOT> && npm run build` — succeeds.
3. `cd <ROOT> && npm run validate:fhir` — exits 0; prints `0 structural errors`
   (online) or offline fallback with local structural validity `true`. No
   non-profile structural errors.
4. `grep -rn "bahari.example" <ROOT>/src <ROOT>/scripts <ROOT>/README.md <ROOT>/submission`
   — returns nothing (placeholder fully removed).
5. `grep -rn "resourceType: 'Group'\|'Group'" <ROOT>/src/core/fhir.js` — returns
   nothing (Group removed).
6. Confirm `fhir.js` emits `meta.profile` canonicals on Location, biotic
   Observation, and Specimen (grep for `hl7.eu/fhir/ig/oah` in `src/core/fhir.js`).

## Scope guardrails
- Surgical diffs only; do not restyle UI or touch unrelated modules
  (`aggregate`, `history`, `map-utils`, `contrast`, `one-health` logic — only its
  references via fhir.js subject change, which is handled in fhir.js not
  one-health.js).
- No API keys committed. No network calls in tests.
- Keep the human-in-the-loop AI policy and the qualitative-only RiskAssessment
  exactly as they are.

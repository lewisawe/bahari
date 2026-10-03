# Verification — FHIR IG Alignment & Submission Hardening (Bahari)

## Iteration 1 (first implementation)

Date: run on worktree `fhir-ig-align`.

### Decision recorded (Task 1, One Health modeling)
A design conflict was raised via send_message (warning) and the parent chose
**Option 1**: model the One Health layer as a **Location-subject Observation**
(ObservationIndicatorsOah), NOT a RiskAssessment. Reason: the official IG is
Observation-centric with no RiskAssessment profile, and base-R4
`RiskAssessment.subject` is 1..1 `Reference(Patient|Group)` only (cannot carry a
Location without forcing a semantically-wrong Group back in). The One Health
Observation is strictly qualitative (CodeableConcept values + reason/basis/limits
text + caveat note; no numeric risk, no diagnosis).

### Commands run
- `npm test` (cwd worktree root) → **132 passed** (13 files, 0 failing).
  Baseline was 122; +10 net new tests (fhir.test.js and ai-assist.test.js).
- `npm run build` → **success** (`vite build`, 59 modules, built in ~5s).
- `npm run validate:fhir` → **exit 0**. HAPI R4 was **reachable**. Result:
  `PASS — 0 structural errors (12 profile-fetch notices, expected: public HAPI
  cannot load the draft OneAquaHealth IG)`. Per-resource structural-errors all 0:
  Bundle 0, Location 0, Specimen 0, Observation(biotic) 0, Observation(reliability)
  0, Observation(One Health) 0. The only non-structural notices are (a) IG
  profile-fetch notices for the unresolvable `http://hl7.eu/fhir/ig/oah/...`
  canonicals and (b) terminology warnings for the project custom CodeSystem.
- `npx vitest run src/core/fhir.test.js` → 16 passed.
- `npx vitest run src/core/ai-assist.test.js` → 17 passed.
- `npx vitest run src/core/biotic-index.test.js` → 14 passed (weights unchanged).
- `npx vitest run src/App.smoke.test.jsx` → 7 passed (StepFhir copy updated).

### Structural / IG checks (plan's final grep sweep)
- `grep -rn "bahari.example" src scripts README.md submission` → only a test NAME
  asserting its absence and a doc line stating it was removed; **no placeholder
  URL in emitted data**. The emitted CodeSystem is
  `https://lewisawe.github.io/bahari/fhir/CodeSystem/stream-health`.
- `grep "resourceType: 'Group'|'Group'" src/core/fhir.js` → **no match**
  (Group resource fully removed).
- `grep RiskAssessment src/core/fhir.js` → only explanatory comments; **no
  RiskAssessment resource emitted**.
- `meta.profile` canonicals emitted on **Location** (location-oah), **Specimen**
  (specimen-oah), **biotic Observation** (observation-indicators-oah), and
  **One Health Observation** (observation-indicators-oah).
- `hl7.eu/fhir/ig/oah` present in `src/core/fhir.js` (profile constants).

### Confirmations
- No `Group` resource remains anywhere in the generated bundle. ✓
- `meta.profile` IG canonicals present on Location/Specimen/Observation(s). ✓
- All internal `urn:uuid:` references resolve (validateBundle green; HAPI 0
  structural errors). ✓
- Fresh bundle has **0 structural errors** on HAPI R4. ✓

### Notes on IG facts (verified against github.com/hl7-eu/oah source)
- `ObservationIndicatorsOah`: `subject only Reference(LocationOah)`,
  `performer 1..` (no type constraint; IG examples use `performer.display`),
  `specimen only Reference(SpecimenOah)`, value CodeableConcept|Quantity,
  component value 1.. .
- `LocationOah`: identifier 1.., name 1.., mode 1..1 = #instance,
  position.longitude/latitude 1..1.
- `SpecimenOah`: subject 1.. only Reference(LocationOah); type (extensible);
  collection.collector 1..1 (IG wants PractitionerRole — we use a display-only
  collector for an anonymous citizen, which is base-R4 valid), collected[x]
  dateTime 1..1.
- `GroupOah` = person cohort (type #person) — confirms Group is wrong for an
  ecosystem; removed.
- Performer modeled display-only (no Device reference) because base-R4
  `Observation.performer` excludes Device; this matches the IG's own examples and
  yields 0 structural errors.

### Submission docs note
`submission/` is **gitignored** (see `.gitignore`), so the files created in this
worktree (`submission/PROJECT.md`, `TRACKS.md`, `FHIR_VALIDATION.md`,
`DEMO_SCRIPT.md`, `README.md`) will NOT appear in `git diff`/the commit. They are
written to disk as required by Task 2. The tracked `README.md` edits DO appear in
the commit.

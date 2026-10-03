# Verification — Amazon Nova Pro (Bedrock) vision adapter

Worktree: `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter`
Branch: `nova-adapter`
Date: 2026 (first iteration — no `review.json` present)

## Commands run (cwd = worktree)

### 1. Install AWS SDK dev dependencies
```
npm install @aws-sdk/client-bedrock-runtime @aws-sdk/credential-providers --save-dev
```
Result: added 30 packages. Both appear under `devDependencies` (NOT
`dependencies`): `@aws-sdk/client-bedrock-runtime ^3.1146.0`,
`@aws-sdk/credential-providers ^3.1146.0`. `node_modules/@aws-sdk/*` present.

### 2. Module export sanity
```
node -e "import('./src/core/ai-assist.js').then(m=>{...})"
```
Result: `ok: novaProvider present, gemini gone`. `geminiProvider` /
`mapGeminiResponse` no longer exported. No `gemini|VITE_GEMINI|generativelanguage`
in `src/core/ai-assist.js`.

### 3. `npm test` (full vitest suite)
```
npm test
```
Result: **PASS — 132 tests passed across 13 test files** (0 failures).
`src/core/ai-assist.test.js` = 17 tests (11 kept + 6 new Nova adapter tests;
the 6 old Gemini tests were replaced). No real network / no real AWS: the Nova
tests all MOCK `fetch` via `fetchImpl`.

Nova adapter tests cover:
- (a) well-formed proxy response maps to `{taxonId,confidence,reasoning=cues}`,
  flows through unchanged policy → `suggested`.
- (b) unknown label → `taxonId: null` → policy `defer`.
- (c) fetch rejects (offline/error) → stub fallback, no throw, deterministic.
- (d) non-OK HTTP (500 / 404 proxy-absent) → stub fallback.
- (e) no `imageBase64` → stub WITHOUT any network call, deterministic.
- (f) `providerName === 'nova-vision'`.

### 4. `npm run build` (production client build)
```
npm run build
```
Result: **PASS** — `vite v6.4.3 building for production`, 59 modules transformed,
built in ~4.5s.

Built client bundle sizes (`dist/`):
| File | Bytes | gzip |
|------|-------|------|
| dist/index.html | 902 | 0.47 kB |
| dist/assets/index-0F54-1_l.css | 18099 | 4.34 kB |
| dist/assets/leaflet-Dgihpmma.css | 15037 | 6.38 kB |
| dist/assets/StreamMap-ra6wnmP0.js | 2063 | 1.16 kB |
| dist/assets/leaflet-src-Cf1xDDdj.js | 150053 | 43.58 kB |
| dist/assets/index-ClP97-YU.js | 236234 | 72.02 kB |

### 5. CRITICAL — AWS SDK absent from client bundle
```
grep -rl "bedrock-runtime|@aws-sdk|BedrockRuntimeClient|ConverseCommand|fromNodeProviderChain" dist/
```
Result: **CLEAN — no match in `dist/`** (grep exited non-zero → nothing found).
The dev proxy lives only in `vite.config.js`'s `configureServer` hook (dev-server
only) and imports the SDK dynamically inside the request handler, so no AWS SDK
code can enter the production client bundle. The browser adapter (`novaProvider`)
only `fetch`es `/api/identify`; it never imports `@aws-sdk/*`. Confirmed
`novaProvider` body IS present in the bundle (`nova-vision`, `imageBase64`, POST
logic) — it is shipped, just never imports the SDK.

### 6. Full-worktree Gemini scrub (excl node_modules, dist, .git)
```
grep -rin "gemini|VITE_GEMINI|generativelanguage" . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git
```
Result: the ONLY remaining matches are inside `.agents/tasks/plan.md` (the
planning document that describes the removal work itself). No Gemini references
remain in code, tests, `README.md`, or `submission/*.md`.

### 7. Submission + README framing
- `README.md`: no `gemini`/`VITE_GEMINI`; contains Amazon Nova Pro / Amazon
  Bedrock, `us.amazon.nova-pro-v1:0`, `AWS_PROFILE=simi-ops`, local-dev-live /
  static-fallback framing.
- `submission/PROJECT.md` + `submission/TRACKS.md`: created on disk (dir is
  gitignored, so they are NOT committed). Both mention Nova; neither mentions
  Gemini. PROJECT.md names it the "Amazon Nova Pro (Amazon Bedrock) vision
  adapter"; TRACKS.md Track 3 carries the explainable-gate + stable-seam +
  fallback story.

## Preserved exactly (NOT changed)
`stubProvider`, `setAssistProvider`, `resetAssistProvider`, `getProviderName`,
`applyConfidencePolicy`, `identifyTaxon`, `CONFIDENT_THRESHOLD = 0.75`,
`REVIEW_THRESHOLD = 0.5`, the CUES/LOOKALIKES tables, and the RNG helpers.
Provider contract unchanged: `async (input) => { taxonId, confidence,
reasoning:string[], cues, alternatives }` with `.providerName`.

## Manual live-run (NOT executed in CI — no network/AWS in tests)
```
AWS_PROFILE=simi-ops AWS_REGION=us-east-1 npm run dev
# then POST a small PNG (base64) to http://localhost:5173/api/identify
# -> expect JSON { taxonId, confidence, cues } (~700ms)
```
The dev proxy decodes base64 → bytes and calls Bedrock Converse with
`modelId: 'us.amazon.nova-pro-v1:0'`, `inferenceConfig.maxTokens = 300`
(always set), credentials from the local AWS profile via `fromNodeProviderChain`.

## Summary
- `npm test`: 132 passed / 13 files / 0 failed.
- `npm run build`: success; client bundle has NO `@aws-sdk/*` (verified).
- Secrets: none committed; no `VITE_` AWS vars; creds only via local AWS profile
  server-side at dev time.

# Implementation Plan — Replace Gemini adapter with Amazon Nova Pro (Bedrock) via local Vite dev proxy

All paths are absolute. Work only inside the worktree
`/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter`.
Commit locally on branch `nova-adapter`; never push.

## Context discovered during exploration (ground truth for the implementer)

- Build tool: Vite 6 (`vite.config.js`). `base: './'`, `@vitejs/plugin-react`. Vitest config is embedded in the SAME `vite.config.js` under the `test` key: `environment: 'node'`, `globals: false`, include `src/**/*.test.js(x)`.
- Test env is **node by default**; browser-DOM test files opt in with a top-of-file `// @vitest-environment jsdom` comment (see `/home/sierra/.../src/a11y.test.jsx`, `/home/sierra/.../src/App.smoke.test.jsx`). `src/core/ai-assist.test.js` runs under **node** — so there is no `FileReader`/`window`/real `fetch` there. novaProvider tests MUST inject/mock fetch and must NOT depend on `FileReader`.
- Baseline: `npm test` = **132 passing** across 13 files. `src/core/ai-assist.test.js` currently has **17 tests**, 6 of which are the Gemini-adapter block to be replaced.
- `@aws-sdk/*` is NOT installed (`node_modules/@aws-sdk` absent). Must be added to **devDependencies** and installed.
- `submission/` does NOT exist on disk (gitignored dir, not materialized). The task says edit it anyway → the implementer must CREATE `submission/TRACKS.md` and `submission/PROJECT.md` only if they already exist; since they do not exist, see item 9 for exact handling (create them with the honest Nova framing).
- No `.env` / `.env.example` file exists in the worktree. Only `src/core/ai-assist.js` + `README.md` reference `VITE_GEMINI_API_KEY`. There is nothing else to scrub.
- `ai-assist.js` consumers: `src/ui/AssistPanel.jsx` (calls `identifyTaxon({ photoName, hintTaxonId, seed })` and `getProviderName()`), and `src/core/assessment.js` (only a comment mention, no code use). `AssistPanel` is used by `src/steps/StepAssess.jsx`.
- `AssistPanel.jsx` today only ever has the FILENAME (`photoName`), never the image bytes: `onPickPhoto` stores `f.name`; `runAssist` passes `{ photoName, hintTaxonId, seed: name.length }`. No File/Blob is retained.
- The default provider at module load is `stubProvider` (`let provider = stubProvider`). Nothing in the app calls `setAssistProvider` at startup — the shipped default is the stub. **Keep it that way**: the deployed static site must use the stub unless something opts into Nova. (The dev proxy only exists under `npm run dev`; novaProvider auto-falls-back to the stub when `/api/identify` is absent.)

### Design decisions (made here; implementer follows these, does not re-decide)

1. **Dev proxy lives in `vite.config.js` via a plugin using `configureServer`** (connect middleware on `server.middlewares`), NOT a separate server file. Rationale: it must exist ONLY under `npm run dev`; `configureServer` hooks run only for the dev server, never for `vite build`/`vite preview`, which guarantees the proxy and its `@aws-sdk` imports never enter the client bundle.
2. **The `@aws-sdk/*` imports are performed with a dynamic `await import()` INSIDE the request handler** (not a top-of-file `import`). Rationale: `vite.config.js` is a Node config module evaluated by Vite's config loader, not part of the client graph, so even a static import would not reach the browser bundle — but a dynamic import inside the handler is belt-and-suspenders and also avoids paying SDK load cost unless `/api/identify` is actually hit. The browser adapter (`ai-assist.js`) must NEVER import `@aws-sdk/*`; it only `fetch`es `/api/identify`.
3. **Provider contract is unchanged**: a provider is `async (input) => rawGuess` where `rawGuess = { taxonId, confidence, reasoning:string[], cues:string[], alternatives?:[{taxonId,confidence}] }`, with `fn.providerName` set. `applyConfidencePolicy`, thresholds, `stubProvider`, `setAssistProvider`, `resetAssistProvider`, `getProviderName`, `identifyTaxon` stay byte-for-byte as they are except for the Gemini removal.
4. **novaProvider input**: accepts `{ imageBase64, imageFormat, hintTaxonId, photoName, seed }`. It POSTs `{ imageBase64, imageFormat, hintTaxonId }` to `/api/identify`. On any failure (fetch throws / non-OK / no endpoint) it falls back to `stubProvider(input)` — and MUST forward `photoName`/`hintTaxonId`/`seed` to the stub so fallback stays deterministic. fetch is injectable (`novaProvider({ fetchImpl })`) for tests.
5. **AssistPanel**: keep the stub-only filename path working. Add retaining the picked File and converting to base64 ONLY in the browser (guarded so node tests are unaffected). Because the shipped default provider is the stub, AssistPanel passing extra fields is harmless when the stub is active. Do not break any existing AssistPanel/App test.

---

## Steps

- [ ] 1. **Add AWS SDK dev dependencies and install them in the worktree.**
      Add to `devDependencies` in `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/package.json`: `@aws-sdk/client-bedrock-runtime` and `@aws-sdk/credential-providers` (pin to the exact resolved versions after install — no `^` drift beyond what npm writes is fine, but prefer the versions npm installs). Run the install in the worktree.
      Files: `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/package.json`, `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/package-lock.json`
      Verify: `cd /home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter && npm install @aws-sdk/client-bedrock-runtime @aws-sdk/credential-providers --save-dev` completes; `ls node_modules/@aws-sdk/client-bedrock-runtime node_modules/@aws-sdk/credential-providers` both exist; the two packages appear under `devDependencies` (NOT `dependencies`) in package.json.

- [ ] 2. **Write the dev-proxy Vite plugin in `vite.config.js`.**
      Add a plugin object (e.g. `novaProxyPlugin()`) to the `plugins` array with a `configureServer(server)` hook that registers a connect middleware on `server.middlewares.use('/api/identify', handler)` responding only to POST. The handler must:
      - Read and JSON-parse the request body (`{ imageBase64, imageFormat, hintTaxonId }`); reject non-POST / bad JSON with HTTP 400.
      - `const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');` and `const { fromNodeProviderChain } = await import('@aws-sdk/credential-providers');` INSIDE the handler (decision 2).
      - Decode base64 → `Uint8Array` (e.g. `new Uint8Array(Buffer.from(imageBase64, 'base64'))`). The SDK needs bytes, NOT base64.
      - Build the known-taxa list from `src/core/taxa.js` (`import { TAXA, TAXON_IDS, getTaxon } from './src/core/taxa.js'` at the top of vite.config.js is fine — it is Node-side only and the file is pure data; prefer importing to keep one source of truth). Build a prompt instructing Nova to return ONLY compact JSON `{ "taxonId": <known id or best-guess common name>, "confidence": <0..1>, "cues": [<short strings>] }`, listing the allowed ids/common names, and passing `hintTaxonId` as a SOFT hint ("if plausible", never forced).
      - Normalize `imageFormat` to `'png'` or `'jpeg'` (map `image/png`→`png`, `image/jpeg`/`jpg`→`jpeg`; default `jpeg`).
      - Call Converse: `new ConverseCommand({ modelId: 'us.amazon.nova-pro-v1:0', messages: [{ role: 'user', content: [ { image: { format, source: { bytes } } }, { text: prompt } ] }], inferenceConfig: { maxTokens: 300 } })`. ALWAYS set `maxTokens` (unset → ThrottlingException). Client: `new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1', credentials: fromNodeProviderChain({ profile: process.env.AWS_PROFILE }) })`. Never read keys from committed code or `VITE_` vars.
      - Extract the model text from `response.output.message.content[].text`, strip code fences, extract the first `{...}` with a brace-matching/regex grab, `JSON.parse`.
      - Map to `{ taxonId, confidence, cues }`: if parsed `taxonId` is a known id → use it; else try closest common-name match against `TAXA[].commonName` (case-insensitive contains / exact) → map to that id; else `taxonId: null` (defer). Clamp confidence to `[0,1]`. `cues` = array of strings (filter non-strings).
      - On ANY error (parse/AWS/throttle/missing creds) respond with a non-2xx status (e.g. 502) and a small JSON error body, so the browser falls back to the stub. Do not crash the dev server.
      - Set `Content-Type: application/json` and write the mapped JSON on success (HTTP 200).
      Keep the existing `base`, `react()` plugin, and `test` config intact; just add the new plugin to the array.
      Files: `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/vite.config.js`
      Verify: `cd /home/sierra/.../nova-adapter && npm run build` succeeds (confirms the config still loads and `configureServer` is not invoked during build). Full live Bedrock call is NOT part of automated verification (no network in tests); a manual smoke note is in item 10.

- [ ] 3. **Remove the Gemini provider and all its helpers from `src/core/ai-assist.js`.**
      Delete `geminiProvider`, `mapGeminiResponse` (exported), `extractText`, `parseImagePayload`, `normalizeTaxonId`, `VISION_PROMPT`, `GEMINI_DEFAULT_ENDPOINT`, `defaultGeminiKey`, and the Gemini comment block + the `VITE_GEMINI_API_KEY` security comment. Keep `clamp01`, `TAXA`/`getTaxon` import, and everything else. Do NOT touch `stubProvider`, `setAssistProvider`, `resetAssistProvider`, `getProviderName`, `applyConfidencePolicy`, `identifyTaxon`, `CONFIDENT_THRESHOLD`, `REVIEW_THRESHOLD`, the CUES/LOOKALIKES tables, or the RNG helpers.
      Files: `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/src/core/ai-assist.js`
      Verify: `grep -in "gemini\|VITE_GEMINI\|generativelanguage" /home/sierra/.../src/core/ai-assist.js` returns nothing. (Suite will be re-run after the next item adds the replacement + fixes tests.)

- [ ] 4. **Add `novaProvider()` to `src/core/ai-assist.js` behind the same provider seam.**
      Export `function novaProvider(opts = {})` with `{ fetchImpl, endpoint = '/api/identify' } = opts`; `doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : undefined)`. The returned `async fn(input = {})`:
      - If `!doFetch` → `return stubProvider(input)` (node without fetch / offline).
      - If no `input.imageBase64` → there is nothing for Nova to see → `return stubProvider(input)` (keeps filename-only path on the stub).
      - Else POST `JSON.stringify({ imageBase64: input.imageBase64, imageFormat: input.imageFormat, hintTaxonId: input.hintTaxonId })` to `endpoint` with `method:'POST'`, `headers:{'Content-Type':'application/json'}`.
      - If the fetch throws, or `!res.ok`, or res is falsy → `return stubProvider(input)` (THE single fallback place). Preserve forwarding `input` (incl. `photoName`/`seed`/`hintTaxonId`) to the stub so fallback stays deterministic.
      - On OK: `const data = await res.json()`; map to the provider contract: `{ taxonId: normalizeKnownId(data.taxonId), confidence: clamp01(data.confidence), reasoning: cues, cues, alternatives: [] }` where `cues` = `Array.isArray(data.cues) ? data.cues.filter(s=>typeof s==='string') : []`. Reuse a small local `normalizeKnownId` (returns a known id via `getTaxon`, else null) — re-add a minimal normalizer since the Gemini one was deleted.
      - Set `fn.providerName = 'nova-vision'` and `return fn`.
      Files: `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/src/core/ai-assist.js`
      Verify: `node -e "import('/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/src/core/ai-assist.js').then(m=>{if(!m.novaProvider||m.geminiProvider)process.exit(1);console.log('ok')})"` prints `ok`.

- [ ] 5. **Replace the Gemini test block in `src/core/ai-assist.test.js` with novaProvider tests (fetch mocked, no real network/AWS).**
      In the imports, remove `geminiProvider, mapGeminiResponse`; add `novaProvider`. Delete the entire `describe('real vision provider (gemini adapter)', ...)` block. Add `describe('real vision provider (nova adapter)', ...)` with at minimum:
      (a) **well-formed proxy response maps correctly**: `fetchImpl` mock returns `{ ok:true, status:200, json: async () => ({ taxonId:'mayfly', confidence:0.82, cues:['three tails','feathery gills'] }) }`; call `novaProvider({ fetchImpl })({ imageBase64:'QUJD', imageFormat:'jpeg' })`; assert fetch called once, `raw.taxonId==='mayfly'`, `TAXON_IDS` contains it, `0<=confidence<=1`, `raw.reasoning` is a non-empty string[] equal to `raw.cues`; then `applyConfidencePolicy(raw,'nova-vision').status==='suggested'`.
      (b) **unknown label → taxonId null → defer**: mock returns `{taxonId:'unicorn',confidence:0.9,cues:['sparkles']}`; assert `raw.taxonId===null` and `applyConfidencePolicy(raw).status==='defer'`.
      (c) **error path falls back to stub**: `fetchImpl` mock rejects (`Promise.reject(new Error('network'))`); call with `{ imageBase64:'QUJD', photoName:'p.jpg', seed:2 }`; assert the result is stub-shaped (`taxonId`/`confidence` present, `reasoning` is an array), did not throw, and is deterministic (call twice with same input → `toEqual`).
      (d) **non-OK HTTP → stub fallback**: mock returns `{ ok:false, status:500, json: async()=>({}) }`; assert fetch called once and stub-shaped result.
      (e) **no imageBase64 → stub WITHOUT network**: `const mock=vi.fn(); novaProvider({fetchImpl:mock})({ photoName:'rock1.jpg', seed:7 })`; assert `mock` NOT called; deterministic (call twice → `toEqual`).
      (f) **providerName is `nova-vision`**: `expect(novaProvider({fetchImpl:vi.fn()}).providerName).toBe('nova-vision')`.
      Keep every other `describe` block (confidence policy, stub via identifyTaxon, swappable provider) unchanged. Net test count should stay ~132 (the 6 gemini tests are replaced by ~6 nova tests).
      Files: `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/src/core/ai-assist.test.js`
      Verify: `cd /home/sierra/.../nova-adapter && npx vitest run src/core/ai-assist.test.js` passes; then `npm test` → all files green, total ≈ 132 (acceptable range 130–134; state the exact number).

- [ ] 6. **Wire real image bytes into AssistPanel without breaking the stub-only path or any test.**
      In `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/src/ui/AssistPanel.jsx`: retain the selected `File` object in state (`photoFile`), in addition to `photoName`. In `runAssist`, if a `File` is present AND `FileReader` exists (browser), read it to a base64 string + detect `imageFormat` from `file.type`, and pass `{ photoName, hintTaxonId, seed, imageBase64, imageFormat }` to `identifyTaxon`. When no file / no FileReader (tests under jsdom that don't attach a real file), pass exactly the current `{ photoName, hintTaxonId, seed }` — unchanged behavior. Do NOT call `setAssistProvider` here; the shipped default stays the stub, so these extra fields are inert unless a Nova provider is explicitly installed. Keep the engine label line (`getProviderName()`) and all existing markup/handlers.
      Files: `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/src/ui/AssistPanel.jsx`
      Verify: `cd /home/sierra/.../nova-adapter && npx vitest run src/App.smoke.test.jsx src/a11y.test.jsx` passes (these render the assess flow); then `npm test` stays fully green.

- [ ] 7. **Confirm the client bundle does NOT import `@aws-sdk/*`, and report bundle sizes.**
      Build and grep the emitted client assets for any AWS SDK footprint. The proxy lives only in `configureServer`, so a production build must not contain it.
      Files: (none changed; verification + reporting step)
      Verify: `cd /home/sierra/.../nova-adapter && npm run build` succeeds; `grep -rl "bedrock-runtime\|@aws-sdk\|BedrockRuntimeClient" dist/ ; test $? -ne 0 && echo "CLEAN: no aws-sdk in dist"` prints `CLEAN...` (grep finds nothing → nonzero exit). Record `dist/` JS/CSS sizes: `find dist -name '*.js' -o -name '*.css' | xargs ls -l` (report each file's bytes in the final summary).

- [ ] 8. **Update `README.md` — replace every Gemini mention with Amazon Nova Pro / Amazon Bedrock.**
      In `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/README.md`, rewrite the "Responsible AI" section: engine swappable behind `setAssistProvider`; the shipped real adapter is **Amazon Nova Pro via Amazon Bedrock** (vision Converse API) reached through a **local Vite dev proxy** that authenticates with an **AWS profile server-side** (no browser keys); the **deployed static site runs the deterministic stub via automatic fallback**, so the public demo needs no backend/keys. Document running live locally: `AWS_PROFILE=simi-ops` (optionally `AWS_REGION=us-east-1`) then `npm run dev`; mention model id `us.amazon.nova-pro-v1:0`. Remove the `.env` / `VITE_GEMINI_API_KEY` code block and any Gemini wording. Keep the "no backend required" claim honest for the deployed site.
      Files: `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/README.md`
      Verify: `grep -in "gemini\|VITE_GEMINI" /home/sierra/.../README.md` returns nothing; `grep -in "nova\|bedrock\|simi-ops\|us.amazon.nova-pro-v1:0" /home/sierra/.../README.md` shows the new content.

- [ ] 9. **Create the `submission/` docs with the Nova framing (dir is gitignored and absent).**
      `submission/` does not exist on disk. Create `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/submission/TRACKS.md` and `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/submission/PROJECT.md`. In PROJECT.md, state the real adapter as the **"Amazon Nova Pro (Amazon Bedrock) vision adapter"** (NOT "Gemini vision adapter"). In TRACKS.md, under Track 3, describe the responsible-AI story: explainable, human-in-the-loop confidence policy (defer<0.5 / review<0.75 / suggested above) with a **real multimodal model (Amazon Nova Pro) behind a stable `setAssistProvider` seam and automatic stub fallback**; the deployed static demo needs no backend/keys because it uses the stub. Keep framing honest — the differentiator is the explainable gate + stable seam + fallback, not raw model accuracy. Since the files are being created fresh, keep them concise and accurate to the current app; do not fabricate features. (These files are gitignored, so they will not be committed — create them on disk regardless, as the task requires.)
      Files: `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/submission/TRACKS.md`, `/home/sierra/Desktop/projects/hackathons/oneaquahealth/.worktrees/nova-adapter/submission/PROJECT.md`
      Verify: both files exist and `grep -il "gemini" /home/sierra/.../submission/*.md` returns nothing; `grep -il "nova" /home/sierra/.../submission/*.md` lists both files.

- [ ] 10. **Full green suite, clean build, final report, and local commit.**
      Run the whole suite and build once more; scrub for any leftover Gemini/VITE_GEMINI across the whole worktree (excluding node_modules). Record the manual-live-run instructions (not executed in CI): `AWS_PROFILE=simi-ops AWS_REGION=us-east-1 npm run dev`, then POST a small PNG as base64 to `http://localhost:5173/api/identify`; expect a JSON `{taxonId,confidence,cues}` (~700ms). Then stage and commit the tracked changes (vite.config.js, src/core/ai-assist.js, src/core/ai-assist.test.js, src/ui/AssistPanel.jsx, package.json, package-lock.json, README.md) on branch `nova-adapter`.
      Files: (verification + commit)
      Verify: `cd /home/sierra/.../nova-adapter && npm test` → all green (report exact count, expect ≈132); `npm run build` → succeeds; `grep -rin "gemini\|VITE_GEMINI" /home/sierra/.../nova-adapter --exclude-dir=node_modules --exclude-dir=dist` returns nothing; `git -C /home/sierra/.../nova-adapter status --short` shows only intended files; create the commit; confirm `dist/` has no `@aws-sdk` footprint (re-assert item 7). Report built bundle sizes in the summary.

## Definition of done (plan must satisfy all)

- Worktree only; branch `nova-adapter`; committed locally, not pushed.
- `npm test` green, ~132 tests, no real-network/real-AWS in any test.
- `npm run build` succeeds; production CLIENT bundle (`dist/`) contains NO `@aws-sdk/*` (proxy is dev-server-only via `configureServer` + dynamic import). Bundle sizes reported.
- Browser adapter never imports `@aws-sdk/*`; it only `fetch`es `/api/identify`.
- No secrets committed; no `VITE_` AWS vars; AWS creds come from `AWS_PROFILE` server-side only.
- `stubProvider`, `setAssistProvider`, `resetAssistProvider`, `getProviderName`, `applyConfidencePolicy`, `identifyTaxon`, `CONFIDENT_THRESHOLD`, `REVIEW_THRESHOLD` unchanged — human-in-the-loop policy preserved.
- All Gemini references replaced by Amazon Nova Pro / Amazon Bedrock in code, tests, README, and submission docs.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TAXA, getTaxon } from './src/core/taxa.js';

// ---------------------------------------------------------------------------
// Local dev-only Nova Pro (Amazon Bedrock) vision proxy.
//
// This plugin exposes POST /api/identify ONLY on the Vite dev server
// (`npm run dev`). The `configureServer` hook is never invoked for
// `vite build` / `vite preview`, so neither this handler nor its
// `@aws-sdk/*` imports can ever enter the client/browser bundle. The AWS SDK
// is imported dynamically INSIDE the request handler (belt-and-suspenders:
// vite.config.js is a Node-side config module, not part of the client graph,
// and the dynamic import also avoids loading the SDK unless /api/identify is
// actually hit).
//
// SECURITY: AWS credentials come ONLY from the local AWS profile at dev time
// (AWS_PROFILE via the Node provider chain). No keys are read from committed
// code, and there are no VITE_ AWS variables (those would leak into the
// client bundle).
// ---------------------------------------------------------------------------

const NOVA_MODEL_ID = 'us.amazon.nova-pro-v1:0';

/** Normalize a mime/type string to a Bedrock image format ('png' | 'jpeg'). */
function normalizeImageFormat(fmt) {
  const f = String(fmt || '').toLowerCase();
  if (f.includes('png')) return 'png';
  // image/jpeg, image/jpg, 'jpg', 'jpeg' -> jpeg (Bedrock expects 'jpeg')
  return 'jpeg';
}

/** Build the vision prompt listing allowed taxa + a soft hint. */
function buildPrompt(hintTaxonId) {
  const known = TAXA.map((t) => `${t.id} (${t.commonName})`).join(', ');
  const hint = getTaxon(hintTaxonId)
    ? ` If — and only if — it is plausible given the image, the user suspects this may be "${hintTaxonId}"; treat that as a soft hint, never as the forced answer.`
    : '';
  return (
    'You identify a single freshwater streambed macroinvertebrate in the image ' +
    'for a citizen-science biotic-index app. Respond with ONLY compact JSON of ' +
    'the form {"taxonId": <one of the allowed ids, or a common name, or null>, ' +
    '"confidence": <number 0..1>, "cues": [<short visual-cue strings>]}. ' +
    'Allowed taxon ids (with common names): ' + known + '. ' +
    'Use null for taxonId if you cannot tell. Do not wrap the JSON in code ' +
    'fences or add any prose.' + hint
  );
}

/**
 * Extract the first balanced {...} JSON object from arbitrary model text,
 * stripping code fences first. Returns the parsed object or {}.
 */
function parseModelJson(text) {
  if (typeof text !== 'string') return {};
  // Strip ``` or ```json code fences.
  let t = text.replace(/```[a-zA-Z]*\s*/g, '').replace(/```/g, '').trim();
  // Grab the first balanced-brace object.
  const start = t.indexOf('{');
  if (start === -1) return {};
  let depth = 0;
  let end = -1;
  for (let i = start; i < t.length; i++) {
    if (t[i] === '{') depth++;
    else if (t[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return {};
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return {};
  }
}

/** Clamp a value into [0,1]; non-numbers -> 0. */
function clamp01(n) {
  n = Number(n) || 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Map an arbitrary model label to one of our known taxon ids:
 * - exact id match -> that id
 * - else closest common-name match (case-insensitive exact, then contains)
 * - else null (defer)
 */
function mapToKnownTaxon(label) {
  if (typeof label !== 'string') return null;
  const needle = label.trim().toLowerCase();
  if (!needle) return null;
  if (getTaxon(needle)) return needle;
  // exact common-name match
  const exact = TAXA.find((t) => t.commonName.toLowerCase() === needle);
  if (exact) return exact.id;
  // contains match in either direction
  const contains = TAXA.find((t) => {
    const cn = t.commonName.toLowerCase();
    return cn.includes(needle) || needle.includes(cn) || needle.includes(t.id);
  });
  return contains ? contains.id : null;
}

/** Read and JSON-parse a connect request body. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 20 * 1024 * 1024) {
        reject(new Error('payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

/** The Vite dev-server plugin exposing POST /api/identify (dev only). */
function novaProxyPlugin() {
  return {
    name: 'nova-identify-proxy',
    configureServer(server) {
      server.middlewares.use('/api/identify', async (req, res) => {
        if (req.method !== 'POST') {
          return sendJson(res, 405, { error: 'method not allowed' });
        }

        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          return sendJson(res, 400, { error: 'invalid JSON body' });
        }

        const { imageBase64, imageFormat, hintTaxonId } = body || {};
        if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
          return sendJson(res, 400, { error: 'imageBase64 is required' });
        }

        try {
          // Dynamic imports: SDK stays entirely Node-side, dev-only.
          const { BedrockRuntimeClient, ConverseCommand } = await import(
            '@aws-sdk/client-bedrock-runtime'
          );
          const { fromNodeProviderChain } = await import(
            '@aws-sdk/credential-providers'
          );

          const bytes = new Uint8Array(Buffer.from(imageBase64, 'base64'));
          const format = normalizeImageFormat(imageFormat);
          const prompt = buildPrompt(hintTaxonId);

          const client = new BedrockRuntimeClient({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: fromNodeProviderChain({ profile: process.env.AWS_PROFILE }),
          });

          const command = new ConverseCommand({
            modelId: NOVA_MODEL_ID,
            messages: [
              {
                role: 'user',
                content: [
                  { image: { format, source: { bytes } } },
                  { text: prompt },
                ],
              },
            ],
            // ALWAYS set maxTokens explicitly — unset causes ThrottlingException.
            inferenceConfig: { maxTokens: 300 },
          });

          const response = await client.send(command);

          const text = (response?.output?.message?.content || [])
            .map((c) => (typeof c?.text === 'string' ? c.text : ''))
            .join('');

          const parsed = parseModelJson(text);
          const taxonId = mapToKnownTaxon(
            parsed.taxonId ?? parsed.taxon ?? parsed.label,
          );
          const confidence = clamp01(parsed.confidence);
          const cues = Array.isArray(parsed.cues)
            ? parsed.cues.filter((s) => typeof s === 'string')
            : [];

          return sendJson(res, 200, { taxonId, confidence, cues });
        } catch (err) {
          // Any error (parse / AWS / throttle / missing creds) -> non-2xx so
          // the browser adapter falls back to the stub. Never crash the dev
          // server.
          return sendJson(res, 502, {
            error: 'nova identify failed',
            detail: String(err && err.message ? err.message : err),
          });
        }
      });
    },
  };
}

export default defineConfig({
  // Relative base so the built app works on any static host (GitHub Pages
  // subpath, Netlify, Vercel) and even when opened from the filesystem.
  base: './',
  plugins: [react(), novaProxyPlugin()],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
  },
});

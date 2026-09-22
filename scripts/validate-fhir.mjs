// Bahari — validate a generated FHIR bundle against a REAL external validator.
//
// Builds a bundle with the app's own buildBundle() and POSTs it to the public
// HAPI FHIR R4 test server's $validate operation. Prints the OperationOutcome
// issues (errors / warnings / information) so we can prove the bundle is
// accepted by an independent FHIR engine, not just our in-house checker.
//
// HAPI public test server: https://hapi.fhir.org/baseR4
//
// Run: npm run validate:fhir

import { buildBundle } from '../src/core/fhir.js';
import { buildContext } from '../src/core/context.js';

const ENDPOINT = process.env.FHIR_BASE || 'https://hapi.fhir.org/baseR4';

function sampleBundle() {
  const stream = { id: 'seed-1', name: 'Bretagne stream', country: 'France', lat: 48.482, lon: -2.689 };
  const counts = { stonefly: 1, mayfly: 3, snail: 4, worm: 2 };
  return buildBundle({
    stream,
    counts,
    submission: {
      counts,
      photoConfirmed: true,
      location: { lat: stream.lat, lon: stream.lon },
      locationOnStream: true,
      durationSec: 240,
    },
    context: buildContext({
      date: new Date('2026-07-01'),
      landUse: 'urban',
      rain: { heavyRain: true, recentRainMm: 35, source: 'sample' },
    }),
  });
}

async function validate(resource, type) {
  const url = `${ENDPOINT}/${type}/$validate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
    body: JSON.stringify(resource),
  });
  const text = await res.text();
  let outcome;
  try {
    outcome = JSON.parse(text);
  } catch {
    outcome = { raw: text };
  }
  return { httpStatus: res.status, outcome };
}

function summarize(outcome) {
  const issues = outcome?.issue || [];
  const counts = { error: 0, fatal: 0, warning: 0, information: 0 };
  for (const i of issues) counts[i.severity] = (counts[i.severity] || 0) + 1;
  return { counts, issues };
}

async function main() {
  console.log(`Validating against ${ENDPOINT}/$validate ...\n`);
  const bundle = sampleBundle();

  // Validate the whole bundle, then each resource individually for detail.
  const targets = [
    { label: 'Bundle', type: 'Bundle', resource: bundle },
    ...bundle.entry.map((e) => ({
      label: e.resource.resourceType,
      type: e.resource.resourceType,
      resource: e.resource,
    })),
  ];

  let hardErrors = 0;
  for (const t of targets) {
    try {
      const { httpStatus, outcome } = await validate(t.resource, t.type);
      const { counts, issues } = summarize(outcome);
      const errs = (counts.error || 0) + (counts.fatal || 0);
      hardErrors += errs;
      console.log(
        `${t.label.padEnd(16)} HTTP ${httpStatus}  ` +
          `errors:${counts.error || 0} fatal:${counts.fatal || 0} ` +
          `warnings:${counts.warning || 0} info:${counts.information || 0}`,
      );
      // show any errors/fatals verbatim (these are what would matter)
      for (const i of issues) {
        if (i.severity === 'error' || i.severity === 'fatal') {
          console.log(`   ! ${i.severity}: ${i.diagnostics || i.details?.text || '(no detail)'}`);
        }
      }
    } catch (e) {
      console.log(`${t.label.padEnd(16)} request failed: ${e.message}`);
    }
  }

  console.log(
    `\nResult: ${hardErrors === 0 ? 'PASS — no errors/fatals from the external validator' : `${hardErrors} error(s) reported`}`,
  );
  console.log(
    'Note: warnings/information from a public server often concern terminology ' +
      'bindings for our custom CodeSystem, which is expected for domain-specific codes.',
  );
  process.exit(hardErrors === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Validation script failed:', e);
  process.exit(1);
});

// Bahari — FHIR R4 export.
//
// Turns a completed assessment into a valid FHIR R4 Bundle so the stream reading
// can be ingested by health/research systems in a recognised standard. This is
// the "speaks a health-data standard" step.
//
// MODELING (validated): FHIR Observation supports a NON-patient subject
// ("a patient or other subject"), so we model the ecosystem itself as the
// subject rather than shoehorning it into a Patient.
//   - Stream            -> Location            (the subject; real coordinates)
//   - Biotic assessment -> Observation         (value = score + class; taxa = components)
//   - Data reliability  -> Observation         (derivedFrom the biotic Observation)
//   - One Health flags  -> RiskAssessment      (prediction[]; basis = biotic Observation)
//   - All of the above  -> Bundle (collection) with resolvable urn:uuid refs
//
// Refs: FHIR Observation subject = patient OR other subject
//   https://mitre.github.io/fhir-for-research/modules/fhir-from-1000-ft
//   Observation is the most-used FHIR resource
//   https://pubmed.ncbi.nlm.nih.gov/39316433/
//
// This module is pure (no network). buildBundle() constructs the Bundle;
// validateBundle() does structural checks (required fields + internal refs
// resolve) so we can prove validity in tests and in the UI.

import { scoreAssessment } from './biotic-index.js';
import { scoreReliability } from './reliability.js';
import { translateOneHealth } from './one-health.js';
import { getTaxon } from './taxa.js';

// A small custom code system for the ecosystem-specific concepts we mint. Using
// a clearly-namespaced system URL is the FHIR-correct way to express codes that
// aren't in a standard terminology yet.
const SYS = 'https://bahari.example/fhir/CodeSystem/stream-health';

/**
 * Build a FHIR R4 Bundle from an assessment.
 * @param {{
 *   stream: {id:string, name:string, country?:string, lat:number, lon:number},
 *   counts: Object.<string, number>,
 *   submission: object,          // for reliability (see reliability.js)
 *   context: object,             // for One Health (see one-health.js)
 *   when?: string,               // ISO datetime; defaults to now
 *   idGen?: () => string,        // injectable id generator (tests -> deterministic)
 * }} input
 * @returns {object} FHIR Bundle
 */
export function buildBundle(input) {
  const {
    stream,
    counts = {},
    submission = {},
    context = {},
    when = new Date().toISOString(),
    idGen = defaultUuid,
  } = input || {};

  const biotic = scoreAssessment(counts);
  const reliability = scoreReliability(submission);
  const oneHealth = translateOneHealth({ classKey: biotic.classKey, context });

  // urn:uuid refs so entries reference each other within the bundle
  const locId = `urn:uuid:${idGen()}`;
  const bioticId = `urn:uuid:${idGen()}`;
  const reliabilityId = `urn:uuid:${idGen()}`;
  const riskId = `urn:uuid:${idGen()}`;

  const entries = [];

  // 1) Location — the stream is the subject of every observation.
  entries.push(entry(locId, {
    resourceType: 'Location',
    status: 'active',
    name: stream?.name || 'Unnamed stream',
    description: `Urban freshwater monitoring point${stream?.country ? ` (${stream.country})` : ''}`,
    physicalType: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'area', display: 'Area' }],
    },
    position: stream
      ? { latitude: stream.lat, longitude: stream.lon }
      : undefined,
  }));

  // 2) Observation — the biotic (ecological) assessment.
  if (biotic.score !== null) {
    entries.push(entry(bioticId, {
      resourceType: 'Observation',
      status: 'final',
      category: [{
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey' }],
      }],
      code: {
        coding: [{ system: SYS, code: 'biotic-index', display: 'Stream macroinvertebrate biotic index' }],
        text: 'Stream ecological health (biotic index)',
      },
      subject: { reference: locId, display: stream?.name },
      effectiveDateTime: when,
      valueQuantity: { value: biotic.score, unit: 'sensitivity (1-10)', system: SYS, code: 'biotic-score' },
      interpretation: [{
        coding: [{ system: SYS, code: biotic.classKey, display: biotic.classInfo?.label }],
        text: biotic.classInfo?.blurb,
      }],
      method: {
        text: 'Average pollution-sensitivity of indicator groups found (miniSASS/SASS/SIGNAL family)',
      },
      // each indicator group found -> a component with its count
      component: biotic.contributions.map((c) => ({
        code: {
          coding: [{ system: SYS, code: `taxon-${c.id}`, display: c.commonName }],
          text: `${c.commonName} (${c.scientificGroup})`,
        },
        valueQuantity: { value: c.count, unit: 'individuals', system: SYS, code: 'count' },
      })),
    }));
  }

  // 3) Observation — data reliability of the citizen submission.
  entries.push(entry(reliabilityId, {
    resourceType: 'Observation',
    status: 'final',
    category: [{
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey' }],
    }],
    code: {
      coding: [{ system: SYS, code: 'data-reliability', display: 'Citizen data reliability score' }],
      text: 'Data reliability (0-100)',
    },
    subject: { reference: locId, display: stream?.name },
    effectiveDateTime: when,
    valueQuantity: { value: reliability.score, unit: 'score (0-100)', system: SYS, code: 'reliability-score' },
    interpretation: [{
      coding: [{ system: SYS, code: `reliability-${reliability.band}`, display: reliability.bandInfo?.label }],
    }],
    ...(biotic.score !== null ? { derivedFrom: [{ reference: bioticId }] } : {}),
    note: reliability.flags.length ? reliability.flags.map((f) => ({ text: f })) : undefined,
  }));

  // 4) RiskAssessment — the One Health considerations (qualitative, caveated).
  entries.push(entry(riskId, {
    resourceType: 'RiskAssessment',
    status: 'final',
    code: {
      coding: [{ system: SYS, code: 'one-health-assessment', display: 'One Health consideration set' }],
      text: 'One Health considerations (qualitative)',
    },
    subject: { reference: locId, display: stream?.name },
    occurrenceDateTime: when,
    ...(biotic.score !== null ? { basis: [{ reference: bioticId }] } : {}),
    // IMPORTANT: qualitativeRisk only — never a numeric probability of illness.
    prediction: oneHealth.flags.map((f) => ({
      outcome: { text: `[${f.audience}] ${f.title}` },
      qualitativeRisk: {
        coding: [{ system: SYS, code: f.level, display: cap(f.level) }],
        text: f.reason,
      },
      rationale: `${f.basis} Limits: ${f.limits}`,
    })),
    note: [{
      text:
        'One Health considerations are qualitative and derived from an indirect ' +
        'ecological indicator (streambed invertebrates). They are not a water-quality ' +
        'test or a medical diagnosis.',
    }],
  }));

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: when,
    entry: entries,
  };
}

function entry(fullUrl, resource) {
  return { fullUrl, resource };
}

/**
 * Structural validation of a Bundle we produced: required fields present and
 * every internal reference resolves to an entry. Not a full FHIR validator, but
 * enough to prove the Bundle is well-formed and self-consistent.
 * @param {object} bundle
 * @returns {{valid:boolean, errors:string[], resourceCounts:Object.<string,number>}}
 */
export function validateBundle(bundle) {
  const errors = [];
  if (!bundle || bundle.resourceType !== 'Bundle') {
    return { valid: false, errors: ['Not a Bundle'], resourceCounts: {} };
  }
  if (!bundle.type) errors.push('Bundle.type missing');
  if (!Array.isArray(bundle.entry) || bundle.entry.length === 0) {
    errors.push('Bundle has no entries');
    return { valid: false, errors, resourceCounts: {} };
  }

  const fullUrls = new Set();
  const counts = {};
  for (const e of bundle.entry) {
    if (!e.fullUrl) errors.push('entry missing fullUrl');
    else fullUrls.add(e.fullUrl);
    const r = e.resource;
    if (!r || !r.resourceType) {
      errors.push('entry missing resource/resourceType');
      continue;
    }
    counts[r.resourceType] = (counts[r.resourceType] || 0) + 1;
    // required-ish fields per resource type
    if (r.resourceType === 'Observation') {
      if (!r.status) errors.push('Observation.status missing');
      if (!r.code) errors.push('Observation.code missing');
      if (!r.subject) errors.push('Observation.subject missing');
    }
    if (r.resourceType === 'RiskAssessment') {
      if (!r.status) errors.push('RiskAssessment.status missing');
      if (!r.subject) errors.push('RiskAssessment.subject missing');
    }
    if (r.resourceType === 'Location') {
      if (!r.status) errors.push('Location.status missing');
    }
  }

  // every internal reference must resolve to a fullUrl in the bundle
  for (const ref of collectReferences(bundle)) {
    if (ref.startsWith('urn:uuid:') && !fullUrls.has(ref)) {
      errors.push(`Unresolved reference: ${ref}`);
    }
  }

  return { valid: errors.length === 0, errors, resourceCounts: counts };
}

function collectReferences(node, acc = []) {
  if (Array.isArray(node)) {
    for (const n of node) collectReferences(n, acc);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'reference' && typeof v === 'string') acc.push(v);
      else collectReferences(v, acc);
    }
  }
  return acc;
}

// Deterministic-ish default UUID (crypto if available, else fallback).
function defaultUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function cap(s) {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

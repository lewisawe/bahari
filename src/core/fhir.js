// Bahari — FHIR R4 export, aligned to the official OneAquaHealth HL7 FHIR IG.
//
// Turns a completed assessment into a valid FHIR R4 Bundle so the stream reading
// can be ingested by health/research systems in a recognised standard. This is
// the "speaks a health-data standard" step.
//
// IG ALIGNMENT: the bundle is modelled against the official OneAquaHealth HL7
// FHIR Implementation Guide (repo github.com/hl7-eu/oah, canonical base
// http://hl7.eu/fhir/ig/oah). We carry each resource's IG profile canonical in
// meta.profile and match the profiles' key constraints. The IG makes the
// ECOSYSTEM the subject (a Location), not a Patient — which is exactly the
// non-patient-subject modelling this project needs.
//
//   - Monitoring site   -> Location     (LocationOah — THE SUBJECT; coordinates)
//   - Macroinvert sample -> Specimen    (SpecimenOah — collected from the Location)
//   - Biotic assessment -> Observation  (ObservationIndicatorsOah; subject=Location,
//                                         specimen=Specimen; taxa = components)
//   - Data reliability   -> Observation (derivedFrom the biotic Observation)
//   - One Health flags   -> Observation (ObservationIndicatorsOah; subject=Location,
//                                         qualitative CodeableConcept values only,
//                                         derivedFrom the biotic Observation)
//   - All of the above   -> Bundle (collection) with resolvable urn:uuid refs
//
// WHY Location-as-subject (and not Group): the IG's ObservationIndicatorsOah
// constrains subject to Reference(LocationOah) — the monitored ecosystem IS the
// subject. The previous Group+Observation.focus workaround is removed: GroupOah
// in the IG models cohorts of PEOPLE (type #person), not ecosystems, so a Group
// is the wrong resource for a stream. Base FHIR R4 permits a Location subject on
// an Observation, confirmed structurally valid (0 errors) on the public HAPI R4
// $validate.
//
// WHY One Health is an Observation (not a RiskAssessment): the official IG is
// Observation-centric and has no RiskAssessment profile; and base R4
// RiskAssessment.subject is 1..1 Reference(Patient|Group) only — it cannot carry
// a Location subject without forcing a semantically-wrong Group back in. Modeling
// the One Health layer as a Location-subject Observation keeps it IG-aligned,
// Location-subject, and structurally valid, while staying strictly QUALITATIVE
// (CodeableConcept values + caveat note; never a numeric risk or diagnosis).
//
// This module is pure (no network). buildBundle() constructs the Bundle;
// validateBundle() does structural checks (required fields + internal refs
// resolve) so we can prove validity in tests and in the UI.

import { scoreAssessment } from './biotic-index.js';
import { scoreReliability } from './reliability.js';
import { translateOneHealth } from './one-health.js';
import { getTaxon } from './taxa.js';

// Custom CodeSystem for Bahari-specific concepts that have no standard
// equivalent yet. Namespaced under the project's real published identity
// (repo: github.com/lewisawe/bahari) so it is a resolvable, non-placeholder URL.
const SYS = 'https://lewisawe.github.io/bahari/fhir/CodeSystem/stream-health';

// Identifier system for the monitoring site (project-namespaced, non-placeholder).
const SITE_ID_SYSTEM = 'https://lewisawe.github.io/bahari/fhir/monitoring-site';

// Official OneAquaHealth HL7 FHIR IG (github.com/hl7-eu/oah),
// canonical base http://hl7.eu/fhir/ig/oah.
const IG = 'http://hl7.eu/fhir/ig/oah/StructureDefinition';
const PROFILE_LOCATION = `${IG}/location-oah`;
const PROFILE_OBS_IND = `${IG}/observation-indicators-oah`;
const PROFILE_SPECIMEN = `${IG}/specimen-oah`;

const PROFILE_LABELS = new Map([
  [PROFILE_LOCATION, 'LocationOah'],
  [PROFILE_OBS_IND, 'ObservationIndicatorsOah'],
  [PROFILE_SPECIMEN, 'SpecimenOah'],
]);
const AI_PROVIDERS = new Set(['nova-vision', 'stub', 'stub-fallback']);
const AI_POLICY_STATUSES = new Set(['defer', 'review', 'suggested']);
const AI_OUTCOMES = new Set(['agreement', 'disagreement', 'defer']);
const AI_COMPONENT_CODES = new Set([
  'reviewed-human-taxon',
  'model-taxon',
  'model-confidence',
  'model-policy-status',
  'comparison-outcome',
  'model-provider',
]);
const AI_NOT_INCLUDED = 'AI provenance is not included in this export.';

/**
 * Return whether untrusted AI review data can be exported as provenance.
 * @param {unknown} aiReview
 * @param {unknown} photoId
 * @param {unknown} counts
 * @returns {boolean}
 */
export function isExportableAiReview(aiReview, photoId, counts) {
  try {
    if (!isObject(aiReview) || !isObject(aiReview.human) || !isObject(aiReview.model)) return false;
    if (!isObject(counts)) return false;

    const { human, model } = aiReview;
    const humanTaxon = typeof human.taxonId === 'string' ? getTaxon(human.taxonId) : null;
    if (!humanTaxon || !Number.isFinite(counts[humanTaxon.id]) || counts[humanTaxon.id] <= 0) return false;
    if (human.source !== 'citizen-count' || !validDateTime(human.confirmedAt)) return false;
    if (typeof photoId !== 'string' || photoId.length === 0 || model.photoId !== photoId) return false;

    const modelTaxon = model.taxonId === null
      ? null
      : typeof model.taxonId === 'string'
        ? getTaxon(model.taxonId)
        : undefined;
    if (modelTaxon === undefined || (model.taxonId !== null && !modelTaxon)) return false;
    if (typeof model.confidence !== 'number' || !Number.isFinite(model.confidence) || model.confidence < 0 || model.confidence > 1) return false;
    if (!AI_PROVIDERS.has(model.provider) || !AI_POLICY_STATUSES.has(model.policyStatus)) return false;
    if (!validDateTime(model.analyzedAt) || !AI_OUTCOMES.has(aiReview.outcome)) return false;

    const expectedPolicy = modelTaxon === null || model.confidence < 0.5
      ? 'defer'
      : model.confidence < 0.75
        ? 'review'
        : 'suggested';
    if (model.policyStatus !== expectedPolicy) return false;

    const expectedOutcome = expectedPolicy === 'defer'
      ? 'defer'
      : modelTaxon.id === humanTaxon.id
        ? 'agreement'
        : 'disagreement';
    return aiReview.outcome === expectedOutcome;
  } catch {
    return false;
  }
}

/**
 * Build a FHIR R4 Bundle from an assessment.
 * @param {{
 *   stream: {id:string, name:string, country?:string, lat:number, lon:number},
 *   counts: Object.<string, number>,
 *   submission: object,          // for reliability (see reliability.js)
 *   context: object,             // for One Health (see one-health.js)
 *   aiReview?: object,           // guarded advisory provenance
 *   photoId?: string|null,       // must exactly match aiReview.model.photoId
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
    aiReview = null,
    photoId = null,
    when = new Date().toISOString(),
    idGen = defaultUuid,
  } = input || {};

  const biotic = scoreAssessment(counts);
  const reliability = scoreReliability(submission);
  const oneHealth = translateOneHealth({ classKey: biotic.classKey, context });

  // urn:uuid refs so entries reference each other within the bundle.
  const locId = `urn:uuid:${idGen()}`;
  const specimenId = `urn:uuid:${idGen()}`;
  const bioticId = `urn:uuid:${idGen()}`;
  const reliabilityId = `urn:uuid:${idGen()}`;
  const oneHealthId = `urn:uuid:${idGen()}`;
  const exportableAiReview = isExportableAiReview(aiReview, photoId, counts);
  const aiReviewId = exportableAiReview ? `urn:uuid:${idGen()}` : null;

  const entries = [];

  // 1) Location (LocationOah) — the monitoring site AS THE SUBJECT of the record.
  //    IG key constraints: identifier 1.., name 1.., mode fixed #instance,
  //    position.latitude 1..1 + position.longitude 1..1. physicalType #area.
  entries.push(entry(locId, {
    resourceType: 'Location',
    meta: { profile: [PROFILE_LOCATION] },
    identifier: [{ system: SITE_ID_SYSTEM, value: stream?.id || 'unknown-site' }], // 1.. required
    status: 'active',
    name: stream?.name || 'Unnamed stream', // 1.. required
    mode: 'instance', // fixed #instance in the profile
    description: `Urban freshwater monitoring point${stream?.country ? ` (${stream.country})` : ''}`,
    physicalType: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'area', display: 'Area' }],
    },
    // position.latitude 1..1 and position.longitude 1..1 — always emit both when stream present.
    position: stream ? { longitude: stream.lon, latitude: stream.lat } : undefined,
  }));

  // 2) Specimen (SpecimenOah) — the macroinvertebrate sample collected from the
  //    Location, referenced by the biotic Observation. Only emitted when there
  //    is a biotic result, since the specimen represents the sampled community.
  //    SpecimenOah: subject 1.. only Reference(LocationOah); type (extensible);
  //    collection.collector 1..1 only Reference(PractitionerRole);
  //    collection.collected[x] dateTime 1..1.
  if (biotic.score !== null) {
    entries.push(entry(specimenId, {
      resourceType: 'Specimen',
      meta: { profile: [PROFILE_SPECIMEN] },
      status: 'available',
      type: {
        coding: [{ system: SYS, code: 'macroinvertebrate-kick-sample', display: 'Streambed macroinvertebrate kick-sample' }],
        text: 'Streambed macroinvertebrate kick-sample',
      },
      // Specimen.subject = Location: base R4 Specimen.subject allows
      // Reference(Patient | Group | Device | Substance | Location); the IG
      // narrows it to LocationOah. This ties the physical sample to the site.
      subject: { reference: locId, display: stream?.name },
      collection: {
        // The IG requires collection.collector 1..1 as Reference(PractitionerRole).
        // We have no PractitionerRole resource for an anonymous citizen and base
        // R4 Specimen.collection.collector allows only Practitioner|PractitionerRole
        // (so a Device/placeholder reference would be a target-type error). We
        // therefore satisfy collector with a display-only reference (no PII, no
        // dangling urn:uuid), which stays base-R4 structurally valid; a real
        // deployment would supply a PractitionerRole. collected[x] = dateTime.
        collector: { display: 'Citizen observer (Bahari)' },
        collectedDateTime: when,
      },
    }));
  }

  // 3) Observation (ObservationIndicatorsOah) — the biotic (ecological) assessment.
  //    KEY: subject = the Location (the ecosystem is the subject); specimen links
  //    the SpecimenOah. No Group, no focus workaround.
  if (biotic.score !== null) {
    entries.push(entry(bioticId, {
      resourceType: 'Observation',
      meta: { profile: [PROFILE_OBS_IND] },
      status: 'final', // profile fixes #final
      category: [{
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey' }],
      }],
      code: { // 1.. required
        coding: [{ system: SYS, code: 'biotic-index', display: 'Stream macroinvertebrate biotic index' }],
        text: 'Stream ecological health (biotic index)',
      },
      subject: { reference: locId, display: stream?.name }, // KEY: Location is the subject
      effectiveDateTime: when, // effective[x] 1..
      // performer 1.. (required by the IG). We represent the anonymous citizen
      // observer as a DISPLAY-ONLY performer (no reference), exactly as the
      // official IG's own ObservationIndicatorsOah examples do
      // (`performer.display = "..."`). base R4 Observation.performer excludes
      // Device, so a Device reference would be a target-type error; a display-
      // only performer carries no PII and is base-R4 structurally valid.
      performer: [{ display: 'Citizen observer (Bahari)' }],
      specimen: { reference: specimenId }, // link to SpecimenOah
      valueQuantity: { // value[x] = Quantity (biotic score)
        value: biotic.score, unit: 'sensitivity (1-10)', system: SYS, code: 'biotic-score',
      },
      interpretation: [{
        coding: [{ system: SYS, code: biotic.classKey, display: biotic.classInfo?.label }],
        text: biotic.classInfo?.blurb,
      }],
      method: {
        text: 'Average pollution-sensitivity of indicator groups found (miniSASS/SASS/SIGNAL family)',
      },
      // each indicator group found -> a component with its count (component.value[x] Quantity)
      component: biotic.contributions.map((c) => ({
        code: {
          coding: [{ system: SYS, code: `taxon-${c.id}`, display: c.commonName }],
          text: `${c.commonName} (${c.scientificGroup})`,
        },
        valueQuantity: { value: c.count, unit: 'individuals', system: SYS, code: 'count' },
      })),
    }));
  }

  // Advisory AI provenance stays separate from the citizen-authored count.
  // It is deliberately unprofiled and is emitted only after the total guard
  // proves that the review matches the current photo, count, and policy.
  if (exportableAiReview) {
    const humanTaxon = getTaxon(aiReview.human.taxonId);
    const modelTaxon = aiReview.model.taxonId === null ? null : getTaxon(aiReview.model.taxonId);
    const components = [
      aiCodeableComponent('reviewed-human-taxon', `taxon-${humanTaxon.id}`, humanTaxon.commonName),
      ...(modelTaxon
        ? [aiCodeableComponent('model-taxon', `taxon-${modelTaxon.id}`, modelTaxon.commonName)]
        : []),
      {
        code: bahariCode('model-confidence', 'Model confidence'),
        valueQuantity: {
          value: aiReview.model.confidence,
          unit: '1',
          system: 'http://unitsofmeasure.org',
          code: '1',
        },
      },
      aiCodeableComponent('model-policy-status', aiReview.model.policyStatus),
      aiCodeableComponent('comparison-outcome', aiReview.outcome),
      aiCodeableComponent('model-provider', aiReview.model.provider),
    ];
    const notes = Array.isArray(aiReview.model.cues)
      ? aiReview.model.cues
        .filter((cue) => typeof cue === 'string' && cue.trim())
        .map((cue) => ({ text: cue.trim() }))
      : [];

    entries.push(entry(aiReviewId, {
      resourceType: 'Observation',
      status: 'final',
      code: bahariCode('ai-identification-second-opinion', 'AI identification second opinion'),
      subject: { reference: locId, display: stream?.name },
      specimen: { reference: specimenId },
      effectiveDateTime: aiReview.model.analyzedAt,
      derivedFrom: [{ reference: bioticId }],
      component: components,
      ...(notes.length ? { note: notes } : {}),
    }));
  }

  // 4) Observation — data reliability of the citizen submission. Kept as a plain
  //    Observation (derivedFrom the biotic one); its subject is the Location too.
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

  // 5) Observation — the One Health considerations (qualitative, caveated).
  //    MODELING NOTE: Bahari's One Health layer is modeled as an
  //    ObservationIndicatorsOah (Location-subject Observation), NOT a
  //    RiskAssessment. Rationale: the official OneAquaHealth IG has no
  //    RiskAssessment profile and is Observation-centric (every indicator is a
  //    Location-subject Observation); and base R4 RiskAssessment.subject is
  //    1..1 Reference(Patient|Group) only, which cannot carry a Location subject
  //    and would force a semantically-wrong Group back in. An Observation keeps
  //    the ecosystem (Location) as the subject, stays IG-aligned, and validates
  //    with 0 structural errors on HAPI R4. The considerations are QUALITATIVE
  //    ONLY — each is a component with a CodeableConcept value (the consideration
  //    level) and the reason/basis/limits text; there is NEVER a numeric risk or
  //    probability of illness, and the honesty caveat is carried as a note.
  entries.push(entry(oneHealthId, {
    resourceType: 'Observation',
    meta: { profile: [PROFILE_OBS_IND] },
    status: 'final',
    category: [{
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey' }],
    }],
    code: {
      coding: [{ system: SYS, code: 'one-health-assessment', display: 'One Health consideration set' }],
      text: 'One Health considerations (qualitative)',
    },
    subject: { reference: locId, display: stream?.name },
    effectiveDateTime: when,
    performer: [{ display: 'Citizen observer (Bahari)' }],
    // overall qualitative value for the consideration set (no numeric risk)
    valueCodeableConcept: {
      coding: [{ system: SYS, code: `one-health-${oneHealth.overall}`, display: cap(oneHealth.overall) }],
      text: oneHealth.summary,
    },
    // provenance: derived from the biotic Observation (the ecological signal)
    ...(biotic.score !== null ? { derivedFrom: [{ reference: bioticId }] } : {}),
    // each consideration -> a component carrying a QUALITATIVE CodeableConcept
    // value (its level) plus the reason/basis/limits as text. No probabilities.
    component: oneHealth.flags.map((f) => ({
      code: {
        coding: [{ system: SYS, code: `one-health-${f.id}`, display: `[${f.audience}] ${f.title}` }],
        text: `[${f.audience}] ${f.title}`,
      },
      valueCodeableConcept: {
        coding: [{ system: SYS, code: f.level, display: cap(f.level) }],
        text: f.reason,
      },
      // reason/basis/limits preserved so each consideration states why + limits
      interpretation: [{ text: `${f.basis} Limits: ${f.limits}` }],
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
 * Derive a display model strictly from evidence present in a Bundle.
 * @param {unknown} bundle
 * @returns {{resourceCounts:Object.<string,number>,resources:object[],profiles:object[],relationships:object[],oneHealth:object|null,aiProvenance:object|null,aiProvenanceMessage:string|null}}
 */
export function inspectBundle(bundle) {
  const indexed = new Map();
  if (isObject(bundle) && Array.isArray(bundle.entry)) {
    for (const item of bundle.entry) {
      if (
        isObject(item) &&
        typeof item.fullUrl === 'string' &&
        item.fullUrl &&
        isObject(item.resource) &&
        typeof item.resource.resourceType === 'string' &&
        item.resource.resourceType
      ) {
        indexed.set(item.fullUrl, item.resource);
      }
    }
  }

  const resourceCounts = {};
  const resources = [];
  const profiles = [];
  const relationships = [];
  for (const [fullUrl, resource] of indexed) {
    resourceCounts[resource.resourceType] = (resourceCounts[resource.resourceType] || 0) + 1;
    const label = resourceLabel(resource);
    resources.push({ fullUrl, resourceType: resource.resourceType, label });

    if (Array.isArray(resource.meta?.profile)) {
      for (const profile of resource.meta.profile) {
        const profileLabel = PROFILE_LABELS.get(profile);
        if (profileLabel) profiles.push({ fullUrl, resourceType: resource.resourceType, profile, label: profileLabel });
      }
    }

    addRelationship(relationships, indexed, { fullUrl, resource, label }, 'subject', resource.subject?.reference);
    addRelationship(relationships, indexed, { fullUrl, resource, label }, 'specimen', resource.specimen?.reference);
    if (Array.isArray(resource.derivedFrom)) {
      for (const derived of resource.derivedFrom) {
        addRelationship(relationships, indexed, { fullUrl, resource, label }, 'derivedFrom', derived?.reference);
      }
    }
  }

  const oneHealthEntry = [...indexed].find(([, resource]) =>
    resource.resourceType === 'Observation' && hasCode(resource.code, SYS, 'one-health-assessment'));
  const oneHealth = oneHealthEntry
    ? {
        fullUrl: oneHealthEntry[0],
        label: resourceLabel(oneHealthEntry[1]),
        value: readCodeableValue(oneHealthEntry[1].valueCodeableConcept),
        notes: readNotes(oneHealthEntry[1].note),
      }
    : null;

  const aiProvenance = inspectAiProvenance(indexed);
  return {
    resourceCounts,
    resources,
    profiles,
    relationships,
    oneHealth,
    aiProvenance,
    aiProvenanceMessage: aiProvenance ? null : AI_NOT_INCLUDED,
  };
}

function inspectAiProvenance(indexed) {
  try {
    const matches = [...indexed].filter(([, resource]) =>
      resource.resourceType === 'Observation' && hasExactCode(resource.code, SYS, 'ai-identification-second-opinion'));
    if (matches.length !== 1) return null;

    const [fullUrl, observation] = matches[0];
    if (observation.status !== 'final' || !validDateTime(observation.effectiveDateTime)) return null;
    if (!Array.isArray(observation.component)) return null;

    const components = new Map();
    for (const component of observation.component) {
      if (!isObject(component)) return null;
      const coding = exactCoding(component.code);
      if (!coding || coding.system !== SYS || !AI_COMPONENT_CODES.has(coding.code) || components.has(coding.code)) return null;
      components.set(coding.code, component);
    }

    const humanCode = exactValueCode(components.get('reviewed-human-taxon'));
    const policyStatus = exactValueCode(components.get('model-policy-status'));
    const outcome = exactValueCode(components.get('comparison-outcome'));
    const provider = exactValueCode(components.get('model-provider'));
    const confidence = exactConfidence(components.get('model-confidence'));
    if (!humanCode || confidence === null) return null;
    if (!AI_POLICY_STATUSES.has(policyStatus) || !AI_OUTCOMES.has(outcome) || !AI_PROVIDERS.has(provider)) return null;

    const humanTaxon = taxonFromCode(humanCode);
    if (!humanTaxon) return null;
    const modelComponent = components.get('model-taxon');
    const modelCode = modelComponent ? exactValueCode(modelComponent) : null;
    const modelTaxon = modelCode ? taxonFromCode(modelCode) : null;
    if (modelComponent && !modelTaxon) return null;

    const expectedComponentCount = policyStatus === 'defer' ? 5 : 6;
    if (components.size !== expectedComponentCount) return null;
    if (policyStatus === 'defer' ? modelComponent !== undefined : !modelTaxon) return null;

    const expectedPolicy = modelTaxon === null || confidence < 0.5
      ? 'defer'
      : confidence < 0.75
        ? 'review'
        : 'suggested';
    if (policyStatus !== expectedPolicy) return null;
    const expectedOutcome = expectedPolicy === 'defer'
      ? 'defer'
      : modelTaxon.id === humanTaxon.id
        ? 'agreement'
        : 'disagreement';
    if (outcome !== expectedOutcome) return null;

    if (!Array.isArray(observation.derivedFrom) || observation.derivedFrom.length !== 1) return null;
    const derivedFrom = observation.derivedFrom[0]?.reference;
    const humanObservation = indexed.get(derivedFrom);
    if (
      typeof derivedFrom !== 'string' ||
      humanObservation?.resourceType !== 'Observation' ||
      !hasCode(humanObservation.code, SYS, 'biotic-index') ||
      !Array.isArray(humanObservation.component) ||
      !humanObservation.component.some((component) => hasExactCode(component?.code, SYS, humanCode))
    ) return null;

    return {
      fullUrl,
      derivedFrom,
      humanTaxon: { id: humanTaxon.id, label: humanTaxon.commonName, code: humanCode },
      modelTaxon: modelTaxon
        ? { id: modelTaxon.id, label: modelTaxon.commonName, code: modelCode }
        : null,
      confidence,
      policyStatus,
      outcome,
      provider,
      analyzedAt: observation.effectiveDateTime,
      cues: readNotes(observation.note),
    };
  } catch {
    return null;
  }
}

function addRelationship(target, indexed, source, relationship, reference) {
  if (typeof reference !== 'string' || !reference) return;
  const resolvedResource = indexed.get(reference);
  target.push({
    sourceFullUrl: source.fullUrl,
    sourceType: source.resource.resourceType,
    sourceLabel: source.label,
    relationship,
    targetReference: reference,
    targetType: resolvedResource?.resourceType ?? null,
    targetLabel: resolvedResource ? resourceLabel(resolvedResource) : reference,
    resolved: Boolean(resolvedResource),
  });
}

function resourceLabel(resource) {
  if (resource.resourceType === 'Location' && typeof resource.name === 'string' && resource.name) return resource.name;
  if (resource.resourceType === 'Specimen') {
    return resource.type?.text || firstCoding(resource.type)?.display || 'Specimen';
  }
  if (resource.resourceType === 'Observation') {
    return resource.code?.text || firstCoding(resource.code)?.display || firstCoding(resource.code)?.code || 'Observation';
  }
  return resource.resourceType;
}

function bahariCode(code, display) {
  return { coding: [{ system: SYS, code, ...(display ? { display } : {}) }] };
}

function aiCodeableComponent(componentCode, valueCode, display) {
  return {
    code: bahariCode(componentCode),
    valueCodeableConcept: bahariCode(valueCode, display),
  };
}

function firstCoding(codeable) {
  return Array.isArray(codeable?.coding) ? codeable.coding.find(isObject) : null;
}

function hasCode(codeable, system, code) {
  return Array.isArray(codeable?.coding) && codeable.coding.some((coding) =>
    isObject(coding) && coding.system === system && coding.code === code);
}

function hasExactCode(codeable, system, code) {
  const coding = exactCoding(codeable);
  return Boolean(coding && coding.system === system && coding.code === code);
}

function exactCoding(codeable) {
  if (!isObject(codeable) || !Array.isArray(codeable.coding) || codeable.coding.length !== 1) return null;
  const coding = codeable.coding[0];
  return isObject(coding) && typeof coding.system === 'string' && typeof coding.code === 'string'
    ? coding
    : null;
}

function exactValueCode(component) {
  if (!isObject(component) || !hasOnlyValueField(component, 'valueCodeableConcept')) return null;
  const coding = exactCoding(component.valueCodeableConcept);
  return coding?.system === SYS ? coding.code : null;
}

function exactConfidence(component) {
  if (!isObject(component) || !hasOnlyValueField(component, 'valueQuantity') || !isObject(component.valueQuantity)) return null;
  const quantity = component.valueQuantity;
  return typeof quantity.value === 'number' && Number.isFinite(quantity.value) && quantity.value >= 0 && quantity.value <= 1 &&
    quantity.unit === '1' && quantity.system === 'http://unitsofmeasure.org' && quantity.code === '1'
    ? quantity.value
    : null;
}

function hasOnlyValueField(component, expected) {
  const valueFields = Object.keys(component).filter((key) => key.startsWith('value'));
  return valueFields.length === 1 && valueFields[0] === expected;
}

function taxonFromCode(code) {
  if (typeof code !== 'string' || !code.startsWith('taxon-')) return null;
  return getTaxon(code.slice(6)) || null;
}

function readCodeableValue(codeable) {
  const coding = firstCoding(codeable);
  return isObject(codeable)
    ? { code: typeof coding?.code === 'string' ? coding.code : null, text: typeof codeable.text === 'string' ? codeable.text : null }
    : null;
}

function readNotes(notes) {
  return Array.isArray(notes)
    ? notes.filter((note) => isObject(note) && typeof note.text === 'string').map((note) => note.text)
    : [];
}

function validDateTime(value) {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Structural validation of a Bundle we produced: required fields present and
 * every internal reference resolves to an entry. Not a full FHIR validator, but
 * enough to prove the Bundle is well-formed and self-consistent, and that the
 * IG profiles' KEY constraints are met.
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

    // required-ish fields per resource type (IG key constraints where relevant)
    if (r.resourceType === 'Observation') {
      if (!r.status) errors.push('Observation.status missing');
      if (!r.code) errors.push('Observation.code missing');
      if (!r.subject) errors.push('Observation.subject missing');
      // the biotic (indicators) Observation additionally requires effective + performer
      const isBiotic = r.code?.coding?.some((c) => c.code === 'biotic-index');
      if (isBiotic) {
        if (!r.effectiveDateTime) errors.push('Observation(biotic).effectiveDateTime missing');
        if (!Array.isArray(r.performer) || r.performer.length === 0) {
          errors.push('Observation(biotic).performer missing');
        }
      }
    }
    if (r.resourceType === 'Location') {
      // LocationOah key constraints: identifier 1.., name 1.., mode, position.
      if (!r.status) errors.push('Location.status missing');
      if (!Array.isArray(r.identifier) || r.identifier.length === 0) {
        errors.push('Location.identifier missing');
      }
      if (!r.name) errors.push('Location.name missing');
      if (!r.mode) errors.push('Location.mode missing');
      if (!r.position) errors.push('Location.position missing');
    }
    if (r.resourceType === 'Specimen') {
      // SpecimenOah: a status and a type at minimum.
      if (!r.status) errors.push('Specimen.status missing');
      if (!r.type) errors.push('Specimen.type missing');
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

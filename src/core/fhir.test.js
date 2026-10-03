import { describe, it, expect } from 'vitest';
import { buildBundle, validateBundle } from './fhir.js';
import { buildContext } from './context.js';

// Official OneAquaHealth HL7 FHIR IG profile canonicals we align to.
const PROFILE_LOCATION = 'http://hl7.eu/fhir/ig/oah/StructureDefinition/location-oah';
const PROFILE_OBS_IND = 'http://hl7.eu/fhir/ig/oah/StructureDefinition/observation-indicators-oah';
const PROFILE_SPECIMEN = 'http://hl7.eu/fhir/ig/oah/StructureDefinition/specimen-oah';

// deterministic id generator so tests are stable
function seqIdGen() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

const baseInput = () => ({
  stream: { id: 'seed-1', name: 'Bretagne stream', country: 'France', lat: 48.482, lon: -2.689 },
  counts: { stonefly: 1, mayfly: 2, snail: 3 },
  submission: {
    counts: { stonefly: 1, mayfly: 2, snail: 3 },
    photoConfirmed: true,
    location: { lat: 48.482, lon: -2.689 },
    locationOnStream: true,
    durationSec: 200,
  },
  context: buildContext({ date: new Date('2026-07-01'), landUse: 'urban', rain: { heavyRain: true, recentRainMm: 40 } }),
  when: '2026-07-01T10:00:00.000Z',
  idGen: seqIdGen(),
});

// convenience finders
const findBiotic = (b) =>
  b.entry.find(
    (e) => e.resource.resourceType === 'Observation' &&
      e.resource.code?.coding?.some((c) => c.code === 'biotic-index'),
  );
const findReliability = (b) =>
  b.entry.find((e) => e.resource.code?.coding?.some((c) => c.code === 'data-reliability'));
const findOneHealth = (b) =>
  b.entry.find((e) => e.resource.code?.coding?.some((c) => c.code === 'one-health-assessment'));

describe('buildBundle', () => {
  it('produces a collection Bundle with entries', () => {
    const b = buildBundle(baseInput());
    expect(b.resourceType).toBe('Bundle');
    expect(b.type).toBe('collection');
    expect(b.entry.length).toBeGreaterThanOrEqual(4);
  });

  it('models the ecosystem as a Location subject — no Group, no RiskAssessment, no Patient', () => {
    const b = buildBundle(baseInput());
    const types = b.entry.map((e) => e.resource.resourceType);
    expect(types).toContain('Location');
    expect(types).toContain('Observation');
    expect(types).toContain('Specimen');
    expect(types).not.toContain('Group');
    expect(types).not.toContain('Patient');
    // One Health is modeled as an Observation, NOT a RiskAssessment (IG is
    // Observation-centric; base-R4 RiskAssessment.subject cannot be a Location).
    expect(types).not.toContain('RiskAssessment');
    // No Device entry: the performer is a display-only performer (IG example style).
    expect(types).not.toContain('Device');
  });

  it('does not contain the retired bahari.example placeholder anywhere', () => {
    const b = buildBundle(baseInput());
    expect(JSON.stringify(b)).not.toMatch(/bahari\.example/);
  });

  it('Location conforms to LocationOah key constraints', () => {
    const b = buildBundle(baseInput());
    const loc = b.entry.find((e) => e.resource.resourceType === 'Location').resource;
    expect(loc.meta.profile).toContain(PROFILE_LOCATION);
    expect(Array.isArray(loc.identifier)).toBe(true);
    expect(loc.identifier.length).toBeGreaterThan(0);
    expect(loc.name).toBeTruthy();
    expect(loc.mode).toBe('instance');
    expect(loc.position.latitude).toBe(48.482);
    expect(loc.position.longitude).toBe(-2.689);
  });

  it('biotic Observation uses the Location as subject (not a Group), with IG profile + specimen + display-only performer', () => {
    const b = buildBundle(baseInput());
    const loc = b.entry.find((e) => e.resource.resourceType === 'Location');
    const specimen = b.entry.find((e) => e.resource.resourceType === 'Specimen');
    const obs = findBiotic(b).resource;

    expect(obs.meta.profile).toContain(PROFILE_OBS_IND);
    expect(obs.status).toBe('final');
    // KEY: Location is the subject (replacing the old Group + focus workaround)
    expect(obs.subject.reference).toBe(loc.fullUrl);
    expect(obs).not.toHaveProperty('focus');
    expect(obs.effectiveDateTime).toBe('2026-07-01T10:00:00.000Z');
    // performer is required (1..) and modeled display-only (IG example style),
    // with NO reference (so no Device target-type error on base R4).
    expect(obs.performer).toHaveLength(1);
    expect(obs.performer[0].display).toBeTruthy();
    expect(obs.performer[0]).not.toHaveProperty('reference');
    expect(obs.specimen.reference).toBe(specimen.fullUrl);
  });

  it('Specimen conforms to SpecimenOah and is collected from the Location', () => {
    const b = buildBundle(baseInput());
    const loc = b.entry.find((e) => e.resource.resourceType === 'Location');
    const specimen = b.entry.find((e) => e.resource.resourceType === 'Specimen').resource;
    expect(specimen.meta.profile).toContain(PROFILE_SPECIMEN);
    expect(specimen.status).toBeTruthy();
    expect(specimen.type).toBeTruthy();
    expect(specimen.subject.reference).toBe(loc.fullUrl);
  });

  it('records each taxon found as an Observation component with a count', () => {
    const b = buildBundle(baseInput());
    const obs = findBiotic(b).resource;
    expect(obs.component).toHaveLength(3); // stonefly, mayfly, snail
    const counts = obs.component.map((c) => c.valueQuantity.value).sort();
    expect(counts).toEqual([1, 2, 3]);
  });

  it('includes a reliability Observation (subject=Location) derived from the biotic one', () => {
    const b = buildBundle(baseInput());
    const loc = b.entry.find((e) => e.resource.resourceType === 'Location');
    const biotic = findBiotic(b);
    const rel = findReliability(b);
    expect(rel).toBeTruthy();
    expect(rel.resource.subject.reference).toBe(loc.fullUrl);
    expect(rel.resource.derivedFrom[0].reference).toBe(biotic.fullUrl);
  });

  it('emits One Health as a Location-subject Observation with QUALITATIVE values only (no RiskAssessment, no numeric risk)', () => {
    const b = buildBundle(baseInput());
    const loc = b.entry.find((e) => e.resource.resourceType === 'Location');
    const biotic = findBiotic(b);
    const oh = findOneHealth(b);
    expect(oh).toBeTruthy();
    const r = oh.resource;
    // It is an Observation (not a RiskAssessment), IG-profiled, Location-subject.
    expect(r.resourceType).toBe('Observation');
    expect(r.meta.profile).toContain(PROFILE_OBS_IND);
    expect(r.status).toBe('final');
    expect(r.subject.reference).toBe(loc.fullUrl);
    // Provenance: derived from the biotic Observation (the ecological signal).
    expect(r.derivedFrom[0].reference).toBe(biotic.fullUrl);
    // Qualitative overall value only — a CodeableConcept, never a numeric risk.
    expect(r.valueCodeableConcept).toBeTruthy();
    expect(r).not.toHaveProperty('valueQuantity');
    // Each consideration is a component with a QUALITATIVE CodeableConcept value
    // and reason/basis/limits text; never a probability.
    expect(r.component.length).toBeGreaterThan(0);
    for (const c of r.component) {
      expect(c.valueCodeableConcept).toBeTruthy();
      expect(c).not.toHaveProperty('valueQuantity');
    }
    // Whole-resource guard: no probability/qualitativeRisk anywhere (not a RiskAssessment).
    const asText = JSON.stringify(r);
    expect(asText).not.toMatch(/probabilityDecimal|probabilityRange|qualitativeRisk/);
  });

  it('carries the honesty caveat as a note on the One Health Observation', () => {
    const b = buildBundle(baseInput());
    const oh = findOneHealth(b).resource;
    const noteText = oh.note.map((n) => n.text).join(' ');
    expect(/not a water-quality test|not a .*diagnosis/i.test(noteText)).toBe(true);
  });

  it('omits the biotic Observation AND the Specimen when nothing was found', () => {
    const input = { ...baseInput(), counts: {}, submission: { ...baseInput().submission, counts: {} } };
    const b = buildBundle(input);
    const biotic = findBiotic(b);
    const specimen = b.entry.find((e) => e.resource.resourceType === 'Specimen');
    expect(biotic).toBeUndefined();
    expect(specimen).toBeUndefined();
    // the One Health + reliability Observations must not carry dangling refs to it
    const v = validateBundle(b);
    expect(v.valid).toBe(true);
  });
});

describe('validateBundle', () => {
  it('validates a well-formed bundle with all references resolving', () => {
    const b = buildBundle(baseInput());
    const v = validateBundle(b);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    expect(v.resourceCounts.Location).toBe(1);
    expect(v.resourceCounts.Observation).toBeGreaterThanOrEqual(3); // biotic + reliability + one-health
    expect(v.resourceCounts.Specimen).toBe(1);
    expect(v.resourceCounts.Device).toBeUndefined();
    expect(v.resourceCounts.RiskAssessment).toBeUndefined();
  });

  it('flags an unresolved reference', () => {
    const b = buildBundle(baseInput());
    // break a real reference on whichever entry has a subject
    const withSubject = b.entry.find((e) => e.resource.subject);
    withSubject.resource.subject.reference = 'urn:uuid:does-not-exist';
    const v = validateBundle(b);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /Unresolved reference/.test(e))).toBe(true);
  });

  it('rejects a non-bundle', () => {
    const v = validateBundle({ resourceType: 'Observation' });
    expect(v.valid).toBe(false);
  });

  it('flags a missing required field (biotic Observation.status)', () => {
    const b = buildBundle(baseInput());
    const obs = findBiotic(b);
    delete obs.resource.status;
    const v = validateBundle(b);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /status missing/.test(e))).toBe(true);
  });

  it('flags a Location missing an IG-required field (identifier)', () => {
    const b = buildBundle(baseInput());
    const loc = b.entry.find((e) => e.resource.resourceType === 'Location');
    delete loc.resource.identifier;
    const v = validateBundle(b);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /Location\.identifier missing/.test(e))).toBe(true);
  });
});

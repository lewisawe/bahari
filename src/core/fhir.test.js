import { describe, it, expect } from 'vitest';
import { buildBundle, validateBundle } from './fhir.js';
import { buildContext } from './context.js';

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

describe('buildBundle', () => {
  it('produces a collection Bundle with entries', () => {
    const b = buildBundle(baseInput());
    expect(b.resourceType).toBe('Bundle');
    expect(b.type).toBe('collection');
    expect(b.entry.length).toBeGreaterThanOrEqual(4);
  });

  it('models the stream subject as a Group (a valid non-patient subject, not a Patient)', () => {
    const b = buildBundle(baseInput());
    const types = b.entry.map((e) => e.resource.resourceType);
    expect(types).toContain('Group'); // the subject
    expect(types).toContain('Location'); // the geographic point
    expect(types).not.toContain('Patient');
  });

  it('biotic Observation references the Group as its subject and the Location as focus', () => {
    const b = buildBundle(baseInput());
    const group = b.entry.find((e) => e.resource.resourceType === 'Group');
    const loc = b.entry.find((e) => e.resource.resourceType === 'Location');
    const obs = b.entry.find(
      (e) => e.resource.resourceType === 'Observation' &&
        e.resource.code.coding.some((c) => c.code === 'biotic-index'),
    );
    expect(obs.resource.subject.reference).toBe(group.fullUrl);
    expect(obs.resource.focus[0].reference).toBe(loc.fullUrl);
  });

  it('records each taxon found as an Observation component with a count', () => {
    const b = buildBundle(baseInput());
    const obs = b.entry.find(
      (e) => e.resource.resourceType === 'Observation' &&
        e.resource.code.coding.some((c) => c.code === 'biotic-index'),
    );
    expect(obs.resource.component).toHaveLength(3); // stonefly, mayfly, snail
    const counts = obs.resource.component.map((c) => c.valueQuantity.value).sort();
    expect(counts).toEqual([1, 2, 3]);
  });

  it('includes a reliability Observation derived from the biotic one', () => {
    const b = buildBundle(baseInput());
    const biotic = b.entry.find(
      (e) => e.resource.code?.coding?.some((c) => c.code === 'biotic-index'),
    );
    const rel = b.entry.find(
      (e) => e.resource.code?.coding?.some((c) => c.code === 'data-reliability'),
    );
    expect(rel).toBeTruthy();
    expect(rel.resource.derivedFrom[0].reference).toBe(biotic.fullUrl);
  });

  it('emits One Health as a RiskAssessment with QUALITATIVE risk only', () => {
    const b = buildBundle(baseInput());
    const risk = b.entry.find((e) => e.resource.resourceType === 'RiskAssessment');
    expect(risk).toBeTruthy();
    expect(risk.resource.prediction.length).toBeGreaterThan(0);
    for (const p of risk.resource.prediction) {
      // qualitative only — never a numeric probability of illness
      expect(p).toHaveProperty('qualitativeRisk');
      expect(p).not.toHaveProperty('probabilityDecimal');
      expect(p).not.toHaveProperty('probabilityRange');
    }
    // basis references the biotic observation
    const biotic = b.entry.find((e) => e.resource.code?.coding?.some((c) => c.code === 'biotic-index'));
    expect(risk.resource.basis[0].reference).toBe(biotic.fullUrl);
  });

  it('carries the honesty caveat as a note on the RiskAssessment', () => {
    const b = buildBundle(baseInput());
    const risk = b.entry.find((e) => e.resource.resourceType === 'RiskAssessment');
    const noteText = risk.resource.note.map((n) => n.text).join(' ');
    expect(/not a water-quality test|not a .*diagnosis/i.test(noteText)).toBe(true);
  });

  it('omits the biotic Observation when nothing was found', () => {
    const input = { ...baseInput(), counts: {}, submission: { ...baseInput().submission, counts: {} } };
    const b = buildBundle(input);
    const biotic = b.entry.find((e) => e.resource.code?.coding?.some((c) => c.code === 'biotic-index'));
    expect(biotic).toBeUndefined();
    // and the risk/ reliability must not carry dangling references to it
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
    expect(v.resourceCounts.Observation).toBeGreaterThanOrEqual(2);
    expect(v.resourceCounts.RiskAssessment).toBe(1);
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

  it('flags a missing required field', () => {
    const b = buildBundle(baseInput());
    const obs = b.entry.find((e) => e.resource.resourceType === 'Observation');
    delete obs.resource.status;
    const v = validateBundle(b);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /status missing/.test(e))).toBe(true);
  });
});

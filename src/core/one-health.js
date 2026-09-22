// Bahari — One Health translation.
//
// This is the layer most stream tools leave out: connecting the ECOLOGICAL
// signal (biotic class) to potential HUMAN and ANIMAL health considerations —
// the "One Health" triad (environment <-> animals <-> people).
//
//   "Environment: the neglected component of the One Health triad" (Lancet):
//     https://www.thelancet.com/journals/lanplh/article/PIIS2542-5196(18)30124-4/fulltext
//
// HONESTY GUARDRAIL (non-negotiable):
//   Macroinvertebrate indices measure ECOLOGICAL stress and can be confounded
//   by other stressors — they are NOT a water test and NOT a diagnosis.
//     https://pmc.ncbi.nlm.nih.gov/articles/PMC10952762/
//   Therefore every output here is:
//     - QUALITATIVE (a "consideration"/"watch-out", never a probability of illness)
//     - EXPLAINABLE (states the reason it was raised)
//     - CAVEATED (states its basis AND its limits, every time)
//   We NEVER assert that the water causes a specific disease.
//
// Output is a list of flags. Each flag:
//   { id, audience:'human'|'animal'|'ecosystem', level:'info'|'watch'|'caution',
//     title, reason, basis, limits }
//
// Rules are transparent if/then combinations of biotic class + context. Pure +
// fully testable.

const LEVELS = { info: 0, watch: 1, caution: 2 };

// Shared caveat text reused so the limitation is stated on every flag.
const STD_LIMIT =
  'Based on which streambed invertebrates were found — an indirect indicator of ' +
  'ecological condition, not a water-quality test or a medical diagnosis. Confirm ' +
  'with proper sampling before acting.';

/**
 * @param {{
 *   classKey: 'natural'|'good'|'fair'|'poor'|'very_poor'|null,
 *   context: { season:string, landUse:string, heavyRain:boolean, recentRainMm:number|null }
 * }} input
 * @returns {{ overall:'info'|'watch'|'caution', flags:Object[], summary:string }}
 */
export function translateOneHealth({ classKey, context } = {}) {
  const ctx = context || {};
  const flags = [];

  if (!classKey) {
    return { overall: 'info', flags: [], summary: 'Record an assessment to see One Health considerations.' };
  }

  const degraded = classKey === 'poor' || classKey === 'very_poor';
  const midling = classKey === 'fair';
  const healthy = classKey === 'natural' || classKey === 'good';

  // --- Ecosystem-level (always present, frames the rest) ---
  if (healthy) {
    flags.push(mk('eco-healthy', 'ecosystem', 'info',
      'Ecosystem signal: healthy',
      'Pollution-sensitive invertebrates are present, which typically indicates a well-functioning stream.',
      'Sensitive taxa (mayfly/stonefly/caddisfly) tend to disappear first when a stream is stressed.'));
  } else if (midling) {
    flags.push(mk('eco-fair', 'ecosystem', 'watch',
      'Ecosystem signal: some stress',
      'The community is dominated by moderate-tolerance groups, suggesting the stream is under some pressure.',
      'Reduced sensitive-taxa presence can reflect pollution, habitat loss, or other stressors.'));
  } else {
    flags.push(mk('eco-degraded', 'ecosystem', 'caution',
      'Ecosystem signal: degraded',
      'Mostly pollution-tolerant groups were found, a pattern often seen where water or habitat quality is poor.',
      'Tolerant-only communities commonly indicate organic pollution or disturbance.'));
  }

  // --- Human considerations ---
  if (degraded) {
    flags.push(mk('human-contact', 'human', 'caution',
      'People: limit direct water contact here',
      'Degraded ecological condition can accompany higher microbial or pollutant loading.',
      'Poor biotic condition is associated with, but does not prove, elevated contamination.'));
  } else if (midling) {
    flags.push(mk('human-contact', 'human', 'watch',
      'People: take normal precautions',
      'Moderate stress means conditions are not pristine; sensible hygiene after contact is wise.',
      'This is general precaution, not evidence of a specific hazard.'));
  }

  // Rain amplifies runoff-borne contamination regardless of baseline class.
  if (ctx.heavyRain && !healthy) {
    flags.push(mk('human-rain', 'human', 'caution',
      'People: extra caution after recent heavy rain',
      'Recent heavy rain can wash contaminants and pathogens into the stream (runoff), temporarily raising exposure risk.',
      'Runoff effects are short-lived and site-specific; this flags a plausible window, not a measurement.',
      `Recent rain total: ${fmtRain(ctx.recentRainMm)}.`));
  }

  // Urban/agricultural land use adds context-specific human considerations.
  if (degraded && ctx.landUse === 'urban') {
    flags.push(mk('human-urban', 'human', 'watch',
      'People: urban stream — assume mixed inputs',
      'Urban streams commonly receive road runoff and sewer misconnections, which fit a degraded signal.',
      'Land-use context is a general expectation, not a site measurement.'));
  }
  if (degraded && ctx.landUse === 'agricultural') {
    flags.push(mk('human-agri', 'human', 'watch',
      'People: farmland stream — possible nutrient/pesticide inputs',
      'Agricultural catchments can contribute nutrients and pesticides that stress stream life.',
      'This reflects typical catchment inputs, not a confirmed contaminant.'));
  }

  // --- Animal considerations ---
  if (degraded) {
    flags.push(mk('animal-dogs', 'animal', 'caution',
      'Animals: keep dogs/livestock from drinking here',
      'Animals that drink from or swim in degraded streams can be exposed to pathogens or toxins.',
      'Precautionary; based on ecological condition, not on testing the water.'));
  } else if (midling) {
    flags.push(mk('animal-dogs', 'animal', 'watch',
      'Animals: watch pets around the water',
      'Some stream stress is present; supervising animals near the water is sensible.',
      'General precaution, not evidence of a specific hazard.'));
  }

  // Summer + degraded: warmer, lower flows can worsen microbial/algal conditions.
  if (ctx.season === 'summer' && degraded) {
    flags.push(mk('animal-summer', 'animal', 'watch',
      'Animals: summer conditions can worsen risk',
      'Warm, low-flow summer conditions in a degraded stream can favour harmful bacteria or algae.',
      'Seasonal expectation; not a measurement of algae or bacteria at this site.'));
  }

  const overall = flags.reduce((max, f) => (LEVELS[f.level] > LEVELS[max] ? f.level : max), 'info');
  return { overall, flags, summary: summarize(overall, classKey) };
}

function summarize(overall, classKey) {
  if (overall === 'caution')
    return 'Some caution advised: the stream signal is poor and points to considerations for people and animals nearby.';
  if (overall === 'watch')
    return 'Worth watching: the stream shows some stress with sensible precautions for people and animals.';
  return 'Reassuring signal: the stream looks healthy, with no particular One Health concerns raised.';
}

function mk(id, audience, level, title, reason, basisExtra, note) {
  return {
    id,
    audience,
    level,
    title,
    reason,
    basis: basisExtra,
    limits: STD_LIMIT,
    note: note || null,
  };
}

function fmtRain(mm) {
  return mm == null ? 'not available' : `${mm} mm over 3 days`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

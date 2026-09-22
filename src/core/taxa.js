// Bahari — simplified indicator taxa and sensitivity weights.
//
// The scoring model is the miniSASS / SASS5 / SIGNAL family: each
// macroinvertebrate group carries a pollution-SENSITIVITY weight. Groups that
// only survive in clean, well-oxygenated water score high (sensitive); groups
// that tolerate pollution score low (tolerant). A citizen records which of
// these groups they find; the average sensitivity weight across the groups
// found gives an ecological score (see biotic-index.js).
//
// We use a reduced "surrogate taxa" set (a small number of easily recognised
// groups), which is a validated citizen-science approach.
//
// Sources:
//   miniSASS method (average sensitivity of groups found):
//     https://wrcwebsite.azurewebsites.net/wp-content/uploads/mdocs/MiniSASS%20infopamphlet%20front.pdf
//   SASS5 / ASPT (average score per taxon is the most consistent metric):
//     https://www.dws.gov.za/iwqs/rhp/methods/dickens%20and%20graham.pdf
//   SIGNAL (score = pollution index / taxa richness):
//     http://data.environment.sa.gov.au/Content/Publications/macroinvertebrate_guide.pdf
//   Simplified surrogate-taxa sets are valid for citizen science (MAIV / 6-taxa):
//     https://www.mdpi.com/2073-4441/12/3/654
//     https://pubmed.ncbi.nlm.nih.gov/41314074/
//
// Weights below are on a 1..10 sensitivity scale consistent with the miniSASS
// grouping (higher = more pollution-sensitive). They are approximations of the
// published group sensitivities, adapted to a simplified citizen-facing set;
// the exact constants are shown transparently in the UI and here in source so
// the science is auditable rather than hidden.

/**
 * @typedef {Object} Taxon
 * @property {string} id            stable key used in assessments + storage
 * @property {string} commonName    jargon-free name shown to citizens
 * @property {string} scientificGroup taxonomic group (order/class)
 * @property {number} sensitivity   1..10, higher = more pollution-sensitive
 * @property {string} gbifTaxonKey  GBIF taxon key for real occurrence lookup (if any)
 * @property {string} recognise     short "how to recognise" hint for the UI
 * @property {string} tier          'sensitive' | 'moderate' | 'tolerant' (for UI grouping)
 */

/** @type {Taxon[]} */
export const TAXA = [
  {
    id: 'stonefly',
    commonName: 'Stonefly nymph',
    scientificGroup: 'Plecoptera',
    sensitivity: 10,
    gbifTaxonKey: '216',
    recognise: 'Two long tails, two claws on each leg, no gills along the belly.',
    tier: 'sensitive',
  },
  {
    id: 'mayfly',
    commonName: 'Mayfly nymph',
    scientificGroup: 'Ephemeroptera',
    sensitivity: 9,
    gbifTaxonKey: '1225',
    recognise: 'Usually three (sometimes two) tails and feathery gills along the abdomen.',
    tier: 'sensitive',
  },
  {
    id: 'caddisfly',
    commonName: 'Caddisfly larva',
    scientificGroup: 'Trichoptera',
    sensitivity: 8,
    gbifTaxonKey: '1003',
    recognise: 'Often builds a little case of sand, stones or plant bits around itself.',
    tier: 'sensitive',
  },
  {
    id: 'riffle_beetle',
    commonName: 'Riffle beetle',
    scientificGroup: 'Coleoptera (Elmidae)',
    sensitivity: 7,
    gbifTaxonKey: '1470',
    recognise: 'Small hard-shelled beetle that crawls slowly on stones in fast water.',
    tier: 'moderate',
  },
  {
    id: 'dragonfly',
    commonName: 'Dragonfly / damselfly nymph',
    scientificGroup: 'Odonata',
    sensitivity: 6,
    gbifTaxonKey: '789',
    recognise: 'Large eyes, sturdy body; damselfly has three leaf-like tail gills.',
    tier: 'moderate',
  },
  {
    id: 'freshwater_shrimp',
    commonName: 'Freshwater shrimp',
    scientificGroup: 'Amphipoda',
    sensitivity: 5,
    gbifTaxonKey: '1176',
    recognise: 'Curved, flattened side-to-side, swims on its side in short darts.',
    tier: 'moderate',
  },
  {
    id: 'snail',
    commonName: 'Water snail',
    scientificGroup: 'Gastropoda',
    sensitivity: 4,
    gbifTaxonKey: '225',
    recognise: 'Coiled or cone shell; glides slowly on plants and stones.',
    tier: 'moderate',
  },
  {
    id: 'true_fly_larva',
    commonName: 'True-fly larva (non-bloodworm)',
    scientificGroup: 'Diptera',
    sensitivity: 4,
    gbifTaxonKey: '811',
    recognise: 'Soft legless grub; many kinds, wriggles when disturbed.',
    tier: 'moderate',
  },
  {
    id: 'leech',
    commonName: 'Leech',
    scientificGroup: 'Hirudinea',
    sensitivity: 2,
    gbifTaxonKey: '',
    recognise: 'Soft, flattened, stretches and contracts; sucker at each end.',
    tier: 'tolerant',
  },
  {
    id: 'bloodworm',
    commonName: 'Bloodworm (red midge larva)',
    scientificGroup: 'Chironomidae',
    sensitivity: 2,
    gbifTaxonKey: '5872',
    recognise: 'Thin, bright red, wriggles in a figure-of-eight; lives in silt.',
    tier: 'tolerant',
  },
  {
    id: 'worm',
    commonName: 'Aquatic worm',
    scientificGroup: 'Oligochaeta',
    sensitivity: 1,
    gbifTaxonKey: '',
    recognise: 'Thin thread-like worm in mud/silt; tolerates very poor water.',
    tier: 'tolerant',
  },
];

/** Look up a taxon by id. */
export function getTaxon(id) {
  return TAXA.find((t) => t.id === id);
}

/** All valid taxon ids. */
export const TAXON_IDS = TAXA.map((t) => t.id);

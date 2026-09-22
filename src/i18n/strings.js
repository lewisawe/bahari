// Bahari — i18n string dictionaries (English + French).
//
// Light, dependency-free i18n. Keys are grouped by area. The French set must
// cover every English key (enforced by a test). Interpolation uses {name}
// placeholders resolved by the t() helper.

export const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'fr', label: 'FR', name: 'Français' },
];

export const STRINGS = {
  en: {
    'app.tagline': 'Citizen stream health',
    'nav.assess': 'Assess a stream',
    'nav.overview': 'Catchment overview',
    'nav.views': 'Views',
    'common.back': 'Back',
    'common.skip': 'Skip to content',

    'step.stream.eyebrow': 'Step 1 · Location',
    'step.stream.title': 'Which stream are you at?',
    'step.stream.intro': 'Pick a monitoring point. These are real locations from the GBIF open biodiversity database.',
    'step.stream.points': '{n} monitoring points',
    'step.stream.showMap': 'Show map',
    'step.stream.hideMap': 'Hide map',
    'step.stream.landUse': "What's around this stream?",
    'step.stream.start': 'Start assessment',
    'step.stream.overTime': 'This stream over time',

    'step.assess.eyebrow': 'Step 2 · Find',
    'step.assess.title': 'What did you find?',
    'step.assess.aiCta': 'Not sure what you found? Check a photo with AI',
    'step.assess.next': 'See stream health',

    'step.result.eyebrow': 'Step 3 · Result',
    'step.result.title': 'Stream health',
    'step.result.method': 'How this score is calculated',
    'step.result.next': 'See One Health considerations',
    'step.result.edit': 'Edit finds',
    'step.result.restart': 'New assessment',

    'step.oneHealth.eyebrow': 'Step 4 · One Health',
    'step.oneHealth.title': 'One Health considerations',
    'step.oneHealth.next': 'Create shareable record',

    'step.fhir.eyebrow': 'Step 5 · Share',
    'step.fhir.title': 'Shareable health record',
    'step.fhir.valid': 'Valid FHIR R4 Bundle',
    'step.fhir.download': 'Download FHIR record (.json)',

    'dash.eyebrow': 'Researcher view',
    'dash.title': 'Catchment overview',
    'dash.distribution': 'Health distribution',
    'dash.streams': 'Streams (most stressed first)',
  },
  fr: {
    'app.tagline': 'Santé des cours d\u2019eau citoyenne',
    'nav.assess': 'Évaluer un cours d\u2019eau',
    'nav.overview': 'Vue du bassin',
    'nav.views': 'Vues',
    'common.back': 'Retour',
    'common.skip': 'Aller au contenu',

    'step.stream.eyebrow': 'Étape 1 · Lieu',
    'step.stream.title': 'À quel cours d\u2019eau êtes-vous ?',
    'step.stream.intro': 'Choisissez un point de suivi. Ce sont de vrais lieux issus de la base de biodiversité ouverte GBIF.',
    'step.stream.points': '{n} points de suivi',
    'step.stream.showMap': 'Afficher la carte',
    'step.stream.hideMap': 'Masquer la carte',
    'step.stream.landUse': 'Qu\u2019y a-t-il autour de ce cours d\u2019eau ?',
    'step.stream.start': 'Commencer l\u2019évaluation',
    'step.stream.overTime': 'Ce cours d\u2019eau dans le temps',

    'step.assess.eyebrow': 'Étape 2 · Observer',
    'step.assess.title': 'Qu\u2019avez-vous trouvé ?',
    'step.assess.aiCta': 'Vous hésitez ? Vérifiez une photo avec l\u2019IA',
    'step.assess.next': 'Voir la santé du cours d\u2019eau',

    'step.result.eyebrow': 'Étape 3 · Résultat',
    'step.result.title': 'Santé du cours d\u2019eau',
    'step.result.method': 'Comment ce score est calculé',
    'step.result.next': 'Voir les considérations One Health',
    'step.result.edit': 'Modifier les observations',
    'step.result.restart': 'Nouvelle évaluation',

    'step.oneHealth.eyebrow': 'Étape 4 · One Health',
    'step.oneHealth.title': 'Considérations One Health',
    'step.oneHealth.next': 'Créer un enregistrement partageable',

    'step.fhir.eyebrow': 'Étape 5 · Partager',
    'step.fhir.title': 'Enregistrement de santé partageable',
    'step.fhir.valid': 'Bundle FHIR R4 valide',
    'step.fhir.download': 'Télécharger l\u2019enregistrement FHIR (.json)',

    'dash.eyebrow': 'Vue chercheur',
    'dash.title': 'Vue du bassin',
    'dash.distribution': 'Répartition de la santé',
    'dash.streams': 'Cours d\u2019eau (les plus stressés d\u2019abord)',
  },
};

export const DEFAULT_LANG = 'en';

/** Translate a key for a language, with {placeholder} interpolation. */
export function translate(lang, key, vars) {
  const dict = STRINGS[lang] || STRINGS[DEFAULT_LANG];
  let s = dict[key] ?? STRINGS[DEFAULT_LANG][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}

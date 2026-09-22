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

    'landing.eyebrow': 'Citizen science · One Health',
    'landing.h1a': 'Read a stream\u2019s health from the life in it, and turn it into',
    'landing.h1accent': 'a health record.',
    'landing.sub': 'A citizen flips a rock, counts the creatures, and Bahari produces an explainable ecological score, a One Health readout for people and animals, and a standards-compliant record a researcher can use.',
    'landing.cta': 'Assess a stream',
    'landing.ctaExplore': 'Explore the map',
    'landing.dataline': '{streams} real monitoring points across {countries} countries',
    'landing.howTitle': 'How it works',
    'landing.step1.t': 'Pick a stream',
    'landing.step1.d': 'Choose a monitoring point on a live map of real locations, colored by their latest health.',
    'landing.step2.t': 'Find the creatures',
    'landing.step2.d': 'A guided, plain-language flow. An optional AI photo check explains itself and defers to you when unsure.',
    'landing.step3.t': 'See the health score',
    'landing.step3.d': 'A transparent biotic-index score, plus a data-reliability score researchers can trust and filter on.',
    'landing.step4.t': 'Understand what it means',
    'landing.step4.d': 'Qualitative, caveated One Health considerations for people and animals. Never a diagnosis.',
    'landing.step5.t': 'Share it in a standard',
    'landing.step5.d': 'Export a valid FHIR record so an ecosystem reading can flow into real health and research systems.',
    'landing.oneHealthTitle': 'The loop most tools leave open',
    'landing.oneHealthBody': 'Stream health, animal health, and human health are one system. Bahari connects them: the life in the streambed is an early signal, and Bahari carries that signal all the way to the people and animals it affects.',
    'landing.oh.env.t': 'Environment',
    'landing.oh.env.d': 'Streambed invertebrates react to pollution long before a lab test would.',
    'landing.oh.animal.t': 'Animals',
    'landing.oh.animal.d': 'Pets and livestock that drink or swim are exposed first, and are read as a signal.',
    'landing.oh.human.t': 'People',
    'landing.oh.human.d': 'Communities downstream share the same water, so the reading reaches them too.',
    'landing.builtTitle': 'Built on real data and real standards',
    'landing.built.data.t': 'Real data',
    'landing.built.data.d': 'Stream locations and species come from the GBIF open biodiversity database; weather from Open-Meteo.',
    'landing.built.ai.t': 'Responsible AI',
    'landing.built.ai.d': 'The AI assist explains its reasoning and hands the decision to a person when it is not confident.',
    'landing.built.fhir.t': 'Health-standard output',
    'landing.built.fhir.d': 'Records export as FHIR R4 and validate cleanly against the public HAPI FHIR server.',
    'landing.built.access.t': 'Accessible and multilingual',
    'landing.built.access.d': 'WCAG AA contrast, keyboard support, and English and French out of the box.',
    'landing.closeTitle': 'Healthy waters, healthy communities. Start with one stream.',
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

    'landing.eyebrow': 'Science citoyenne · One Health',
    'landing.h1a': 'Lisez la santé d\u2019un cours d\u2019eau à travers la vie qu\u2019il abrite, et transformez-la en',
    'landing.h1accent': 'un dossier de santé.',
    'landing.sub': 'Un citoyen retourne une pierre, compte les petites créatures, et Bahari produit un score écologique explicable, une lecture One Health pour les personnes et les animaux, et un enregistrement conforme aux normes qu\u2019un chercheur peut utiliser.',
    'landing.cta': 'Évaluer un cours d\u2019eau',
    'landing.ctaExplore': 'Explorer la carte',
    'landing.dataline': '{streams} points de suivi réels dans {countries} pays',
    'landing.howTitle': 'Comment ça marche',
    'landing.step1.t': 'Choisir un cours d\u2019eau',
    'landing.step1.d': 'Choisissez un point de suivi sur une carte de lieux réels, colorée selon leur dernière santé.',
    'landing.step2.t': 'Trouver les créatures',
    'landing.step2.d': 'Un parcours guidé en langage clair. Une vérification photo par IA s\u2019explique et vous laisse décider en cas de doute.',
    'landing.step3.t': 'Voir le score de santé',
    'landing.step3.d': 'Un score d\u2019indice biotique transparent, plus un score de fiabilité des données utile aux chercheurs.',
    'landing.step4.t': 'Comprendre ce que ça signifie',
    'landing.step4.d': 'Des considérations One Health qualitatives et nuancées pour les personnes et les animaux. Jamais un diagnostic.',
    'landing.step5.t': 'Le partager dans une norme',
    'landing.step5.d': 'Exportez un enregistrement FHIR valide pour qu\u2019une lecture d\u2019écosystème rejoigne de vrais systèmes de santé.',
    'landing.oneHealthTitle': 'La boucle que la plupart des outils laissent ouverte',
    'landing.oneHealthBody': 'La santé des cours d\u2019eau, des animaux et des humains forme un seul système. Bahari les relie : la vie du lit du cours d\u2019eau est un signal précoce, et Bahari porte ce signal jusqu\u2019aux personnes et animaux concernés.',
    'landing.oh.env.t': 'Environnement',
    'landing.oh.env.d': 'Les invertébrés du lit réagissent à la pollution bien avant un test en laboratoire.',
    'landing.oh.animal.t': 'Animaux',
    'landing.oh.animal.d': 'Les animaux qui boivent ou nagent sont exposés en premier, et servent de signal.',
    'landing.oh.human.t': 'Personnes',
    'landing.oh.human.d': 'Les communautés en aval partagent la même eau, la lecture les concerne aussi.',
    'landing.builtTitle': 'Bâti sur des données et des normes réelles',
    'landing.built.data.t': 'Données réelles',
    'landing.built.data.d': 'Les lieux et espèces viennent de la base de biodiversité ouverte GBIF ; la météo d\u2019Open-Meteo.',
    'landing.built.ai.t': 'IA responsable',
    'landing.built.ai.d': 'L\u2019assistant IA explique son raisonnement et laisse la décision à une personne en cas de doute.',
    'landing.built.fhir.t': 'Sortie aux normes de santé',
    'landing.built.fhir.d': 'Les enregistrements s\u2019exportent en FHIR R4 et se valident sans erreur sur le serveur public HAPI FHIR.',
    'landing.built.access.t': 'Accessible et multilingue',
    'landing.built.access.d': 'Contraste WCAG AA, support clavier, et anglais et français d\u2019origine.',
    'landing.closeTitle': 'Des eaux saines, des communautés saines. Commencez par un cours d\u2019eau.',
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

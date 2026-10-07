#!/usr/bin/env node
/**
 * JAWEBFLOW — CALCULATRICE DE COÛT DES PACKS
 * ============================================================================
 * Répond à une seule question : « quand un client paie un pack, combien me
 * coûte-t-il réellement ? » — pack par pack, niveau d'usage par niveau d'usage.
 *
 *   node scripts/couts-plans.mjs
 *   node scripts/couts-plans.mjs --change=140 --marge-cible=80
 *
 * Toutes les hypothèses sont en haut du fichier (HYPOTHESES) : rien n'est caché.
 * Aucune dépendance, aucun accès réseau : ce sont des maths, pas des appels API.
 *
 * Les valeurs par défaut viennent du CODE du dépôt (pas d'un guide trouvé en
 * ligne) :
 *   • quotas & plafonds ....... functions/_shared/limits.ts
 *   • pondération du quota .... supabase/migration_ai_usage.sql (8 unités = 1 conversation)
 *   • tarifs des packs ........ functions/api/slickpay.js + src/pages/PricingPage.tsx
 *   • génération du prompt ..... functions/_shared/prompt.ts (mesuré : 6 125 → 7 499 car.)
 *   • cache de contexte ....... functions/_shared/gemini-cache.ts
 */

// ───────────────────────────────────────────────────────────────────────────
// 1. HYPOTHÈSES (modifiables en ligne de commande)
// ───────────────────────────────────────────────────────────────────────────

const HYPOTHESES = {
  /** Taux de change utilisé par le dépôt pour l'affichage admin (AdminPage.tsx). */
  changeDzdParUsd: 135,

  /** Tarif officiel Gemini 3.1 Flash-Lite (vérifié le 07/10/2026). */
  prixEntreeUsdParMTok: 0.25,
  prixSortieUsdParMTok: 1.5,
  /** Lecture d'un token mis en cache = 10 % du prix d'entrée. */
  prixEntreeCacheUsdParMTok: 0.025,
  /** STOCKAGE du cache : facturé à l'heure, que le cache serve ou non. */
  prixStockageCacheUsdParMTokParHeure: 1.0,

  /** Une « conversation commerciale » facturée au client = 8 unités de quota. */
  unitesParConversation: 8,

  /** Tokens du prompt système stable (mesuré sur le code : 6 125 → 7 499 car.). */
  tokensPromptSysteme: 1600,

  /** Packs vendus : quota en conversations, plafond de coût IA, prix. */
  packs: [
    { id: 'free',       libelle: 'Découverte',    prixDzd: 0,     quotaConversations: 0,    capUsd: 0 },
    { id: 'basic',      libelle: 'Basic',         prixDzd: 6850,  quotaConversations: 1000, capUsd: 3 },
    { id: 'pro',        libelle: 'Pro/Business',  prixDzd: 18700, quotaConversations: 5000, capUsd: 9 },
    { id: 'enterprise', libelle: 'Enterprise',    prixDzd: 47100, quotaConversations: null, capUsd: 30 },
  ],

  /** Profils de messages : (tokens RAG + historique) et tokens de sortie. */
  profils: [
    { id: 'leger',   libelle: 'Message simple (peu de contexte, réponse courte)', entrees: 2400, sorties: 200 },
    { id: 'typique', libelle: 'Message typique (FAQ + historique)',                entrees: 3600, sorties: 350 },
    { id: 'riche',   libelle: 'Message riche (photo, catalogue, long échange)',    entrees: 6500, sorties: 700 },
  ],
  /** Répartition supposée du trafic réel entre ces profils. */
  mixTrafic: { leger: 0.45, typique: 0.4, riche: 0.15 },

  /** Coûts fixes de la plateforme (payés par TOI, pas par client). */
  coutsFixes: [
    { libelle: 'Cloudflare Pages/Workers', usdParMois: 0,  note: 'offre gratuite : 100 000 requêtes/jour' },
    { libelle: 'Supabase',                 usdParMois: 0,  note: 'gratuit ~500 Mo ; 25 $/mois au-delà' },
    { libelle: 'Nom de domaine',           usdParMois: 0.9, note: '≈ 11 $/an' },
    { libelle: 'Modèle IA (Gemini)',       usdParMois: 0,  note: 'variable — calculé ci-dessous' },
  ],

  /** Canal WhatsApp (si ajouté, cf. docs/NOUVEAUX_CANAUX.md). */
  whatsapp: {
    rateServiceDzdParMessage: 0.54, // 0,0040 $ × 135
    messagesGratuitsParNumeroParMois: 1000,
  },
};

const arg = (nom, defaut) => {
  const brut = process.argv.find((a) => a.startsWith(`--${nom}=`));
  if (!brut) return defaut;
  const valeur = Number(brut.split('=')[1]);
  return Number.isFinite(valeur) ? valeur : defaut;
};
HYPOTHESES.changeDzdParUsd = arg('change', HYPOTHESES.changeDzdParUsd);
const MARGE_CIBLE = arg('marge-cible', 80); // % de marge brute visée

// ───────────────────────────────────────────────────────────────────────────
// 2. OUTILS
// ───────────────────────────────────────────────────────────────────────────

const usdVersDzd = (usd) => usd * HYPOTHESES.changeDzdParUsd;
const dzd = (v, decimales = 0) =>
  `${v.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} DA`;
const usd = (v, decimales = 4) => `${v.toFixed(decimales)} $`;
const centimes = (v) => `${(v * 100).toFixed(3)} ¢`;
const pct = (v) => `${v.toFixed(1)} %`;
const pad = (v, n) => String(v).padEnd(n);
const padL = (v, n) => String(v).padStart(n);

const titre = (t) => `\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`;

// ───────────────────────────────────────────────────────────────────────────
// 3. COÛT D'UN MESSAGE
// ───────────────────────────────────────────────────────────────────────────

function coutMessage(profil, { cacheChaud = false } = {}) {
  const prixEntree = cacheChaud
    ? HYPOTHESES.prixEntreeCacheUsdParMTok
    : HYPOTHESES.prixEntreeUsdParMTok;
  const tokensEntree = profil.entrees;
  const usdEntree =
    (tokensEntree * prixEntree) / 1e6 + (0 * 0); // le prompt système est inclus dans `entrees`
  const usdSortie = (profil.sorties * HYPOTHESES.prixSortieUsdParMTok) / 1e6;
  return usdEntree + usdSortie;
}

/** Coût moyen pondéré d'un message IA selon le mix de trafic. */
function coutMessageMoyen(options) {
  return HYPOTHESES.profils.reduce(
    (total, p) => total + HYPOTHESES.mixTrafic[p.id] * coutMessage(p, options),
    0,
  );
}

/**
 * Coût d'une conversation commerciale. Hypothèse PRUDENTE : on compte
 * `unitesParConversation` messages IA (8), alors qu'en réalité les messages de
 * politesse coûtent 0 unité ET aucun appel IA — le coût réel est donc un peu
 * plus bas. On préfère surestimer le coût que l'inverse.
 * (Une photo pèse 4 unités mais coûte plus cher par appel — les deux effets se
 * compensent à peu près.)
 */
const coutConversation = (options) =>
  coutMessageMoyen(options) * HYPOTHESES.unitesParConversation;

// ───────────────────────────────────────────────────────────────────────────
// 4. RAPPORT
// ───────────────────────────────────────────────────────────────────────────

const coutMoyen = coutMessageMoyen();
const coutMoyenCache = coutMessageMoyen({ cacheChaud: true });
const coutConv = coutConversation();
const coutConvCache = coutConversation({ cacheChaud: true });

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  JAWEBFLOW — COMBIEN COÛTE CHAQUE PACK, EN VRAI                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
Change utilisé : 1 $ = ${HYPOTHESES.changeDzdParUsd} DA · Gemini 3.1 Flash-Lite :
${HYPOTHESES.prixEntreeUsdParMTok} $/M entrée · ${HYPOTHESES.prixSortieUsdParMTok} $/M sortie · ${HYPOTHESES.prixEntreeCacheUsdParMTok} $/M entrée en cache`);

// --- 4.1 Coût par message -------------------------------------------------
console.log(titre('1. COÛT RÉEL D\'UN MESSAGE IA'));
console.log(
  pad('Profil', 46) + padL('entrée', 9) + padL('sortie', 8) + padL('USD', 12) + padL('DA', 10),
);
console.log('─'.repeat(85));
for (const p of HYPOTHESES.profils) {
  const c = coutMessage(p);
  console.log(
    pad(p.libelle, 46) + padL(`${p.entrees}`, 9) + padL(`${p.sorties}`, 8) +
      padL(centimes(c), 12) + padL(dzd(usdVersDzd(c), 3), 10),
  );
}
console.log('─'.repeat(85));
console.log(
  pad('MOYENNE pondérée par le trafic réel', 46) + padL(`${Math.round(
    HYPOTHESES.profils.reduce((t, p) => t + HYPOTHESES.mixTrafic[p.id] * p.entrees, 0),
  )}`, 9) +
    padL(`${Math.round(HYPOTHESES.profils.reduce((t, p) => t + HYPOTHESES.mixTrafic[p.id] * p.sorties, 0))}`, 8) +
    padL(centimes(coutMoyen), 12) + padL(dzd(usdVersDzd(coutMoyen), 3), 10),
);
console.log(`
Une « conversation commerciale » = ${HYPOTHESES.unitesParConversation} unités de quota
(photo = 4 unités, recherche produits = +2, politesse = 0 et AUCUN appel IA).
Hypothèse prudente : ${HYPOTHESES.unitesParConversation} messages IA par conversation
(les messages de politesse, eux, ne coûtent rien : 0 unité et aucun appel IA) :
   • coût réel  : ${usd(coutConv)} ≈ ${dzd(usdVersDzd(coutConv), 2)}
   • avec le cache de contexte chaud : ${usd(coutConvCache)} ≈ ${dzd(usdVersDzd(coutConvCache), 2)}`);

// --- 4.2 Le plafond de coût coupe AVANT le quota --------------------------
console.log(titre('2. LE VRAI CUL-DE-SAC : QUOTA OU PLAFOND DE COÛT ?'));
console.log(`
Le quota vendu (1 000 / 5 000 conversations) et le plafond de coût
(COST_CAP_USD_PER_PLAN dans limits.ts) sont DEUX freins différents.
C'est le plus petit des deux qui arrête l'IA.

${pad('Pack', 14)}${padL('Quota vendu', 13)}${padL('Plafond', 10)}${padL('Conv. avant', 13)}  Frein réel`);
console.log('─'.repeat(85));
for (const pack of HYPOTHESES.packs) {
  if (pack.capUsd === 0) {
    console.log(pad(pack.libelle, 14) + padL('0', 13) + padL('0 $', 10) + padL('0', 13) + '  IA désactivée (plan gratuit)');
    continue;
  }
  const convParPlafond = pack.capUsd / coutConv;
  const quota = pack.quotaConversations;
  const frein = quota === null
    ? 'plafond de coût'
    : convParPlafond < quota
      ? `⚠️ PLAFOND d'abord (${Math.round((convParPlafond / quota) * 100)} % du quota)`
      : '✅ quota vendu';
  console.log(
    pad(pack.libelle, 14) +
      padL(quota === null ? 'illimité' : quota.toLocaleString('fr-FR'), 13) +
      padL(`${pack.capUsd} $`, 10) +
      padL(`${Math.round(convParPlafond).toLocaleString('fr-FR')}`, 13) +
      `  ${frein}`,
  );
}
console.log(`
👉 Un client Basic qui consomme vraiment son forfait s'arrête vers
   ${Math.round(HYPOTHESES.packs[1].capUsd / coutConv)} conversations — pas 1 000.
   Il verra « Cet assistant a terminé son forfait pour ce mois-ci ».
   (Voir §4 du document : c'est un choix à assumer, pas un bug.)`);

// --- 4.3 Coût mensuel par pack selon l'usage ------------------------------
console.log(titre('3. CE QUE CHAQUE CLIENT COÛTE, SELON SON USAGE'));
const usages = [
  { id: 'faible', libelle: 'faible (50 conv.)', conversations: 50 },
  { id: 'moyen', libelle: 'moyen (250 conv.)', conversations: 250 },
  { id: 'fort', libelle: 'fort (1 000 conv.)', conversations: 1000 },
  { id: 'tresfort', libelle: 'très fort (3 000 conv.)', conversations: 3000 },
];
console.log(
  pad('Pack', 14) + usages.map((u) => padL(u.libelle, 20)).join('') + padL('plafond', 12),
);
console.log('─'.repeat(85));
for (const pack of HYPOTHESES.packs) {
  const ligne = usages.map((u) => {
    if (pack.capUsd === 0) return padL('IA coupée', 20);
    const coutBrut = u.conversations * coutConv;
    const coupe = pack.capUsd > 0 ? Math.min(coutBrut, pack.capUsd) : coutBrut;
    const d = usdVersDzd(coupe);
    const partPrix = pack.prixDzd > 0 ? ` (${pct((d / pack.prixDzd) * 100)})` : '';
    return padL(`${dzd(d)}${partPrix}`, 20);
  });
  console.log(
    pad(pack.libelle, 14) + ligne.join('') +
      padL(pack.capUsd > 0 ? `${dzd(usdVersDzd(pack.capUsd))}` : '—', 12),
  );
}
console.log(`
Entre parenthèses : la part du prix du pack mangée par le coût IA.
« IA coupée » = plan gratuit (aucune réponse IA). Quand le pourcentage plafonne
(5,9 % / 6,5 %), c'est que le plafond de coût a déjà coupé l'IA avant.`);

// --- 4.4 Marge par pack ---------------------------------------------------
console.log(titre(`4. MARGE BRUTE PAR PACK (marge visée : ${MARGE_CIBLE} %)`));
console.log(
  pad('Pack', 14) + padL('Prix', 12) + padL('Coût pire cas', 16) + padL('Marge', 12) + padL('Marge %', 10) + padL('Verdict', 22),
);
console.log('─'.repeat(85));
for (const pack of HYPOTHESES.packs) {
  if (pack.prixDzd === 0) {
    console.log(pad(pack.libelle, 14) + padL('0 DA', 12) + padL('0 DA', 16) + padL('—', 12) + padL('—', 10) + padL('vitrine gratuite', 22));
    continue;
  }
  const cout = usdVersDzd(pack.capUsd);
  const marge = pack.prixDzd - cout;
  const margePct = (marge / pack.prixDzd) * 100;
  const verdict = margePct >= MARGE_CIBLE ? '✅ sain' : margePct >= 60 ? '⚠️ à surveiller' : '❌ trop juste';
  console.log(
    pad(pack.libelle, 14) + padL(dzd(pack.prixDzd), 12) + padL(dzd(cout), 16) + padL(dzd(marge), 12) +
      padL(pct(margePct), 10) + padL(verdict, 22),
  );
}
console.log(`
« Coût pire cas » = plafond de coût atteint, soit le maximum qu'un client peut
te coûter en IA sur le mois. S'il n'atteint jamais le plafond, tu paies moins.`);

// --- 4.5 Seuil de rentabilité --------------------------------------------
console.log(titre('5. À PARTIR DE QUEL USAGE UN PACK DEVIENT-IL NON RENTABLE ?'));
console.log(`
« Budget IA max » = ce que tu peux dépenser en IA tout en gardant ${MARGE_CIBLE} % de marge.
« Seuil non rentable » = le nombre de conversations qui épuise ce budget.
Comme le plafond coupe toujours AVANT, ces packs restent rentables tant que le
plafond n'est pas relevé.
`);
console.log(pad('Pack', 14) + padL('Budget IA max', 14) + padL('Seuil non rentable', 20) + padL('Plafond coupe à', 18));
console.log('─'.repeat(85));
for (const pack of HYPOTHESES.packs) {
  if (pack.prixDzd === 0) continue;
  const margeAutoriseeDzd = pack.prixDzd * (1 - MARGE_CIBLE / 100);
  const seuil = margeAutoriseeDzd / usdVersDzd(coutConv);
  console.log(
    pad(pack.libelle, 14) + padL(dzd(margeAutoriseeDzd), 14) + padL(`${Math.round(seuil).toLocaleString('fr-FR')} conv.`, 20) +
      padL(`${Math.round(pack.capUsd / coutConv).toLocaleString('fr-FR')} conv.`, 18),
  );
}

// --- 4.6 Le piège du cache Gemini ----------------------------------------
console.log(titre('6. LE CACHE DE CONTEXTE GEMINI : ÉCONOMIE OU PIÈGE ?'));
const tokensCaches = HYPOTHESES.tokensPromptSysteme;
const economieParMessage = (tokensCaches * (HYPOTHESES.prixEntreeUsdParMTok - HYPOTHESES.prixEntreeCacheUsdParMTok)) / 1e6;
const coutHoraireCache = (tokensCaches * HYPOTHESES.prixStockageCacheUsdParMTokParHeure) / 1e6;
const seuilHoraire = coutHoraireCache / economieParMessage;
console.log(`
La lecture d'un token en cache coûte 10× moins cher (${HYPOTHESES.prixEntreeCacheUsdParMTok} $/M au lieu de
${HYPOTHESES.prixEntreeUsdParMTok} $/M). MAIS Google facture AUSSI le STOCKAGE du cache : ${HYPOTHESES.prixStockageCacheUsdParMTokParHeure} $ / M tokens / heure,
que le cache serve ou non. Or gemini-cache.ts crée un cache de ${tokensCaches.toLocaleString('fr-FR')} tokens
avec un TTL d'1 heure, renouvelé à chaque usage.

  • économie par message   : ${centimes(economieParMessage)} ≈ ${dzd(usdVersDzd(economieParMessage), 3)}
  • coût de stockage/heure : ${centimes(coutHoraireCache)} ≈ ${dzd(usdVersDzd(coutHoraireCache), 3)}
  • SEUIL DE RENTABILITÉ   : ${seuilHoraire.toFixed(1)} messages par heure de cache vivant

👉 Sous ${seuilHoraire.toFixed(1)} messages/heure (soit ~${Math.round(seuilHoraire * 24)} messages/jour étalés),
   le cache COÛTE PLUS qu'il ne rapporte. Un assistant à 30 messages/jour :
     stockage ≈ ${dzd(usdVersDzd(coutHoraireCache * 8), 2)}/jour pour ${dzd(usdVersDzd(economieParMessage * 30), 2)} d'économie.
   Un assistant très actif (> 300 messages/jour) y gagne vraiment.
   → Le cache devrait être conditionné au VOLUME de l'assistant, pas activé pour tous.`);

// --- 4.7 Coûts fixes & amortissement -------------------------------------
console.log(titre('7. COÛTS FIXES DE LA PLATEFORME (payés par toi)'));
let fixes = 0;
for (const c of HYPOTHESES.coutsFixes) {
  fixes += c.usdParMois;
  console.log(`  • ${pad(c.libelle, 28)} ${padL(usd(c.usdParMois, 2), 10)} /mois   ${c.note}`);
}
console.log(`\n  TOTAL fixe ≈ ${usd(fixes, 2)}/mois ≈ ${dzd(usdVersDzd(fixes))}`);
for (const n of [5, 10, 25, 50, 100]) {
  console.log(`     • réparti sur ${padL(n, 3)} clients payants : ${dzd(usdVersDzd(fixes / n), 0)} par client`);
}
console.log(`
⚠️ Le compte « Supabase » et « Cloudflare » passent en payant selon le volume
(25 $/mois Supabase Pro, 5 $/mois Workers). À re-modéliser dès ~50 clients actifs.`);

// --- 4.8 Effet WhatsApp --------------------------------------------------
console.log(titre('8. SI TU AJOUTES WHATSAPP (tarif métropole Algérie du 01/10/2026)'));
const wa = HYPOTHESES.whatsapp;
console.log(`
WhatsApp facture ${dzd(wa.rateServiceDzdParMessage, 2)} par réponse du bot, après
${wa.messagesGratuitsParNumeroParMois.toLocaleString('fr-FR')} messages de service gratuits par numéro et par mois.

${pad('Usage WhatsApp', 30)}${padL('Messages/mois', 16)}${padL('Coût Meta', 14)}${padL('+ IA', 12)}${padL('Total', 14)}`);
console.log('─'.repeat(85));
for (const messages of [200, 1000, 2000, 5000, 25000]) {
  const factures = Math.max(0, messages - wa.messagesGratuitsParNumeroParMois);
  const coutMeta = factures * wa.rateServiceDzdParMessage;
  const coutIa = usdVersDzd(coutMessageMoyen() * messages);
  console.log(
    pad(`${(messages / 8).toFixed(0)} conversations`, 30) + padL(messages.toLocaleString('fr-FR'), 16) +
      padL(dzd(coutMeta), 14) + padL(dzd(coutIa), 12) + padL(dzd(coutMeta + coutIa), 14),
  );
}
console.log(`
👉 WhatsApp s'ajoute PAR-DESSUS le coût IA, et il est proportionnel au trafic.
   Un pack Basic (${dzd(6850)}) avec 5 000 messages WhatsApp/mois :
   ${dzd(wa.rateServiceDzdParMessage * 4000)} de frais Meta = ${pct((wa.rateServiceDzdParMessage * 4000) / 6850 * 100)} du prix du pack.
   → À refacturer (pass-through ou option payante), jamais à absorber en silence.`);

// --- 4.9 Conclusion ------------------------------------------------------
console.log(titre('9. CE QU\'IL FAUT RETENIR'));
console.log(`
1. Le coût IA par conversation est FAIBLE : ${dzd(usdVersDzd(coutConv), 2)} environ.
   Un client très actif (1 000 conversations) coûte ~${dzd(usdVersDzd(coutConv * 1000), 0)} en IA.
2. Ce qui protège ta marge, ce n'est PAS le quota affiché, c'est le PLAFOND DE
   COÛT en dollars. Il coupe l'IA bien avant le quota.
3. Conséquence gênante : un pack Basic vend « 1 000 conversations » mais s'arrête
   à ~${Math.round(HYPOTHESES.packs[1].capUsd / coutConv)}. C'est le seul chiffre à corriger — soit en
   baissant la promesse, soit en montant le plafond.
4. Le cache Gemini doit être piloté par le volume, sinon il coûte de l'argent.
5. WhatsApp (si tu l'ajoutes) coûtera plus cher que l'IA elle-même : à refacturer.
`);

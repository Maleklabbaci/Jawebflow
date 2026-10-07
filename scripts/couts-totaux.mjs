#!/usr/bin/env node
/**
 * JAWEBFLOW — COÛT TOTAL, TOUS FRAIS INCLUS
 * ============================================================================
 * « Ça me coûte combien exactement, avec TOUS les frais ? »
 *
 *   node scripts/couts-totaux.mjs
 *   node scripts/couts-totaux.mjs --clients=100 --slickpay=1.4
 *
 * Consolide les 5 postes de dépense réels :
 *   1. Infra fixe (domaine, Cloudflare, Supabase)
 *   2. Modèle IA (Gemini)
 *   3. WhatsApp (Meta) — service, utility, marketing
 *   4. Frais d'encaissement (SlickPay 1,4–2 % de CHAQUE paiement client)
 *   5. Mise en place (dossier Meta, numéro du client, temps de développement)
 *
 * Sources : docs/COUTS_PLANS.md (mesures IA), docs/COUTS_WHATSAPP.md (barème Meta),
 * slick-pay.com/pricing (frais d'encaissement), code du dépôt pour les prix des packs.
 */

// ───────────────────────────────────────────────────────────────────────────
// HYPOTHÈSES
// ───────────────────────────────────────────────────────────────────────────

const H = {
  change: 135, // 1 $ = 135 DA (taux utilisé par la console admin)

  /**
   * 💱 LE POSTE CACHÉ : pour payer Google (Gemini), Meta (WhatsApp), Supabase et
   * Cloudflare, il faut des DOLLARS. Or le dinar n'est pas librement convertible :
   *   • taux officiel Banque d'Algérie : ≈ 134 DA/USD (octobre 2026)
   *   • marché parallèle (Square Port-Saïd) : ≈ 240 DA/USD (octobre 2026)
   * Tant que les recettes sont en DA et les dépenses en USD, cet écart décide du
   * coût réel. Les deux taux sont affichés côte à côte ci-dessous.
   */
  tauxOfficiel: 134,
  tauxParallele: 240,

  packs: {
    basic:      { libelle: 'Basic',        prixDzd: 6850 },
    pro:        { libelle: 'Pro/Business', prixDzd: 18700 },
    enterprise: { libelle: 'Enterprise',   prixDzd: 47100 },
  },

  /** Consommation IA par conversation web (mesurée). */
  iaParConversationWeb: 1.49,
  /** WhatsApp : Meta 0,0046 $ + IA 0,19 DA = 0,81 DA après la franchise. */
  whatsappMetaParMessage: 0.62,
  iaParMessageWhatsApp: 0.186,
  whatsappFranchise: 1000,
  /** Marketing : 0,0259 $, sans franchise. */
  whatsappMarketingParMessage: 3.50,

  /** Usage supposé par plan (web + WhatsApp inclus). */
  usage: {
    basic:      { convWeb: 250, messagesWhatsApp: 0 },
    pro:        { convWeb: 200, messagesWhatsApp: 1000 },
    enterprise: { convWeb: 500, messagesWhatsApp: 5000 },
  },

  /** Répartition du portefeuille client (hypothèse, ajustable). */
  mix: { basic: 0.5, pro: 0.4, enterprise: 0.1 },

  /** Encaissement SlickPay : 1,4 % (versement mensuel) à 2 % (instantané). */
  slickpayPct: 1.6,

  /** Infra fixe. */
  domaineUsdMois: 0.9,
  supabaseProUsd: 25,
  cloudflareWorkersUsd: 5,

  /** Une ligne de conversation ≈ 8 Ko en base (message 2 000 car. + réponse 4 000 car. + index). */
  koParConversation: 8,
  /** Requêtes Cloudflare par conversation (1 par message envoyé au widget). */
  requetesParConversation: 10,
  /** Offre gratuite Cloudflare Pages Functions : 100 000 requêtes/jour. */
  requetesGratuitesParJour: 100000,
  /** Mois d'historique conservés. */
  moisHistorique: 3,
  /** Limite de l'offre gratuite Supabase. */
  supabaseGratuitMo: 500,
};

const arg = (nom, defaut) => {
  const b = process.argv.find((a) => a.startsWith(`--${nom}=`));
  if (!b) return defaut;
  const v = Number(b.split('=')[1]);
  return Number.isFinite(v) ? v : defaut;
};
H.slickpayPct = arg('slickpay', H.slickpayPct);
const CLIENT_VISE = arg('clients', 50);

const dzd = (v, d = 0) => `${v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} DA`;
const usd = (v, d = 2) => `${v.toFixed(d)} $`;
const pct = (v) => `${v.toFixed(1).replace('.', ',')} %`;
const pad = (v, n) => String(v).padEnd(n);
const padL = (v, n) => String(v).padStart(n);
const titre = (t) => `\n${'═'.repeat(88)}\n  ${t}\n${'═'.repeat(88)}`;

// ───────────────────────────────────────────────────────────────────────────
// CALCULS
// ───────────────────────────────────────────────────────────────────────────

/** Coût WhatsApp (Meta + IA) pour N messages de service inclus. */
function coutWhatsApp(messages) {
  const gratuits = Math.min(messages, H.whatsappFranchise);
  const factures = Math.max(0, messages - H.whatsappFranchise);
  return gratuits * H.iaParMessageWhatsApp + factures * (H.whatsappMetaParMessage + H.iaParMessageWhatsApp);
}

/** Coût IA web. */
const coutWeb = (conv) => conv * H.iaParConversationWeb;

/** Revenu mensuel d'un portefeuille (utilisé pour les ratios). */
const revenu0 = (clients) =>
  Object.entries(H.mix).reduce((t, [id, p]) => t + clients * p * H.packs[id].prixDzd, 0);

/** Frais d'encaissement sur un montant. */
const fraisEncaissement = (montant) => montant * (H.slickpayPct / 100);

/** Coût complet d'un client, hors frais fixes répartis. */
function coutClient(planId) {
  const u = H.usage[planId];
  const ia = coutWeb(u.convWeb) + coutWhatsApp(u.messagesWhatsApp);
  const encaissement = fraisEncaissement(H.packs[planId].prixDzd);
  return { ia, encaissement, total: ia + encaissement };
}

/** Coûts fixes mensuels selon le nombre de clients. */
/** Conversations web créées par mois, tous clients confondus. */
const conversationsMois = (clients) =>
  clients * Object.entries(H.mix).reduce((t, [id, p]) => t + p * H.usage[id].convWeb, 0);

/** Taille de la base Supabase, en Mo (Ko → Mo). */
const tailleBaseMo = (clients, mois = H.moisHistorique) =>
  (conversationsMois(clients) * H.koParConversation * mois) / 1024;

/** Requêtes Cloudflare par mois. */
const requetesMois = (clients) => conversationsMois(clients) * H.requetesParConversation;

function coûtsFixes(clients) {
  const lignes = [{ libelle: 'Nom de domaine', dzd: H.domaineUsdMois * H.change }];

  const baseMo = tailleBaseMo(clients);
  const supabasePro = baseMo > H.supabaseGratuitMo;
  lignes.push({
    libelle: supabasePro
      ? `Supabase Pro (base ≈ ${baseMo.toFixed(0)} Mo, au-delà des 500 Mo gratuits)`
      : `Supabase gratuit (base ≈ ${baseMo.toFixed(0)} Mo sur 500 Mo)`,
    dzd: supabasePro ? H.supabaseProUsd * H.change : 0,
  });

  const reqMois = requetesMois(clients);
  const cfPayant = reqMois > (H.requetesGratuitesParJour * 30) * 0.8;
  lignes.push({
    libelle: cfPayant
      ? `Cloudflare Workers (${Math.round(reqMois / 1000)} k requêtes/mois)`
      : 'Cloudflare (offre gratuite)',
    dzd: cfPayant ? H.cloudflareWorkersUsd * H.change : 0,
  });

  return { lignes, total: lignes.reduce((t, l) => t + l.dzd, 0), baseMo, reqMois };
}

/** Nombre de clients à partir duquel la base dépasse l'offre gratuite Supabase. */
const seuilSupabase = Math.ceil(
  (H.supabaseGratuitMo * 1024) /
    (Object.entries(H.mix).reduce((t, [id, p]) => t + p * H.usage[id].convWeb, 0) *
      H.koParConversation * H.moisHistorique),
);
/** Nombre de clients à partir duquel le quota Cloudflare gratuit devient juste. */
const seuilCloudflare = Math.ceil(
  (H.requetesGratuitesParJour * 30 * 0.8) /
    (Object.entries(H.mix).reduce((t, [id, p]) => t + p * H.usage[id].convWeb, 0) * H.requetesParConversation),
);

// ───────────────────────────────────────────────────────────────────────────
// RAPPORT
// ───────────────────────────────────────────────────────────────────────────

console.log(`
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  JAWEBFLOW — COÛT TOTAL, TOUS FRAIS INCLUS                                            ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
  Change : 1 $ = ${H.change} DA        Frais d'encaissement SlickPay : ${H.slickpayPct.toFixed(1).replace('.', ',')} % du montant encaissé
  Frais fixes partagés + IA + WhatsApp (Meta) + encaissement + mise en place`);

// --- 1. Les 5 postes de dépense ------------------------------------------
console.log(titre('1. LES 5 POSTES QUI TE COÛTENT DE L\'ARGENT'));
console.log(`
  ①  INFRA FIXE ................ domaine + Cloudflare + Supabase — le plus petit poste
  ②  IA (Gemini) ............... 0,186 DA par message, 1,49 DA par conversation web
  ③  WHATSAPP (Meta) ........... 0,62 DA par réponse APRÈS 1 000 gratuites/mois/numéro
                                 et 3,50 DA par message marketing, SANS franchise
  ④  ENCAISSEMENT (SlickPay) ... ${H.slickpayPct.toFixed(1).replace('.', ',')} % de CHAQUE paiement — le poste le plus gros
  ⑤  MISE EN PLACE ............. dossier Meta gratuit, mais un numéro par client
                                 et 15–25 jours de développement`);

// --- 2. Coût d'un client, plan par plan ----------------------------------
console.log(titre('2. CE QUE COÛTE UN CLIENT (tous frais variables inclus)'));
console.log(
  pad('Plan', 16) + padL('Prix', 12) + padL('IA web', 11) + padL('WhatsApp', 12) +
    padL('Encaissement', 14) + padL('COÛT TOTAL', 14) + padL('Marge', 12) + padL('Marge %', 10),
);
console.log('─'.repeat(101));
for (const planId of ['basic', 'pro', 'enterprise']) {
  const p = H.packs[planId];
  const u = H.usage[planId];
  const c = coutClient(planId);
  const wa = coutWhatsApp(u.messagesWhatsApp);
  console.log(
    pad(p.libelle, 16) + padL(dzd(p.prixDzd), 12) + padL(dzd(coutWeb(u.convWeb)), 11) +
      padL(dzd(wa), 12) + padL(dzd(c.encaissement), 14) + padL(dzd(c.total), 14) +
      padL(dzd(p.prixDzd - c.total), 12) + padL(pct(((p.prixDzd - c.total) / p.prixDzd) * 100), 10),
  );
}
console.log(`
  Usage supposé : Basic ${H.usage.basic.convWeb} conversations web · Pro ${H.usage.pro.convWeb} + ${H.usage.pro.messagesWhatsApp} messages WhatsApp ·
  Enterprise ${H.usage.enterprise.convWeb} + ${H.usage.enterprise.messagesWhatsApp} messages WhatsApp. Hors frais fixes (voir §4).`);

// --- 3. Détail WhatsApp --------------------------------------------------
console.log(titre('3. LE DÉTAIL DU POSTE WHATSAPP'));
console.log(
  pad('Messages/mois (par client)', 30) + padL('Meta', 12) + padL('IA', 11) + padL('TOTAL', 12) + padL('≈ conversations', 16),
);
console.log('─'.repeat(101));
for (const n of [500, 1000, 2000, 5000, 10000]) {
  const factures = Math.max(0, n - H.whatsappFranchise);
  console.log(
    pad(n.toLocaleString('fr-FR'), 30) + padL(dzd(factures * H.whatsappMetaParMessage), 12) +
      padL(dzd(n * H.iaParMessageWhatsApp), 11) + padL(dzd(coutWhatsApp(n)), 12) +
      padL(`${Math.round(n / 6)}`, 16),
  );
}
console.log(`
  Les ${H.whatsappFranchise} premiers messages sont GRATUITS chez Meta : offrir 1 000 messages dans Pro
  ne coûte donc que l'IA = ${dzd(coutWhatsApp(1000))} (${pct((coutWhatsApp(1000) / H.packs.pro.prixDzd) * 100)} du prix du pack).
  Une campagne marketing de 1 000 messages : ${dzd(1000 * H.whatsappMarketingParMessage)} — sans franchise, non inclus dans les plans.`);

// --- 4. Frais fixes ------------------------------------------------------
console.log(titre('4. FRAIS FIXES (payés par toi, quel que soit le nombre de clients)'));
const fixesVise = coûtsFixes(CLIENT_VISE);
console.log(`
  Pour ${CLIENT_VISE} clients (base ≈ ${fixesVise.baseMo.toFixed(0)} Mo, ${H.moisHistorique} mois d'historique conservés,
  ${Math.round(fixesVise.reqMois / 1000)} k requêtes/mois) :
`);
for (const l of fixesVise.lignes) console.log(`    • ${pad(l.libelle, 46)} ${padL(dzd(l.dzd), 10)}`);
console.log(`    ${'─'.repeat(60)}`);
console.log(`    • ${pad('TOTAL / mois', 46)} ${padL(dzd(fixesVise.total), 10)}`);
console.log(`    • ${pad('par client', 46)} ${padL(dzd(fixesVise.total / CLIENT_VISE), 10)}`);
console.log(`
  Seuils à connaître :
    • Supabase passe en payant (25 $/mois) quand la base dépasse 500 Mo — soit environ
      ${seuilSupabase} clients actifs si tu gardes ${H.moisHistorique} mois d'historique détaillé.
      → Le plus simple : purger les conversations de plus de ${H.moisHistorique} mois (la vue
        assistant_monthly_usage agrège déjà les totaux du mois, l'historique
        détaillé n'est pas indispensable pour le tableau de bord).
    • Cloudflare (Pages Functions) est gratuit jusqu'à 100 000 requêtes/jour, soit
      ~${Math.round((H.requetesGratuitesParJour * 30) / (Object.entries(H.mix).reduce((t, [id, p]) => t + p * H.usage[id].convWeb, 0) * H.requetesParConversation) / 100) * 100} clients. Le plan payant (5 $) ne devient
      nécessaire qu'au-delà de ~${seuilCloudflare} clients actifs, ou pour des limites CPU plus hautes.

  Conclusion : l'infrastructure fixe reste marginale — ${pct((fixesVise.total / revenu0(CLIENT_VISE)) * 100)} du revenu
  à ${CLIENT_VISE} clients — tant que tu purges l'historique des conversations.`);

// --- 5. Mise en place (une seule fois) -----------------------------------
console.log(titre('5. MISE EN PLACE — CE QUE ÇA COÛTE UNE SEULE FOIS'));
console.log(`
  ${pad('Poste', 40)}${padL('Coût', 16)}${padL('Qui paie', 16)}`);
console.log('─'.repeat(101));
for (const [poste, cout, qui] of [
  ['Vérification d\'entreprise Meta', '0 DA', 'toi'],
  ['App Review (permissions WhatsApp)', '0 DA', 'toi'],
  ['Statut Tech Provider / Embedded Signup', '0 DA', 'toi'],
  ['Numéro dédié par client (SIM)', '≈ 500–1 500 DA', 'le client'],
  ['Développement du canal (15–25 j)', 'ton temps', 'toi'],
  ['Meta Verified (OPTIONNEL, non requis)', 'abonnement', '—'],
]) {
  console.log(`  ${pad(poste, 40)}${padL(cout, 16)}${padL(qui, 16)}`);
}
console.log(`
  ⚠️ Le point important n'est PAS le prix, c'est la contrainte : le numéro branché sur l'API
     ne peut plus servir dans l'application WhatsApp normale. Le client doit donc accepter
     un numéro dédié (souvent une 2ᵉ SIM), ou utiliser le mode « Coexistence » s'il veut garder
     son app. C'est le premier frein à l'adoption, avant toute question de coût.`);

// --- 6. Vue plateforme ---------------------------------------------------
console.log(titre(`6. VUE D'ENSEMBLE À ${CLIENT_VISE} CLIENTS`));
const repartition = Object.entries(H.mix).map(([id, p]) => ({ id, n: CLIENT_VISE * p }));
const revenu = repartition.reduce((t, r) => t + r.n * H.packs[r.id].prixDzd, 0);
const coutsParPlan = repartition.map((r) => ({ ...r, cout: r.n * coutClient(r.id).total }));
const totalVariables = coutsParPlan.reduce((t, r) => t + r.cout, 0);
const totalFixes = coûtsFixes(CLIENT_VISE).total;
const totalGeneral = totalVariables + totalFixes;
console.log(`
  Portefeuille : ${repartition.map((r) => `${r.n} ${H.packs[r.id].libelle}`).join(' · ')}
`);
console.log(pad('Poste', 42) + padL('Par mois', 16) + padL('% du revenu', 16));
console.log('─'.repeat(101));
console.log(pad('REVENU (abonnements)', 42) + padL(dzd(revenu), 16) + padL('100 %', 16));
for (const r of coutsParPlan) {
  console.log(
    pad(`  ↳ IA + WhatsApp + encaissement · ${r.n} × ${H.packs[r.id].libelle}`, 42) +
      padL(`- ${dzd(r.cout)}`, 16) + padL(pct((r.cout / revenu) * 100), 16),
  );
}
console.log(pad('  ↳ Frais fixes (infra)', 42) + padL(`- ${dzd(totalFixes)}`, 16) + padL(pct((totalFixes / revenu) * 100), 16));
console.log('─'.repeat(101));
console.log(pad('MARGE NETTE', 42) + padL(dzd(revenu - totalGeneral), 16) + padL(pct(((revenu - totalGeneral) / revenu) * 100), 16));
console.log(`
  Détail du coût variable : encaissement ${dzd(revenu * H.slickpayPct / 100)} · IA ${dzd(
    repartition.reduce((t, r) => t + r.n * (coutWeb(H.usage[r.id].convWeb) + coutWhatsApp(H.usage[r.id].messagesWhatsApp)), 0),
  )} · dont WhatsApp ${dzd(repartition.reduce((t, r) => t + r.n * coutWhatsApp(H.usage[r.id].messagesWhatsApp), 0))}`);

// --- 7. Point mort -------------------------------------------------------
console.log(titre('7. POINT MORT ET SEUILS'));
const margeParClient = (revenu - totalVariables) / CLIENT_VISE;
const pointMort = Math.ceil(totalFixes / margeParClient);
console.log(`
  Marge par client (après tous les frais variables) : ${dzd(margeParClient)}
  Frais fixes mensuels : ${dzd(totalFixes)}
  → POINT MORT : ${pointMort} client(s).

  Autrement dit : dès le premier client, tu couvres l'infrastructure. Le vrai coût
  n'est pas l'infra, il est au §2 : ${dzd(coutClient('pro').total)} pour un client Pro, dont
  ${dzd(coutClient('pro').encaissement)} de frais d'encaissement et ${dzd(coutWhatsApp(H.usage.pro.messagesWhatsApp))} de WhatsApp.`);


// --- 9. Le poste caché : payer en dollars ---------------------------------
console.log(titre('8. LE POSTE CACHÉ : PAYER EN DOLLARS DEPUIS L\'ALGÉRIE'));

const convA = Math.round(Object.entries(H.mix).reduce((t, [id, p]) => t + p * H.usage[id].convWeb, 0) * CLIENT_VISE);
const msgsWA = Math.round(Object.entries(H.mix).reduce((t, [id, p]) => t + p * H.usage[id].messagesWhatsApp, 0) * CLIENT_VISE);
const iaDzdOfficiel = convA * H.iaParConversationWeb + msgsWA * H.iaParMessageWhatsApp;
const metaDzdOfficiel = repartition.reduce((t, r) => {
  const factures = Math.max(0, H.usage[r.id].messagesWhatsApp - H.whatsappFranchise);
  return t + r.n * factures * H.whatsappMetaParMessage;
}, 0);
const infraUsdMois = H.domaineUsdMois + (tailleBaseMo(CLIENT_VISE) > H.supabaseGratuitMo ? H.supabaseProUsd : 0) +
  (requetesMois(CLIENT_VISE) > H.requetesGratuitesParJour * 30 * 0.8 ? H.cloudflareWorkersUsd : 0);

const devisesDepart = [
  { libelle: 'IA Gemini (tokens)', dzdOfficiel: iaDzdOfficiel, usd: iaDzdOfficiel / H.tauxOfficiel },
  { libelle: 'WhatsApp — frais Meta facturés', dzdOfficiel: metaDzdOfficiel, usd: metaDzdOfficiel / H.tauxOfficiel },
  { libelle: `Infra (supabase + Cloudflare + domaine)`, dzdOfficiel: infraUsdMois * H.tauxOfficiel, usd: infraUsdMois },
];
const totalUsd = devisesDepart.reduce((t, d) => t + d.usd, 0);
console.log(`
  Dépenses mensuelles payables UNIQUEMENT en dollars (à ${CLIENT_VISE} clients) :
`);
console.log(pad('Poste', 40) + padL('en USD', 12) + padL(`à ${H.tauxOfficiel} DA`, 16) + padL(`à ${H.tauxParallele} DA`, 18) + padL('Écart', 12));
console.log('─'.repeat(101));
for (const d of devisesDepart) {
  console.log(
    pad(d.libelle, 40) + padL(usd(d.usd), 12) + padL(dzd(d.usd * H.tauxOfficiel), 16) +
      padL(dzd(d.usd * H.tauxParallele), 18) + padL(`+${dzd(d.usd * (H.tauxParallele - H.tauxOfficiel))}`, 12),
  );
}
console.log('─'.repeat(101));
console.log(
  pad('TOTAL / mois', 40) + padL(usd(totalUsd), 12) + padL(dzd(totalUsd * H.tauxOfficiel), 16) +
    padL(dzd(totalUsd * H.tauxParallele), 18) + padL(`+${dzd(totalUsd * (H.tauxParallele - H.tauxOfficiel))}`, 12),
);
console.log(`
  ⚠️ Le dinar n'est pas librement convertible : le taux officiel (~${H.tauxOfficiel} DA/USD) ne s'applique
     qu'aux opérations bancaires autorisées. L'écart avec le marché parallèle (~${H.tauxParallele} DA/USD) est de
     ${pct(((H.tauxParallele / H.tauxOfficiel) - 1) * 100)}. Selon la façon dont tu obtiens les dollars, TES coûts en DA
     changent d'autant — sans que les tarifs Meta ou Google bougent d'un centime.

  Impact sur les chiffres du §3 (le message WhatsApp) :
     • au taux officiel  : ${dzd(coutWhatsApp(1000))} pour 1 000 messages inclus dans Pro (${pct((coutWhatsApp(1000) / H.packs.pro.prixDzd) * 100)} du pack)
     • au taux parallèle : ${dzd((1000 * H.iaParMessageWhatsApp) * (H.tauxParallele / H.tauxOfficiel))} (${pct(((1000 * H.iaParMessageWhatsApp * H.tauxParallele / H.tauxOfficiel) / H.packs.pro.prixDzd) * 100)} du pack)
  → La conclusion ne change PAS (WhatsApp reste à ~1–2 % du pack), mais il faut
     bien budgéter la devise : c'est le vrai « frais caché » de ce business en Algérie.

  Voies légales à explorer auprès de ta banque (aucun conseil réglementaire ici) :
     • compte devise professionnel / allocation pour « services numériques » ;
     • encaisser une partie en devises (clients diaspora, export de services) ;
     • carte devise adossée au compte professionnel.
     Le marché parallèle est illégal et ne doit pas être un plan d'affaires.
`);

// --- 8. Réponse directe --------------------------------------------------
console.log(titre('9. LA RÉPONSE EN UNE PHRASE'));
console.log(`
  • Ajouter WhatsApp au plan Pro te coûte ${dzd(coutWhatsApp(1000))} par client et par mois
    (1 % du prix du pack), tout compris : Meta 0 DA grâce à la franchise, IA incluse.
  • Un client Pro complet (web + WhatsApp + encaissement) te coûte ${dzd(coutClient('pro').total)},
    soit ${pct((coutClient('pro').total / H.packs.pro.prixDzd) * 100)} de ce qu'il paie — et jusqu'à
    ${dzd(coutClient('pro').total + (coutClient('pro').ia * (H.tauxParallele / H.tauxOfficiel - 1)))}
    (${pct(((coutClient('pro').total + coutClient('pro').ia * (H.tauxParallele / H.tauxOfficiel - 1)) / H.packs.pro.prixDzd) * 100)}) si tu obtiens les dollars au taux parallèle.
  • Les frais fixes sont négligeables : ${dzd(coûtsFixes(CLIENT_VISE).total)} /mois à ${CLIENT_VISE} clients
    (${dzd(coûtsFixes(CLIENT_VISE).total / CLIENT_VISE)} par client).
  • Le seul poste qui grandit avec le succès, c'est l'ENCAISSEMENT (${H.slickpayPct.toFixed(1).replace('.', ',')} % du revenu) —
    pas l'IA, pas Meta. C'est aussi le seul que tu peux négocier (versement mensuel = 1,4 %).

  Variables d'ajustement : --clients=100 --slickpay=1.4
`);

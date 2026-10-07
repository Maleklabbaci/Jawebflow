#!/usr/bin/env node
/**
 * JAWEBFLOW — COÛT TOTAL, TOUS FRAIS INCLUS (taux dollar RÉEL : 270 DA)
 * ============================================================================
 * « Ça me coûte combien exactement, avec TOUS les frais ? »
 *
 *   node scripts/couts-totaux.mjs
 *   node scripts/couts-totaux.mjs --clients=100 --slickpay=1.4
 *   node scripts/couts-totaux.mjs --change=250
 *
 * ⚠️ TAUX RETENU : 270 DA / USD.
 *    Le dinar n'est pas librement convertible. Le taux officiel de la Banque
 *    d'Algérie est ≈ 134 DA/USD, mais c'est le taux auquel tu achètes
 *    RÉELLEMENT des dollars qui décide de tes coûts : ≈ 270 DA/USD.
 *    Tous les tarifs de ce script sont en USD et convertis à ce taux.
 *
 * Les 5 postes de dépense : infra, IA (Gemini), WhatsApp (Meta),
 * encaissement (SlickPay), mise en place (dossier Meta).
 */

// ───────────────────────────────────────────────────────────────────────────
// 1. TARIFS (en USD — c'est la devise dans laquelle on te facture)
// ───────────────────────────────────────────────────────────────────────────

const U = {
  /** IA : Gemini 3.1 Flash-Lite, mesuré sur le code du dépôt. */
  iaParMessage: 0.00138,          // ~0,186 DA au taux de 135
  iaParConversationWeb: 0.011,    // 8 messages

  /** WhatsApp (barème Meta du 01/10/2026, marché « Rest of Africa »). */
  waService: 0.0046,              // par message, après 1 000 gratuits/mois/numéro
  waMarketing: 0.0259,            // par message, AUCUNE franchise
  waFranchise: 1000,

  /** Infra. */
  domaine: 0.9,
  supabasePro: 25,
  cloudflare: 5,
};

const H = {
  change: 270,
  tauxOfficiel: 134,
  slickpayPct: 1.6,

  /** Les 4 packs : ce qu'ils incluent. */
  packs: [
    { id: 'free',       libelle: 'Découverte',    prixDzd: 0,     convWebInclus: 0,    waInclus: 0,    capIaUsd: 0 },
    { id: 'basic',      libelle: 'Basic',         prixDzd: 6850,  convWebInclus: 1000, waInclus: 0,    capIaUsd: 3 },
    { id: 'pro',        libelle: 'Pro/Business',  prixDzd: 18700, convWebInclus: 5000, waInclus: 1000, capIaUsd: 20 },
    { id: 'enterprise', libelle: 'Enterprise',    prixDzd: 47100, convWebInclus: null, waInclus: 5000, capIaUsd: 30 },
  ],

  /** Usage réaliste d'un client, par pack. */
  usage: {
    free:       { convWeb: 0,   wa: 0 },
    basic:      { convWeb: 250, wa: 0 },
    pro:        { convWeb: 200, wa: 1000 },
    enterprise: { convWeb: 500, wa: 5000 },
  },

  /** Répartition du portefeuille client. */
  mix: { basic: 0.5, pro: 0.4, enterprise: 0.1 },

  /** Les canaux : seul WhatsApp a des frais au message. */
  canaux: [
    { id: 'web',       libelle: 'Widget web',            fraisUsd: 0,         dev: '0 j',      etat: 'en production',   prerequis: '—' },
    { id: 'instagram', libelle: 'Instagram (DM + commentaires)', fraisUsd: 0,  dev: '0 j',      etat: 'en production',   prerequis: 'App Meta (déjà en place)' },
    { id: 'telegram',  libelle: 'Telegram',              fraisUsd: 0,         dev: '2–4 j',    etat: 'à développer',    prerequis: 'aucun (BotFather)' },
    { id: 'messenger', libelle: 'Facebook Messenger',    fraisUsd: 0,         dev: '5–8 j',    etat: 'à développer',    prerequis: 'App Review Meta (pages_messaging)' },
    { id: 'tiktok',    libelle: 'TikTok (DM + commentaires)', fraisUsd: 0,    dev: '5–10 j',   etat: 'beta, à tester',  prerequis: 'Business Messaging API + approbation' },
    { id: 'whatsapp',  libelle: 'WhatsApp',              fraisUsd: U.waService, dev: '15–25 j', etat: 'à développer',   prerequis: 'Tech Provider + vérification d\'entreprise' },
  ],

  /** Usage « et tout » : un client qui utilise plusieurs canaux. */
  usageTout: {
    basic:      { conv: 400,  wa: 0 },
    pro:        { conv: 900,  wa: 1000 },
    enterprise: { conv: 2500, wa: 5000 },
  },

  /** Infra / base de données. */
  koParConversation: 8,
  moisHistorique: 3,
  supabaseGratuitMo: 500,
  requetesParConversation: 10,
  requetesGratuitesParJour: 100000,
};

const arg = (nom, defaut) => {
  const b = process.argv.find((a) => a.startsWith(`--${nom}=`));
  if (!b) return defaut;
  const v = Number(b.split('=')[1]);
  return Number.isFinite(v) ? v : defaut;
};
H.change = arg('change', H.change);
H.slickpayPct = arg('slickpay', H.slickpayPct);
const CLIENTS = arg('clients', 50);

// ───────────────────────────────────────────────────────────────────────────
// 2. CONVERSIONS & OUTILS
// ───────────────────────────────────────────────────────────────────────────

const da = (usd) => usd * H.change;
const dzd = (v, d = 0) => `${v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} DA`;
const usd = (v, d = 2) => `${v.toFixed(d)} $`;
const pct = (v) => `${v.toFixed(1).replace('.', ',')} %`;
const pad = (v, n) => String(v).padEnd(n);
const padL = (v, n) => String(v).padStart(n);
const titre = (t) => `\n${'═'.repeat(92)}\n  ${t}\n${'═'.repeat(92)}`;

/** Coût IA (Gemini) d'un usage, en USD puis en DA. */
const iaUsd = (convWeb, wa) => convWeb * U.iaParConversationWeb + wa * U.iaParMessage;
const iaDzd = (convWeb, wa) => da(iaUsd(convWeb, wa));

/** Coût Meta (WhatsApp) d'un usage, en DA. Inclut la franchise de 1 000 messages. */
function metaDzd(wa) {
  const factures = Math.max(0, wa - U.waFranchise); // les 1 000 premiers sont gratuits
  return da(factures * U.waService);
}

/** Frais d'encaissement SlickPay. */
const encaissement = (prix) => prix * (H.slickpayPct / 100);

/** Coût total d'un pack pour son usage réaliste. */
function coutPack(pack) {
  const u = H.usage[pack.id];
  const ia = iaDzd(u.convWeb, u.wa);
  const meta = metaDzd(u.wa);
  const enc = encaissement(pack.prixDzd);
  return { ia, meta, enc, total: ia + meta + enc, u };
}

/** Pire cas : le client consomme jusqu'au plafond IA + tout le forfait WhatsApp. */
function pireCas(pack) {
  if (pack.capIaUsd === 0) return { ia: 0, meta: 0, enc: 0, total: 0, convWeb: 0 };
  // Le plafond borne le coût GEMINI total (web + WhatsApp), pas les frais Meta.
  const reste = Math.max(0, pack.capIaUsd - (pack.waInclus * U.iaParMessage));
  const convWeb = reste / U.iaParConversationWeb;
  const ia = da(pack.capIaUsd); // le plafond borne le coût Gemini
  const meta = metaDzd(pack.waInclus);
  const enc = encaissement(pack.prixDzd);
  return { ia, meta, enc, total: ia + meta + enc, convWeb };
}

/** Infra fixe. */
const conversationsMois = (clients) =>
  clients * Object.entries(H.mix).reduce((t, [id, p]) => t + p * H.usage[id].convWeb, 0);
const tailleBaseMo = (clients) =>
  (conversationsMois(clients) * H.koParConversation * H.moisHistorique) / 1024;
const requetesMois = (clients) => conversationsMois(clients) * H.requetesParConversation;
const revenu = (clients) =>
  Object.entries(H.mix).reduce((t, [id, p]) => t + clients * p * H.packs.find((x) => x.id === id).prixDzd, 0);

function infra(clients) {
  const baseMo = tailleBaseMo(clients);
  const supabase = baseMo > H.supabaseGratuitMo;
  const cf = requetesMois(clients) > U.requetesGratuitesParJour * 30 * 0.8;
  const totalUsd = U.domaine + (supabase ? U.supabasePro : 0) + (cf ? U.cloudflare : 0);
  return { baseMo, supabase, cf, totalUsd, total: da(totalUsd) };
}

// ───────────────────────────────────────────────────────────────────────────
// 3. RAPPORT
// ───────────────────────────────────────────────────────────────────────────

console.log(`
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║  JAWEBFLOW — COÛT TOTAL, TOUS FRAIS INCLUS                                                     ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
  Taux retenu : 1 $ = ${H.change} DA   (taux RÉEL d'accès au dollar — le taux officiel
                                     Banque d'Algérie est ≈ ${H.tauxOfficiel} DA, non applicable à tes achats)
  Encaissement SlickPay : ${H.slickpayPct.toFixed(1).replace('.', ',')} % du montant encaissé
  Repère : la conversion officielle affichée dans ta console (135) SOUS-ESTIME tes coûts de ${Math.round((H.change / 135 - 1) * 100)} %.`);

// --- 1. Les 5 postes -----------------------------------------------------
console.log(titre('1. LES 5 POSTES QUI TE COÛTENT DE L\'ARGENT (au taux réel)'));
console.log(`
  ①  IA (Gemini) ............... ${dzd(da(U.iaParMessage), 2)} par message · ${dzd(da(U.iaParConversationWeb), 2)} par conversation web
  ②  WHATSAPP (Meta) ........... ${dzd(da(U.waService), 2)} par réponse APRÈS ${U.waFranchise} gratuites/mois/numéro
                                 ${dzd(da(U.waMarketing), 2)} par message MARKETING, sans aucune franchise
  ③  ENCAISSEMENT (SlickPay) ... ${H.slickpayPct.toFixed(1).replace('.', ',')} % de chaque paiement client — le plus gros poste
  ④  INFRA ..................... domaine + Supabase + Cloudflare : ${dzd(infra(CLIENTS).total)}/mois à ${CLIENTS} clients
  ⑤  MISE EN PLACE ............. 0 DA chez Meta, mais un numéro par client + 15–25 j de développement`);

// --- 2. LES 4 PACKS, WHATSAPP COMPRIS ------------------------------------
console.log(titre('2. LES 4 PACKS, WHATSAPP COMPRIS — CE QU\'ILS TE COÛTENT'));
console.log(`
  Ce que chaque pack inclut (décision) :
    • Découverte  : rien (l'IA est coupée)
    • Basic       : ${dzd(6850)} · 1 000 conversations web · PAS de WhatsApp
    • Pro         : ${dzd(18700)} · 5 000 conversations web · + WhatsApp : ${U.waFranchise.toLocaleString('fr-FR')} messages/mois
    • Enterprise  : ${dzd(47100)} · conversations illimitées · + WhatsApp : 5 000 messages/mois

  Scénario A — usage RÉALISTE d'un client (Basic 250 conv. · Pro 200 conv. + 1 000 msg WhatsApp ·
  Enterprise 500 conv. + 5 000 msg WhatsApp) :
`);
console.log(
  pad('Pack', 15) + padL('Prix', 11) + padL('IA web', 10) + padL('IA WhatsApp', 12) +
    padL('Meta', 9) + padL('Encaiss.', 11) + padL('COÛT TOTAL', 13) + padL('Marge', 12) + padL('Marge %', 10),
);
console.log('─'.repeat(93));
for (const p of H.packs) {
  if (p.prixDzd === 0) {
    console.log(pad(p.libelle, 15) + padL('0 DA', 11) + padL('—', 10) + padL('—', 12) + padL('—', 9) +
      padL('—', 11) + padL('0 DA', 13) + padL('—', 12) + padL('—', 10));
    continue;
  }
  const c = coutPack(p);
  const u = H.usage[p.id];
  const iaWeb = dzd(iaDzd(u.convWeb, 0));
  const iaWa = dzd(iaDzd(0, u.wa));
  console.log(
    pad(p.libelle, 15) + padL(dzd(p.prixDzd), 11) + padL(iaWeb, 10) + padL(iaWa, 12) +
      padL(dzd(c.meta), 9) + padL(dzd(c.enc), 11) + padL(dzd(c.total), 13) +
      padL(dzd(p.prixDzd - c.total), 12) + padL(pct(((p.prixDzd - c.total) / p.prixDzd) * 100), 10),
  );
}

console.log(`
  Scénario B — usage MAXIMAL : le client consomme jusqu'au plafond IA et tout son forfait WhatsApp.
  (C'est le pire cas : le maximum que ce client peut te coûter sans dépasser.)
`);
console.log(
  pad('Pack', 15) + padL('Plafond IA', 13) + padL('Conv. web', 11) + padL('WhatsApp', 11) +
    padL('Coût IA', 11) + padL('Dont Meta', 12) + padL('DU TOTAL', 12) + padL('Marge', 12) + padL('Marge %', 10),
);
console.log('─'.repeat(93));
for (const p of H.packs) {
  if (p.prixDzd === 0) continue;
  const w = pireCas(p);
  console.log(
    pad(p.libelle, 15) + padL(usd(p.capIaUsd, 0), 13) + padL(`${Math.floor(w.convWeb).toLocaleString('fr-FR')}`, 11) +
      padL(p.waInclus ? p.waInclus.toLocaleString('fr-FR') : 'non inclus', 11) +
      padL(dzd(w.ia), 11) + padL(dzd(w.meta), 12) + padL(dzd(w.total), 12) +
      padL(dzd(p.prixDzd - w.total), 12) + padL(pct(((p.prixDzd - w.total) / p.prixDzd) * 100), 10),
  );
}
console.log(`
  ⚠️ Le plafond IA (${dzd(da(3))} pour Basic, ${dzd(da(20))} pour Pro, ${dzd(da(30))} pour Enterprise au taux réel)
     borne le coût GEMINI uniquement. Les frais Meta, eux, ne sont bornés par RIEN :
     d'où la colonne « Dont Meta » du scénario B.`);


// --- 2 bis. Les canaux ---------------------------------------------------
console.log(titre('2 bis. TOUS LES CANAUX : CE QUE CHACUN COÛTE RÉELLEMENT'));
console.log(`
  La règle qui simplifie tout : SEUL WHATSAPP a des frais au message.
  Instagram, Messenger, Telegram et TikTok ne facturent RIEN (aucun tarif au message
  chez Meta ni chez TikTok). Leur seul coût récurrent, c'est l'IA par conversation
  (${dzd(da(U.iaParConversationWeb), 2)}) — la même quelle que soit la plateforme.
`);
console.log(
  pad('Canal', 32) + padL('Frais/message', 15) + padL('Dev.', 10) + '  ' + pad('État', 16) + 'Prérequis',
);
console.log('─'.repeat(93));
for (const c of H.canaux) {
  console.log(
    pad(c.libelle, 32) +
      padL(c.fraisUsd === 0 ? 'AUCUN' : dzd(da(c.fraisUsd), 2), 15) +
      padL(c.dev, 10) + '  ' + pad(c.etat, 16) + c.prerequis,
  );
}
console.log(`
  Développement total pour « tout ajouter » : Messenger 5–8 j + Telegram 2–4 j +
  TikTok 5–10 j + WhatsApp 15–25 j = 27 à 47 jours de travail. C'est le VRAI coût de
  « et tout » — pas les frais d'API, qui sont nuls pour 3 canaux sur 4.

  À noter pour TikTok : toutes les API officielles sont gratuites, mais l'accès se paie
  en temps — compte Business obligatoire, candidature à la Business Messaging API, revue
  de sécurité des données, et l'API reste en beta restreinte (APAC, LATAM, METAP, Amérique
  du Nord — l'EEE, la Suisse et le Royaume-Uni en sont exclus). L'Algérie relève de METAP :
  éligibilité probable, à confirmer avec un compte pilote AVANT de le promettre à un client.`);

// --- 2 ter. Packs avec tous les canaux ----------------------------------
console.log(titre('2 ter. LES PACKS SI LE CLIENT UTILISE TOUS LES CANAUX'));
console.log(`
  Usage « et tout » : le commerçant reçoit des messages sur le web, Instagram, Messenger,
  Telegram et TikTok en même temps (plus de conversations), et sur WhatsApp s'il y est.
  • Basic      : ${H.usageTout.basic.conv} conversations tous canaux
  • Pro        : ${H.usageTout.pro.conv} conversations + ${H.usageTout.pro.wa.toLocaleString('fr-FR')} messages WhatsApp
  • Enterprise : ${H.usageTout.enterprise.conv.toLocaleString('fr-FR')} conversations + ${H.usageTout.enterprise.wa.toLocaleString('fr-FR')} messages WhatsApp
`);
console.log(
  pad('Pack', 15) + padL('Prix', 12) + padL('IA canaux', 12) + padL('IA WhatsApp', 12) +
    padL('Meta', 10) + padL('Encaiss.', 11) + padL('COÛT TOTAL', 13) + padL('Marge %', 10),
);
console.log('─'.repeat(93));
for (const p of H.packs) {
  if (p.prixDzd === 0) continue;
  const t = H.usageTout[p.id];
  const iaCanaux = da(t.conv * U.iaParConversationWeb);
  const iaWa = da(t.wa * U.iaParMessage);
  const meta = metaDzd(t.wa);
  const enc = encaissement(p.prixDzd);
  const total = iaCanaux + iaWa + meta + enc;
  console.log(
    pad(p.libelle, 15) + padL(dzd(p.prixDzd), 12) + padL(dzd(iaCanaux), 12) + padL(dzd(iaWa), 12) +
      padL(dzd(meta), 10) + padL(dzd(enc), 11) + padL(dzd(total), 13) +
      padL(pct(((p.prixDzd - total) / p.prixDzd) * 100), 10),
  );
}
console.log(`
  Comparé à l'usage « un seul canal » du §2, la marge baisse — non pas à cause des
  nouveaux réseaux (gratuits), mais parce que PLUS DE CANAUX = PLUS DE CONVERSATIONS,
  donc plus de tokens Gemini. C'est la seule vraie dépense que « et tout » ajoute.

  ⚠️ Conséquence à décider : les plafonds IA doivent suivre. Le plafond de Basic
     (${usd(3, 0)} = ${dzd(da(3))}) ne couvre que ${Math.floor(da(3) / da(U.iaParConversationWeb))} conversations — un commerçant
     présent sur 4 réseaux les atteint en quelques semaines. Idem pour Pro (${usd(20, 0)} = ${dzd(da(20))} :
     ${Math.floor((da(20) - H.usageTout.pro.wa * da(U.iaParMessage)) / da(U.iaParConversationWeb))} conversations après le forfait WhatsApp).`);

// --- 3. Dépassement ------------------------------------------------------
const coutMsgDepassement = da(U.waService + U.iaParMessage);
console.log(titre('3. AU-DELÀ DU FORFAIT : COMBIEN FACTURER'));
console.log(`
  Coût réel d'un message WhatsApp supplémentaire : ${dzd(coutMsgDepassement, 2)}
  (Meta ${dzd(da(U.waService), 2)} + IA ${dzd(da(U.iaParMessage), 2)})
`);
console.log(pad('Palier de recharge', 26) + padL('Coût réel', 14) + padL('Prix conseillé', 16) + padL('Marge', 10) + padL('Soit / message', 18));
console.log('─'.repeat(93));
for (const n of [1000, 5000]) {
  const cout = n * coutMsgDepassement;
  const prix = cout / 0.5;
  console.log(pad(`${n.toLocaleString('fr-FR')} messages`, 26) + padL(dzd(cout), 14) + padL(dzd(prix), 16) +
    padL('50 %', 10) + padL(dzd(prix / n, 2), 18));
}
console.log(`
  Marketing (campagnes) : ${dzd(da(U.waMarketing), 2)} de coût Meta par message, SANS IA et SANS franchise.
     1 000 messages = ${dzd(da(U.waMarketing * 1000))} de coût → à vendre ~${dzd(da(U.waMarketing * 1000) / 0.5)}.
  → Le marketing se facture TOUJOURS à part, jamais inclus dans un forfait.`);

// --- 4. Frais fixes ------------------------------------------------------
const inf = infra(CLIENTS);
console.log(titre('4. FRAIS FIXES (payés par toi, quel que soit le nombre de clients)'));
console.log(`
  Pour ${CLIENTS} clients — base ≈ ${inf.baseMo.toFixed(0)} Mo, ${Math.round(requetesMois(CLIENTS) / 1000)} k requêtes/mois :
`);
console.log(pad('Poste', 52) + padL('USD', 10) + padL('DA/mois', 13));
console.log('─'.repeat(93));
console.log(pad('Nom de domaine', 52) + padL(usd(U.domaine), 10) + padL(dzd(da(U.domaine)), 13));
console.log(pad(`Supabase ${inf.supabase ? 'Pro (base au-delà des 500 Mo gratuits)' : 'gratuit'}`, 52) +
  padL(usd(inf.supabase ? U.supabasePro : 0), 10) + padL(dzd(da(inf.supabase ? U.supabasePro : 0)), 13));
console.log(pad(`Cloudflare ${inf.cf ? 'Workers payant' : 'gratuit'}`, 52) +
  padL(usd(inf.cf ? U.cloudflare : 0), 10) + padL(dzd(da(inf.cf ? U.cloudflare : 0)), 13));
console.log('─'.repeat(93));
console.log(pad('TOTAL / mois', 52) + padL(usd(inf.totalUsd), 10) + padL(dzd(inf.total), 13));
console.log(pad('Par client', 52) + padL('', 10) + padL(dzd(inf.total / CLIENTS), 13));
console.log(`
  Seuils : Supabase payant vers ~84 clients (purger l'historique > ${H.moisHistorique} mois) ·
  Cloudflare gratuit jusqu'à ~940 clients. À ${CLIENTS} clients : ${pct((inf.total / revenu(CLIENTS)) * 100)} du revenu.`);

// --- 5. Mise en place ----------------------------------------------------
console.log(titre('5. MISE EN PLACE (une seule fois)'));
console.log(`
  ${pad('Poste', 46)}${padL('Coût', 16)}${padL('Qui paie', 14)}`);
console.log('─'.repeat(93));
for (const [poste, cout, qui] of [
  ['Vérification d\'entreprise Meta', '0 DA', 'toi'],
  ['App Review (permissions WhatsApp)', '0 DA', 'toi'],
  ['Statut Tech Provider / Embedded Signup', '0 DA', 'toi'],
  ['Numéro dédié par client (SIM)', '≈ 500–1 500 DA', 'le client'],
  ['Développement du canal (15–25 j)', 'ton temps', 'toi'],
]) console.log(`  ${pad(poste, 46)}${padL(cout, 16)}${padL(qui, 14)}`);
console.log(`
  Le vrai frein : un numéro branché sur l'API ne peut plus servir dans l'app WhatsApp
  normale. Le client doit accepter un numéro dédié (2ᵉ SIM) ou le mode « Coexistence ».`);

// --- 6. Vue plateforme ---------------------------------------------------
console.log(titre(`6. VUE D'ENSEMBLE À ${CLIENTS} CLIENTS`));
const repartition = Object.entries(H.mix).map(([id, p]) => ({
  pack: H.packs.find((x) => x.id === id), n: Math.round(CLIENTS * p),
}));
const rev = revenu(CLIENTS);
let totalVar = 0;
const lignes = repartition.map((r) => {
  const c = coutPack(r.pack);
  const t = r.n * c.total;
  totalVar += t;
  return { ...r, cout: c, total: t };
});
console.log(`
  Portefeuille : ${repartition.map((r) => `${r.n} ${r.pack.libelle}`).join(' · ')}
`);
console.log(pad('Poste', 46) + padL('Par mois', 15) + padL('% du revenu', 14));
console.log('─'.repeat(93));
console.log(pad('REVENU (abonnements)', 46) + padL(dzd(rev), 15) + padL('100 %', 14));
for (const l of lignes) {
  console.log(pad(`  ↳ ${l.n} × ${l.pack.libelle} (IA + WhatsApp + encaissement)`, 46) +
    padL(`- ${dzd(l.total)}`, 15) + padL(pct((l.total / rev) * 100), 14));
}
console.log(pad('  ↳ Frais fixes (infra)', 46) + padL(`- ${dzd(inf.total)}`, 15) + padL(pct((inf.total / rev) * 100), 14));
console.log('─'.repeat(93));
console.log(pad('MARGE NETTE', 46) + padL(dzd(rev - totalVar - inf.total), 15) +
  padL(pct(((rev - totalVar - inf.total) / rev) * 100), 14));
const encTotal = lignes.reduce((t, l) => t + l.n * l.cout.enc, 0);
const iaTotal = lignes.reduce((t, l) => t + l.n * l.cout.ia, 0);
const metaTotal = lignes.reduce((t, l) => t + l.n * l.cout.meta, 0);
console.log(`
  Détail : encaissement ${dzd(encTotal)} · IA ${dzd(iaTotal)} · Meta (WhatsApp) ${dzd(metaTotal)} · infra ${dzd(inf.total)}`);

// --- 7. Devise -----------------------------------------------------------
console.log(titre('7. POURQUOI LE TAUX DE 270 CHANGE TOUT'));
const usdMois = lignes.reduce((t, l) => t + l.n * l.cout.ia / H.change, 0) +
  lignes.reduce((t, l) => t + l.n * l.cout.meta / H.change, 0) + inf.totalUsd;
void usdMois;
const depensesUsd = [
  { libelle: 'IA Gemini (tokens)', usd: iaTotal / H.change },
  { libelle: 'WhatsApp — frais Meta', usd: metaTotal / H.change },
  { libelle: 'Infra', usd: inf.totalUsd },
];
console.log(`
  Tes recettes sont en dinars, tes fournisseurs facturent en dollars. Le taux que
  tu obtiens réellement décide de TES coûts, sans que Meta ou Google bougent d'un centime.
`);
console.log(pad('Poste', 38) + padL('en USD', 11) + padL('≈ taux officiel', 17) + padL('≈ 270 DA (réel)', 17) + padL('Surcoût', 13));
console.log('─'.repeat(93));
let totUsd = 0, totOff = 0, totReel = 0;
for (const d of depensesUsd) {
  totUsd += d.usd; totOff += d.usd * H.tauxOfficiel; totReel += d.usd * H.change;
  console.log(pad(d.libelle, 38) + padL(usd(d.usd), 11) + padL(dzd(d.usd * H.tauxOfficiel), 17) +
    padL(dzd(d.usd * H.change), 17) + padL(`+${dzd(d.usd * (H.change - H.tauxOfficiel))}`, 13));
}
console.log('─'.repeat(93));
console.log(pad('TOTAL / mois', 38) + padL(usd(totUsd), 11) + padL(dzd(totOff), 17) + padL(dzd(totReel), 17) +
  padL(`+${dzd(totReel - totOff)}`, 13));
console.log(`
  👉 L'écart (×${(H.change / H.tauxOfficiel).toFixed(2).replace('.', ',')}) est le vrai « frais caché » de ce business en Algérie.
     Conséquence : toutes les décisions se calculent au taux réel. Un poste facturé
     1 $ te coûte ${dzd(H.change)} — pas ${dzd(135)} comme l'affiche ta console admin.
     → À corriger dans l'affichage : AdminPage.tsx utilise 135 pour convertir les coûts IA.

  Pistes légales pour réduire ce poste : compte devise professionnel, allocation
  « services numériques », ou encaisser une partie en devises (clients diaspora).
  Le marché parallèle est illégal : il sert ici à mesurer un coût, pas de plan d'affaires.`);

// --- 8. Réponse ----------------------------------------------------------
console.log(titre('8. LA RÉPONSE'));
const pro = H.packs.find((p) => p.id === 'pro');
const ent = H.packs.find((p) => p.id === 'enterprise');
const cPro = coutPack(pro), wPro = pireCas(pro);
const cEnt = coutPack(ent), wEnt = pireCas(ent);
console.log(`
  AU TAUX RÉEL DE ${H.change} DA/$ :

  • WhatsApp dans le plan Pro (1 000 messages inclus)
      coût réel : ${dzd(iaDzd(200, 1000))} (part WhatsApp) — ${dzd(cPro.total)} tout compris
      pire cas  : ${dzd(wPro.total)} → ${pct((wPro.total / pro.prixDzd) * 100)} du pack

  • WhatsApp dans le plan Enterprise (5 000 messages inclus)
      coût réel : ${dzd(cEnt.total)} → ${pct((cEnt.total / ent.prixDzd) * 100)} du pack
      pire cas  : ${dzd(wEnt.total)} → ${pct((wEnt.total / ent.prixDzd) * 100)} du pack

  • Basic (sans WhatsApp) : ${dzd(coutPack(H.packs[1]).total)} → ${pct((coutPack(H.packs[1]).total / 6850) * 100)} du pack
  • Message supplémentaire : coût ${dzd(coutMsgDepassement, 2)} → à vendre ${dzd(coutMsgDepassement / 0.5, 2)}
  • Marge globale à ${CLIENTS} clients : ${pct(((rev - totalVar - inf.total) / rev) * 100)}

  ✅ La conclusion tient : WhatsApp reste ≤ ${pct((wEnt.total / ent.prixDzd) * 100)} du prix de son pack,
     même au taux réel de ${H.change} DA et même dans le pire cas.
  ⚠️ Mais deux choses doublent : l'encaissement (${dzd(encTotal)}/mois à ${CLIENTS} clients) et
     tous les coûts libellés en dollars — c'est-à-dire l'IA et Meta.

  Variables : --clients=100 --change=250 --slickpay=1.4
`);

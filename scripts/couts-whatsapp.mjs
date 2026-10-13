#!/usr/bin/env node
/**
 * JAWEBFLOW — CALCULATRICE DU CANAL WHATSAPP
 * ============================================================================
 * Répond à : « si j'ajoute WhatsApp, ça me coûte combien — et je le vends
 * combien ? » pour un client, pour un pack, et à l'échelle de la plateforme.
 *
 *   node scripts/couts-whatsapp.mjs
 *   node scripts/couts-whatsapp.mjs --change=140 --marge=50
 *   node scripts/couts-whatsapp.mjs --bsp=twilio --reponses=8
 *
 * Aucune dépendance, aucun accès réseau : que des maths.
 *
 * ── SOURCES (vérifiées le 7 octobre 2026) ─────────────────────────────────
 * • Doc officielle Meta, page « Pricing on the WhatsApp Business Platform »,
 *   mise à jour le 30/09/2026 :
 *     - facturation PAR MESSAGE LIVRÉ (et non par conversation) depuis le 01/07/2025 ;
 *     - tarif déterminé par le code pays du DESTINATAIRE (pas de l'entreprise) ;
 *     - Algérie = marché « Rest of Africa » (confirmé dans la table des codes) ;
 *     - 1 000 messages de service GRATUITS par numéro d'entreprise et par mois
 *       (depuis le 01/10/2026 ; non cumulables, remis à zéro chaque mois) ;
 *     - les templates « utility » envoyés dans la fenêtre de 24 h sont facturés
 *       depuis le 01/10/2026 (ils étaient gratuits depuis le 01/07/2025) ;
 *     - les messages ENTRANTS (du client vers l'entreprise) sont toujours gratuits ;
 *     - fenêtre « free entry point » après une pub Click-to-WhatsApp : 72 h dans
 *       la page de référence, étendue à 7 JOURS par le changelog du 28/09/2026 ;
 *     - Meta Business Agent = 2,00 $/M tokens (~4–5 ¢ par message), hors sujet ici.
 *   Les NUMÉROS du barème « Rest of Africa » au 01/10/2026 proviennent de barèmes
 *   publiés par des partenaires Meta (Gallabox, ManyChat, Sleekflow) : le tableau
 *   officiel est un composant interactif qui ne s'extrait pas. Fourchette
 *   observée : service/utility 0,0040–0,0046 $, marketing 0,0225–0,0259 $.
 *   → À reconfirmer dans le Billing Hub avant de publier un prix. La calculatrice
 *   accepte une correction : --rate-service=0.0045
 */

// ───────────────────────────────────────────────────────────────────────────
// 1. HYPOTHÈSES
// ───────────────────────────────────────────────────────────────────────────

const H = {
  /** Taux de change utilisé ailleurs dans le dépôt (AdminPage.tsx affiche 135). */
  change: 270,

  /**
   * Tarifs Meta par marché (USD par message livré), barème du 01/10/2026.
   * `service` = tarif utility du marché (règle énoncée par Meta).
   */
  marches: {
    algerie:  { libelle: 'Algérie (Rest of Africa)',        marketing: 0.0259, utility: 0.0046, service: 0.0046 },
    tunisie:  { libelle: 'Tunisie (Rest of Africa)',        marketing: 0.0259, utility: 0.0046, service: 0.0046 },
    maroc:    { libelle: 'Maroc (Rest of Africa*)',         marketing: 0.0259, utility: 0.0046, service: 0.0046 },
    france:   { libelle: 'France (Rest of W. Europe)',      marketing: 0.0680, utility: 0.0197, service: 0.0197 },
    canada:   { libelle: 'Canada / USA (North America)',    marketing: 0.0287, utility: 0.0039, service: 0.0039 },
    emirats:  { libelle: 'Émirats (standalone)',            marketing: 0.0451, utility: 0.0105, service: 0.0105 },
    autre:    { libelle: 'Autres pays (« Other »)',         marketing: 0.0694, utility: 0.0089, service: 0.0089 },
  },

  /** Ce que Meta offre gratuitement, par numéro et par mois. */
  messagesServiceGratuits: 1000,

  /** Messages du bot par conversation WhatsApp (1 « conversation » métier). */
  reponsesParConversation: 6,

  /**
   * Part des conversations démarrées par une PUB Click-to-WhatsApp.
   * Dans la fenêtre « free entry point », TOUT est gratuit (même le marketing).
   */
  partViaPubCtw: 0.15,

  /** Marge de revente visée sur l'option WhatsApp (pour calculer le prix). */
  margeCible: 50,

  /** Frais d'un BSP, en $ par message (Twilio = 0,005 $ entrant ET sortant). */
  bsp: {
    direct: 0,
    twilio: 0.005,
    troisSoixante: 0.005,
  },
  bspChoisi: 'direct',

  /** Packs vendus (prix DZD), alignés sur slickpay.js. */
  packs: [
    { id: 'basic',      libelle: 'Basic',        prixDzd: 6850 },
    { id: 'pro',        libelle: 'Pro/Business', prixDzd: 18700 },
    { id: 'enterprise', libelle: 'Enterprise',   prixDzd: 47100 },
  ],

  /** Profils de clients, en conversations WhatsApp par mois. */
  profils: [
    { id: 'vitrine', libelle: 'Petit commerce',   conversations: 40 },
    { id: 'actif',   libelle: 'Commerce actif',   conversations: 200 },
    { id: 'fort',    libelle: 'Gros volume',      conversations: 800 },
    { id: 'intense', libelle: 'Très gros',        conversations: 2500 },
  ],
};

// Options en ligne de commande
const argNum = (nom, defaut) => {
  const b = process.argv.find((a) => a.startsWith(`--${nom}=`));
  if (!b) return defaut;
  const v = Number(b.split('=')[1]);
  return Number.isFinite(v) ? v : defaut;
};
H.change = argNum('change', H.change);
H.margeCible = argNum('marge', H.margeCible);
H.reponsesParConversation = argNum('reponses', H.reponsesParConversation);
const bspArg = (process.argv.find((a) => a.startsWith('--bsp=')) || '').split('=')[1];
if (bspArg && bspArg in H.bsp) H.bspChoisi = bspArg;
const rateServiceCorrige = argNum('rate-service', null);
if (rateServiceCorrige) {
  H.marches.algerie.service = rateServiceCorrige;
  H.marches.algerie.utility = rateServiceCorrige;
}

// ───────────────────────────────────────────────────────────────────────────
// 2. OUTILS
// ───────────────────────────────────────────────────────────────────────────

const M = H.marches.algerie;
const enDzd = (usd) => usd * H.change;
const dzd = (v, d = 0) => `${v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} DA`;
const usd = (v, d = 4) => `${v.toFixed(d)} $`;
const pct = (v) => `${v.toFixed(1)} %`;
const pad = (v, n) => String(v).padEnd(n);
const padL = (v, n) => String(v).padStart(n);
const titre = (t) => `\n${'═'.repeat(84)}\n  ${t}\n${'═'.repeat(84)}`;
const sous = (t) => `\n── ${t} ${'─'.repeat(Math.max(0, 76 - t.length))}`;

/** Coût Meta du bot pour N messages de service (la 1 000ᵉ est gratuite). */
function coutService(messages, market = M) {
  const factures = Math.max(0, messages - H.messagesServiceGratuits);
  return factures * (market.service + H.bsp[H.bspChoisi]);
}

/** Coût Meta d'une campagne de templates sortants. */
function coutTemplates(nombre, categorie, market = M) {
  return nombre * (market[categorie] + H.bsp[H.bspChoisi]);
}

/** Coût IA (Gemini) — mesuré dans docs/COUTS_PLANS.md : 0,186 DA par message. */
const COUT_IA_DZD_PAR_MESSAGE = 0.186;
const coutIa = (messages) => messages * COUT_IA_DZD_PAR_MESSAGE;

// ───────────────────────────────────────────────────────────────────────────
// 3. RAPPORT
// ───────────────────────────────────────────────────────────────────────────

console.log(`
╔══════════════════════════════════════════════════════════════════════════════════╗
║  JAWEBFLOW — CE QUE COÛTE WHATSAPP                                                ║
╚══════════════════════════════════════════════════════════════════════════════════╝
  Marché de facturation : ${M.libelle}
  Change : 1 $ = ${H.change} DA         Frais BSP : ${H.bsp[H.bspChoisi] ? usd(H.bsp[H.bspChoisi], 3) + '/message' : 'aucun (accès direct Meta)'}
  Messages du bot par conversation : ${H.reponsesParConversation}`);

// --- 1. Les 5 règles qui font la facture ---------------------------------
console.log(titre('1. LES 5 RÈGLES QUI DÉCIDENT DE LA FACTURE'));
console.log(`
  1. Facturation PAR MESSAGE LIVRÉ (depuis le 01/07/2025), pas par conversation.
  2. Le tarif dépend du PAYS DU CLIENT (code pays du numéro), pas du tien.
     → L'Algérie est facturée au tarif « Rest of Africa ».
  3. Ce qu'un client t'écrit est TOUJOURS gratuit et illimité.
  4. Tes réponses coûtent ${dzd(enDzd(M.service), 2)} chacune APRÈS ${H.messagesServiceGratuits} messages
     de service gratuits par numéro et par mois (remis à zéro chaque mois).
  5. Un template sortant (relance, promo, confirmation) n'a PAS de franchise :
     utility ${dzd(enDzd(M.utility), 2)} · marketing ${dzd(enDzd(M.marketing), 2)} — facturé dès le premier envoi.

  Exception qui vaut de l'or : si le client vient d'une PUB Click-to-WhatsApp et que
  tu réponds dans les 24 h, une fenêtre « free entry point » s'ouvre (jusqu'à 7 jours
  depuis le 28/09/2026) où TOUT est gratuit, marketing compris.`);

// --- 2. Coût par message / par conversation ------------------------------
console.log(titre('2. COÛT RÉEL EN ALGÉRIE, PAR CLIENT'));
console.log(sous('Ce que coûte UNE réponse du bot'));
console.log(`
  ${pad('Réponse de service, après la franchise', 46)} ${padL(dzd(enDzd(M.service), 2), 12)}
  ${pad('+ IA (Gemini, mesuré)', 46)} ${padL(dzd(COUT_IA_DZD_PAR_MESSAGE, 2), 12)}
  ${pad('= COÛT TOTAL d\'une réponse', 46)} ${padL(dzd(enDzd(M.service) + COUT_IA_DZD_PAR_MESSAGE, 2), 12)}
  ${pad('Message de service DANS la franchise', 46)} ${padL(dzd(COUT_IA_DZD_PAR_MESSAGE, 2), 12)}   (Meta = 0)`);

console.log(sous(`Ce que coûte UNE conversation (${H.reponsesParConversation} réponses du bot)`));
console.log(`
  ${pad('Conversation hors pub, franchise épuisée', 46)} ${padL(dzd(H.reponsesParConversation * (enDzd(M.service) + COUT_IA_DZD_PAR_MESSAGE), 2), 12)}
  ${pad('Conversation dans la franchise (1 000/mois)', 46)} ${padL(dzd(coutIa(H.reponsesParConversation), 2), 12)}
  ${pad('Conversation venue d\'une pub Click-to-WhatsApp', 46)} ${padL(dzd(coutIa(H.reponsesParConversation), 2), 12)}   (Meta = 0)`);

console.log(sous('Ce que coûtent les messages SORTANTS (templates, hors franchise)'));
console.log(`
  ${pad('Confirmation de commande / rappel (utility)', 46)} ${padL(dzd(enDzd(M.utility), 2), 12)}   ${pad('', 6)}(×${(M.marketing / M.utility).toFixed(1)} moins cher que le marketing)
  ${pad('Relance, promo (marketing)', 46)} ${padL(dzd(enDzd(M.marketing), 2), 12)}
  ${pad('Relance à 1 000 contacts (marketing)', 46)} ${padL(dzd(enDzd(coutTemplates(1000, 'marketing')), 0), 12)}   ← c'est ÇA, le vrai coût de WhatsApp`);

// --- 3. Selon l'usage du client ------------------------------------------
console.log(titre('3. CE QUE COÛTE WHATSAPP PAR CLIENT, SELON SON USAGE'));
console.log(sous('Bot répondant aux clients qui écrivent (service)'));
console.log(
  pad('Profil de client', 20) + padL('Conversations', 14) + padL('Messages bot', 13) +
    padL('Facturés', 11) + padL('Meta', 12) + padL('IA', 11) + padL('TOTAL', 12),
);
console.log('─'.repeat(93));
for (const p of H.profils) {
  const messages = p.conversations * H.reponsesParConversation;
  const factures = Math.max(0, messages - H.messagesServiceGratuits);
  const meta = coutService(messages);
  const ia = coutIa(messages);
  console.log(
    pad(p.libelle, 20) + padL(p.conversations.toLocaleString('fr-FR'), 14) + padL(messages.toLocaleString('fr-FR'), 13) +
      padL(factures.toLocaleString('fr-FR'), 11) + padL(dzd(enDzd(meta)), 12) + padL(dzd(ia), 11) +
      padL(dzd(enDzd(meta) + ia), 12),
  );
}

console.log(sous('Le même client, mais avec des relances (templates sortants)'));
console.log(
  pad('Profil de client', 20) + padL('Service', 12) + padL('+ 1 000 relances', 18) + padL('+ 200 devis', 14) + padL('TOTAL', 12),
);
console.log('─'.repeat(93));
for (const p of H.profils) {
  const messages = p.conversations * H.reponsesParConversation;
  const svc = coutService(messages);
  const relances = coutTemplates(1000, 'marketing');
  const devis = coutTemplates(200, 'utility');
  console.log(
    pad(p.libelle, 20) + padL(dzd(enDzd(svc)), 12) +
      padL(dzd(enDzd(relances)), 18) + padL(dzd(enDzd(devis)), 14) +
      padL(dzd(enDzd(svc + relances + devis) + coutIa(messages)), 12),
  );
}
console.log(`
  Une campagne de relance à 1 000 contacts (${dzd(enDzd(coutTemplates(1000, 'marketing')), 0)}) coûte presque
  2 fois PLUS que 200 conversations de service. Le marketing est le poste qui explose.`);

// --- 4. Comparaison des marchés ------------------------------------------
console.log(titre('4. LE PIÈGE DES CLIENTS QUI VENDENT À L\'ÉTRANGER'));
console.log(`
  Meta facture selon le PAYS DE TON CLIENT À TOI (le destinataire), pas selon l'Algérie.
  Une boutique algérienne qui vend à la diaspora paie donc le tarif du pays du client.
`);
console.log(
  pad('Marché du destinataire', 34) + padL('Service', 12) + padL('Utility', 12) + padL('Marketing', 12) + padL('× Algérie', 12),
);
console.log('─'.repeat(93));
for (const [id, m] of Object.entries(H.marches)) {
  console.log(
    pad(m.libelle, 34) + padL(dzd(enDzd(m.service), 2), 12) + padL(dzd(enDzd(m.utility), 2), 12) +
      padL(dzd(enDzd(m.marketing), 2), 12) + padL(`${(m.service / H.marches.algerie.service).toFixed(1)}×`, 12),
  );
}
console.log(`
  👉 Un client qui vend en France paie ${(H.marches.france.service / H.marches.algerie.service).toFixed(1)}× le tarif algérien.
     Il faut donc demander à chaque client « tes clients sont dans quel pays ? »
     avant de lui vendre une option WhatsApp à prix fixe.
  👉 *Maroc : Meta le sort du « Rest of Africa » au 01/10/2026 (tarif propre, plus élevé).`);

// --- 5. Direct vs BSP ----------------------------------------------------
console.log(titre('5. ACCÈS DIRECT META OU PASSER PAR UN BSP ?'));
const messagesRef = 3000;
const facturesRef = Math.max(0, messagesRef - H.messagesServiceGratuits);
console.log(`
  Pour ${messagesRef.toLocaleString('fr-FR')} messages de service par mois, par client :
`);
console.log(pad('Montage', 34) + padL('Coût Meta', 14) + padL('Frais BSP', 14) + padL('TOTAL/mois', 14) + padL('Coût moyen/msg', 14));
console.log('─'.repeat(93));
for (const [id, markup] of Object.entries(H.bsp)) {
  if (id === 'troisSoixante') continue;
  const meta = facturesRef * M.service;
  const frais = facturesRef * markup;
  const libelle = id === 'direct'
    ? 'Accès direct (Tech Provider)'
    : id === 'twilio' ? 'Twilio (+0,005 $/msg)' : id;
  console.log(
    pad(libelle, 34) + padL(dzd(enDzd(meta)), 14) + padL(dzd(enDzd(frais)), 14) +
      padL(dzd(enDzd(meta + frais)), 14) + padL(dzd(enDzd(meta / messagesRef + markup), 3), 14),
  );
}
console.log(`
  L'accès direct coûte 0 $ à Meta mais demande : statut Tech Provider, vérification
  d'entreprise, App Review des permissions whatsapp_business_*, et Embedded Signup v4
  (v2/v3 dépréciés au 15/10/2026). Un BSP évite ce dossier mais DOUBLE le prix du message
  en Algérie (${dzd(enDzd(M.service), 2)} → ${dzd(enDzd(M.service + 0.005), 2)}).
  → Direct si WhatsApp devient un pilier de l'offre ; BSP seulement pour tester.

  Nuance stratégique : les PALIERS DE VOLUME (baisse du tarif utility/authentication au-delà
  de certains seuils) s'agrègent au niveau du « business portfolio ». En statut Tech Provider,
  chaque client a son propre portfolio → chaque client reste au tarif de base. Si JawebFlow
  portait lui-même les WABAs (modèle Solution Partner avec ligne de crédit), le volume de TOUS
  les clients s'additionnerait et pourrait débloquer des paliers inférieurs — mais tu encaisses
  le risque de paiement et la facturation. À trancher au moment du dossier Meta.`);

// --- 6. Poids dans chaque pack -------------------------------------------
console.log(titre('6. CE QUE WHATSAPP MANGE DANS CHAQUE PACK'));
console.log(`
  Coût mensuel du canal (service + IA) comparé au prix du pack.
`);
console.log(
  pad('Pack', 16) + padL('Prix', 12) + H.profils.map((p) => padL(`${p.conversations} conv.`, 16)).join(''),
);
console.log('─'.repeat(93));
for (const pack of H.packs) {
  const cellules = H.profils.map((p) => {
    const messages = p.conversations * H.reponsesParConversation;
    const total = enDzd(coutService(messages)) + coutIa(messages);
    const part = (total / pack.prixDzd) * 100;
    return padL(`${dzd(total)} (${pct(part)})`, 16);
  });
  console.log(pad(pack.libelle, 16) + padL(dzd(pack.prixDzd), 12) + cellules.join(''));
}
console.log(`
  ⚠️ Un client Basic qui pousse ${H.profils[2].conversations} conversations WhatsApp par mois
     consomme ${dzd((() => { const m = H.profils[2].conversations * H.reponsesParConversation; return enDzd(coutService(m)) + coutIa(m); })())} de canal — soit ${pct((((() => { const m = H.profils[2].conversations * H.reponsesParConversation; return enDzd(coutService(m)) + coutIa(m); })()) / 6850) * 100)} de son abonnement.
  → WhatsApp doit être une OPTION FACTURÉE, jamais incluse silencieusement dans Basic.`);

// --- 7. Ce qu'il faut facturer -------------------------------------------
console.log(titre(`7. COMBIEN FACTURER L'OPTION WHATSAPP (marge visée : ${H.margeCible} %)`));
const coutMessageDzd = enDzd(M.service + H.bsp[H.bspChoisi]) + COUT_IA_DZD_PAR_MESSAGE;
const prixConseille = coutMessageDzd / (1 - H.margeCible / 100);
console.log(`
  Coût d'une réponse = ${dzd(coutMessageDzd, 2)} (Meta + IA).
`);
console.log(pad('Palier', 26) + padL('Coût réel', 14) + padL('Prix conseillé', 16) + padL('Marge', 12) + padL('≈ par jour', 14));
console.log('─'.repeat(93));
for (const [libelle, prix] of [
  ['1 000 messages', 1000],
  ['2 500 messages', 2500],
  ['5 000 messages', 5000],
  ['10 000 messages', 10000],
]) {
  const cout = prix * coutMessageDzd;
  const prixVente = cout / (1 - H.margeCible / 100);
  console.log(
    pad(libelle, 26) + padL(dzd(cout), 14) + padL(dzd(prixVente), 16) + padL(pct(H.margeCible), 12) +
      padL(dzd(prixVente / 30), 14),
  );
}
console.log(`
  Trois montages possibles :
   A. Pass-through (le plus sain) : le client achète des crédits WhatsApp.
      Prix au message conseillé : ${dzd(prixConseille, 2)} (contre ${dzd(coutMessageDzd, 2)} de coût).
   B. Option mensuelle : « +${dzd((2000 * coutMessageDzd) / (1 - H.margeCible / 100), 0)}/mois, 2 000 messages inclus,
      puis ${dzd(prixConseille, 2)}/message ». → couvre le gros du trafic, le dépassement reste payant.
   C. Réservée à Pro/Enterprise avec clause d'usage raisonnable.

  ⚠️ Le marketing (relances, promos) doit être facturé SÉPARÉMENT et au message :
     ${dzd(enDzd(M.marketing), 2)} chez toi (${(M.marketing / M.service).toFixed(1)}× une réponse de service).
     Vendre « relances illimitées » est le moyen le plus rapide de perdre de l'argent.`);

// --- 8. Le levier pub ----------------------------------------------------
console.log(titre('8. LE LEVIER QUI REND WHATSAPP GRATUIT : LA PUB CLICK-TO-WHATSAPP'));
const part = H.partViaPubCtw;
console.log(`
  Si le client vient d'une pub Click-to-WhatsApp et que tu réponds dans les 24 h, une
  fenêtre « free entry point » s'ouvre (jusqu'à 7 jours depuis le 28/09/2026) :
  TOUT y est gratuit — même les templates marketing.
`);
console.log(
  pad('Part du trafic via pub', 26) + padL('Coût Meta/mois', 18) + padL('Économie', 14) + padL('Coût IA', 12) + padL('TOTAL', 12),
);
console.log('─'.repeat(93));
for (const partTest of [0, 0.15, 0.3, 0.5]) {
  const conversations = 800;
  const messages = conversations * H.reponsesParConversation;
  const messagesHorsPub = messages * (1 - partTest);
  const meta = coutService(messagesHorsPub);
  const ia = coutIa(messages);
  const eco = enDzd(coutService(messages) - meta);
  console.log(
    pad(`${(partTest * 100).toFixed(0).replace('.', ',')} %`, 26) + padL(dzd(enDzd(meta)), 18) + padL(dzd(eco), 14) + padL(dzd(ia), 12) +
      padL(dzd(enDzd(meta) + ia), 12),
  );
}
console.log(`
  👉 C'est le meilleur argument commercial du canal : « dépense en pub plutôt qu'en
     frais de message ». À condition de rester dans la fenêtre (répondre dans les 24 h,
     client sur Android/iOS, pas desktop/web).
  👉 Les réponses de Meta Business Agent restent facturées (2 $/M tokens) — sans objet ici,
     puisque c'est TON IA qui répond.`);

// --- 9. Marge sur la plateforme ------------------------------------------
console.log(titre('9. À L\'ÉCHELLE DE JAWEBFLOW'));
console.log(`
  Hypothèse : chaque client paie l'option WhatsApp au prix conseillé (§7),
  trafic moyen = ${H.profils[1].conversations} conversations/mois, aucune relance marketing.
`);
const convMoyen = H.profils[1].conversations;
const msgMoyen = convMoyen * H.reponsesParConversation;
const coutParClient = enDzd(coutService(msgMoyen)) + coutIa(msgMoyen);
const prixParClient = coutParClient / (1 - H.margeCible / 100);
console.log(
  pad('Clients avec WhatsApp', 24) + padL('Coût total', 16) + padL('Encaissé', 16) + padL('Marge', 16) + padL('Marge %', 12),
);
console.log('─'.repeat(93));
for (const n of [5, 25, 100]) {
  const cout = n * coutParClient;
  const encaisse = n * prixParClient;
  console.log(
    pad(`${n} clients`, 24) + padL(dzd(cout), 16) + padL(dzd(encaisse), 16) + padL(dzd(encaisse - cout), 16) +
      padL(pct(H.margeCible), 12),
  );
}
console.log(`
  Le coût de WhatsApp augmente LINÉAIREMENT avec le trafic : contrairement à l'IA,
  il n'y a aucune économie d'échelle à attendre. La seule variable à surveiller est
  le tarif par message — d'où l'intérêt des paliers de volume (utility/authentication)
  et du passage en accès direct.`);

// --- 10. Récapitulatif ---------------------------------------------------
console.log(titre('10. RÉCAPITULATIF'));
console.log(`
  1. Coût d'une réponse du bot en Algérie : ${dzd(coutMessageDzd, 2)} (Meta ${dzd(enDzd(M.service + H.bsp[H.bspChoisi]), 2)}${H.bsp[H.bspChoisi] ? ' BSP compris' : ''} + IA ${dzd(COUT_IA_DZD_PAR_MESSAGE, 2)}),
     après ${H.messagesServiceGratuits} messages de service gratuits par numéro et par mois.
  2. Une conversation de ${H.reponsesParConversation} réponses : ~${dzd(H.reponsesParConversation * coutMessageDzd, 0)}.
  3. Un client sous 1 000 messages/mois : le canal coûte ~${dzd(coutIa(1000), 0)} de la part de l'IA — quasi rien.
  4. Ce qui explose, c'est le MARKETING : ${dzd(enDzd(M.marketing + H.bsp[H.bspChoisi]), 2)} par message, sans franchise.
  5. Le pays du CLIENT final fixe le tarif (France = ${(H.marches.france.service / H.marches.algerie.service).toFixed(1)}× l'Algérie).
  6. Prix conseillé de l'option : ${dzd(prixConseille, 2)} par message (marge ${H.margeCible} %), ou un forfait mensuel équivalent.
  7. L'accès direct évite le +0,005 $/message d'un BSP${H.bspChoisi !== 'direct' ? ` (actuellement : ${H.bspChoisi}, +${dzd(enDzd(H.bsp[H.bspChoisi]), 2)} par message)` : ''}, mais exige le dossier Meta.
  8. La pub Click-to-WhatsApp peut ramener le coût Meta à ~0 pendant la fenêtre gratuite.

  ⚠️ Avant de publier un tarif : reconfirmer le barème « Rest of Africa » du 01/10/2026
     dans le Billing Hub Meta (les chiffres retenus ici viennent de barèmes partenaires).
`);

// --- 11. Répartition par plan (la décision) ------------------------------
console.log(titre('11. QUELLE PART DE WHATSAPP CHAQUE PLAN PEUT ABSORBER'));

/** Coût pour JawebFlow de X messages inclus : les 1 000 premiers sont gratuits chez Meta. */
const coutInclus = (messages) =>
  Math.min(messages, H.messagesServiceGratuits) * COUT_IA_DZD_PAR_MESSAGE +
  Math.max(0, messages - H.messagesServiceGratuits) * coutMessageDzd;

console.log(`
  Rappel : les ${H.messagesServiceGratuits} premiers messages de service de chaque numéro sont
  GRATUITS chez Meta. Donc offrir « ${H.messagesServiceGratuits} messages » ne coûte que l'IA
  (${dzd(COUT_IA_DZD_PAR_MESSAGE, 2)} par message) — pas 0,81 DA.
`);
console.log(
  pad('Messages inclus', 20) + padL('Coût réel/mois', 16) + padL('% du pack Pro', 16) + padL('% du pack Enterprise', 22) + padL('Couvre ≈', 12),
);
console.log('─'.repeat(93));
for (const n of [500, 1000, 1500, 2000, 3000, 5000, 10000]) {
  const cout = coutInclus(n);
  console.log(
    pad(n.toLocaleString('fr-FR'), 20) + padL(dzd(cout), 16) +
      padL(pct((cout / 18700) * 100), 16) + padL(pct((cout / 47100) * 100), 22) +
      padL(`${Math.round(n / H.reponsesParConversation)} conv.`, 12),
  );
}

console.log(`
  Lecture : offrir 1 000 messages dans Pro coûte ${dzd(coutInclus(1000))} — soit ${pct((coutInclus(1000) / 18700) * 100)} du prix du pack,
  parce que Meta offre déjà ces 1 000 messages. C'est l'argument le moins cher de tout le catalogue.
  Au-delà, chaque message coûte vraiment 0,81 DA et il faut le facturer.`);

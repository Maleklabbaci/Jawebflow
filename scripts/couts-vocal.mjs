#!/usr/bin/env node
/**
 * JAWEBFLOW — LE CHATBOT WEB : CE QUE COÛTE UN MESSAGE, CE QUE COÛTE UN APPEL
 * ============================================================================
 * Répond à une seule question : « le chatbot web — écrit ET vocal — combien me
 * coûte-t-il vraiment ? » puis « jusqu'où mon plafond me laisse aller ? ».
 *
 *   node scripts/couts-vocal.mjs
 *   node scripts/couts-vocal.mjs --change=260
 *
 * Toutes les hypothèses sont en haut du fichier (H) : rien n'est caché.
 * Aucune dépendance, aucun accès réseau : ce sont des maths, pas des appels API.
 *
 * Les valeurs viennent du CODE et des tarifs officiels :
 *   • plafonds IA ................ functions/_shared/limits.ts (3 / 9 / 30 $)
 *   • quotas .................... functions/_shared/limits.ts (1 000 / 5 000)
 *   • 8 unités = 1 conversation .. supabase/migration_ai_usage.sql
 *   • texte (3.1 Flash-Lite) ..... 0,25 $/M entrée · 1,50 $/M sortie (mesuré)
 *   • voix (Gemini Live, audio) ... 3 $/M entrée · 12 $/M sortie
 *   • 1 s d'audio ............... ~32 tokens en entrée, ~25 en sortie
 */

// ───────────────────────────────────────────────────────────────────────────
// 1. HYPOTHÈSES (modifiables en ligne de commande)
// ───────────────────────────────────────────────────────────────────────────

const H = {
  /** Taux de change. Défaut du dépôt : 270 DA/USD. */
  change: 270,

  /** ---- ÉCRIT (Gemini 3.1 Flash-Lite) — coût réel mesuré sur le trafic. ---- */
  /** Un échange = 1 message du client + 1 réponse de l'IA (moyenne pondérée). */
  messageUsd: 0.00138,
  /** Une conversation commerciale = 8 échanges → 8 unités de quota. */
  messagesParConversation: 8,
  /** Quand le contexte est déjà en cache : lecture à 10 % du prix d'entrée. */
  conversationCacheUsd: 0.0047,

  /** ---- APPEL (Gemini Live, audio bidirectionnel) ---- */
  prixEntreeAudioUsdParMTok: 3,
  prixSortieAudioUsdParMTok: 12,
  tokensEntreeParSeconde: 32,
  tokensSortieParSeconde: 25,
  /** En vrai, l'agent ne parle pas pendant que le client parle : ~40 %. */
  partParoleAgent: 0.4,
  /** Le « thinking » du modèle Live est facturé au tarif texte de sortie. */
  prixSortieTexteUsdParMTok: 1.5,

  /** ---- Les packs : ce qu'ils vendent et ce que le code plafonne. ---- */
  plans: [
    { id: 'basic', libelle: 'Basic', prixDzd: 4500, capUsd: 3, quotaConversations: 1000 },
    { id: 'pro', libelle: 'Pro', prixDzd: 14000, capUsd: 9, quotaConversations: 5000 },
    { id: 'enterprise', libelle: 'Enterprise', prixDzd: null, capUsd: 30, quotaConversations: null },
  ],

  /** Le barème décidé : 1 minute d'appel = 10 conversations de quota. */
  conversationsParMinuteAppel: 10,
  /** Minutes visées par pack (Enterprise : plafond proposé, à confirmer). */
  minutesVisees: { basic: 100, pro: 500, enterprise: 2000 },
};

// ───────────────────────────────────────────────────────────────────────────
// 2. OUTILS
// ───────────────────────────────────────────────────────────────────────────

const arg = (nom, defaut) => {
  const brut = process.argv.find((a) => a.startsWith(`--${nom}=`));
  return brut ? Number(brut.split('=')[1]) : defaut;
};
H.change = arg('change', H.change);

const dzd = (v, d = 2) => `${v.toFixed(d).replace('.', ',')} DA`;
const usd = (v, d = 4) => `${v.toFixed(d)} $`;
const pct = (v) => `${v.toFixed(0)} %`;
const pad = (v, n) => String(v).padEnd(n);
const padL = (v, n) => String(v).padStart(n);
const da = (usdValue) => usdValue * H.change;

const titre = (t) => `\n${'═'.repeat(94)}\n  ${t}\n${'═'.repeat(94)}`;

// ───────────────────────────────────────────────────────────────────────────
// 3. LES COÛTS UNITAIRES
// ───────────────────────────────────────────────────────────────────────────

/** Une minute d'appel : l'entrée (le client parle) + la sortie (l'agent parle). */
function coutMinuteAppel({ partParoleAgent = 1 } = {}) {
  const tokensEntree = H.tokensEntreeParSeconde * 60;
  const tokensSortie = H.tokensSortieParSeconde * 60 * partParoleAgent;
  const entreeUsd = (tokensEntree * H.prixEntreeAudioUsdParMTok) / 1_000_000;
  const sortieUsd = (tokensSortie * H.prixSortieAudioUsdParMTok) / 1_000_000;
  return { tokensEntree, tokensSortie, entreeUsd, sortieUsd, totalUsd: entreeUsd + sortieUsd };
}

const MESSAGE_USD = H.messageUsd;
const CONVERSATION_USD = H.messageUsd * H.messagesParConversation;
const APPEL_MAX = coutMinuteAppel({ partParoleAgent: 1 });
const APPEL_REEL = coutMinuteAppel({ partParoleAgent: H.partParoleAgent });

// ───────────────────────────────────────────────────────────────────────────
// 4. RAPPORT
// ───────────────────────────────────────────────────────────────────────────

console.log(titre(`LE CHATBOT WEB — APPEL ET MESSAGE (1 $ = ${H.change} DA)`));

console.log(`
  Un seul assistant, deux façons de parler : le visiteur ÉCRIT (petit modèle
  texte, quasi gratuit) ou il APPELA (Gemini Live, audio bidirectionnel — 40×
  plus cher à la seconde). Les deux tapent dans le MÊME plafond du pack.
`);

// --- 1. L'écrit ------------------------------------------------------------
console.log(titre("1. L'ÉCRIT — ce qu'un message coûte"));
console.log(`
  1 échange (question + réponse) ................ ${usd(MESSAGE_USD, 5)}  ≈ ${dzd(da(MESSAGE_USD), 3)}
  1 conversation commerciale (8 échanges) ....... ${usd(CONVERSATION_USD, 4)}  ≈ ${dzd(da(CONVERSATION_USD))}
     (même conversation, contexte en cache) ..... ${usd(H.conversationCacheUsd, 4)}  ≈ ${dzd(da(H.conversationCacheUsd))}
`);
console.log(`  Autrement dit : ${dzd(da(MESSAGE_USD), 3)} le message, et il en faut ${H.messagesParConversation} pour marquer 1 conversation au compteur.`);

// --- 2. La voix -----------------------------------------------------------
console.log(titre("2. L'APPEL — ce qu'une minute coûte"));
console.log(`
  Tarif officiel Gemini Live (audio) : ${H.prixEntreeAudioUsdParMTok} $ / M entrée · ${H.prixSortieAudioUsdParMTok} $ / M sortie
  Volume par seconde : ~${H.tokensEntreeParSeconde} tokens en entrée, ~${H.tokensSortieParSeconde} en sortie

  Le client parle pendant toute la minute (entrée) :
     ${padL(APPEL_MAX.tokensEntree.toLocaleString('fr-FR'), 6)} tokens × ${H.prixEntreeAudioUsdParMTok} $/M          = ${usd(APPEL_MAX.entreeUsd, 5)}
  L'agent parle en continu (sortie maximale) :
     ${padL(APPEL_MAX.tokensSortie.toLocaleString('fr-FR'), 6)} tokens × ${H.prixSortieAudioUsdParMTok} $/M         = ${usd(APPEL_MAX.sortieUsd, 5)}
                                                  ────────
  PIRE CAS (les deux parlent tout le temps) ..... ${usd(APPEL_MAX.totalUsd, 5)}  ≈ ${dzd(da(APPEL_MAX.totalUsd))} / minute
`);
console.log(`  En pratique, l'agent parle ~${pct(H.partParoleAgent * 100)} du temps (le client écoute, réfléchit, coupe) :
     ${padL(Math.round(APPEL_REEL.tokensSortie).toLocaleString('fr-FR'), 6)} tokens × ${H.prixSortieAudioUsdParMTok} $/M  ........ ${usd(APPEL_REEL.sortieUsd, 5)}
  RÉALISTE ...................................... ${usd(APPEL_REEL.totalUsd, 5)}  ≈ ${dzd(da(APPEL_REEL.totalUsd))} / minute`);

console.log(`
  Repères :
     • 1 minute d'appel (pire cas) = ${(APPEL_MAX.totalUsd / MESSAGE_USD).toFixed(0)} échanges écrits
     • 1 minute d'appel (réaliste) = ${(APPEL_REEL.totalUsd / MESSAGE_USD).toFixed(0)} échanges écrits
     • 1 minute d'appel (pire cas) = ${(APPEL_MAX.totalUsd / CONVERSATION_USD).toFixed(1).replace('.', ',')} conversations de quota
     • 1 minute d'appel (réaliste) = ${(APPEL_REEL.totalUsd / CONVERSATION_USD).toFixed(1).replace('.', ',')} conversations de quota
     • le barème « 1 min = ${H.conversationsParMinuteAppel} conversations » est donc GÉNÉREUX :
       tu factures ${H.conversationsParMinuteAppel} unités ce qui te coûte ${(APPEL_MAX.totalUsd / CONVERSATION_USD).toFixed(1).replace('.', ',')} conversations.`);

// --- 3. Ce que le plafond autorise ---------------------------------------
console.log(titre('3. JUSQU’OÙ CHAQUE PLAFOND LAISSE ALLER (écrit, puis appel)'));
console.log(
  pad('Pack', 12) + padL('Plafond IA', 14) + padL('Prix du pack', 14) +
    padL('Conversations', 15) + padL('Minutes (pire)', 16) + padL('Minutes (réel)', 16),
);
console.log('─'.repeat(94));
for (const p of H.plans) {
  const capDzd = da(p.capUsd);
  const conversations = Math.floor(capDzd / da(CONVERSATION_USD));
  const minutesMax = Math.floor(capDzd / da(APPEL_MAX.totalUsd));
  const minutesReel = Math.floor(capDzd / da(APPEL_REEL.totalUsd));
  console.log(
    pad(p.libelle, 12) +
      padL(`${p.capUsd} $ = ${Math.round(capDzd).toLocaleString('fr-FR')} DA`, 14) +
      padL(p.prixDzd ? `${p.prixDzd.toLocaleString('fr-FR')} DA` : 'sur devis', 14) +
      padL(conversations.toLocaleString('fr-FR'), 15) +
      padL(minutesMax.toLocaleString('fr-FR'), 16) +
      padL(minutesReel.toLocaleString('fr-FR'), 16),
  );
}
console.log(`
  Lecture : le plafond est un MONTANT (${da(1).toFixed(0)} DA par dollar), pas un nombre
  d'actions. Le client peut le dépenser en messages ou en minutes d'appel — et
  quand il l'a atteint, l'assistant se met en pause tout seul (même UX que le
  quota de conversations : il reprend le 1er du mois).`);

// --- 4. Le barème tient-il dans le plafond ? -----------------------------
console.log(titre('4. LE BARÈME « 1 MIN = 10 CONVERSATIONS » TIENT-IL DANS LE PLAFOND ?'));
console.log(
  pad('Pack', 12) + padL('Quota', 10) + padL('Minutes visées', 15) +
    padL('Coût des minutes', 18) + padL('Plafond', 14) + padL('Verdict', 20),
);
console.log('─'.repeat(94));
for (const p of H.plans) {
  const visees = H.minutesVisees[p.id];
  const capeDzd = da(p.capUsd);
  const coutMinutes = visees * da(APPEL_MAX.totalUsd);
  const tient = coutMinutes <= capeDzd;
  const minutesPossibles = Math.floor(capeDzd / da(APPEL_MAX.totalUsd));
  console.log(
    pad(p.libelle, 12) +
      padL(p.quotaConversations ? p.quotaConversations.toLocaleString('fr-FR') : 'illimité', 10) +
      padL(`${visees.toLocaleString('fr-FR')} min`, 15) +
      padL(`${Math.round(coutMinutes).toLocaleString('fr-FR')} DA`, 18) +
      padL(`${Math.round(capeDzd).toLocaleString('fr-FR')} DA`, 14) +
      padL(tient ? '✅ tient' : `❌ coupé à ${minutesPossibles} min`, 20),
  );
}
console.log(`
  ⚠️ Le barème vocal et les plafonds ont été décidés séparément : en pire cas,
     la voix coûte ${dzd(da(APPEL_MAX.totalUsd))} la minute, donc un plafond de 9 $ ne finance que
     ~${Math.floor(da(9) / da(APPEL_MAX.totalUsd))} minutes. Deux façons de remettre d'aplomb :
       (a) baisser les minutes vendues (Pro 380 min, Enterprise 1 200 min), ou
       (b) monter les plafonds (Pro 12 $, Enterprise 48 $) — et donc tes coûts max.`);

// --- 5. Usage mixte -------------------------------------------------------
console.log(titre('5. UN CLIENT QUI FAIT LES DEUX (usage mixte, cas courant)'));
const mixte = [
  { libelle: 'Un Pro : 300 conversations écrites + 100 minutes d’appel', conversations: 300, minutes: 100, capUsd: 9 },
  { libelle: 'Un Pro : 700 conversations écrites + 40 minutes d’appel', conversations: 700, minutes: 40, capUsd: 9 },
  { libelle: 'Un Basic : 200 conversations écrites + 30 minutes d’appel', conversations: 200, minutes: 30, capUsd: 3 },
];
console.log(pad('Scénario', 56) + padL('Coût', 14) + padL('Plafond', 12) + padL('Tenu ?', 12));
console.log('─'.repeat(94));
for (const s of mixte) {
  const cout = s.conversations * da(CONVERSATION_USD) + s.minutes * da(APPEL_MAX.totalUsd);
  console.log(
    pad(s.libelle, 56) +
      padL(`${Math.round(cout).toLocaleString('fr-FR')} DA`, 14) +
      padL(`${Math.round(da(s.capUsd)).toLocaleString('fr-FR')} DA`, 12) +
      padL(cout <= da(s.capUsd) ? `✅ ${pct((cout / da(s.capUsd)) * 100)}` : '❌ coupé', 12),
  );
}

console.log(`
  Variables : --change=260 (taux) · modifier H en tête de fichier pour tout le reste.
`);

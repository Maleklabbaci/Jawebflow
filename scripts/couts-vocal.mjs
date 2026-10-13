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
 *   • quotas .................... functions/_shared/limits.ts (500 / 1 500)
 *   • 1 unité = 1 conversation ... functions/_shared/limits.ts (14/10/2026)
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
  /** 1 conversation = 1 message du client + sa réponse → 1 unité de quota. */
  messagesParConversation: 1,
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
    { id: 'basic', libelle: 'Basic', prixDzd: 2700, capUsd: 0, quotaConversations: 500 },
    { id: 'pro', libelle: 'Pro', prixDzd: 5400, capUsd: 0, quotaConversations: 1500 },
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
  texte, quasi gratuit) ou il APPELA (Gemini Live, audio bidirectionnel — une
  minute d'appel coûte 17 messages écrits). Les deux tapent dans le MÊME quota
  du pack : 1 minute d'appel = 10 conversations.
`);

// --- 1. L'écrit ------------------------------------------------------------
console.log(titre("1. L'ÉCRIT — ce qu'un message coûte"));
console.log(`
  1 échange (question + réponse) ................ ${usd(MESSAGE_USD, 5)}  ≈ ${dzd(da(MESSAGE_USD), 3)}
  1 conversation commerciale (1 échange) ........ ${usd(CONVERSATION_USD, 4)}  ≈ ${dzd(da(CONVERSATION_USD))}
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

// --- 3. Le forfait entier, sans plafond -----------------------------------
console.log(titre('3. LE FORFAIT ENTIER : CE QU’IL COÛTE AU MAXIMUM (aucun plafond)'));
console.log(`
  Décision du 13/10/2026 : plus de plafond en dollars sur Basic et Pro. C'est
  le QUOTA DE CONVERSATIONS qui arrête l'assistant. Le pire cas possible est
  donc « le client épuise tout son forfait » — et il peut l'épuiser en écrit,
  en appels, ou dans n'importe quel mélange des deux.
`);
console.log(
  pad('Pack', 12) + padL('Quota', 10) + padL('Tout en écrit', 15) + padL('Tout en appel', 15) +
    padL('Prix du pack', 14) + padL('Marge (pire)', 14),
);
console.log('─'.repeat(94));
for (const p of H.plans) {
  if (p.quotaConversations === null) {
    // Enterprise : pas de quota chiffré → fusible en dollars en attendant.
    const fuseDzd = da(p.capUsd);
    console.log(
      pad(p.libelle, 12) + padL('à négocier', 10) +
        padL(`${Math.floor(fuseDzd / da(CONVERSATION_USD)).toLocaleString('fr-FR')} conv.`, 15) +
        padL(`${Math.floor(fuseDzd / da(APPEL_MAX.totalUsd)).toLocaleString('fr-FR')} min`, 15) +
        padL('sur devis', 14) + padL(`fusible ${p.capUsd} $`, 14),
    );
    continue;
  }
  const quota = p.quotaConversations;
  const toutEcrit = quota * da(CONVERSATION_USD);
  const toutAppel = (quota / H.conversationsParMinuteAppel) * da(APPEL_MAX.totalUsd);
  const pire = Math.max(toutEcrit, toutAppel);
  console.log(
    pad(p.libelle, 12) + padL(quota.toLocaleString('fr-FR'), 10) +
      padL(`${Math.round(toutEcrit).toLocaleString('fr-FR')} DA`, 15) +
      padL(`${Math.round(toutAppel).toLocaleString('fr-FR')} DA`, 15) +
      padL(p.prixDzd.toLocaleString('fr-FR') + ' DA', 14) +
      padL(pct(((p.prixDzd - pire) / p.prixDzd) * 100), 14),
  );
}
const conversationAppelDzd = da(APPEL_MAX.totalUsd) / H.conversationsParMinuteAppel;
console.log(`
  Une conversation ÉCRITE = ${H.messagesParConversation} messages × ${dzd(da(MESSAGE_USD), 3)} = ${dzd(da(CONVERSATION_USD))}
  Une conversation d'APPEL = 1/${H.conversationsParMinuteAppel} de minute × ${dzd(da(APPEL_MAX.totalUsd))} = ${dzd(conversationAppelDzd)}

  → À QUOTA ÉGAL, l'écrit coûte ${(da(CONVERSATION_USD) / conversationAppelDzd).toFixed(1).replace('.', ',')}× plus cher que l'appel.
  → MAIS une minute d'appel reste ${(APPEL_MAX.totalUsd / MESSAGE_USD).toFixed(0)}× plus chère qu'un message : la voix est
    chère à la seconde, c'est le barème « 1 min = ${H.conversationsParMinuteAppel} conversations » qui la rend
    bon marché EN UNITÉS DE QUOTA (le client brûle ${H.messagesParConversation * H.conversationsParMinuteAppel} messages de forfait
    pour une minute qui te coûte ${dzd(da(APPEL_MAX.totalUsd))}).`);

// --- 4. Le barème tient-il dans le quota ? --------------------------------
console.log(titre('4. LE BARÈME « 1 MIN = 10 CONVERSATIONS » TIENT-IL DANS LE QUOTA ?'));
console.log(
  pad('Pack', 12) + padL('Quota', 10) + padL('Minutes visées', 16) +
    padL('Conversations prises', 21) + padL('Reste', 16) + padL('Verdict', 14),
);
console.log('─'.repeat(94));
for (const p of H.plans) {
  const visees = H.minutesVisees[p.id];
  const prises = visees * H.conversationsParMinuteAppel;
  if (p.quotaConversations === null) {
    console.log(
      pad(p.libelle, 12) + padL('à négocier', 10) + padL(`${visees.toLocaleString('fr-FR')} min`, 16) +
        padL(prises.toLocaleString('fr-FR'), 21) + padL('—', 16) +
        padL(`fusible ${p.capUsd} $`, 14),
    );
    continue;
  }
  const reste = p.quotaConversations - prises;
  console.log(
    pad(p.libelle, 12) + padL(p.quotaConversations.toLocaleString('fr-FR'), 10) +
      padL(`${visees.toLocaleString('fr-FR')} min`, 16) + padL(prises.toLocaleString('fr-FR'), 21) +
      padL(reste >= 0 ? `${reste.toLocaleString('fr-FR')} conv.` : `${Math.abs(reste).toLocaleString('fr-FR')} de trop`, 16) +
      padL(reste >= 0 ? '✅ tient' : '❌ dépasse', 14),
  );
}
console.log(`
  Le barème tient exactement dans le quota pour Basic et Pro : 100 minutes
  d'appel = 1 000 conversations, 500 minutes = 5 000. Un client qui parle
  beaucoup épuise donc son forfait en minutes, un client qui écrit l'épuise en
  messages — et le premier te coûte BEAUCOUP moins cher que le second.

  Enterprise n'a pas de quota chiffré (vendu « sur devis ») : il ne reste qu'un
  fusible de ${H.plans[2].capUsd} $ — soit ${Math.floor(da(H.plans[2].capUsd) / da(APPEL_MAX.totalUsd)).toLocaleString('fr-FR')} minutes d'appel ou
  ${Math.floor(da(H.plans[2].capUsd) / da(CONVERSATION_USD)).toLocaleString('fr-FR')} conversations écrites. À chiffrer avec le client.`);

// --- 5. Usage mixte -------------------------------------------------------
console.log(titre('5. UN CLIENT QUI FAIT LES DEUX (usage mixte, cas courant)'));
const mixte = [
  { libelle: 'Un Pro : 300 conversations écrites + 100 minutes d’appel', conversations: 300, minutes: 100, prixDzd: 14000 },
  { libelle: 'Un Pro : 700 conversations écrites + 40 minutes d’appel', conversations: 700, minutes: 40, prixDzd: 14000 },
  { libelle: 'Un Basic : 200 conversations écrites + 30 minutes d’appel', conversations: 200, minutes: 30, prixDzd: 4500 },
  { libelle: 'Un Basic qui épuise tout son forfait en appels (100 min)', conversations: 0, minutes: 100, prixDzd: 4500 },
];
console.log(pad('Scénario', 58) + padL('Coût', 12) + padL('Prix', 12) + padL('Marge', 12));
console.log('─'.repeat(94));
for (const sc of mixte) {
  const cout = sc.conversations * da(CONVERSATION_USD) + sc.minutes * da(APPEL_MAX.totalUsd);
  console.log(
    pad(sc.libelle, 58) +
      padL(`${Math.round(cout).toLocaleString('fr-FR')} DA`, 12) +
      padL(`${sc.prixDzd.toLocaleString('fr-FR')} DA`, 12) +
      padL(pct(((sc.prixDzd - cout) / sc.prixDzd) * 100), 12),
  );
}
console.log(`
  Un client normal (100 à 300 conversations et quelques appels par mois) te
  coûte 500 à 1 500 DA : la marge reste au-dessus de 85 %.

  Variables : --change=260 (taux) · modifier H en tête de fichier pour tout le reste.
`);

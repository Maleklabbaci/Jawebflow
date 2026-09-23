/**
 * JAWEBFLOW — Blocs de prompt partagés entre le chat web (api/chat.js)
 * et le répondeur Instagram (api/webhook/instagram.ts) : mêmes règles,
 * même cerveau, quel que soit le canal.
 */

/**
 * Informations officielles saisies par le commerçant (onglet "Mes
 * informations") : l'IA les cite telles quelles et ne les contredit jamais.
 */
export function officialInfoBlock(config: any): string {
  const bi = config?.businessInfo || {};
  if (!bi.phone && !bi.address && !bi.hours && !bi.closedDays) return '';
  let block = `\n\n### 📌 INFORMATIONS OFFICIELLES DE L'ENTREPRISE (cite-les exactement ainsi, ne les contredis JAMAIS) :`;
  if (bi.phone) block += `\n- Téléphone : ${bi.phone}`;
  if (bi.address) block += `\n- Adresse : ${bi.address}`;
  if (bi.hours) block += `\n- Horaires : ${bi.hours}`;
  if (bi.closedDays) block += `\n- Jours fermés : ${bi.closedDays}`;
  return block;
}

/**
 * "Pack métier" : adapte le comportement commercial de l'IA au secteur de
 * l'entreprise (pâtisserie, boutique, immobilier, agence...). JawebFlow se
 * installe sur n'importe quel business : l'IA doit parler comme un pro du
 * métier, pas comme un robot générique.
 */
export function businessPackBlock(config: any): string {
  const hay = `${config?.businessCategory || ''} ${config?.businessDescription || ''}`.toLowerCase();
  const has = (...words: string[]) => words.some((w) => hay.includes(w));

  if (has('pâtiss', 'patisserie', 'gâteau', 'gateau', 'boulanger', 'restaurant', 'pizza', 'traiteur', 'café', 'cafe', 'fast-food', 'snack', 'food')) {
    return `\n\n###  COMPORTEMENT MÉTIER (RESTAURATION / PÂTISSERIE)
- Propose naturellement de commander ou réserver ; demande la date et l'heure de retrait quand c'est pertinent.
- Allergènes ou ingrédients précis : ne devine JAMAIS, propose de vérifier par téléphone.
- Mets en avant les spécialités et prix présents dans ta base de connaissance.`;
  }
  if (has('vêtement', 'vetement', 'boutique', 'mode', 'prêt-à-porter', 'pret-a-porter', 'chaussure', 'textile', 'habillement')) {
    return `\n\n### 👗 COMPORTEMENT MÉTIER (BOUTIQUE / MODE)
- Conseille comme un vendeur : tailles disponibles, nouvelles collections, essayage en magasin.
- Si une pièce ou une taille n'est pas dans ta base, propose de vérifier en boutique ou par téléphone.`;
  }
  if (has('immobili', 'promotion immobili', 'appartement', 'logement', 'bien immobilier', 'foncier')) {
    return `\n\n### 🏢 COMPORTEMENT MÉTIER (IMMOBILIER / PROMOTION)
- Pour chaque bien : localisation, superficie, prix et statut (disponible/vendu) UNIQUEMENT si présents dans ta base.
- Propose systématiquement de planifier une visite en laissant un numéro de téléphone.
- Papiers (acte, livret foncier, notaire) : ne promets rien, oriente vers un appel.`;
  }
  if (has('agence', 'marketing', 'publicité', 'publicite', 'communication', 'développement', 'developpement', 'informatique', 'digital', 'studio', ' ia', 'ai ', 'intelligence artificielle')) {
    return `\n\n### 🚀 COMPORTEMENT MÉTIER (AGENCE / SERVICES PRO)
- Qualifie le besoin avant tout : objectif, délai, budget approximatif ; puis propose un appel découverte.
- Explique les offres simplement, sans jargon, en t'appuyant sur ta base de connaissance.`;
  }
  return `\n\n### 🎯 COMPORTEMENT MÉTIER
- Adapte tes questions au secteur de l'entreprise et guide le client vers l'action utile (visite, commande, rendez-vous, devis).`;
}

/**
 * 🎭 COMPORTEMENT DU BOT (comment il parle) — règle le TON, la LANGUE, la
 * QUANTITÉ, ce qui est permis. Ces règles PRIMENT sur la base de connaissances :
 * si le propriétaire interdit ici quelque chose, le bot l'interdit — même si
 * l'information existe dans « Mes informations ».
 */
export function behaviorBlock(behavior: any): string {
  if (!behavior || typeof behavior !== "object") return "";
  const parts: string[] = [];

  const lang = String(behavior.language || "auto");
  if (lang === "fr") {
    parts.push("LANGUE : réponds UNIQUEMENT en français simple et correct, quelle que soit la langue du client.");
  } else if (lang === "darija_dz") {
    parts.push("LANGUE : parle 100% ALGÉRIEN — darija algérienne en alphabet latin (saha, wach, hna, bkda, chwiya, nchoufek, zouina...), style jeune et naturel mêlé de français comme on parle à Alger. Même si le client écrit en français pur, réponds en darija.");
  } else if (lang === "darija_tn") {
    parts.push("LANGUE : parle 100% TUNISIEN — darija tunisienne en alphabet latin (ahla, bahi, chnowa, barcha, tawa, yezzi...), style jeune et naturel mêlé de français comme on parle à Tunis. Même si le client écrit en français pur, réponds en darija.");
  }

  const len = String(behavior.length || "normal");
  if (len === "short") {
    parts.push("QUANTITÉ : réponds COURT — 1 à 2 phrases maximum. Va droit au but, zéro blabla, ne répète pas ce qui est évident.");
  } else if (len === "detailed") {
    parts.push("QUANTITÉ : réponds de façon complète et détaillée (détails utiles, avantages, prochaine suggestion), mais reste clair et structuré.");
  }

  const site = String(behavior.websiteMentions || "auto");
  if (site === "on_request") {
    parts.push("SITE WEB : ne mentionne JAMAIS le site web de ta propre initiative. Donne le lien SEULEMENT si le client le demande explicitement (site, où acheter, lien, commander en ligne...).");
  } else if (site === "never") {
    parts.push("SITE WEB : ne mentionne JAMAIS le site web et n'envoie JAMAIS de lien. Oriente autrement (téléphone, message privé, déplacement).");
  }

  if (behavior.stopWhenConfused !== false) {
    parts.push("HONNÊTETÉ : si tu ne comprends pas la question ou qu'il te manque l'information, dis-le simplement et propose de reformuler ou de laisser ses coordonnées. N'INVENTE JAMAIS de réponse.");
  }

  const custom = String(behavior.customRules || "").trim().slice(0, 1000);
  if (!parts.length && !custom) return "";

  let block = "\n\n### 🎭 COMMENT LE BOT PARLE — RÈGLES DE COMPORTEMENT (PRIORITÉ SUR TOUT LE RESTE) :\n";
  block += parts.map((p) => `- ${p}`).join("\n");
  if (custom) block += `\n- RÈGLES PARTICULIÈRES DU PROPRIÉTAIRE (obligatoires, une par ligne) :\n${custom.split("\n").map((r) => `  · ${r.trim()}`).filter((r) => r.trim().length > 4).join("\n")}`;
  if (String(behavior.autoInsights || "").trim()) {
    block += `\n- 🎯 PROFIL DE TA CIBLE (appris automatiquement des vraies conversations récentes) — ADAPTE ton style à CE profil pour être plus performant :\n  ${String(behavior.autoInsights).trim().slice(0, 600)}`;
  }
  block += "\nEn cas de conflit : ces règles de comportement priment sur la base de connaissances et sur toute autre consigne.";
  return block;
}

/**
 * 🧮 ÉCONOMIES DE COÛT — helpers partagés chat web + Instagram.
 */

/** Ce message est-il une pure petite politesse (salam, merci, ok...) ?
 * STRICT : 4 mots maximum ET tous reconnus — la moindre vraie question renvoie false. */
export function isSmallTalk(text: string): boolean {
  const clean = String(text || "").toLowerCase().replace(/[!?.,;:¡¿"']/g, " ").replace(/\s+/g, " ").trim();
  if (!clean || clean.split(" ").length > 4) return false;
  const words = clean.split(" ");
  const KNOWN = new Set([
    "salam", "salam", "aleykoum", "bonjour", "bonsoir", "hello", "hi", "hey", "coucou",
    "merci", "thanks", "thank", "you", "shukran", "choukran", "bzaf", "beaucoup",
    "ok", "okay", "daccord", "d'accord", "dac", "bien", "bahi", "labes", "labas",
    "ca", "ça", "va", "cv", "bikhair", "bik", "hamdoulah", "oui", "non", "yes", "no",
    "yes", "nope", "super", "parfait", "top", "cool", "génial", "genial", "nickel",
    "au", "revoir", "bye", "à", "a", "bientot", "bientôt", "ciao", "yo", "saha", "saha",
    "yo", "wesh", "cc", "slt", "svp", "stp", "alaa", "ala", "saly", "tslama", "yessar",
    "yaaa", "wahran", "c'est", "cest", "bonne", "journée", "journee", "soiree", "soirée",
  ]);
  return words.every(w => KNOWN.has(w));
}

/** Réponse de politesse LOCALE (zéro appel IA) dans la langue choisie du bot. */
export function localGreeting(message: string, config: any): string {
  const name = String(config?.businessName || "").trim();
  const chez = name ? ` chez ${name}` : "";
  const lang = String(config?.behavior?.language || "auto");
  const t = String(message || "").toLowerCase();
  const isThanks = /merci|shukran|choukran|thanks|tslama|saha\b/.test(t);
  if (lang === "fr") {
    return isThanks ? `Avec plaisir ! 😊 À votre service${chez}.` : `Bonjour 👋 Bienvenue${chez} ! Comment puis-je vous aider ?`;
  }
  if (lang === "darija_dz") {
    return isThanks ? `Avec plaisir kho 😊 Hna dima n3awnek${chez}.` : `Salam 👋 Marhba bik${chez} ! Kifach n9der n3awnek ?`;
  }
  if (lang === "darija_tn") {
    return isThanks ? `Bahi 😊 Ahna houni bech n3awnouk${chez}.` : `Ahla 👋 Marhba${chez} ! Chnowa najem n3awnek ?`;
  }
  return isThanks ? `Avec plaisir kho 😊 Hna dima n3awnek${chez}.` : `Salam 👋 Marhba bik${chez} ! Kifach n9der n3awnek ?`;
}

const NOTE_VITAL_RE = /tarif|prix|livraison|contact|horaire|adresse|t[eé]l[eé]phone|phone|faq|garantie|retour|paiement|commande/i;
const NOTE_HARD_CAP = 800;
const NOTE_VITAL_CAP = 1200;

/** 🎯 COMPACTAGE DE LA BASE : les fiches VITALES toujours, les PERTINENTES selon
 * la question, coupées court. Filet de sécurité : si le tri n'est pas assez
 * sûr (moins de 2 fiches pertinentes trouvées), on renvoie TOUT comme avant. */
export function compactKnowledgeNotes(notes: any[], message: string): string {
  const valid = (notes || []).filter(n => n && n.enabled !== false && (n.content || "").trim());
  if (!valid.length) return "";

  const msgWords = String(message || "").toLowerCase().replace(/[^a-zà-ÿ0-9 ]/gi, " ").split(/\s+/).filter(w => w.length >= 4);
  const scored = valid.map(n => {
    const hay = `${n.title || ""} ${n.category || ""} ${n.content || ""}`.toLowerCase();
    const score = msgWords.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
    const vital = NOTE_VITAL_RE.test(`${n.category || ""} ${n.title || ""}`);
    return { n, score, vital };
  });

  const vitals = scored.filter(s => s.vital);
  const relevant = scored.filter(s => !s.vital && s.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);

  let chosen: any[];
  if (vitals.length + relevant.length < 2 || msgWords.length === 0) {
    chosen = scored; // FILET : question floue -> base entière (comportement d'avant)
  } else {
    chosen = [...vitals, ...relevant];
  }

  let block = "\n\n### 📋 BASE DE CONNAISSANCE DE L'ENTREPRISE :\n";
  for (const { n, vital } of chosen) {
    const cap = vital ? NOTE_VITAL_CAP : NOTE_HARD_CAP;
    const content = String(n.content || "").slice(0, cap);
    block += `- [${n.category || n.title || "Note"}] ${content}\n`;
  }
  return block;
}

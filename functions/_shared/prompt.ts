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

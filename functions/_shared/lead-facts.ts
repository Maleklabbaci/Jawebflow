/**
 * JAWEBFLOW — Extraction des infos client depuis SES messages naturels.
 * Un client qui écrit « je m'appelle Malek, j'habite à Blida, 0697660969 »
 * alimente automatiquement sa fiche prospect (nom, ville, téléphone, email).
 * Le même client qui CORRIGE son numéro voit sa fiche mise à jour (jamais
 * dupliquée : l'id du prospect est déterministe par client et par canal).
 */

export interface LeadFacts {
  phone?: string;
  name?: string;
  city?: string;
  email?: string;
}

const PHONE_RE = /(?:(?:\+|00)213|0)\s?[5-7](?:[\s.-]?[0-9]){8}/;
const PHONE_GENERIC_RE = /\+\d{2,4}[\s.-]?\d[\d\s.-]{6,}\d/;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

// « je m'appelle Malek », « mon nom c'est Malek », « moi c'est Malek », « smiti Malek »…
const NAME_RE = /(?:je\s*m'?appelle|mon\s+(?:nom|prénom)\s+(?:c'?est|est)|moi\s*,?\s+c'?est|moi\s+c'?est|smit[iy]|smi\s*ti|ana\s+smi[tity]+)\s+([A-Za-zÀ-ÿ'’-]{2,30}(?:\s+[A-Za-zÀ-ÿ'’-]{2,30})?)/i;

// « j'habite à Blida », « je suis d'Oran », « je suis à Alger »…
const CITY_RE = /(?:j'?habite\s+(?:à|a|au|en|dans\s+le\s+)?|j'?habite\s+à|je\s+suis\s+(?:à|a|au|en|de|d')|on\s+habite\s+(?:à|a|au|en)|naskun\s+f|na\s*skun\s+f|i\s+live\s+in)\s+([A-Za-zÀ-ÿ'’-]{3,30})/i;

// Villes DZ + TN (translittérations courantes incluses)
const CITIES = [
  'alger', 'oran', 'blida', 'constantine', 'annaba', 'setif', 'sétif', 'batna', 'tlemcen',
  'bejaia', 'béjaia', 'béjaïa', 'tizi ouzou', 'ouargla', 'ghardaia', 'ghardaïa',
  'sidi bel abbes', 'sidi bel abbès', 'mostaganem', 'tiaret', 'biskra', 'tebessa', 'tébessa',
  'djelfa', 'medea', 'médéa', 'boumerdes', 'boumerdès', 'bouira', 'chlef', 'jijel', 'bechar',
  'béchar', 'adrar', 'tamanrasset', 'skikda', 'souk ahras', 'oum el bouaghi', 'khenchela',
  'msila', "m'sila", 'mascara', 'relizane', 'ain defla', 'aïn defla', 'ain temouchent',
  'aïn témouchent', 'guelma', 'el oued', 'laghouat', 'saida', 'saïda', 'mila', 'tipaza',
  'bordj bou arreridj', 'el tarf', 'naama', 'naâma', 'el bayadh', 'illizi', 'tindouf',
  'timimoun', 'beni abbes', 'bordj badji mokhtar', 'ain salah', 'in salah',
  'tunis', 'sfax', 'sousse', 'kairouan', 'bizerte', 'gabes', 'gabès', 'ariana',
  'ben arous', 'monastir', 'nabeul', 'djerba', 'zarzis', 'medenine', 'médenine',
  'kasserine', 'gafsa', 'tozeur', 'le kef', 'siliana', 'jendouba', 'tataouine',
  'mahdia', 'sidi bouzid', 'hammamet', 'nabeul',
];

const NOT_A_NAME = new Set([
  'bonjour', 'salut', 'merci', 'bonsoir', 'oui', 'non', 'ok', 'bien', 'ça', 'ca', 'va',
  'quoi', 'comment', 'pourquoi', 'combien', 'cherche', 'veux', 'voudrais', 'besoin',
  'prix', 'saha', 'salam', 'labes', 'bkhir', 'hola', 'hello', 'hi', 'shukran', 'choukran',
]);

function cleanCaptured(value: string): string {
  return value.replace(/[.,!?;:]+$/g, '').trim();
}

function titleCaseSoft(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function extractLeadFacts(text: string): LeadFacts {
  const facts: LeadFacts = {};
  const t = String(text || '');
  if (!t) return facts;

  const phone = t.match(PHONE_RE) || t.match(PHONE_GENERIC_RE);
  if (phone) facts.phone = phone[0].replace(/[\s.-]/g, '');

  const email = t.match(EMAIL_RE);
  if (email) facts.email = email[0].toLowerCase();

  const name = t.match(NAME_RE);
  if (name) {
    const candidate = cleanCaptured(name[1])
      .split(/\s+/)
      .filter(w => w.length >= 2 && !/^(naskun|nasken|skun|nestanna|fi|de|du|et|w|wa|el|al)$/i.test(w))
      .join(' ');
    const lower = candidate.toLowerCase();
    if (candidate.length >= 2 && !NOT_A_NAME.has(lower) && !CITIES.includes(lower)) {
      facts.name = titleCaseSoft(candidate);
    }
  }

  const cityPattern = t.match(CITY_RE);
  if (cityPattern) {
    const candidate = cleanCaptured(cityPattern[1]);
    if (candidate.length >= 3 && !NOT_A_NAME.has(candidate.toLowerCase())) {
      facts.city = titleCaseSoft(candidate);
    }
  }
  if (!facts.city) {
    const lower = t.toLowerCase();
    // Recherche par liste (mot entier) — la plus longue correspondance gagne
    let best = '';
    for (const c of CITIES) {
      if (new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower) && c.length > best.length) best = c;
    }
    if (best) facts.city = titleCaseSoft(best);
  }

  return facts;
}

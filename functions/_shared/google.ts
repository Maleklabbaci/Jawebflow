/**
 * JAWEBFLOW — Helpers partagés pour les Cloudflare Pages Functions.
 *
 * ⚠️ NE PAS utiliser `?key=<FIRESTORE_API_KEY>` pour lire/écrire dans Firestore :
 * une requête REST Firestore avec seulement la clé Web est traitée comme
 * ANONYME et se fait donc REFUSER par les règles de sécurité (les assistants
 * appartiennent à leur propriétaire). Résultat constaté : les Functions
 * recevaient `permission denied` et poursuivaient silencieusement avec une
 * configuration vide / des écritures perdues.
 *
 * On signe donc un JWT avec le compte de service (FIREBASE_SERVICE_ACCOUNT)
 * pour obtenir un jeton OAuth et appeler Firestore en tant qu'Admin.
 */

export interface GoogleEnv {
  FIREBASE_SERVICE_ACCOUNT?: string;
  FIRESTORE_PROJECT_ID?: string;
  FIRESTORE_DATABASE_ID?: string;
  FIRESTORE_API_KEY?: string;
}

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

/**
 * Base64 STANDARD (avec padding). Meta signe ses webhooks en base64 classique :
 * `sha256=<base64>`. Utiliser une variante base64url (-, _ et sans padding)
 * faisait échouer la comparaison pour TOUS les événements légitimes.
 */
export function base64(source: ArrayBuffer | string): string {
  if (typeof source === "string") return btoa(unescape(encodeURIComponent(source)));
  const bytes = new Uint8Array(source);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64url(source: ArrayBuffer | string): string {
  let encoded = "";
  if (typeof source === "string") {
    encoded = btoa(unescape(encodeURIComponent(source)));
  } else {
    const bytes = new Uint8Array(source);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    encoded = btoa(binary);
  }
  return encoded.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) binaryDer[i] = binaryDerString.charCodeAt(i);

  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

export function parseServiceAccount(raw?: string): ServiceAccount | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Jeton d'accès OAuth (1h) signé avec le compte de service. */
export async function getGoogleAccessToken(
  saJson: string,
  scope = "https://www.googleapis.com/auth/datastore"
): Promise<{ accessToken: string; projectId: string; clientEmail: string }> {
  const sa = JSON.parse(saJson) as ServiceAccount;
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: sa.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const unsignedToken = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await importPrivateKey(sa.private_key),
    new TextEncoder().encode(unsignedToken)
  );
  const jwt = `${unsignedToken}.${base64url(signature)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });

  const tokenData = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(`OAuth Google refusé: ${tokenData.error_description || tokenRes.status}`);
  }

  return {
    accessToken: tokenData.access_token,
    projectId: sa.project_id || "",
    clientEmail: sa.client_email,
  };
}

/** Chemin REST Firestore (documents) pour un projet base de données donné. */
export function firestoreDocumentsBase(env: GoogleEnv): string {
  const project = env.FIRESTORE_PROJECT_ID;
  const db = env.FIRESTORE_DATABASE_ID || "(default)";
  return `https://firestore.googleapis.com/v1/projects/${project}/databases/${db}/documents`;
}

/**
 * Convertit un objet Firestore REST `{ fields: {...} }` en objet JS classique.
 * Sans ça, chaque Function devait réécrire sa propre copie de cette logique
 * (ce qui a déjà causé des divergences entre le webhook Instagram et le
 * crawler : l'un savait lire les tableaux imbriqués, l'autre non).
 */
export function parseFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value.stringValue !== undefined) out[key] = value.stringValue;
    else if (value.doubleValue !== undefined) out[key] = value.doubleValue;
    else if (value.integerValue !== undefined) out[key] = parseInt(value.integerValue, 10);
    else if (value.booleanValue !== undefined) out[key] = value.booleanValue;
    else if (value.arrayValue) {
      out[key] = (value.arrayValue.values || []).map((v: any) =>
        v.mapValue ? parseFields(v.mapValue.fields || {}) : v.stringValue ?? v.booleanValue ?? v.doubleValue ?? v
      );
    } else if (value.mapValue) {
      out[key] = parseFields(value.mapValue.fields || {});
    }
  }
  return out;
}

/** Conversion inverse : objet JS classique ➜ format Firestore REST `fields`. */
export function toFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") fields[key] = { stringValue: value };
    else if (typeof value === "number") {
      fields[key] = Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    } else if (typeof value === "boolean") fields[key] = { booleanValue: value };
    else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map((item) =>
            item && typeof item === "object" ? { mapValue: { fields: toFields(item) } } : toFields({ v: item }).v
          ),
        },
      };
    } else if (typeof value === "object") {
      fields[key] = { mapValue: { fields: toFields(value) } };
    }
  }
  return fields;
}

/**
 * Lecture Admin d'un document Firestore.
 * Renvoie `{ ok, status, fields }` — l'appelant DOIT vérifier `ok` au lieu de
 * supposer que la lecture a réussi (c'était la cause des réponses IA vides :
 * la config assistant n'était jamais chargée, sans aucune alerte).
 */
export async function adminGetDocument(
  env: GoogleEnv,
  path: string
): Promise<{ ok: boolean; status: number; fields: Record<string, any> | null; error?: string }> {
  const sa = env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return { ok: false, status: 500, fields: null, error: "FIREBASE_SERVICE_ACCOUNT manquant" };

  try {
    const { accessToken } = await getGoogleAccessToken(sa);
    const res = await fetch(`${firestoreDocumentsBase(env)}/${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 404) return { ok: false, status: 404, fields: null, error: "document introuvable" };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, fields: null, error: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }

    const data = (await res.json()) as { fields?: Record<string, any> };
    return { ok: true, status: 200, fields: data.fields || null };
  } catch (e: any) {
    return { ok: false, status: 500, fields: null, error: e?.message || String(e) };
  }
}

/**
 * Écriture Admin (fusion / PATCH) d'un document Firestore.
 *
 * Sans cette fonction, le crawler ne pouvait renvoyer sa synthèse QUE vers le
 * frontend, qui devait lui-même écrire dans Firestore avec les identifiants
 * du navigateur — bloqué par les mêmes règles de sécurité mentionnées en
 * haut de ce fichier. Résultat : le scan « réussissait » côté IA, mais rien
 * n'était jamais réellement enregistré dans « Mes informations ».
 *
 * `updateMask` restreint la PATCH aux clés fournies (fusion, pas un
 * remplacement complet du document).
 */
export async function adminPatchDocument(
  env: GoogleEnv,
  path: string,
  data: Record<string, any>
): Promise<{ ok: boolean; status: number; error?: string }> {
  const sa = env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return { ok: false, status: 500, error: "FIREBASE_SERVICE_ACCOUNT manquant" };

  try {
    const { accessToken } = await getGoogleAccessToken(sa);
    const mask = Object.keys(data)
      .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
      .join("&");
    const res = await fetch(`${firestoreDocumentsBase(env)}/${path}?${mask}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFields(data) }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }
    return { ok: true, status: 200 };
  } catch (e: any) {
    return { ok: false, status: 500, error: e?.message || String(e) };
  }
}

/**
 * Vérifie l'identité Firebase de l'appelant (jeton ID du SDK web).
 * Renvoie l'uid, ou null si le jeton est absent/invalide/expiré.
 */
export async function verifyFirebaseIdToken(
  env: GoogleEnv,
  authorizationHeader: string | null
): Promise<{ uid: string; email?: string } | null> {
  const apiKey = env.FIRESTORE_API_KEY;
  const idToken = authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.slice(7).trim() : "";
  if (!apiKey || !idToken) return null;

  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { users?: Array<{ localId?: string; email?: string }> };
    const user = data.users?.[0];
    if (!user?.localId) return null;
    return { uid: user.localId, email: user.email };
  } catch {
    return null;
  }
}

/**
 * Anti-SSRF : refuse les adresses internes (localhost, réseau privé, métadonnées
 * cloud) avant tout fetch déclenché par un utilisateur.
 */
export function isPublicHttpUrl(rawUrl: string): { ok: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL invalide" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Seuls http:// et https:// sont autorisés" };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "Hôte interne refusé" };
  }

  // IPv4 littérale
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    const isPrivate =
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||              // link-local + métadonnées cloud
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127);      // CGNAT
    if (isPrivate) return { ok: false, reason: "Adresse IP interne refusée" };
  }

  // IPv6 locales / loopback
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return { ok: false, reason: "Adresse IPv6 interne refusée" };
  }

  // domaines sans point (ex: "intranet") et TLD internes
  if (!host.includes(".") && !ipv4) {
    return { ok: false, reason: "Nom d'hôte non qualifié refusé" };
  }

  return { ok: true };
}

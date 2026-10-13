/**
 * JAWEBFLOW — 🎙️ AGENT VOCAL : la session Gemini Live
 * ============================================================================
 * Le visiteur appuie sur le micro du widget : il parle, l'assistant répond à
 * voix haute, comme au téléphone. Tout se passe DANS la page du marchand.
 *
 * ⚠️ La clé Gemini ne descend JAMAIS dans le navigateur. On fabrique ici un
 * **jeton éphémère** (`auth_tokens`) que le navigateur utilisera directement
 * pour ouvrir la connexion temps réel avec Google :
 *
 *   navigateur ──► POST /api/voice/session ──► Google (avec GEMINI_API_KEY)
 *        ◄── jeton éphémère (2 minutes pour démarrer, 1 seul usage)
 *        └──► wss://…BidiGenerateContent?access_token=<jeton>  (direct Google)
 *
 * Conséquence voulue : l'audio ne traverse ni Cloudflare ni nos serveurs — donc
 * aucune facture de bande passante, et une latence minimale.
 *
 * Le jeton porte AUSSI les consignes de l'assistant (`bidiGenerateContentSetup`) :
 * le visiteur ne peut pas modifier le comportement, ni lire les consignes du
 * marchand dans le navigateur.
 */

/** Modèle temps réel par défaut (surchargeable par `GEMINI_LIVE_MODEL`). */
import {
  normalizedLanguages,
  normalizedMission,
  type VoiceLanguage,
  type VoiceMission,
} from './mission.ts';

export const DEFAULT_LIVE_MODEL = 'gemini-3.8-live';

/**
 * Version d'API de la CONNEXION temps réel (surchargeable par
 * `GEMINI_LIVE_API_VERSION`). C'est celle de la porte des jetons :
 * `…v1beta.GenerativeService.BidiGenerateContentConstrained`.
 */
export const DEFAULT_LIVE_API_VERSION = 'v1beta';

/**
 * Version d'API du SERVICE DES JETONS (`AuthTokenService.CreateToken`).
 * ⚠️ Ce service n'est pas ouvert sur v1beta : demander un jeton là-bas répond
 * 404 — et c'est ce qui nous a fait croire que la clé était en cause. On essaie
 * donc v1alpha d'abord, puis v1beta (certains projets sont l'inverse).
 */
export const TOKEN_API_VERSION = 'v1alpha';
export const TOKEN_API_VERSION_FALLBACK = 'v1beta';

/**
 * Deuxième chance : la MÊME porte (`Constrained`), seulement l'autre version
 * d'API. On ne retente JAMAIS la porte sans « Constrained » : un jeton
 * éphémère n'y a pas d'identité, Google répond « Method doesn't allow
 * unregistered callers … use API Key » et referme aussitôt.
 */
export const FALLBACK_LIVE_API_VERSION = 'v1alpha';

/** Voix proposées au marchand (Google en fournit d'autres : cette liste est un garde-fou). */
export const LIVE_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Zephyr'] as const;
export const DEFAULT_LIVE_VOICE = 'Puck';

/** Le temps que le navigateur a pour démarrer l'appel après la création du jeton. */
export const TOKEN_START_WINDOW_MS = 120_000; // 2 minutes

/** Plafond absolu d'un appel, même mal configuré côté marchand. */
export const MAX_SESSION_SECONDS = 900; // 15 minutes

/** Durée par défaut d'un appel quand le marchand n'a rien réglé. */
export const DEFAULT_SESSION_SECONDS = 300; // 5 minutes

/**
 * Consignes ajoutées au prompt commercial, propres à la VOIX.
 * Un appel téléphonique ne se lit pas comme un chat : pas de listes, pas de
 * liens cliquables, des phrases courtes, et on demande l'accord avant de
 * raccrocher sur une information incertaine.
 */
export const VOICE_CHANNEL_INSTRUCTIONS = `### 📞 TU ES AU TÉLÉPHONE AVEC LE CLIENT
Tu parles à voix haute : ta réponse est écoutée, pas lue.
- Phrases courtes (une idée par phrase), 1 à 3 phrases par réponse, puis tu laisses parler le client.
- AUCUNE mise en forme : pas de listes à puces, pas d'astérisques, pas de titres, pas d'emojis, pas d'URL lues à voix haute (dis « sur notre site » plutôt qu'une adresse).
- Écris les nombres, prix et horaires comme on les DIT : « dix-huit mille dinars », « de neuf heures à dix-huit heures ».
- Tu ne dis JAMAIS que tu ne peux pas parler ou que tu es un texte.
- Si tu n'as pas l'information : dis-le en une phrase et propose de prendre le numéro du client ou de le rappeler.
- Quand le client donne son numéro de téléphone ou son email, répète-le pour vérifier qu'il est juste.
- Si le client parle darija, réponds en darija ; s'il mélange, fais pareil.
- Termine naturellement : « autre chose ? » — et laisse le client raccrocher.`;

export interface VoiceSettings {
  enabled: boolean;
  voice: string;
  greeting: string;
  maxSeconds: number;
  /** 🗣️ Les langues que l'agent doit parler (le client garde le dernier mot). */
  languages: VoiceLanguage[];
  /** 🎯 Ce que l'agent doit obtenir (CTA du marchand) et ce qu'il doit noter. */
  mission: VoiceMission;
}

/** Réglages de voix du widget, toujours assainis (le jsonb vient du marchand). */
export function normalizedVoiceSettings(raw: unknown): VoiceSettings {
  const v = (raw || {}) as Record<string, unknown>;
  const voice = String(v.voice || '');
  const maxMinutes = Number(v.maxMinutes);
  const seconds = Number.isFinite(maxMinutes) && maxMinutes > 0
    ? Math.round(maxMinutes * 60)
    : DEFAULT_SESSION_SECONDS;
  return {
    // Opt-in explicite : sans réglage, la voix reste éteinte (personne ne
    // découvre un micro sur son site sans l'avoir demandé).
    enabled: v.enabled === true,
    voice: (LIVE_VOICES as readonly string[]).includes(voice) ? voice : DEFAULT_LIVE_VOICE,
    greeting: String(v.greeting || '').slice(0, 400),
    maxSeconds: Math.min(MAX_SESSION_SECONDS, Math.max(30, seconds)),
    languages: normalizedLanguages(v.languages),
    mission: normalizedMission(v.mission),
  };
}

/** « auth_tokens/abc123 » → « abc123 » (Google renvoie le nom préfixé). */
export function tokenFromAuthTokenName(name: unknown): string {
  return String(name || '').trim().replace(/^auth_tokens\//, '');
}

/**
 * Adresse temps réel à donner au navigateur, jeton compris.
 *
 * ⚠️ Un JETON ÉPHÉMÈRE ne se branche PAS sur `BidiGenerateContent` mais sur
 * `BidiGenerateContentConstrained` : c'est la porte réservée aux jetons (le
 * setup y est imposé par le jeton, le navigateur ne peut rien changer).
 * Se brancher sur la mauvaise porte ouvre la socket puis la fait fermer
 * aussitôt — exactement « ça tourne un peu puis ça raccroche ».
 */
export function liveWebSocketUrl(apiVersion: string, token: string, constrained = true): string {
  const method = constrained ? 'BidiGenerateContentConstrained' : 'BidiGenerateContent';
  return (
    `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}` +
    `.GenerativeService.${method}?access_token=${encodeURIComponent(token)}`
  );
}

/**
 * Message `setup` que le navigateur enverra en ouvrant la connexion.
 * Il reprend EXACTEMENT le modèle et la voix autorisés par le jeton : le
 * navigateur ne peut donc pas choisir un autre modèle que celui prévu.
 */
export function buildClientSetup(model: string, voice: string) {
  return {
    setup: {
      model: `models/${model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    },
  };
}

/**
 * Configuration imposée par le jeton (autoritaire côté Google) : le marchand
 * garde la main sur le comportement, le visiteur ne peut rien changer.
 */
export function buildTokenSetup(
  model: string,
  voice: string,
  systemInstruction: string,
  tools: unknown[] = [],
) {
  return {
    model: `models/${model}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
    systemInstruction: { parts: [{ text: systemInstruction }] },
    // 🎯 La mission de l'agent (enregistrer la demande du client) vit ICI :
    // le jeton est autoritaire, donc le navigateur ne peut ni retirer l'outil
    // ni en ajouter un autre.
    ...(Array.isArray(tools) && tools.length ? { tools } : {}),
  };
}

export interface LiveSessionResult {
  ok: boolean;
  token?: string;
  wsUrl?: string;
  model?: string;
  /** Version d'API de la connexion (celle de `wsUrl`). */
  apiVersion?: string;
  /** Version d'API du service des jetons (v1alpha en général). */
  tokenApiVersion?: string;
  /** Porte d'entrée réellement utilisée. */
  method?: string;
  expiresAt?: string;
  /** Message français prêt à afficher, en cas d'échec. */
  error?: string;
  /** Détail technique (journalisé côté serveur, jamais montré au visiteur). */
  detail?: string;
}

/**
 * Fabrique le jeton éphémère auprès de Google.
 * `fetchImpl` permet de tester tout ce fichier sans réseau.
 */
export async function createLiveToken(
  env: Record<string, any>,
  opts: {
    systemInstruction: string;
    voice?: string;
    model?: string;
    apiVersion?: string;
    /** Le navigateur redemande un jeton APRÈS l'échec du premier : couple historique. */
    legacy?: boolean;
    /** Les outils que l'agent pourra appeler (enregistrer une demande…). */
    tools?: unknown[];
    fetchImpl?: typeof fetch;
    now?: number;
  },
): Promise<LiveSessionResult> {
  const apiKey = String(env?.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "L'appel vocal n'est pas encore activé : la clé Gemini manque côté serveur.",
      detail: 'GEMINI_API_KEY absente',
    };
  }

  const model = String(opts.model || env?.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL);
  const apiVersion = String(opts.apiVersion || env?.GEMINI_LIVE_API_VERSION || DEFAULT_LIVE_API_VERSION);
  const voice = (LIVE_VOICES as readonly string[]).includes(String(opts.voice))
    ? String(opts.voice)
    : DEFAULT_LIVE_VOICE;
  const now = opts.now ?? Date.now();
  const expireTime = new Date(now + TOKEN_START_WINDOW_MS).toISOString();

  const doFetch = opts.fetchImpl || fetch;

  /**
   * Demande un jeton éphémère. Le service vit sur une seule version d'API :
   * on essaie `TOKEN_API_VERSION` puis l'autre, et on retient la réponse
   * utile (message de Google compris) pour pouvoir la MONTRER.
   */
  const createToken = async (modelName: string): Promise<{ ok: boolean; token?: string; version?: string; result?: LiveSessionResult }> => {
    let dernier: LiveSessionResult | null = null;
    for (const version of [TOKEN_API_VERSION, TOKEN_API_VERSION_FALLBACK]) {
      const url = `https://generativelanguage.googleapis.com/${version}/auth_tokens`;
      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            uses: 1, // un seul appel par jeton : impossible de le revendre
            expireTime,
            newSessionExpireTime: expireTime,
            bidiGenerateContentSetup: buildTokenSetup(modelName, voice, opts.systemInstruction, opts.tools),
          }),
        });
      } catch (e) {
        dernier = {
          ok: false,
          error: "L'appel vocal est momentanément indisponible. Écrivez-nous, nous répondons tout de suite.",
          detail: `réseau (jeton ${version}) : ${(e as Error)?.message || e}`,
        };
        continue;
      }

      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const apiMsg = String(data?.error?.message || data?.error || res.status);
        dernier = {
          ok: false,
          error: apiMsg.includes('API key')
            ? "L'appel vocal n'est pas encore activé (clé Gemini refusée). Notre équipe est prévenue."
            : "L'appel vocal n'est pas disponible pour le moment. Écrivez-nous, nous répondons tout de suite.",
          detail: `jeton ${version} → ${res.status} : ${apiMsg.slice(0, 300)}`,
        };
        continue;
      }

      const token = tokenFromAuthTokenName(data?.name || data?.token);
      if (!token) {
        dernier = {
          ok: false,
          error: "L'appel vocal n'a pas pu démarrer. Réessayez, ou écrivez-nous dans le chat.",
          detail: `jeton ${version} → réponse inattendue : ${JSON.stringify(data).slice(0, 200)}`,
        };
        continue;
      }
      return { ok: true, token, version };
    }
    return { ok: false, result: dernier || { ok: false, error: "L'appel vocal n'est pas disponible pour le moment." } };
  };

  /** Une tentative complète : un jeton + la porte `Constrained` sur `connectVersion`. */
  const attempt = async (modelName: string, connectVersion: string): Promise<LiveSessionResult> => {
    const tokenRes = await createToken(modelName);
    if (!tokenRes.ok || !tokenRes.token) return tokenRes.result as LiveSessionResult;

    return {
      ok: true,
      token: tokenRes.token,
      tokenApiVersion: tokenRes.version,
      wsUrl: liveWebSocketUrl(connectVersion, tokenRes.token, true),
      method: 'BidiGenerateContentConstrained',
      model: modelName,
      apiVersion: connectVersion,
      expiresAt: expireTime,
    };
  };

  // Le serveur ne voit PAS ce qui se passe sur la WebSocket : c'est le
  // navigateur qui redemande un jeton (`legacy: true`) quand la session meurt
  // avant le premier mot, et on lui donne alors la MÊME porte sur l'autre
  // version d'API. Aucun essai n'est gaspillé : un jeton = un appel.
  const connectVersion = opts.legacy ? FALLBACK_LIVE_API_VERSION : apiVersion;
  return attempt(model, connectVersion);
}

/** Message français quand le forfait du marchand ne permet pas l'appel vocal. */
export const VOICE_NOT_ENABLED_MSG =
  "L'appel vocal n'est pas activé sur ce widget : écrivez-nous dans le chat, nous vous répondons tout de suite.";

export const VOICE_RATE_LIMITED_MSG =
  "Trop d'appels ont été lancés depuis votre connexion. Patientez un instant ou écrivez-nous dans le chat.";

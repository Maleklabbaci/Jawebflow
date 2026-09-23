/**
 * JAWEBFLOW — Le compte Instagram de JawebFlow devient LE notificateur
 * et le guide des marchands. 🏢
 *
 * Principe : un marchand lie son compte en 10 secondes — il envoie un code
 * (« JF-XXXX ») en DM au compte JawebFlow — et reçoit ensuite SUR INSTAGRAM :
 *   🔥 les nouveaux leads (téléphone capté, demande de commande),
 *   🙋 les demandes de transfert humain (« je veux parler à quelqu'un »),
 *   … sans jamais ouvrir la plateforme.
 *
 * 💸 100 % CODE (aucun appel IA pour les notifications) : 0 DA.
 * Le stockage vit dans platform_settings ('global' → settings.igNotify).
 * Phase 2 (plus tard) : le même compte RÉPOND aux questions des marchands.
 */
import { supabaseRequest } from "./supabase.ts";

const GRAPH_VERSION = "v21.0";
const SETTINGS_KEY = "igNotify";

export type NotifyLink = { uid: string; aid: string; at: string };
export type NotifyConfig = {
  handle?: string;       // le @ du compte JawebFlow (sans @)
  token?: string;        // jeton d'envoi du compte JawebFlow
  igUserId?: string;     // id IG du compte JawebFlow
  codes?: Record<string, { uid: string; aid: string; exp: number }>;
  links?: Record<string, NotifyLink>; // igUserId du marchand -> compte
};

// ─── Stockage (platform_settings.row 'global', sans migration SQL) ───────────
export async function getNotifyConfig(env: any): Promise<NotifyConfig> {
  try {
    const res = await supabaseRequest(env, "platform_settings?id=eq.global&select=settings");
    const settings = res.ok ? (await res.json().catch(() => []))?.[0]?.settings : null;
    return settings?.[SETTINGS_KEY] || {};
  } catch {
    return {};
  }
}

export async function saveNotifyConfig(env: any, cfg: NotifyConfig): Promise<void> {
  const res = await supabaseRequest(env, "platform_settings?id=eq.global&select=settings");
  const settings = res.ok ? ((await res.json().catch(() => []))?.[0]?.settings || {}) : {};
  settings[SETTINGS_KEY] = cfg;
  await supabaseRequest(env, "platform_settings?id=eq.global", {
    method: "PATCH",
    body: JSON.stringify({ settings }),
  });
}

// ─── Envoi DM (même tuyau que les bots des marchands) ────────────────────────
async function sendDm(token: string, igRecipientId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://graph.instagram.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: igRecipientId }, message: { text } }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Activation : le marchand envoie « JF-XXXX » en DM ───────────────────────
export async function createActivationCode(env: any, uid: string, aid: string): Promise<{ code: string; link: string | null }> {
  const cfg = await getNotifyConfig(env);
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "JF-" + Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (cfg.codes?.[code]);
  cfg.codes = { ...(cfg.codes || {}), [code]: { uid, aid, exp: Date.now() + 30 * 60 * 1000 } };
  // purge des codes expirés (taille raisonnable)
  for (const [c, v] of Object.entries(cfg.codes)) {
    if ((v as any).exp < Date.now() - 3600_000) delete cfg.codes[c];
  }
  await saveNotifyConfig(env, cfg);
  const link = cfg.handle ? `https://ig.me/m/${cfg.handle}?text=${encodeURIComponent(code)}` : null;
  return { code, link };
}

export async function registerNotifyAccount(env: any, handle: string, token: string, igUserId: string): Promise<void> {
  const cfg = await getNotifyConfig(env);
  await saveNotifyConfig(env, { ...cfg, handle: handle.replace(/^@/, ""), token, igUserId: String(igUserId) });
}

export function isNotifyAccount(cfg: NotifyConfig, instagramAccountId?: string): boolean {
  return Boolean(cfg.igUserId && instagramAccountId && String(instagramAccountId) === String(cfg.igUserId));
}

/** Le message arrive sur le compte JawebFlow : code d'activation ou aide. Renvoie true si géré. */
export async function handleNotifyAccountMessage(env: any, event: any): Promise<boolean> {
  const cfg = await getNotifyConfig(env);
  if (!isNotifyAccount(cfg, event?.recipient?.id) || !cfg.token) return false;
  const senderId: string | undefined = event?.sender?.id;
  const text: string = typeof event?.message?.text === "string" ? event.message.text.trim() : "";
  if (!senderId) return true;

  const codeMatch = text.match(/^JF[-\s]?([A-Z2-9]{4,10})$/i);
  if (codeMatch && cfg.codes) {
    const code = "JF-" + codeMatch[1].toUpperCase();
    const entry = cfg.codes[code];
    if (entry && entry.exp > Date.now()) {
      cfg.links = { ...(cfg.links || {}), [senderId]: { uid: entry.uid, aid: entry.aid, at: new Date().toISOString() } };
      delete cfg.codes[code];
      await saveNotifyConfig(env, cfg);
      await sendDm(cfg.token, senderId, "✅ C'est activé ! Tu recevras ici tes alertes : nouveaux clients intéressés, demandes d'aide humaine… Réponds-nous de temps en temps pour garder la connexion ouverte. 🚀");
    } else {
      await sendDm(cfg.token, senderId, "⏳ Ce code a expiré. Retourne dans ton tableau de bord JawebFlow et régénère un nouveau code.");
    }
    return true;
  }

  await sendDm(
    cfg.token,
    senderId,
    "👋 Salut ! Ce compte envoie les alertes de ta boutique JawebFlow (nouveaux clients, demandes d'aide…).\nPour activer : tableau de bord → Instagram → « Recevoir les alertes dans Instagram », puis envoie ici le code affiché (format JF-XXXXX)."
  );
  return true;
}

// ─── Notifications vers le marchand ──────────────────────────────────────────
/** Anti-spam : 1 notification max / 2 h par clé (session ou client). */
const sentAt = new Map<string, number>();
function recentlySent(key: string): boolean {
  const at = sentAt.get(key);
  if (at && Date.now() - at < 2 * 3600_000) return true;
  sentAt.set(key, Date.now());
  if (sentAt.size > 500) for (const [k, t] of sentAt) if (Date.now() - t > 2 * 3600_000) sentAt.delete(k);
  return false;
}

/** 🔥 Nouveau lead : le marchand reçoit les détails directement sur Instagram. */
export async function notifyLead(env: any, assistantId: string, details: { name?: string; phone?: string; city?: string; email?: string; need?: string; source: string }): Promise<void> {
  try {
    const cfg = await getNotifyConfig(env);
    const link = Object.entries(cfg.links || {}).find(([, l]) => l.aid === assistantId);
    if (!link || !cfg.token) return;
    if (recentlySent(`lead:${assistantId}:${details.phone || link[0]}`)) return;
    const who = details.name || "Un visiteur";
    const parts = [
      `🔥 Nouveau client intéressé (${details.source}) !`,
      `👤 ${who}${details.city ? ` — ${details.city}` : ""}`,
      details.phone ? `📞 ${details.phone}` : "",
      details.email ? `✉️ ${details.email}` : "",
      details.need ? `💬 « ${details.need.slice(0, 160)} »` : "",
      "",
      "Rappelle-le vite, c'est maintenant que ça se joue 💪",
    ].filter(Boolean);
    await sendDm(cfg.token, link[0], parts.join("\n"));
  } catch { /* jamais bloquer le flux pour une notif */ }
}

/** 🙋 Transfert humain : le bot prévient le marchand qu'on demande sa présence. */
export async function notifyHumanTransfer(env: any, assistantId: string, who: string, lastMessage: string): Promise<void> {
  try {
    const cfg = await getNotifyConfig(env);
    const link = Object.entries(cfg.links || {}).find(([, l]) => l.aid === assistantId);
    if (!link || !cfg.token) return;
    if (recentlySent(`transfer:${assistantId}:${who}`)) return;
    await sendDm(
      cfg.token,
      link[0],
      `🙋 ${who} demande ta présence maintenant !\n💬 « ${String(lastMessage || "").slice(0, 180)} »\n👉 Réponds-lui directement dans la discussion de ta boutique.`
    );
  } catch { /* jamais bloquer le flux */ }
}

/** Le marchand a-t-il activé les notifs (pour l'UI) ? */
export async function isMerchantLinked(env: any, uid: string): Promise<boolean> {
  const cfg = await getNotifyConfig(env);
  return Object.values(cfg.links || {}).some((l) => l.uid === uid);
}

// ─── Détection « je veux un humain » (100 % code, 0 DA) ──────────────────────
const HUMAN_RE = /(parler (à|a|avec) (quelqu|une personne|un humain|un conseiller|un agent|un vrai|qqu|huma|cons)|conseiller|un humain|vraie personne|vraie pers|service client|parler au patron|مع موظف|بشري|وحدة بشرية|نبغيوحدة|احكي مع شي واحد)/i;
export function isHumanTransfer(text: string): boolean {
  return HUMAN_RE.test(String(text || ""));
}
export const HUMAN_TRANSFER_REPLY = "C'est noté ! 🙌 Je préviens immédiatement l'équipe — un humain prend le relais très vite. En attendant, je reste là si besoin.";

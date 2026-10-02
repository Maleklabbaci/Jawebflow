/**
 * JAWEBFLOW — Adresses web fournies par les marchands (webhook vers leur CRM,
 * Google Sheets, Zapier, Make…) : on n'accepte que de vraies adresses
 * publiques. Évite qu'un compte serve à sonder des machines internes (SSRF).
 */
export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

export function checkPublicHttpUrl(raw: unknown): UrlCheck {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, reason: 'Colle l’adresse (URL) de ton outil, par exemple https://hooks.zapier.com/…' };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: 'Cette adresse n’est pas valide. Elle doit commencer par https://' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'L’adresse doit commencer par https://' };
  if (url.username || url.password) return { ok: false, reason: 'N’écris pas d’identifiant ni de mot de passe dans l’adresse.' };
  const host = url.hostname.toLowerCase();
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[') || host.includes(':');
  if (
    isIp ||
    !host.includes('.') ||
    host === 'localhost' ||
    /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(host)
  ) {
    return { ok: false, reason: 'Utilise une vraie adresse de site (pas une adresse locale ou une adresse IP).' };
  }
  if (url.port && url.port !== '80' && url.port !== '443') return { ok: false, reason: 'Seuls les ports web habituels (80 et 443) sont acceptés.' };
  return { ok: true, url };
}

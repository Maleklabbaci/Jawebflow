/**
 * JAWEBFLOW — ISOLATION DES CLIENTS CÔTÉ WIDGET
 * ------------------------------------------------------------
 * Un simple `assistantId` ne protège rien : n'importe qui pouvait interroger la
 * base de connaissances d'un autre client via /api/chat. On permet donc à chaque
 * assistant de définir :
 *   - `widgetKey`      : une clé publique que seul le widget du client envoie ;
 *   - `allowedDomains` : liste de domaines d'où le widget a le droit d'appeler.
 * Si rien n'est configuré, on laisse passer (rétrocompatibilité).
 */

export type WidgetAccessConfig = {
  widgetKey?: unknown;
  allowedDomains?: unknown;
};

function domainList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === 'string') return value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return origin.toLowerCase();
  }
}

export function evaluateWidgetAccess(
  config: WidgetAccessConfig | null | undefined,
  provided: { key?: unknown; origin?: unknown },
): { allowed: boolean; reason?: 'key' | 'domaine' } {
  const widgetKey = String(config?.widgetKey || '').trim();
  if (widgetKey && String(provided.key || '') !== widgetKey) return { allowed: false, reason: 'key' };

  const domains = domainList(config?.allowedDomains);
  if (domains.length) {
    const origin = String(provided.origin || '').trim();
    if (!origin) return { allowed: false, reason: 'domaine' };
    const host = hostOf(origin).replace(/^www\./, '');
    const ok = domains.some((d) => {
      const bare = d.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
      return host === bare || host.endsWith(`.${bare}`);
    });
    if (!ok) return { allowed: false, reason: 'domaine' };
  }
  return { allowed: true };
}

/**
 * JAWEBFLOW — STATS + EMAIL DE RÉSUMÉ (partagé cron + test)
 * ------------------------------------------------------------
 * collectClientStats : conversations des dernières 24 h, contacts captés,
 * questions en attente — pour les assistants D'UN client.
 * buildDigestHtml : l'email prêt à envoyer (français, simple, chiffré gros).
 */

import { supabaseRequest } from './supabase.ts';

export interface ClientStats {
  conversations: number;
  prospects: number;
  prospectsSample: { name: string; phone?: string; need?: string }[];
  openQuestions: number;
}

export async function collectClientStats(env: any, assistantIds: string[]): Promise<ClientStats> {
  const stats: ClientStats = { conversations: 0, prospects: 0, prospectsSample: [], openQuestions: 0 };
  if (!assistantIds.length) return stats;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const orFilter = assistantIds.map(i => `assistant_id.eq.${encodeURIComponent(i)}`).join(',');

  // Conversations des dernières 24 h
  try {
    const res = await supabaseRequest(
      env,
      `conversation_contexts?or=(${orFilter})&created_at=gte.${since}&select=id`,
      { headers: { Prefer: 'count=exact' } }
    );
    if (res.ok) {
      const total = parseInt((res.headers.get('content-range') || '').split('/')[1] || '', 10);
      stats.conversations = isNaN(total) ? ((await res.json()) as any[]).length : total;
    }
  } catch { /* dégrade silencieusement */ }

  // Contacts captés des dernières 24 h (avec un échantillon lisible)
  try {
    const res = await supabaseRequest(
      env,
      `prospects?or=(${orFilter})&created_at=gte.${since}&select=data&order=created_at.desc&limit=5`,
      { headers: { Prefer: 'count=exact' } }
    );
    if (res.ok) {
      const total = parseInt((res.headers.get('content-range') || '').split('/')[1] || '', 10);
      stats.prospects = isNaN(total) ? ((await res.json()) as any[]).length : total;
      const rows = await res.json();
      for (const row of rows || []) {
        const d = row?.data || {};
        stats.prospectsSample.push({ name: d.name, phone: d.phone, need: d.need });
      }
    }
  } catch { /* dégrade silencieusement */ }

  // Questions en attente (apprentissage)
  try {
    const res = await supabaseRequest(
      env,
      `learning_questions?or=(${orFilter})&status=eq.open&select=id`,
      { headers: { Prefer: 'count=exact' } }
    );
    if (res.ok) {
      const total = parseInt((res.headers.get('content-range') || '').split('/')[1] || '', 10);
      stats.openQuestions = isNaN(total) ? ((await res.json()) as any[]).length : total;
    }
  } catch { /* dégrade silencieusement */ }

  return stats;
}

export function buildDigestHtml(displayName: string, stats: ClientStats, isTest = false): string {
  const prenom = String(displayName || '').split(' ')[0] || 'there';
  const contacts = stats.prospectsSample
    .filter(p => p.name || p.phone)
    .slice(0, 3)
    .map(p => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:14px"><b>${p.name || 'Visiteur'}</b>${p.phone ? ` — <span dir="ltr">${p.phone}</span>` : ''}${p.need ? `<br><span style="color:#777;font-size:12px">${String(p.need).slice(0, 80)}</span>` : ''}</td></tr>`)
    .join('');

  return `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px">
    <div style="background:#7c3aed;display:inline-block;padding:8px 14px;border-radius:10px;color:#fff;font-weight:bold">JawebFlow</div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:24px;margin-top:14px">
      <h1 style="font-size:19px;color:#0f172a;margin:0 0 4px">Bonjour ${prenom} 👋</h1>
      <p style="color:#475569;font-size:14px;margin:0 0 18px">${isTest ? 'Voici un <b>exemple</b> de votre résumé quotidien.' : 'Voici ce que votre assistant a fait <b>ces dernières 24 heures</b>.'}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
        <tr>
          <td style="background:#f5f3ff;border-radius:10px;padding:14px;text-align:center;width:33%">
            <div style="font-size:26px;font-weight:bold;color:#7c3aed">${stats.conversations}</div>
            <div style="font-size:11px;color:#64748b">CONVERSATIONS</div>
          </td>
          <td style="width:12px"></td>
          <td style="background:#ecfdf5;border-radius:10px;padding:14px;text-align:center;width:33%">
            <div style="font-size:26px;font-weight:bold;color:#059669">${stats.prospects}</div>
            <div style="font-size:11px;color:#64748b">CONTACTS CAPTÉS</div>
          </td>
          <td style="width:12px"></td>
          <td style="background:#fffbeb;border-radius:10px;padding:14px;text-align:center;width:33%">
            <div style="font-size:26px;font-weight:bold;color:#d97706">${stats.openQuestions}</div>
            <div style="font-size:11px;color:#64748b">À APPRENDRE</div>
          </td>
        </tr>
      </table>
      ${contacts ? `<p style="font-size:13px;color:#334155;margin:0 0 6px"><b>Derniers contacts intéressés :</b></p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">${contacts}</table>` : ''}
      <a href="https://jawebflow.pages.dev/dashboard" style="display:block;background:#7c3aed;color:#fff;text-align:center;padding:12px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px">Ouvrir mon tableau de bord</a>
      <p style="color:#94a3b8;font-size:11px;text-align:center;margin:16px 0 0">Votre assistant travaille 24h/24, même quand vous dormez 😴</p>
    </div>
  </div>
</body></html>`;
}

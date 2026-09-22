/**
 * JAWEBFLOW — ENVOI D'EMAILS RÉELS (Brevo)
 * ------------------------------------------------------------
 * Brevo (ex-Sendinblue) : 300 emails/jour gratuits, vérification de
 * l'expéditeur par simple clic (pas de configuration DNS nécessaire).
 * https://developers.brevo.com  →  POST /v3/smtp/email
 *
 * Variables d'environnement Cloudflare :
 *   BREVO_API_KEY      clé API du dashboard Brevo (Settings → SMTP & API)
 *   EMAIL_SENDER       email expéditeur vérifié chez Brevo (ex: noreply@jawebflow.dz)
 *   EMAIL_SENDER_NAME  nom affiché (ex: JawebFlow)
 */

export interface EmailEnv {
  BREVO_API_KEY?: string;
  EMAIL_SENDER?: string;
  EMAIL_SENDER_NAME?: string;
}

export function emailConfigured(env: EmailEnv): boolean {
  return Boolean(env.BREVO_API_KEY && env.EMAIL_SENDER);
}

export async function sendEmail(env: EmailEnv, to: string, subject: string, html: string): Promise<boolean> {
  if (!emailConfigured(env)) return false;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY as string,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: env.EMAIL_SENDER_NAME || 'JawebFlow', email: env.EMAIL_SENDER },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      console.error('[email] envoi refusé:', res.status, (await res.text().catch(() => '')).slice(0, 200));
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[email] échec:', e?.message || e);
    return false;
  }
}

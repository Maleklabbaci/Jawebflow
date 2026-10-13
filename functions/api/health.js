/**
 * JAWEBFLOW — ÉTAT DES INTÉGRATIONS (PAGES FUNCTIONS)
 * ------------------------------------------------------------
 * GET /api/health
 *
 * Les deux runbooks du dépôt (AUDIT.md §6.9 et SUPABASE_MIGRATION.md §4)
 * demandent de vérifier cette route après chaque déploiement. Cette page doit
 * répondre à UNE question : **« qu'est-ce qu'il me reste à régler ? »**
 *
 * Elle ne renvoie QUE des booléens et des NOMS de variables : jamais une clé,
 * même partielle. Les valeurs d'exemple de `.env.example` (« MY_GEMINI_API_KEY »,
 * « your_key »…) sont traitées comme absentes, sinon l'état afficherait
 * « configuré » à tort.
 *
 * `toFix` liste, en français, ce qui manque et où le trouver.
 */

import { supabaseConfigured } from '../_shared/supabase.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

/** `.env.example` livre des placeholders non vides : ils ne configurent rien. */
const PLACEHOLDER = /^(my_|your_|change[_-]?me|replace|placeholder|todo|xxx|xxx+|<)/i;

function configured(value) {
  return Boolean(value && !PLACEHOLDER.test(String(value).trim()));
}

/** Au moins une des variables proposées est renseignée (les noms de repli). */
function firstConfigured(names, env) {
  for (const name of names) if (configured(env[name])) return name;
  return null;
}

/**
 * Un besoin = une intégration. Renvoie `ok` + la liste EXACTE des variables
 * manquantes, pour que le propriétaire sache quoi coller dans Cloudflare.
 */
function need(env, alternatives) {
  const missing = [];
  for (const entry of alternatives) {
    const names = Array.isArray(entry) ? entry : [entry];
    if (!firstConfigured(names, env)) missing.push(names.join(' ou '));
  }
  return { ok: missing.length === 0, missing };
}

export async function onRequestGet(context) {
  const env = context.env || {};

  // ── Le strict nécessaire ────────────────────────────────────────────────
  const gemini = need(env, ['GEMINI_API_KEY']);
  const supabaseServer = { ok: supabaseConfigured(env), missing: supabaseConfigured(env) ? [] : ['SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY'] };
  // Ce que le NAVIGATEUR lit. Vite fige les VITE_* à la construction : si le
  // build a été fait ailleurs que chez Cloudflare, seul ce repli runtime peut
  // sauver la page (voir docs/DEPLOIEMENT.md).
  const siteFallback = need(env, [['VITE_SUPABASE_URL', 'SUPABASE_URL'], ['VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY']]);

  // ── Canaux de messagerie ────────────────────────────────────────────────
  // L'App Secret est commun aux produits Meta : celui d'Instagram suffit.
  const metaAppSecret = [['MESSENGER_APP_SECRET', 'INSTAGRAM_APP_SECRET'], ['WHATSAPP_APP_SECRET', 'INSTAGRAM_APP_SECRET']];
  const messenger = need(env, ['MESSENGER_PAGE_ACCESS_TOKEN', ...metaAppSecret]);
  const whatsapp = need(env, ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', ...metaAppSecret]);
  const telegram = need(env, ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET']);
  const tiktok = need(env, ['TIKTOK_ACCESS_TOKEN', 'TIKTOK_BUSINESS_ID', 'TIKTOK_APP_SECRET']);
  const metaWebhookVerify = need(env, [['META_VERIFY_TOKEN', 'INSTAGRAM_VERIFY_TOKEN', 'VERIFY_TOKEN']]);

  // ── Instagram (canal historique) ────────────────────────────────────────
  const instagram = need(env, ['INSTAGRAM_APP_SECRET', ['INSTAGRAM_ACCESS_TOKEN', 'META_PAGE_ACCESS_TOKEN']]);

  // ── Confort, facturation, tâches planifiées ─────────────────────────────
  const email = need(env, ['BREVO_API_KEY', 'EMAIL_SENDER']);
  // ⚠️ Le nom EXACT lu par functions/api/slickpay.js est SLICKPAY_API_KEY.
  //    (L'ancienne version de cette route testait SLICKPAY_PUBLIC_KEY et
  //     SLICKPAY_SECRET_KEY — des noms que le code ne lit nulle part : elle
  //     annonçait « non configuré » même quand tout était en place.)
  const slickpay = need(env, ['SLICKPAY_API_KEY']);
  const cron = need(env, ['CRON_SECRET']);
  const firebase = need(env, ['FIREBASE_SERVICE_ACCOUNT']);

  const integrations = {
    gemini: gemini.ok,
    supabase: supabaseServer.ok,
    siteFallback: siteFallback.ok,
    firebaseServiceAccount: firebase.ok,
    instagramMessaging: instagram.ok,
    metaWebhookVerify: metaWebhookVerify.ok,
    channels: {
      messenger: messenger.ok,
      whatsapp: whatsapp.ok,
      telegram: telegram.ok,
      tiktok: tiktok.ok,
    },
    email: email.ok,
    payments: { slickpay: slickpay.ok },
    cron: cron.ok,
    // Stripe n'est PAS implémenté côté Pages Functions (aucun code de paiement
    // ne l'appelle : il n'apparaît que dans l'ancien serveur Express). Ne pas le
    // configurer ne casse donc rien — SlickPay est la seule voie d'encaissement.
  };

  /**
   * Les priorités, en français : ce qui bloque tout, puis ce qui bloque un
   * canal, puis le confort. Chaque entrée dit QUOI mettre et OÙ le trouver.
   */
  const toFix = [];
  const push = (quoi, res, ou) => {
    if (!res.ok) toFix.push({ quoi, variables: res.missing, ou });
  };

  push('Le site ne peut joindre aucune base (page blanche).', siteFallback, 'Supabase → Project Settings → API, puis Cloudflare → Settings → Environment variables');
  push("Les serveurs ne peuvent pas lire la base (assistants, clients, facturation).", supabaseServer, 'Supabase → Project Settings → API (clé service_role)');
  push("L'assistant ne peut pas répondre : aucune clé IA.", gemini, 'https://aistudio.google.com/apikey');

  push('Instagram : les messages ne partent pas.', instagram, 'Meta for Developers → votre application');
  push('Meta refuse de vérifier votre webhook (il renvoie 503).', metaWebhookVerify, 'La valeur que VOUS choisissez, identique dans Meta et dans Cloudflare');
  push('Messenger : les messages ne partent pas.', messenger, 'Meta → jeton de page + App Secret');
  push('WhatsApp : les messages ne partent pas.', whatsapp, 'Meta → WhatsApp → jeton + Phone number ID (+ App Secret)');
  push('Telegram : les messages ne partent pas.', telegram, '@BotFather → jeton ; et un secret que vous choisissez');
  push('TikTok : les messages ne partent pas.', tiktok, 'TikTok for Business → Business Messaging (accès à demander)');

  push("Les e-mails (relances, notifications) ne partent pas.", email, 'brevo.com → Settings → SMTP & API');
  push('Encaissement SlickPay désactivé (les paiements restent manuels).', slickpay, 'slick-pay.com → votre tableau de bord → clé API');
  push('Les relances automatiques (cron) ne tournent pas.', cron, 'Une chaîne secrète que vous choisissez');
  push('Bases de connaissances historiques illisibles (facultatif).', firebase, 'Google Cloud → compte de service (JSON)');

  return new Response(
    JSON.stringify(
      {
        status: 'ok',
        runtime: 'cloudflare-pages-functions',
        integrations,
        // Ce qui reste à régler, par ordre d'importance (vide = tout va bien).
        toFix,
        note: toFix.length === 0
          ? 'Tout est configuré. Détail des canaux : docs/INSTALLATION_CANAUX.md'
          : 'Marche à suivre : docs/CONFIGURATION.md — seules les clés manquantes sont affichées, jamais leur valeur.',
        deployment: {
          branch: env.CF_PAGES_BRANCH || null,
          commit: env.CF_PAGES_COMMIT_SHA || null,
        },
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
    { status: 200, headers: cors },
  );
}

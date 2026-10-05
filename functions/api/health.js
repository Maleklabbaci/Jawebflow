/**
 * JAWEBFLOW — ÉTAT DES INTÉGRATIONS (PAGES FUNCTIONS)
 * ------------------------------------------------------------
 * GET /api/health
 *
 * Les deux runbooks du dépôt (AUDIT.md §6.9 et SUPABASE_MIGRATION.md §4)
 * demandent de vérifier cette route après chaque déploiement. Elle n'existait
 * que dans le serveur Express legacy (`server.ts`) : côté Cloudflare Pages, la
 * requête tombait sur le SPA et renvoyait du HTML avec un 200 — le contrôle
 * « passait » donc sans rien dire.
 *
 * La route ne renvoie QUE des booléens : jamais une clé, même partielle.
 * Les valeurs d'exemple de `.env.example` (« MY_GEMINI_API_KEY »…) sont
 * traitées comme absentes, sinon l'état afficherait « configuré » à tort.
 */

import { supabaseConfigured } from '../_shared/supabase.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

/** `.env.example` livre des placeholders non vides : ils ne configurent rien. */
const PLACEHOLDER = /^(my_|your_|change[_-]?me|replace|placeholder|todo|xxx|<)/i;

function configured(value) {
  return Boolean(value && !PLACEHOLDER.test(String(value).trim()));
}

export async function onRequestGet(context) {
  const env = context.env || {};

  const body = {
    status: 'ok',
    runtime: 'cloudflare-pages-functions',
    integrations: {
      // L'IA : sans clé, /api/chat répond par un refus explicite (jamais une
      // salutation inventée) — voir les `diagnostics` de /api/chat.
      gemini: configured(env.GEMINI_API_KEY),
      // La base principale (assistants, prospects, conversations, commandes).
      supabase: supabaseConfigured(env),
      // Temporaire : lecture des bases de connaissances et jetons Firebase.
      firebaseServiceAccount: configured(env.FIREBASE_SERVICE_ACCOUNT),
      instagramMessaging: configured(env.INSTAGRAM_APP_SECRET) && configured(env.INSTAGRAM_ACCESS_TOKEN),
      // Sans jeton de vérification, le webhook Meta renvoie 503 au lieu de 200.
      metaWebhookVerify: configured(env.INSTAGRAM_VERIFY_TOKEN) || configured(env.META_VERIFY_TOKEN),
      payments: {
        stripe: configured(env.STRIPE_SECRET_KEY),
        slickpay: configured(env.SLICKPAY_PUBLIC_KEY) && configured(env.SLICKPAY_SECRET_KEY),
      },
    },
    deployment: {
      branch: env.CF_PAGES_BRANCH || null,
      commit: env.CF_PAGES_COMMIT_SHA || null,
    },
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body, null, 2), { status: 200, headers: cors });
}

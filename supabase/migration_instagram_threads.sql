-- ============================================================================
-- MIGRATION : table instagram_threads (webhook Instagram 100 % Supabase)
-- ----------------------------------------------------------------------------
-- Remplace les documents Firestore instagram_integrations/{uid}/threads/{customerId}
-- qui servaient d'historique de conversation + buffer anti-doublons au webhook.
-- À coller dans : Supabase → SQL Editor → New query → Run
-- ============================================================================

create table if not exists public.instagram_threads (
  integration_id   text        not null,
  customer_id      text        not null,
  messages         jsonb       not null default '[]'::jsonb,
  handled_mids     jsonb       not null default '[]'::jsonb,
  pending_messages jsonb       not null default '[]'::jsonb,
  pending_token    text,
  updated_at       timestamptz not null default now(),
  primary key (integration_id, customer_id)
);

alter table public.instagram_threads enable row level security;

-- Aucune policy volontairement : la table n'est accessible QUE côté serveur
-- (clé service_role du webhook). Jamais exposée aux navigateurs clients.

-- ============================================================================
-- MIGRATION : table bot_mutes (le client peut faire taire le bot : « stop »)
-- ----------------------------------------------------------------------------
-- Le visiteur écrit « stop » -> une ligne est créée -> le bot se tait sur CE
-- canal pour CET assistant. Il écrit « reprends » -> la ligne est supprimée.
-- Fonctionne pour le widget du site (session web_xxx) ET Instagram (ig_<id>).
-- À coller dans : Supabase → SQL Editor → New query → Run
-- ============================================================================

create table if not exists public.bot_mutes (
  assistant_id text not null,
  session_id   text not null,
  created_at   timestamptz not null default now(),
  primary key (assistant_id, session_id)
);

alter table public.bot_mutes enable row level security;

-- Aucune policy volontairement : accessible uniquement côté serveur
-- (clé service_role du chat et du webhook Instagram).

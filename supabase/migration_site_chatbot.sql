-- ----------------------------------------------------------------------------
-- JAWEBFLOW — LE CHATBOT DU SITE VITRINE (réglages)
-- ============================================================================
-- Le site public (les pages AVANT l'interface : accueil, tarifs, services,
-- contact…) affiche une bulle de discussion. Ses réglages vivent dans UNE
-- ligne de cette table : `id = 'site_chat'`.
--
-- Ce qu'elle contient (lu par la console admin, jamais par le navigateur) :
--   • l'interrupteur du chat, les questions rapides, le message d'accueil ;
--   • la base de connaissance rédigée à la main — c'est la SEULE source de
--     l'IA : elle ne sort jamais vers un visiteur (elle reste côté serveur) ;
--   • le ton, la langue, le modèle, la phrase de secours ;
--   • toute l'apparence du widget (couleurs, forme, position, accroche, CSS).
--
-- À exécuter : Supabase → SQL Editor → coller → Run. Idempotent : on peut le
-- relancer sans rien casser.
-- ----------------------------------------------------------------------------

create table if not exists public.platform_settings (
  id          text        primary key,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- RLS : AUCUN accès depuis le navigateur.
--   • lecture publique  → /api/site-chat (liste blanche de champs, jamais la
--     base de connaissance ni les réglages internes) ;
--   • écriture          → /api/admin/site-chat (jeton admin + rôle vérifié).
-- Seule la clé service (côté serveur) touche donc cette table.
alter table public.platform_settings enable row level security;

drop policy if exists "service role platform_settings" on public.platform_settings;
create policy "service role platform_settings" on public.platform_settings
  for all to service_role using (true) with check (true);

-- Force PostgREST à voir la table tout de suite (sinon « schema cache »).
notify pgrst, 'reload schema';

-- ============================================================================
-- JAWEBFLOW — À COLLER DANS SUPABASE → SQL EDITOR → RUN
-- ----------------------------------------------------------------------------
-- But : vérifier que la table des réglages existe VRAIMENT, la réparer si
-- besoin, et surtout forcer l'API Supabase à la voir TOUT DE SUITE.
--
-- Sans danger : on peut le relancer autant de fois qu'on veut, rien n'est
-- écrasé (les réglages déjà enregistrés sont conservés).
--
-- À lire en bas : LE VERDICT (un petit tableau).
-- ============================================================================

-- 1) La table manque ? On la crée (sinon on ne touche à rien).
create table if not exists public.platform_settings (
  id          text        primary key,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- 2) Verrouillage : seul le serveur (clé service_role) touche cette table.
alter table public.platform_settings enable row level security;

drop policy if exists "service role platform_settings" on public.platform_settings;
create policy "service role platform_settings" on public.platform_settings
  for all to service_role using (true) with check (true);

-- 3) Droits explicites, au cas où le projet a des droits par défaut modifiés.
grant all on table public.platform_settings to service_role;

-- 4) La ligne des réglages (elle ne remplace PAS des réglages déjà enregistrés).
insert into public.platform_settings (id, data)
values ('site_chat', '{}'::jsonb)
on conflict (id) do nothing;

-- 5) L'API garde la liste des tables en cache : on la force à recharger.
notify pgrst, 'reload schema';

-- 6) LE VERDICT — c'est ce tableau qu'il faut lire :
--    table        = public.platform_settings  → la table existe ✅
--    lignes       = 1                          → la ligne des réglages est là ✅
--    rls_active   = true                       → aucun visiteur ne peut la lire ✅
--    regles_acces = 1                          → le serveur a bien le droit ✅
select
  to_regclass('public.platform_settings')                                    as "table",
  (select count(*) from public.platform_settings)                            as "lignes",
  (select relrowsecurity from pg_class
     where oid = 'public.platform_settings'::regclass)                       as "rls_active",
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'platform_settings')        as "regles_acces",
  current_database()                                                         as "base";

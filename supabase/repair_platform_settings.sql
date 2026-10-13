-- ============================================================================
-- JAWEBFLOW — RÉPARATION de la table des réglages du chatbot
-- À COLLER DANS SUPABASE → SQL EDITOR → RUN
-- ----------------------------------------------------------------------------
-- POURQUOI CE SCRIPT :
-- la table `platform_settings` existait DÉJÀ dans ce projet, mais créée par une
-- ancienne version : elle n'a pas la colonne `data`. Du coup :
--   • `create table if not exists` ne faisait RIEN (la table est déjà là) ;
--   • l'écriture échouait → « column data does not exist ».
--
-- Ce script AJOUTE ce qui manque, sans rien supprimer ni écraser.
-- On peut le relancer autant de fois qu'on veut.
-- ============================================================================

-- 1) Ce qui manque est ajouté (si c'est déjà là : aucune action).
alter table public.platform_settings
  add column if not exists data jsonb not null default '{}'::jsonb;

alter table public.platform_settings
  add column if not exists updated_at timestamptz not null default now();

-- 2) Verrouillage : seul le serveur (clé service_role) touche cette table.
alter table public.platform_settings enable row level security;

drop policy if exists "service role platform_settings" on public.platform_settings;
create policy "service role platform_settings" on public.platform_settings
  for all to service_role using (true) with check (true);

grant all on table public.platform_settings to service_role;

-- 3) La ligne des réglages du site (créée seulement si elle n'existe pas).
insert into public.platform_settings (id, data)
select 'site_chat', '{}'::jsonb
where not exists (select 1 from public.platform_settings where id = 'site_chat');

-- 4) L'API Supabase garde la liste des tables en mémoire : on la force à recharger.
notify pgrst, 'reload schema';

-- 5) LE VERDICT — une seule ligne à lire en bas :
--    colonnes    → doit contenir « id, data, updated_at »
--    lignes      → 1
--    colonne_data → 1  (la colonne qui manquait)
select
  (select string_agg(column_name, ', ' order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'platform_settings')      as "colonnes",
  (select count(*) from public.platform_settings)                            as "lignes",
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'platform_settings'
      and column_name = 'data')                                              as "colonne_data",
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'platform_settings')         as "regles_acces";

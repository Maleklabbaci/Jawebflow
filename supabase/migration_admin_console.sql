-- ============================================================================
-- JAWEBFLOW — CONSOLE ADMIN : PLEINS DROITS (bloc UNIQUE, idempotent)
-- ----------------------------------------------------------------------------
-- À coller EN ENTIER dans Supabase → SQL Editor → Run.
-- Ce bloc :
--   1. garantit les fonctions is_admin() / is_superadmin() ;
--   2. garantit la table invoices (si jamais absente) ;
--   3. garantit TOUTES les policies dont la console admin a besoin,
--      notamment « admins update all prospects » (changement de statut
--      d'un prospect depuis la console) qui n'existait dans aucun script ;
--   4. garantit le verrou anti-escalade (trigger protect_user_profile).
-- Il peut être ré-exécuté sans risque : tout est vérifié avant création.
-- ============================================================================

do $console$
declare
  pol record;
begin

  -- ------------------------------------------------------------------ 1.
  -- Fonctions de rôle (security definer : lisent public.users même si
  -- l'appelant n'a pas le droit de lire toute la table).
  execute $fn$
    create or replace function public.is_admin()
    returns boolean language sql stable security definer set search_path = public
    as $$ select exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','superadmin')) $$;
  $fn$;

  execute $fn$
    create or replace function public.is_superadmin()
    returns boolean language sql stable security definer set search_path = public
    as $$ select exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'superadmin') $$;
  $fn$;

  -- ------------------------------------------------------------------ 2.
  -- Table invoices (colonnes camelCase entre guillemets, comme le frontend).
  create table if not exists public.invoices (
    id text primary key,
    "customerEmail" text not null,
    "customerName" text,
    "planName" text,
    "amountDzd" numeric,
    "amountUsd" numeric,
    "paymentMethod" text,
    status text not null default 'paid',
    date text,
    "createdAt" timestamptz not null default now(),
    "validatedByAdmin" boolean not null default false
  );
  create index if not exists invoices_created_idx on public.invoices ("createdAt" desc);
  create index if not exists invoices_email_idx on public.invoices (lower("customerEmail"));
  alter table public.invoices enable row level security;

  -- ------------------------------------------------------------------ 3.
  -- Verrou anti-escalade : personne ne s'auto-promeut depuis le navigateur.
  execute $fn$
    create or replace function public.protect_user_profile()
    returns trigger language plpgsql security definer set search_path = public
    as $$
    begin
      if current_user in ('service_role','postgres','supabase_admin') then return new; end if;
      if tg_op = 'INSERT' then
        if new.role is distinct from 'user' then
          raise exception 'Rôle initial interdit : un nouveau compte doit être "user".';
        end if;
        return new;
      end if;
      if new.id is distinct from old.id then raise exception 'Changement d''identifiant interdit.'; end if;
      if new.email is distinct from old.email then raise exception 'Changement d''email interdit depuis le client.'; end if;
      if new.role is distinct from old.role and not public.is_superadmin() then
        raise exception 'Changement de rôle réservé au superadmin.';
      end if;
      return new;
    end;
    $$;
  $fn$;
  drop trigger if exists trg_protect_user_profile on public.users;
  create trigger trg_protect_user_profile
    before insert or update on public.users
    for each row execute function public.protect_user_profile();

  -- ------------------------------------------------------------------ 4.
  -- Policies garanties une par une (créées seulement si absentes).
  for pol in
    select * from (values
      -- users : l'admin lit tout, le superadmin modifie/supprime
      ('users','select','admins read all users',        'for select to authenticated using (public.is_admin())'),
      ('users','update','superadmin update all users',  'for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin())'),
      ('users','delete','superadmin delete users',      'for delete to authenticated using (public.is_superadmin())'),
      -- assistants : l'admin lit / modifie / supprime tout
      ('assistants','select','admins read all assistants','for select to authenticated using (public.is_admin())'),
      ('assistants','update','admins update all assistants','for update to authenticated using (public.is_admin()) with check (public.is_admin())'),
      ('assistants','delete','admins delete all assistants','for delete to authenticated using (public.is_admin())'),
      -- prospects : l'admin lit / MODIFIE (statut) / supprime tout
      ('prospects','select','admins read all prospects','for select to authenticated using (public.is_admin())'),
      ('prospects','update','admins update all prospects','for update to authenticated using (public.is_admin()) with check (public.is_admin())'),
      ('prospects','delete','admins delete all prospects','for delete to authenticated using (public.is_admin())'),
      -- conversations : l'admin lit le compteur d'usage (onglet Plans)
      ('conversation_contexts','select','admins read conversation usage','for select to authenticated using (public.is_admin())'),
      -- réglages plateforme : l'admin lit et modifie les quotas des plans
      ('platform_settings','select','admins read platform settings','for select to authenticated using (public.is_admin())'),
      ('platform_settings','all','admins manage platform settings','for all to authenticated using (public.is_admin()) with check (public.is_admin())'),
      -- invoices : service_role + client (ses factures) + admin (tout) + superadmin (suppression)
      ('invoices','all',   'service role only invoices','for all to service_role using (true) with check (true)'),
      ('invoices','select','clients read own invoices', 'for select to authenticated using (lower("customerEmail") = lower(auth.email()))'),
      ('invoices','select','admins read all invoices',  'for select to authenticated using (public.is_admin())'),
      ('invoices','insert','admins create invoices',    'for insert to authenticated with check (public.is_admin())'),
      ('invoices','update','admins update invoices',    'for update to authenticated using (public.is_admin()) with check (public.is_admin())'),
      ('invoices','delete','superadmin delete invoices','for delete to authenticated using (public.is_superadmin())')
    ) as t(tablename, cmd, policyname, definition)
  loop
    if not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = pol.tablename and p.policyname = pol.policyname
    ) then
      execute format('create policy %I on public.%I %s', pol.policyname, pol.tablename, pol.definition);
    end if;
  end loop;

  raise notice 'CONSOLE ADMIN : toutes les permissions sont en place.';
end $console$;

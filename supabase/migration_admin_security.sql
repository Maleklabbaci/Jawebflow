-- ===========================================================================
-- JawebFlow : ADMIN HAUTE SÉCURITÉ
-- À exécuter DANS L'ORDRE après : schema.sql, schema_auth_migration.sql,
-- migration_learning.sql (SQL Editor → New query → coller → Run).
--
-- ⚠️ AVANT D'EXÉCUTER : remplace l'email et le mot de passe du super admin
--    dans le bloc "CRÉATION DU COMPTE" ci-dessous.
--
-- Ce que ce fichier fait :
--   1. Crée la table `invoices` (elle n'existait PAS -> l'admin crashait).
--   2. Crée le compte SUPER ADMIN (auth + profil role='superadmin').
--   3. Bouche le trou critique : un utilisateur ne pouvait pas s'auto-
--      promouvoir admin, mais rien ne l'empêchait côté base -> trigger.
--   4. Donne à l'admin les droits d'écriture nécessaires (gérer plans,
--      supprimer assistants/prospects, créer des factures) — et UNIQUEMENT
--      ceux-là.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- FONCTIONS de rôle (is_admin existe déjà dans schema_auth_migration.sql ;
-- on ajoute is_superadmin). Créées AVANT les policies qui les utilisent.
-- ---------------------------------------------------------------------------
create or replace function public.is_superadmin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'superadmin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. TABLE invoices (colonnes camelCase entre guillemets : le frontend
--    écrit/lie exactement ces noms via Supabase JS).
-- ---------------------------------------------------------------------------
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

create policy "service role only invoices" on public.invoices
  for all to service_role using (true) with check (true);

-- Un client ne voit QUE ses propres factures.
create policy "clients read own invoices" on public.invoices
  for select to authenticated
  using (lower("customerEmail") = lower(auth.email()));

-- L'admin voit tout, crée et modifie ; seul le superadmin peut supprimer
-- (une facture = pièce comptable : pas de suppression pour un admin simple).
create policy "admins read all invoices" on public.invoices
  for select to authenticated using (public.is_admin());
create policy "admins create invoices" on public.invoices
  for insert to authenticated with check (public.is_admin());
create policy "admins update invoices" on public.invoices
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "superadmin delete invoices" on public.invoices
  for delete to authenticated using (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- 2. VERROU ANTI-ESCALADE : personne ne peut s'auto-promouvoir admin,
--    changer un rôle, ou modifier id/email depuis le navigateur.
--    Seul le superadmin (ou le serveur service_role) peut toucher aux rôles.
-- ---------------------------------------------------------------------------
create or replace function public.protect_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Le serveur garde tous les droits (création de comptes, scripts...).
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Un nouveau compte naît toujours 'user' (jamais admin d'office).
    if new.role is distinct from 'user' then
      raise exception 'Rôle initial interdit : un nouveau compte doit être "user".';
    end if;
    return new;
  end if;

  -- id et email sont intouchables côté client.
  if new.id is distinct from old.id then
    raise exception 'Changement d''identifiant interdit.';
  end if;
  if new.email is distinct from old.email then
    raise exception 'Changement d''email interdit depuis le client.';
  end if;

  -- Seul le SUPERADMIN peut modifier un rôle.
  if new.role is distinct from old.role and not public.is_superadmin() then
    raise exception 'Changement de rôle réservé au superadmin.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_user_profile on public.users;
create trigger trg_protect_user_profile
  before insert or update on public.users
  for each row execute function public.protect_user_profile();

-- ---------------------------------------------------------------------------
-- 4. DROITS D'ÉCRITURE DE L'ADMIN (le dashboard admin agit depuis le
--    navigateur avec le jeton de l'admin connecté, pas en service_role).
-- ---------------------------------------------------------------------------
-- Admin : gérer (mettre à jour / supprimer) tous les assistants et prospects.
create policy "admins update all assistants" on public.assistants
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete all assistants" on public.assistants
  for delete to authenticated using (public.is_admin());
create policy "admins delete all prospects" on public.prospects
  for delete to authenticated using (public.is_admin());

-- Superadmin : gérer les comptes (changer un rôle, supprimer un compte).
create policy "superadmin update all users" on public.users
  for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy "superadmin delete users" on public.users
  for delete to authenticated using (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- 5. CRÉATION DU COMPTE SUPER ADMIN — MÉTHODE FIABLE
--    On ne crée PLUS le compte en insérant dans auth.users (cassé sur
--    certaines versions Supabase). Le compte auth doit être créé par le
--    bouton officiel (Authentication → Add user, coche "Auto confirm"),
--    puis ce bloc lui attribue le rôle superadmin.
--    ⚠️ Remplace l'email ci-dessous par ton email admin.
-- ---------------------------------------------------------------------------
do $$
declare
  admin_email text := 'admin@jawebflow.com';  -- ⚠️ TON email admin
  admin_id uuid;
begin
  select id into admin_id from auth.users where email = admin_email;

  if admin_id is null then
    raise exception 'COMPTE AUTH INTROUVABLE (%) : crée-le dans Supabase → Authentication → Add user (mot de passe fort + coche Auto confirm), puis RE-EXÉCUTE ce script.', admin_email;
  end if;

  insert into public.users (id, email, display_name, role)
  values (admin_id, admin_email, 'Super Admin', 'superadmin')
  on conflict (id) do update
    set role = 'superadmin',
        email = excluded.email,
        updated_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- 6. NOTE SÉCURITÉ
--    - Après la 1ère connexion : change le mot de passe (Supabase Dashboard →
--      Authentication → Users → l'admin → Update user) et active la 2FA
--      (Authentication → MFA) pour ce compte.
--    - Le mot de passe ci-dessus est haché en base (bcrypt) : il n'apparaît
--      nulle part en clair après exécution.
--    - Aucun compte ne peut devenir admin depuis l'application : seul ce SQL
--      (ou le superadmin connecté) peut attribuer un rôle.
-- ===========================================================================

-- ============================================================================
-- 🔒 MIGRATION : MODULE RÉSEAUX SOCIAUX (verrouillé par défaut)
-- ----------------------------------------------------------------------------
-- À coller dans : Supabase → SQL Editor → New query → Run
-- (sans danger si exécuté plusieurs fois : tout est « if not exists »)
--
-- POURQUOI CETTE MIGRATION EXISTE
-- JawebFlow vend deux choses distinctes :
--   • le CHATBOT À INTÉGRER DANS LE SITE WEB  → ouvert à tous les clients ;
--   • le MODULE RÉSEAUX SOCIAUX (Instagram, Messenger, WhatsApp, Telegram,
--     TikTok) → vendu à part, ouvert client par client par le propriétaire.
--
-- Ce script ajoute :
--   1. `users.social_enabled` (booléen, FAUX par défaut) : l'interrupteur du
--      module. Tant qu'il est faux, le serveur refuse (403) tout branchement
--      de canal — même si le client appelle l'API directement. Son tableau de
--      bord affiche un cadenas et un bouton « Demander l'activation ».
--   2. Le garde-fou anti-contournement : le client ne peut PAS s'ouvrir le
--      module lui-même depuis son navigateur (il peut modifier son profil,
--      alors la fonction `protect_user_profile()` est remise à jour).
--   3. `social_requests` : la trace des demandes d'activation envoyées depuis
--      les tableaux de bord (l'e-mail part en parallèle à contact@jawebflow.dz).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. L'INTERRUPTEUR DU MODULE, SUR LE COMPTE CLIENT
-- ----------------------------------------------------------------------------
alter table public.users
  add column if not exists social_enabled boolean not null default false;

comment on column public.users.social_enabled is
  'Module réseaux sociaux (Instagram, Messenger, WhatsApp, Telegram, TikTok) : ouvert par le propriétaire pour CE compte. Les rôles admin/superadmin ne sont jamais bloqués par le module.';

-- ----------------------------------------------------------------------------
-- 2. ANTI-CONTOURNEMENT
--    « users update own profile » laisse le client modifier sa propre ligne.
--    On remet donc `protect_user_profile()` à jour : `social_enabled` devient
--    réservé au superadmin (console admin) et au serveur (service_role).
--    Le reste de la fonction est identique à migration_admin_security.sql.
-- ----------------------------------------------------------------------------
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
    -- Un nouveau compte naît toujours 'user' (jamais admin d'office) et
    -- sans le module réseaux sociaux.
    if new.role is distinct from 'user' then
      raise exception 'Rôle initial interdit : un nouveau compte doit être "user".';
    end if;
    new.social_enabled := false;
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

  -- 🔒 Seul le SUPERADMIN peut ouvrir/fermer le module réseaux sociaux.
  -- Sans cette ligne, un client technicien pourrait appeler l'API Supabase
  -- depuis son navigateur et s'ouvrir le module tout seul.
  if new.social_enabled is distinct from old.social_enabled and not public.is_superadmin() then
    raise exception 'Module Réseaux sociaux : activation réservée à JawebFlow.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_user_profile on public.users;
create trigger trg_protect_user_profile
  before insert or update on public.users
  for each row execute function public.protect_user_profile();

-- ----------------------------------------------------------------------------
-- 3. LES DEMANDES D'ACTIVATION (« Demander l'activation » du tableau de bord)
--    L'e-mail reste le canal principal ; cette table est la trace, pour ne
--    jamais perdre une demande si l'e-mail n'est pas configuré.
-- ----------------------------------------------------------------------------
create table if not exists public.social_requests (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users(id) on delete set null,
  email       text,
  company     text,
  message     text,
  status      text        not null default 'pending',
  created_at  timestamptz not null default now()
);

create index if not exists social_requests_created_idx
  on public.social_requests (created_at desc);

alter table public.social_requests enable row level security;

drop policy if exists "service role social_requests" on public.social_requests;
create policy "service role social_requests" on public.social_requests
  for all to service_role using (true) with check (true);

-- Le marchand voit ses propres demandes (il sait où il en est)…
drop policy if exists "owner reads social_requests" on public.social_requests;
create policy "owner reads social_requests" on public.social_requests
  for select to authenticated using (user_id = auth.uid());

-- …et le propriétaire les voit toutes depuis la console admin.
drop policy if exists "admins read social_requests" on public.social_requests;
create policy "admins read social_requests" on public.social_requests
  for select to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. LES CLIENTS DÉJÀ ÉQUIPÉS NE PERDENT PAS LEUR ACCÈS
--    Un client qui avait DÉJÀ branché un canal garde son module ouvert au
--    moment de la migration : lui fermer la porte au nez serait un incident.
--    (Les réponses continuent de toute façon : le verrou ne concerne que
--     l'espace de branchement, jamais la conversation en cours.)
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.channel_integrations') is not null then
    update public.users u
       set social_enabled = true
     where u.social_enabled = false
       and exists (
         select 1 from public.channel_integrations ci where ci.user_id = u.id
       );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. OPTIONNEL — ouvrir le module d'un coup
-- ----------------------------------------------------------------------------
-- Normalement, le déblocage se fait client par client depuis la console admin
-- (onglet Clients → bouton « 🔒 Réseaux sociaux » de chaque ligne).
--
-- Ouvrir à TOUS les comptes existants :
--   update public.users set social_enabled = true;
--
-- N'ouvrir qu'aux formules payantes :
--   update public.users set social_enabled = true where plan in ('basic','pro','enterprise');
--
-- Tout refermer (sauf le propriétaire) :
--   update public.users set social_enabled = false where role not in ('admin','superadmin');
-- ----------------------------------------------------------------------------

-- Demande à Supabase de recharger sa liste de tables (prise en compte immédiate).
notify pgrst, 'reload schema';

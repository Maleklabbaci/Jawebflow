-- ============================================================================
-- MIGRATION : Automatisations Instagram (style ManyChat)
-- ----------------------------------------------------------------------------
--  • Commentaire sous un post/reel  ➜ réponse publique + message privé
--  • Mot-clé reçu en message privé  ➜ réponse automatique (sans IA)
--  • Réponse à une story / mention  ➜ message automatique
--
-- À coller dans : Supabase → SQL Editor → New query → Run
-- (sans danger si exécuté plusieurs fois : tout est "if not exists")
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Les automatisations créées par le marchand
-- ----------------------------------------------------------------------------
create table if not exists public.ig_automations (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  name               text        not null default 'Nouvelle automatisation',
  trigger_type       text        not null
                     check (trigger_type in ('comment', 'dm_keyword', 'story_reply', 'story_mention')),
  enabled            boolean     not null default false,
  -- tout le détail (publication visée, mots-clés, réponses, boutons…) est dans
  -- `config` : on peut ajouter des options plus tard SANS nouvelle migration.
  config             jsonb       not null default '{}'::jsonb,
  -- compteurs (mis à jour de façon atomique par ig_automation_bump)
  triggered_count    integer     not null default 0,
  public_reply_count integer     not null default 0,
  dm_count           integer     not null default 0,
  error_count        integer     not null default 0,
  last_triggered_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists ig_automations_user_idx
  on public.ig_automations (user_id, trigger_type);

-- ----------------------------------------------------------------------------
-- 2. Le journal : une ligne = une personne qui a déclenché une automatisation
--    (sert aussi d'anti-doublon : Meta renvoie parfois le même événement)
-- ----------------------------------------------------------------------------
create table if not exists public.ig_automation_events (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  automation_id      uuid        references public.ig_automations(id) on delete set null,
  automation_name    text,
  trigger_type       text        not null,
  contact_id         text        not null,   -- identifiant Instagram de la personne
  contact_username   text,
  source_id          text,                   -- id du commentaire (ou du message)
  media_id           text,                   -- publication concernée
  input_text         text,                   -- ce que la personne a écrit
  public_reply_text  text,
  public_reply_status text,                  -- sent | failed | skipped
  dm_text            text,
  dm_status          text,                   -- sent | failed | skipped | awaiting_follow
  gate_state         text,                   -- awaiting | released (abonnement demandé)
  outcome            text        not null default 'processing',
                                             -- processing | done | partial | failed | skipped
  error              text,                   -- cause en français si ça a échoué
  note               text,                   -- information (ex. « déjà servi »)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (automation_id, source_id)
);

create index if not exists ig_automation_events_user_idx
  on public.ig_automation_events (user_id, created_at desc);
create index if not exists ig_automation_events_contact_idx
  on public.ig_automation_events (automation_id, contact_id);

-- ----------------------------------------------------------------------------
-- 2 bis. Un témoin de vie : quand Instagram nous a envoyé un commentaire pour la
--        dernière fois (permet d'expliquer « j'ai commenté et rien ne se passe »)
-- ----------------------------------------------------------------------------
create table if not exists public.ig_automation_state (
  user_id         uuid        primary key references auth.users(id) on delete cascade,
  last_comment_at timestamptz,
  updated_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Sécurité : chaque marchand ne VOIT que ses propres lignes.
--    Toutes les écritures passent par le serveur (clé service_role), qui
--    contrôle et nettoie ce qui est enregistré.
-- ----------------------------------------------------------------------------
alter table public.ig_automations       enable row level security;
alter table public.ig_automation_events enable row level security;
alter table public.ig_automation_state  enable row level security;

drop policy if exists "service role ig_automations" on public.ig_automations;
create policy "service role ig_automations" on public.ig_automations
  for all to service_role using (true) with check (true);

drop policy if exists "owner reads ig_automations" on public.ig_automations;
create policy "owner reads ig_automations" on public.ig_automations
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "service role ig_automation_events" on public.ig_automation_events;
create policy "service role ig_automation_events" on public.ig_automation_events
  for all to service_role using (true) with check (true);

drop policy if exists "owner reads ig_automation_events" on public.ig_automation_events;
create policy "owner reads ig_automation_events" on public.ig_automation_events
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "service role ig_automation_state" on public.ig_automation_state;
create policy "service role ig_automation_state" on public.ig_automation_state
  for all to service_role using (true) with check (true);

drop policy if exists "owner reads ig_automation_state" on public.ig_automation_state;
create policy "owner reads ig_automation_state" on public.ig_automation_state
  for select to authenticated using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. Compteurs atomiques (évite de perdre des +1 quand 2 commentaires arrivent
--    en même temps). Réservé au serveur.
-- ----------------------------------------------------------------------------
create or replace function public.ig_automation_bump(
  p_id        uuid,
  p_triggered integer default 0,
  p_public    integer default 0,
  p_dm        integer default 0,
  p_errors    integer default 0
) returns void
language sql
security definer
set search_path = public
as $$
  update public.ig_automations
     set triggered_count    = triggered_count    + greatest(p_triggered, 0),
         public_reply_count = public_reply_count + greatest(p_public, 0),
         dm_count           = dm_count           + greatest(p_dm, 0),
         error_count        = error_count        + greatest(p_errors, 0),
         last_triggered_at  = case when p_triggered > 0 then now() else last_triggered_at end
   where id = p_id;
$$;

revoke all on function public.ig_automation_bump(uuid, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.ig_automation_bump(uuid, integer, integer, integer, integer) to service_role;

-- Demande à Supabase de recharger sa liste de tables (prise en compte immédiate).
notify pgrst, 'reload schema';

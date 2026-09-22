-- JawebFlow: Phase 0 de la migration Firebase -> Supabase
-- Ce fichier COMPLÈTE supabase/schema.sql (ne le remplace pas). À exécuter
-- après schema.sql sur le même projet Supabase (SQL Editor ou `supabase db push`).
--
-- Contenu :
--   1. Table `users` (profil, remplace la collection Firestore `users`)
--   2. Table `evolving_memories` (remplace la collection du même nom)
--   3. Table `instagram_integrations` (remplace la collection du même nom)
--   4. Policies RLS PAR UTILISATEUR sur `users`, `assistants`, `prospects`,
--      `instagram_integrations` — en plus des policies `service_role` déjà
--      présentes dans schema.sql. C'est ce qui manque aujourd'hui pour que
--      le futur AuthContext (Supabase Auth) puisse lire/écrire directement
--      depuis le navigateur, comme le faisait Firestore avec ses propres
--      règles de sécurité.
--
-- IMPORTANT : `assistants.user_id` et `prospects` (via assistant_id) sont en
-- ce moment des colonnes `text` libres (compatibles avec les anciens UID
-- Firebase). Une fois les comptes migrés vers Supabase Auth, `user_id` doit
-- contenir le `auth.uid()` Supabase (uuid en texte) pour que ces policies
-- fonctionnent. Voir scripts/migrate-firebase-users.ts : le script force
-- volontairement le même id côté Supabase que l'ancien uid Firebase pour
-- éviter d'avoir à réécrire ces colonnes.

-- ----------------------------------------------------------------------
-- 1. users
-- ----------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  company_name text,
  phone_number text,
  photo_url text,
  role text not null default 'user', -- 'user' | 'admin' | 'superadmin'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists users_email_idx on public.users(email);

alter table public.users enable row level security;

create policy "service role only users" on public.users
  for all to service_role using (true) with check (true);

-- Chaque utilisateur peut lire/modifier SON PROPRE profil (équivalent de
-- l'ancienne règle Firestore `request.auth.uid == userId`).
create policy "users read own profile" on public.users
  for select to authenticated using (auth.uid() = id);
create policy "users update own profile" on public.users
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "users insert own profile" on public.users
  for insert to authenticated with check (auth.uid() = id);

-- ----------------------------------------------------------------------
-- 2. evolving_memories (usage interne serveur uniquement -> service_role only,
--    aucun accès direct navigateur, comme côté Firestore)
-- ----------------------------------------------------------------------
create table if not exists public.evolving_memories (
  assistant_id text primary key,
  preferred_tone text,
  adapted_expertise text,
  user_preferences_summary text,
  learned_patterns jsonb not null default '[]'::jsonb,
  total_interactions integer not null default 0,
  last_evolved_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.evolving_memories enable row level security;
create policy "service role only evolving_memories" on public.evolving_memories
  for all to service_role using (true) with check (true);

-- ----------------------------------------------------------------------
-- 3. instagram_integrations (1 ligne par utilisateur, lu/écrit par le
--    dashboard client -> a besoin d'une policy par utilisateur)
-- ----------------------------------------------------------------------
create table if not exists public.instagram_integrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  connected boolean not null default false,
  assistant_id text,
  instagram_user_id text,
  instagram_username text,
  page_id text,
  page_name text,
  profile_picture_url text,
  auto_reply_enabled boolean not null default true,
  respond_to_stories boolean not null default false,
  respond_to_comments boolean not null default false,
  assistant_tone text,
  custom_greeting text,
  access_token text, -- sensible : ne JAMAIS lire cette colonne depuis le
                      -- client après migration, seulement le backend
                      -- (service_role). Ajouter une vue publique sans cette
                      -- colonne si le dashboard a besoin de lire l'état.
  last_connected_at timestamptz,
  webhook_status text default 'pending',
  total_messages_handled integer not null default 0,
  unresolved_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.instagram_integrations enable row level security;
create policy "service role only instagram_integrations" on public.instagram_integrations
  for all to service_role using (true) with check (true);
create policy "users manage own instagram_integrations" on public.instagram_integrations
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------
-- 4. Policies par utilisateur sur les tables déjà créées par schema.sql
-- ----------------------------------------------------------------------
-- assistants : un utilisateur ne peut voir/modifier que ses propres assistants.
-- (user_id est `text` ici pour rester compatible avec schema.sql — cast
-- explicite de auth.uid() en text pour la comparaison.)
create policy "users manage own assistants" on public.assistants
  for all to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

-- prospects : accès via l'assistant parent (pas de user_id direct dans la table).
create policy "users manage own prospects" on public.prospects
  for all to authenticated
  using (
    exists (
      select 1 from public.assistants a
      where a.id = prospects.assistant_id and a.user_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1 from public.assistants a
      where a.id = prospects.assistant_id and a.user_id = auth.uid()::text
    )
  );

-- ----------------------------------------------------------------------
-- 5. Rôle admin : remplace SUPER_ADMIN_EMAILS / isUserAdmin() côté client.
--    Fonction utilisable dans d'autres policies ("using (public.is_admin())").
-- ----------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('admin', 'superadmin')
  );
$$;

create policy "admins read all users" on public.users
  for select to authenticated using (public.is_admin());
create policy "admins read all assistants" on public.assistants
  for select to authenticated using (public.is_admin());
create policy "admins read all prospects" on public.prospects
  for select to authenticated using (public.is_admin());

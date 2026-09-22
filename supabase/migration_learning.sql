-- ===========================================================================
-- JawebFlow : boucle d'apprentissage en production
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
--
-- learning_questions : questions auxquelles l'IA n'a PAS su répondre
--   (auto-détection côté functions/api/chat.js + boutons 👎 du widget).
--   Le commerçant y répond depuis l'onglet "Apprentissage" du dashboard,
--   la réponse devient une note de connaissance.
-- message_feedback : notes 👍/👎 laissées par les visiteurs sur les réponses.
--
-- Comme pour le reste de la plateforme, l'accès passe uniquement par les
-- Cloudflare Functions (clé service_role) : RLS verrouillée au service role.
-- ===========================================================================

create table if not exists public.learning_questions (
  id text primary key default gen_random_uuid()::text,
  assistant_id text not null references public.assistants(id) on delete cascade,
  question text not null,
  ai_answer text,
  reason text not null default 'no_info',   -- no_info | eval_no_info | thumbs_down
  status text not null default 'open',      -- open | resolved
  answer text,                              -- réponse fournie par le commerçant
  occurrences int not null default 1,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists learning_questions_assistant_idx
  on public.learning_questions(assistant_id, status, created_at desc);

create table if not exists public.message_feedback (
  id text primary key default gen_random_uuid()::text,
  assistant_id text not null references public.assistants(id) on delete cascade,
  session_id text,
  rating text not null check (rating in ('up', 'down')),
  message_text text,
  created_at timestamptz not null default now()
);
create index if not exists message_feedback_assistant_idx
  on public.message_feedback(assistant_id, created_at desc);

alter table public.learning_questions enable row level security;
alter table public.message_feedback enable row level security;

create policy "service role only learning" on public.learning_questions
  for all to service_role using (true) with check (true);
create policy "service role only feedback" on public.message_feedback
  for all to service_role using (true) with check (true);

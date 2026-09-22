-- JawebFlow: Supabase migration schema
create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.assistants (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  business_name text not null default 'Mon Entreprise',
  website_url text,
  config jsonb not null default '{}'::jsonb,
  knowledge_notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistants_user_id_idx on public.assistants(user_id);

create table if not exists public.knowledge_documents (
  id text primary key default gen_random_uuid()::text,
  assistant_id text not null references public.assistants(id) on delete cascade,
  source_url text,
  title text not null default '',
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(768),
  scanned_at timestamptz not null default now(),
  unique (assistant_id, source_url)
);
create index if not exists knowledge_documents_assistant_idx on public.knowledge_documents(assistant_id);

create table if not exists public.conversation_contexts (
  id text primary key default gen_random_uuid()::text,
  assistant_id text not null references public.assistants(id) on delete cascade,
  session_id text not null default 'default_session',
  channel text not null default 'web_widget',
  user_message text not null,
  assistant_response text not null,
  created_at timestamptz not null default now()
);
create index if not exists conversation_contexts_lookup_idx on public.conversation_contexts(assistant_id, session_id, created_at desc);

create table if not exists public.prospects (
  id text primary key default gen_random_uuid()::text,
  assistant_id text not null references public.assistants(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prospects_assistant_idx on public.prospects(assistant_id, updated_at desc);

alter table public.assistants enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.conversation_contexts enable row level security;
alter table public.prospects enable row level security;

-- Firebase Auth remains the identity provider during this migration.
-- Browser writes are intentionally denied until Supabase Auth/JWT mapping is configured.
-- Cloudflare uses SUPABASE_SERVICE_ROLE_KEY server-side.
create policy "service role only assistants" on public.assistants for all to service_role using (true) with check (true);
create policy "service role only knowledge" on public.knowledge_documents for all to service_role using (true) with check (true);
create policy "service role only conversations" on public.conversation_contexts for all to service_role using (true) with check (true);
create policy "service role only prospects" on public.prospects for all to service_role using (true) with check (true);

create or replace function public.match_knowledge(
  p_assistant_id text,
  p_query_embedding vector(768),
  p_match_count int default 8
) returns table (id text, source_url text, title text, content text, similarity float)
language sql stable as $$
  select kd.id, kd.source_url, kd.title, kd.content,
         1 - (kd.embedding <=> p_query_embedding) as similarity
  from public.knowledge_documents kd
  where kd.assistant_id = p_assistant_id and kd.embedding is not null
  order by kd.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 20));
$$;

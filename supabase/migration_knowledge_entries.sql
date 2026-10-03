-- JawebFlow — base de connaissances structurée et compatible tout secteur.
-- À exécuter une fois dans Supabase SQL Editor, après schema.sql et
-- schema_auth_migration.sql. Les notes historiques sont copiées sans effacer
-- knowledge_notes : le champ JSON reste un miroir de compatibilité.

create table if not exists public.knowledge_entries (
  assistant_id text not null references public.assistants(id) on delete cascade,
  id text not null,
  title text not null default '',
  content text not null default '',
  category text not null default 'services',
  source text not null default 'manual',
  source_url text,
  enabled boolean not null default true,
  status text not null default 'active' check (status in ('active', 'pending_review', 'rejected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (assistant_id, id)
);

create index if not exists knowledge_entries_assistant_status_idx
  on public.knowledge_entries(assistant_id, status, enabled);
create index if not exists knowledge_entries_assistant_category_idx
  on public.knowledge_entries(assistant_id, category, updated_at desc);

alter table public.knowledge_entries enable row level security;

drop policy if exists "service role only knowledge entries" on public.knowledge_entries;
create policy "service role only knowledge entries" on public.knowledge_entries
  for all to service_role using (true) with check (true);

-- Transfert idempotent des anciennes fiches JSON vers la table structurée.
-- Les catégories historiques (produits, liens, politiques, learned, etc.) sont
-- converties en cinq catégories stables : services, tarifs, livraison, contact,
-- faq. Les fiches apprises automatiquement sont désactivées en attente de revue.
insert into public.knowledge_entries (
  assistant_id, id, title, content, category, source, source_url, enabled,
  status, metadata, created_at, updated_at
)
select
  a.id,
  coalesce(nullif(n.note->>'id', ''), 'legacy_' || md5(a.id || ':' || n.note::text)),
  coalesce(nullif(n.note->>'title', ''), 'Information importée'),
  coalesce(n.note->>'content', ''),
  case
    when lower(coalesce(n.note->>'category', '')) ~ '(prix|tarif|price|pricing|promo|promotion|discount)' then 'tarifs'
    when lower(coalesce(n.note->>'category', '')) ~ '(livraison|shipping|paiement|payment|delivery|commande)' then 'livraison'
    when lower(coalesce(n.note->>'category', '')) ~ '(contact|liens|links|adresse|horaire|pratique)' then 'contact'
    when lower(coalesce(n.note->>'category', '')) ~ '(faq|garantie|warranty|politique|learned|appris|condition|retour)' then 'faq'
    else 'services'
  end,
  case
    when lower(coalesce(n.note->>'source', '')) ~ '(learn|appris|conversation|auto)' or lower(coalesce(n.note->>'category', '')) = 'learned' then 'learned'
    when lower(coalesce(n.note->>'source', '')) ~ 'quick' then 'quick_add'
    when lower(coalesce(n.note->>'source', '')) in ('scanned', 'site', 'scan') then 'site'
    when lower(coalesce(n.note->>'source', '')) = 'extracted' and coalesce(n.note->>'id', '') not like 'imported_%' then 'site'
    when lower(coalesce(n.note->>'source', '')) = 'extracted' or coalesce(n.note->>'id', '') like 'imported_%' then 'imported'
    else 'manual'
  end,
  nullif(n.note->>'sourceUrl', ''),
  case
    when (lower(coalesce(n.note->>'source', '')) ~ '(learn|appris|conversation|auto)' or lower(coalesce(n.note->>'category', '')) = 'learned')
      and coalesce(n.note->>'approvalStatus', n.note->>'status', '') not in ('approved', 'active') then false
    else coalesce((n.note->>'enabled')::boolean, true)
  end,
  case
    when (lower(coalesce(n.note->>'source', '')) ~ '(learn|appris|conversation|auto)' or lower(coalesce(n.note->>'category', '')) = 'learned')
      and coalesce(n.note->>'approvalStatus', n.note->>'status', '') not in ('approved', 'active') then 'pending_review'
    else 'active'
  end,
  jsonb_build_object(
    'legacyCategory', n.note->>'category',
    'legacySource', n.note->>'source'
  ) || coalesce(n.note->'metadata', '{}'::jsonb),
  coalesce(nullif(n.note->>'createdAt', '')::timestamptz, a.created_at),
  coalesce(nullif(n.note->>'updatedAt', '')::timestamptz, a.updated_at)
from public.assistants a
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(a.knowledge_notes) = 'array' then a.knowledge_notes else '[]'::jsonb end
) as n(note)
where nullif(n.note->>'content', '') is not null
on conflict (assistant_id, id) do nothing;

-- Les documents vectorisés restent dans knowledge_documents (index de recherche
-- du bot). Ils sont exposés dans la même interface et regroupés avec les fiches,
-- sans créer un doublon de contenu dans la table relationnelle.

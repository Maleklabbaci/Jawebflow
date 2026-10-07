-- ============================================================================
-- MIGRATION : CANAUX MULTIPLES (Messenger, WhatsApp, TikTok, Telegram)
-- ----------------------------------------------------------------------------
-- À coller dans : Supabase → SQL Editor → New query → Run
-- (sans danger si exécuté plusieurs fois : tout est "if not exists")
--
-- Trois tables, et c'est tout :
--   • channel_integrations → quel assistant répond sur quel compte de quel canal
--   • channel_messages     → LE COMPTEUR DE FACTURATION (pricing.billable de Meta)
--   • channel_credits      → les recharges prépayées achetées par le client
--
-- ⚠️ Types : `assistants.id` et `assistants.user_id` sont des TEXT chez
-- JawebFlow (voir schema.sql), seul `auth.users.id` est un UUID. On suit donc
-- la convention du dépôt (`ig_automations`) :
--   assistant_id text  →  references public.assistants(id)
--   user_id      uuid  →  references auth.users(id)
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Les connexions : une ligne = un canal branché pour un assistant
-- ----------------------------------------------------------------------------
create table if not exists public.channel_integrations (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  assistant_id  text        not null references public.assistants(id) on delete cascade,
  channel       text        not null
                check (channel in ('messenger', 'whatsapp', 'tiktok', 'telegram')),
  -- Identifiant du compte côté plateforme :
  --   Messenger  → id de la page Facebook
  --   WhatsApp   → phone_number_id
  --   TikTok     → business id (ou clé d'URL)
  --   Telegram   → clé d'URL du webhook (Telegram n'envoie pas d'id de compte)
  account_id    text        not null,
  display_name  text,
  access_token  text,                       -- jeton de page / numéro / bot
  phone_number  text,                       -- WhatsApp uniquement (affichage)
  connected     boolean     not null default true,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (channel, account_id)              -- un compte ne peut appartenir qu'à un assistant
);

create index if not exists channel_integrations_assistant_idx
  on public.channel_integrations (assistant_id, channel);
create index if not exists channel_integrations_user_idx
  on public.channel_integrations (user_id);

-- ----------------------------------------------------------------------------
-- 2. Le compteur de messages — SOURCE DE LA REFACTURATION
--    Une ligne par message entrant/sortant. `billable` vient de Meta
--    (accusé de livraison : pricing.billable) — on ne l'estime JAMAIS.
-- ----------------------------------------------------------------------------
create table if not exists public.channel_messages (
  id            uuid        primary key default gen_random_uuid(),
  -- Rempli par le serveur à partir de `channel_integrations.user_id`.
  -- FACULTATIF À DESSEIN : un compteur qui ne s'écrit pas parce qu'un
  -- propriétaire manque serait un trou de facturation. La lecture du marchand
  -- passe de toute façon par la policy ci-dessous (propriété de l'assistant).
  user_id       uuid        references auth.users(id) on delete cascade,
  assistant_id  text        not null references public.assistants(id) on delete cascade,
  channel       text        not null,
  direction     text        not null check (direction in ('in', 'out')),
  -- id du message côté plateforme : sert d'anti-doublon (Meta renvoie
  -- plusieurs accusés pour le même message : sent, delivered, read)
  message_id    text,
  contact_id    text,
  billable      boolean     not null default false,
  category      text,                        -- marketing | utility | service | authentication
  from_ad       boolean     not null default false,  -- fenêtre gratuite des pubs
  created_at    timestamptz not null default now()
);

-- Anti-doublon : un même message (canal + id + sens) ne compte qu'une fois.
-- L'anti-renvoi des webhooks s'appuie dessus via (contact_id, message_id).
create unique index if not exists channel_messages_dedup_idx
  on public.channel_messages (channel, message_id, direction)
  where message_id is not null;

create index if not exists channel_messages_usage_idx
  on public.channel_messages (assistant_id, channel, created_at desc);
create index if not exists channel_messages_dedup_lookup_idx
  on public.channel_messages (assistant_id, channel, contact_id, message_id);

-- Vue : la jauge « X / 1 000 » du tableau de bord, par assistant et par mois.
-- `security_invoker` : la vue respecte la RLS de `channel_messages`, donc un
-- marchand ne voit QUE ses propres chiffres.
create or replace view public.channel_monthly_usage
  with (security_invoker = true) as
select user_id,
       assistant_id,
       channel,
       date_trunc('month', created_at) as month,
       count(*) filter (where direction = 'out' and billable)      as billable_out,
       count(*) filter (where direction = 'out' and not billable)  as free_out,
       count(*) filter (where direction = 'in')                    as inbound
from public.channel_messages
group by 1, 2, 3, 4;

-- ----------------------------------------------------------------------------
-- 3. Les recharges prépayées (au-delà du forfait inclus du plan)
--    Décision commerciale : Pro = 1 000 messages inclus, Enterprise = 5 000,
--    puis recharge. Voir docs/DECISION_WHATSAPP_PLANS.md.
-- ----------------------------------------------------------------------------
create table if not exists public.channel_credits (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        references auth.users(id) on delete cascade,
  assistant_id  text        not null references public.assistants(id) on delete cascade,
  channel       text        not null,
  quantity      integer     not null check (quantity > 0),
  invoice_id    text,
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists channel_credits_assistant_idx
  on public.channel_credits (assistant_id, channel);
create index if not exists channel_credits_user_idx
  on public.channel_credits (user_id);

-- ----------------------------------------------------------------------------
-- 4. Sécurité (RLS) — même logique que les automatisations Instagram :
--    le marchand ne LIT que ses lignes ; les écritures des compteurs passent
--    par le serveur (clé service_role) pour qu'ils restent fiables.
-- ----------------------------------------------------------------------------
alter table public.channel_integrations enable row level security;
alter table public.channel_messages     enable row level security;
alter table public.channel_credits      enable row level security;

-- 4.1 Connexions : le serveur écrit, le marchand peut aussi brancher lui-même.
drop policy if exists "service role channel_integrations" on public.channel_integrations;
create policy "service role channel_integrations" on public.channel_integrations
  for all to service_role using (true) with check (true);

drop policy if exists "owner manages channel_integrations" on public.channel_integrations;
create policy "owner manages channel_integrations" on public.channel_integrations
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4.2 Compteurs de facturation et crédits : LECTURE seule pour le marchand.
drop policy if exists "service role channel_messages" on public.channel_messages;
create policy "service role channel_messages" on public.channel_messages
  for all to service_role using (true) with check (true);

drop policy if exists "owner reads channel_messages" on public.channel_messages;
create policy "owner reads channel_messages" on public.channel_messages
  for select to authenticated using (
    user_id = auth.uid()
    -- `assistants.user_id` est un TEXT chez JawebFlow : on caste l'UUID.
    or exists (
      select 1 from public.assistants a
      where a.id = channel_messages.assistant_id and a.user_id = auth.uid()::text
    )
  );

drop policy if exists "service role channel_credits" on public.channel_credits;
create policy "service role channel_credits" on public.channel_credits
  for all to service_role using (true) with check (true);

drop policy if exists "owner reads channel_credits" on public.channel_credits;
create policy "owner reads channel_credits" on public.channel_credits
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.assistants a
      where a.id = channel_credits.assistant_id and a.user_id = auth.uid()::text
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Purge : garder 3 mois de messages facturables suffit pour la facturation
--    et la jauge ; au-delà, la vue agrège déjà les totaux.
--    (À planifier une fois par mois si la base grossit.)
-- ----------------------------------------------------------------------------
-- delete from public.channel_messages where created_at < now() - interval '3 months';

-- Demande à Supabase de recharger sa liste de tables (prise en compte immédiate).
notify pgrst, 'reload schema';

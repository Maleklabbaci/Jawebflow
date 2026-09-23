-- ============================================================================
-- MIGRATION : comptabilité du coût IA + COMPTEUR PONDÉRÉ DE QUOTA
-- ----------------------------------------------------------------------------
-- 1) tokens_in / tokens_out / model : consommation réelle renvoyée par Gemini
--    sur chaque réponse IA (lue par la carte admin « 💸 Coût IA ce mois »).
-- 2) weight : poids de quota par message —
--       message simple      = 1 unité
--       photo (vision)      = 4 unités
--       recherche produits  = +2 unités
--       politesse (salam)   = 0 unité (pas d'IA)
--    1 CONVERSATION COMMERCIALE = 8 UNITÉS
--    (ex : une photo + 4 messages = 8 unités = 1 conversation)
-- 3) Vue assistant_monthly_usage : agrège les unités du mois par assistant
--    (c'est elle que lit la jauge « X / 1000 » du tableau de bord client).
--
-- À coller dans : Supabase → SQL Editor → New query → Run
-- ============================================================================

alter table public.conversation_contexts add column if not exists tokens_in int;
alter table public.conversation_contexts add column if not exists tokens_out int;
alter table public.conversation_contexts add column if not exists model text;
alter table public.conversation_contexts add column if not exists weight int default 1;

create index if not exists conv_ctx_created_idx on public.conversation_contexts (created_at desc);

create or replace view public.assistant_monthly_usage as
select assistant_id,
       date_trunc('month', created_at) as month,
       coalesce(sum(coalesce(weight, 1)), 0) as units,
       count(*) as messages,
       coalesce(sum(coalesce(tokens_in, 0)), 0) as tokens_in,
       coalesce(sum(coalesce(tokens_out, 0)), 0) as tokens_out
from public.conversation_contexts
group by 1, 2;

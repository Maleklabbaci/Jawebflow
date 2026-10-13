/**
 * JAWEBFLOW — POST /api/voice/knowledge
 * ============================================================================
 * 🔎 LA RECHERCHE DE L'AGENT VOCAL : « dis-moi juste ce qu'il faut ».
 *
 * Pendant un appel, l'agent ne transporte plus la base de connaissance dans son
 * prompt (6 000 caractères, ~1 500 jetons, renvoyés à chaque tour de parole). Il
 * appelle l'outil `chercher_information` avec les mots du client ; ce point
 * d'entrée cherche dans la base du compte et ne renvoie QUE les lignes utiles,
 * plafonnées à ~900 caractères.
 *
 * Deux clients possibles :
 *   • le site vitrine (`site: true`) → la base vient de `platform_settings`
 *     (`site_chat.ai.knowledge`), la même que le chat écrit ;
 *   • le widget d'un marchand (`assistantId`) → les fiches du compte
 *     (`knowledge_entries`), avec repli sur les anciennes notes `knowledgeNotes`,
 *     la FAQ et la liste des tarifs.
 *
 * Ce que cette route ne fait JAMAIS :
 *   • renvoyer la base entière (le plafond est dur : 900 caractères) ;
 *   • répondre à un robot qui vide la base : 60 recherches / 10 min / IP, et le
 *     même contrôle d'accès widget que la création d'appel pour les marchands ;
 *   • inventer : si rien ne correspond, elle répond `found: false` et l'agent
 *     dit honnêtement qu'il ne sait pas.
 */
import { readSiteChatConfig, siteContactFacts, SITE_ASSISTANT_ID } from '../../_shared/site-chat.ts';
import {
  supabaseConfigured,
  supabaseGetAssistant,
  supabaseAssistantRowToConfig,
  supabaseListKnowledgeEntries,
} from '../../_shared/supabase.ts';
import { evaluateWidgetAccess } from '../../_shared/widget-access.ts';
import { rateLimited } from '../../_shared/rate-limit.ts';
import { businessInfoFacts, compactKnowledgeNotes, selectRelevantText } from '../../_shared/prompt.ts';
import { selectKnowledgeSections, estimateTokens } from '../../_shared/rag.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

/** Plafond ABSOLU de ce qu'on renvoie à l'agent : au-delà, on ne cherche plus,
 *  on facture. 900 caractères ≈ 225 jetons, la dose utile pour une réponse. */
export const VOICE_KB_ANSWER_CHARS = 900;

/** Longueur maximale de la question acceptée (une question parlée est courte). */
export const VOICE_KB_QUESTION_CHARS = 300;

/**
 * 📇 LES COORDONNÉES OFFICIELLES — la seule façon dont un fait du commerce
 * arrive dans un appel. L'agent vocal n'a AUCUNE donnée client dans ses
 * consignes : quand le client demande le numéro, l'adresse ou les horaires, il
 * appelle cet outil et reçoit ces quelques lignes, filtrées par compte.
 */
const VITAL_FACTS_LABELS: Record<string, string> = {
  telephone: 'Téléphone',
  adresse: 'Adresse',
  horaires: 'Horaires',
  joursFermes: 'Jours fermés',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
};

/** Une question qui appelle les coordonnées / horaires / la livraison. */
const VITAL_FACTS_RE =
  /horaire|adresse|telephone|téléphone|numero|numéro|contact|mail|whatsapp|livraison|ou etes|où etes|ou etre|ou se trouve|وقت|عنوان|رقم|هاتف|وين|فين|شحال/i;

export function voiceFactsLine(facts: Record<string, string> | null | undefined): string {
  const parts = Object.entries(facts || {})
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => `${VITAL_FACTS_LABELS[key] || key} : ${String(value).trim()}`);
  return parts.length ? `INFOS OFFICIELLES DU COMMERCE (à citer exactement) : ${parts.join(' · ')}` : '';
}

const clientIp = (request: Request) =>
  request.headers.get('CF-Connecting-IP') ||
  (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
  request.headers.get('x-real-ip') ||
  'inconnue';

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}

export async function onRequestPost(context: any) {
  const env = context.env || {};
  try {
    const body = await context.request.json().catch(() => ({} as any));
    const question = String(body?.question ?? '').replace(/\s+/g, ' ').trim().slice(0, VOICE_KB_QUESTION_CHARS);
    if (!question) return json({ ok: true, found: false, text: '', reason: 'question vide' });

    const ip = clientIp(context.request);
    if (rateLimited(`voice-kb:${ip}`, { max: 60, windowMs: 10 * 60_000 })) {
      // Un appel dure 5 minutes : soixante recherches suffisent largement. Au
      // pire, l'agent dit qu'il ne sait pas — jamais de panne visible.
      return json({ ok: false, found: false, text: '', error: 'Trop de recherches — réessayez dans quelques minutes.' }, 429);
    }

    const assistantId = String(body?.assistantId || '').trim();
    const isSite = body?.site === true || assistantId === SITE_ASSISTANT_ID;

    if (isSite) {
      const { config } = await readSiteChatConfig(env);
      const selection = selectKnowledgeSections(config.ai.knowledge, question, {
        budgetChars: VOICE_KB_ANSWER_CHARS,
        // Pas de repli sur le début de la base : une question sans réponse doit
        // rester sans réponse (l'agent le dit honnêtement au téléphone).
        fallbackToHead: false,
        // Un vrai recoupement est demandé : un mot outil en commun ne fait pas
        // une réponse (sinon le bot répondrait les tarifs à une question de moto).
        minScore: 1,
      });
      // 📇 Les coordonnées de l'équipe voyagent avec la réponse à l'outil, pas
      // dans les consignes de l'agent.
      const wantsFacts = VITAL_FACTS_RE.test(question);
      const facts = wantsFacts ? voiceFactsLine(siteContactFacts(config)) : '';
      const pieces = [facts, selection.text];
      const text = pieces.filter(Boolean).join('\n').trim().slice(0, VOICE_KB_ANSWER_CHARS);
      return json({
        ok: true,
        found: text.length > 0,
        text,
        chars: text.length,
        tokens: estimateTokens(text.length),
        scope: 'site',
      });
    }

    if (!assistantId) return json({ ok: false, found: false, text: '', error: 'assistantId requis' }, 400);
    if (!supabaseConfigured(env)) {
      return json({ ok: true, found: false, text: '', reason: 'base non configurée' });
    }

    // Même contrôle d'accès que la création de l'appel : la base d'un marchand
    // ne se lit pas depuis n'importe quel site.
    const assistant = await supabaseGetAssistant(env, assistantId);
    const row = assistant?.data;
    if (!row) return json({ ok: false, found: false, text: '', error: 'Assistant introuvable' }, 404);
    const config = supabaseAssistantRowToConfig(row);
    const access = evaluateWidgetAccess(config, {
      key: body?.widgetKey,
      origin: String(body?.origin || context.request.headers.get('Origin') || '').trim(),
    });
    if (!access.allowed) {
      return json(
        { ok: false, found: false, text: '', error: access.reason === 'key' ? 'Clé de widget invalide' : 'Domaine non autorisé' },
        403,
      );
    }

    const parts: string[] = [];
    let found = 0;
    try {
      const base = await supabaseListKnowledgeEntries(env, assistantId);
      if (base.available && base.entries.length) {
        const relevant = compactKnowledgeNotes(base.entries, question);
        if (relevant.trim()) {
          parts.push(relevant.trim());
          found += 1;
        }
      }
    } catch (error: any) {
      console.warn('[voice/knowledge] fiches indisponibles:', error?.message || error);
    }

    if (!parts.length && Array.isArray(config?.knowledgeNotes) && config.knowledgeNotes.length) {
      const relevant = compactKnowledgeNotes(config.knowledgeNotes, question);
      if (relevant.trim()) {
        parts.push(relevant.trim());
        found += 1;
      }
    }
    if (!parts.length && config?.faqText) {
      const faq = selectRelevantText(config.faqText, question, 400);
      if (faq) {
        parts.push(`FAQ :\n${faq}`);
        found += 1;
      }
    }
    if (!parts.length && config?.pricingServicesText) {
      const pricing = selectRelevantText(config.pricingServicesText, question, 400);
      if (pricing) {
        parts.push(`TARIFS :\n${pricing}`);
        found += 1;
      }
    }

    // 📇 Même règle côté marchand : les coordonnées du compte courant sortent de
    // sa propre fiche (`config.businessInfo`), et de nulle part ailleurs.
    // Coordonnées demandées (numéro, adresse, horaires…) : elles sortent de la
    // fiche du compte courant. Sinon on n'ajoute rien — une question sans
    // réponse doit rester sans réponse, l'agent le dit honnêtement.
    const facts = VITAL_FACTS_RE.test(question) ? voiceFactsLine(businessInfoFacts(config)) : '';
    if (facts) parts.unshift(facts);

    const text = parts.join('\n').trim().slice(0, VOICE_KB_ANSWER_CHARS);
    return json({
      ok: true,
      found: text.length > 0,
      text,
      chars: text.length,
      tokens: estimateTokens(text.length),
      scope: 'assistant',
      sources: found,
    });
  } catch (e: any) {
    console.error('[voice/knowledge]', e?.message || e);
    // Jamais d'erreur visible pour le visiteur : l'agent dira simplement qu'il
    // ne sait pas et prendra son numéro.
    return json({ ok: true, found: false, text: '', reason: 'erreur technique' });
  }
}

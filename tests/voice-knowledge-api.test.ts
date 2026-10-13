/**
 * 🔎 L'OUTIL DE RECHERCHE DE L'AGENT VOCAL — tests d'intégration.
 * ============================================================================
 * Ce que ces tests protègent (demande du client, 13/10/2026) :
 *   1. pendant un appel, la base de connaissance n'est PLUS dans le prompt :
 *      l'agent CHERCHE et le serveur ne renvoie que les lignes utiles ;
 *   2. la réponse est TOUJOURS plafonnée (900 caractères) : jamais la base
 *      entière, jamais le catalogue complet ;
 *   3. une question sans réponse renvoie `found: false` — l'agent dira qu'il ne
 *      sait pas au lieu d'inventer ;
 *   4. la base du site vitrine et celle d'un marchand passent par le même
 *      point d'entrée, avec les mêmes garde-fous (60 recherches / 10 min / IP).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as knowledgeApi from '../functions/api/voice/knowledge';
import { DEFAULT_SITE_KNOWLEDGE } from '../functions/_shared/site-chat';
import { ENV, installFakes, seedMerchant } from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;

beforeEach(() => {
  fx = installFakes();
  seedMerchant(fx.supabase);
});
afterEach(() => fx.restore());

const ask = (body: Record<string, unknown>, ip = '30.0.0.1', env: any = ENV) =>
  knowledgeApi.onRequestPost({
    request: new Request('https://jawebflow.test/api/voice/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify(body),
    }),
    env,
  });

const seedSite = (knowledge: string) =>
  fx.supabase.seed('platform_settings', [
    { id: 'site_chat', data: { enabled: true, ai: { enabled: true, knowledge } } },
  ]);

/** Une base de 8 000 caractères, comme celle rédigée à la main dans la console. */
const grosseBase = `${DEFAULT_SITE_KNOWLEDGE}\n\n${Array.from({ length: 14 }, (_, i) =>
  `SERVICE ${i}\nLe service numéro ${i} : description détaillée, conditions, délais et questions fréquentes des visiteurs.`.repeat(5)).join('\n\n')}`;

describe('/api/voice/knowledge — l’agent cherche au lieu de tout emporter', () => {
  it('ne renvoie QUE les lignes utiles, plafonnées, jamais la base entière', async () => {
    seedSite(grosseBase);
    expect(grosseBase.length).toBeGreaterThan(7_000);

    const res = await ask({ site: true, question: 'combien ça coûte ?' });
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.found).toBe(true);
    // La réponse est minuscule à côté de la base…
    expect(json.chars).toBeLessThanOrEqual(900);
    expect(json.text.length).toBeLessThan(1_000);
    expect(json.tokens).toBeLessThan(250);
    // …et elle contient bien ce qui répond à la question.
    expect(json.text).toMatch(/Basic|10 \$|2\\s?700 DA/);
    expect(json.scope).toBe('site');
  });

  it('la réponse tombe sur la bonne section (installation), pas sur tout le reste', async () => {
    seedSite(grosseBase);
    const json = (await (await ask({ site: true, question: 'comment ça s’installe sur mon site ?' }, '30.0.0.9')).json()) as any;
    expect(json.found).toBe(true);
    expect(json.chars).toBeLessThanOrEqual(900);
    expect(json.text).toMatch(/install/i);
    expect(json.text).not.toMatch(/SERVICE 9/);
  });

  it('question sans réponse : `found: false`, même sur une petite base (pas de réponse « à côté »)', async () => {
    seedSite('JAWEBFLOW — l’essentiel\n• Tarifs : Basic 10 $/mois, Pro 20 $/mois.');
    // Une question de moto n'a RIEN à voir avec la base : au téléphone, mieux
    // vaut « je ne sais pas » qu'une réponse hors sujet.
    const hors = (await (await ask({ site: true, question: 'vous réparez les motos ?' }, '30.0.0.2')).json()) as any;
    expect(hors.ok).toBe(true);
    expect(hors.found).toBe(false);
    expect(hors.text).toBe('');
    // La même base répond normalement quand la question la concerne.
    const dans = (await (await ask({ site: true, question: 'c’est combien ?' }, '30.0.0.11')).json()) as any;
    expect(dans.found).toBe(true);
    expect(dans.text).toMatch(/10 \$/);
  });

  it('sans réglage enregistré (aucune ligne) : jamais d’invention, jamais d’erreur visible', async () => {
    const hors = (await (await ask({ site: true, question: 'quelle est la capitale du Japon ?' }, '30.0.0.3')).json()) as any;
    expect(hors.ok).toBe(true);
    expect(hors.found).toBe(false);
    expect(hors.text).toBe('');
  });

  it('question vide : réponse vide, aucune recherche facturée', async () => {
    seedSite(grosseBase);
    const json = (await (await ask({ site: true, question: '   ' }, '30.0.0.4')).json()) as any;
    expect(json.found).toBe(false);
    expect(json.reason).toMatch(/question vide/i);
  });

  it('marchand : les fiches du compte, filtrées et plafonnées (fiche refusée = jamais servie)', async () => {
    fx.supabase.seed('knowledge_entries', [
      { id: 'k1', assistant_id: 'asst1', title: 'Coque Spiderman', content: 'Coque Spiderman pour iPhone 13 à 16 : 1 900 DA.', category: 'produits', status: 'active', enabled: true },
      { id: 'k2', assistant_id: 'asst1', title: 'Livraison', content: 'Livraison 400 DA sur Alger en 48 heures.', category: 'livraison', status: 'active', enabled: true },
      { id: 'k3', assistant_id: 'asst1', title: 'Interne', content: 'Prix d’achat fournisseur : NE DOIT JAMAIS SORTIR.', category: 'interne', status: 'rejected', enabled: true },
      { id: 'k4', assistant_id: 'asst1', title: 'Autre marchand', content: 'Fiche d’un autre compte.', category: 'produits', status: 'active', enabled: true, assistant_id_other: 'asst2' },
    ]);
    const json = (await (await ask({ assistantId: 'asst1', question: 'le prix de la coque spiderman ?' }, '30.0.0.5')).json()) as any;
    expect(json.ok).toBe(true);
    expect(json.found).toBe(true);
    expect(json.scope).toBe('assistant');
    expect(json.text).toContain('1 900 DA');
    expect(json.text).not.toContain('NE DOIT JAMAIS SORTIR');
    expect(json.chars).toBeLessThanOrEqual(900);
  });

  it('marchand : les fiches du compte ne sortent QUE sur un domaine autorisé', async () => {
    fx.supabase.seed('assistants', [
      { id: 'asst2', user_id: 'u2', business_name: 'Boutique fermée', config: { plan: 'basic', widgetKey: 'CLEF_SECRETE', allowedDomains: 'https://boutique.dz' } },
    ]);
    fx.supabase.seed('knowledge_entries', [
      { id: 'k9', assistant_id: 'asst2', title: 'Prix', content: 'Le prix est 5 000 DA.', category: 'produits', status: 'active', enabled: true },
    ]);
    const refused = (await (await ask({ assistantId: 'asst2', question: 'le prix ?' }, '30.0.0.6')).json()) as any;
    expect(refused.ok).toBe(false);
    expect(refused.found).toBe(false);
    expect(String(refused.error)).toMatch(/clé|domaine/i);
  });

  it('étanchéité : deux comptes, la même question — chacun ne reçoit QUE sa fiche', async () => {
    fx.supabase.seed('assistants', [
      { id: 'asst2', user_id: 'u2', business_name: 'Autre Boutique', config: { plan: 'basic' } },
    ]);
    fx.supabase.seed('knowledge_entries', [
      { id: 'p1', assistant_id: 'asst1', title: 'Coque Spiderman', content: 'Coque Spiderman : 1 900 DA chez Boutique Nour.', category: 'produits', status: 'active', enabled: true },
      { id: 'p2', assistant_id: 'asst2', title: 'Coque Spiderman', content: 'Coque Spiderman : 7 400 DA chez Autre Boutique.', category: 'produits', status: 'active', enabled: true },
    ]);

    const a = (await (await ask({ assistantId: 'asst1', question: 'le prix de la coque spiderman ?' }, '30.0.0.20')).json()) as any;
    const b = (await (await ask({ assistantId: 'asst2', question: 'le prix de la coque spiderman ?' }, '30.0.0.21')).json()) as any;

    expect(a.found).toBe(true);
    expect(a.scope).toBe('assistant');
    expect(a.text).toContain('1 900 DA');
    expect(a.text).not.toContain('7 400 DA');   // ← aucune fuite de l'autre compte
    expect(b.found).toBe(true);
    expect(b.text).toContain('7 400 DA');
    expect(b.text).not.toContain('1 900 DA');
  });

  it('les coordonnées du commerce arrivent par l’outil quand on les demande', async () => {
    fx.supabase.tables['assistants'] = [
      ...fx.supabase.rows('assistants').filter((row) => row.id !== 'asst1'),
      {
        id: 'asst1',
        user_id: 'u1',
        business_name: 'Boutique Nour',
        config: {
          plan: 'basic',
          businessInfo: { phone: '0550 11 22 33', address: 'Cité 200 logements, Blida', hours: '9h-18h', closedDays: 'vendredi' },
        },
      },
    ];

    const res = await ask({ assistantId: 'asst1', question: 'votre numéro de téléphone ?' }, '30.0.0.50');
    const json = (await res.json()) as any;
    expect(json.found).toBe(true);
    expect(json.text).toContain('Téléphone : 0550 11 22 33');
    expect(json.text).toContain('Adresse : Cité 200 logements, Blida');
    expect(json.text).toContain('Horaires : 9h-18h');
    expect(json.text).toContain('Jours fermés : vendredi');
    expect(json.chars).toBeLessThanOrEqual(900);   // le plafond dur tient toujours

    // …mais une question sans rapport ne les reçoit PAS : pas de réponse « à côté ».
    const autre = await (await ask({ assistantId: 'asst1', question: 'vous réparez les motos ?' }, '30.0.0.51')).json() as any;
    expect(autre.text).not.toContain('0550 11 22 33');
    expect(autre.found).toBe(false);
  });

  it('chaque compte ne reçoit QUE ses propres coordonnées', async () => {
    const seedInfo = (id: string, phone: string, name: string) => {
      fx.supabase.tables['assistants'] = [
        ...fx.supabase.rows('assistants').filter((row) => row.id !== id),
        { id, user_id: `u-${id}`, business_name: name, config: { plan: 'basic', businessInfo: { phone } } },
      ];
    };
    seedInfo('asst1', '0550 11 22 33', 'Boutique Nour');
    seedInfo('asst2', '0770 99 88 77', 'Autre Boutique');

    const a = (await (await ask({ assistantId: 'asst1', question: 'votre numéro ?' }, '30.0.0.52')).json()) as any;
    const b = (await (await ask({ assistantId: 'asst2', question: 'votre numéro ?' }, '30.0.0.53')).json()) as any;
    expect(a.text).toContain('0550 11 22 33');
    expect(a.text).not.toContain('0770 99 88 77');
    expect(b.text).toContain('0770 99 88 77');
    expect(b.text).not.toContain('0550 11 22 33');
  });

  it('site vitrine : le contact de l’équipe est donné quand on le demande, et seulement alors', async () => {
    seedSite("JAWEBFLOW — l'essentiel\n• Installation : une ligne de code à coller avant </body>.");

    const demande = (await (await ask({ site: true, question: 'votre e-mail de contact ?' }, '30.0.0.54')).json()) as any;
    expect(demande.found).toBe(true);
    expect(demande.text).toContain('contact@jawebflow.dz');

    const autre = (await (await ask({ site: true, question: 'vous réparez les motos ?' }, '30.0.0.55')).json()) as any;
    expect(autre.text).not.toContain('contact@jawebflow.dz');
    expect(autre.found).toBe(false);
  });

  it('assistant inconnu : refus clair (jamais une base vide silencieuse)', async () => {
    const json = (await (await ask({ assistantId: 'inconnu', question: 'le prix ?' }, '30.0.0.7')).json()) as any;
    expect(json.ok).toBe(false);
    expect(String(json.error)).toMatch(/introuvable/i);
  });

  it('anti-abus : au-delà de 60 recherches en 10 minutes, plus rien ne sort', async () => {
    seedSite(grosseBase);
    let last: any = null;
    for (let i = 0; i < 61; i += 1) {
      last = (await (await ask({ site: true, question: `question ${i}` }, '30.0.0.8')).json()) as any;
    }
    expect(last.ok).toBe(false);
    expect(last.text).toBe('');
    expect(String(last.error)).toMatch(/trop de recherches/i);
  });

  it('une panne de la base ne casse JAMAIS l’appel : réponse vide, pas d’erreur', async () => {
    fx.supabase.missing.add('knowledge_entries');
    const json = (await (await ask({ assistantId: 'asst1', question: 'le prix ?' }, '30.0.0.10')).json()) as any;
    expect(json.ok).toBe(true);
    expect(json.found).toBe(false);
    expect(json.text).toBe('');
  });
});

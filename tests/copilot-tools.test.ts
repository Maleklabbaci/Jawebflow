import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyOp, CopilotRunner, loadState } from '../functions/_shared/copilot-tools';
import { COPILOT_LIMITS } from '../functions/_shared/copilot-core';
import { behaviorBlock, compactKnowledgeNotes, officialInfoBlock } from '../functions/_shared/prompt';
import { ENV, USER_ID, installFakes, seedAutomation, seedMerchant } from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;
let ids = 0;

beforeEach(() => {
  fx = installFakes();
  ids = 0;
});
afterEach(() => fx.restore());

const assistantRow = () => fx.supabase.rows('assistants').find((r) => r.id === 'asst1')!;
const savedNotes = () => (assistantRow().knowledge_notes || []) as any[];
const savedConfig = () => (assistantRow().config || {}) as any;
const automationRows = () => fx.supabase.rows('ig_automations');

function seed(opts: { instagram?: boolean; notes?: any[]; config?: any } = {}) {
  seedMerchant(fx.supabase);
  if (opts.instagram === false) fx.supabase.tables['instagram_integrations'] = [];
  Object.assign(assistantRow(), { knowledge_notes: opts.notes ?? [], config: opts.config ?? {} });
}

async function runner(): Promise<CopilotRunner> {
  const state = await loadState(ENV, USER_ID, assistantRow());
  return new CopilotRunner({ env: ENV, uid: USER_ID, assistantId: 'asst1', state, makeId: () => `cp_${++ids}`, now: () => new Date('2026-10-02T10:00:00Z') });
}

const note = (over: any = {}) => ({ id: 'n1', title: 'Livraison', content: 'Livraison 48h partout.', category: 'livraison', enabled: true, ...over });

describe('fiches « Mes informations »', () => {
  it('add_knowledge : la fiche est VRAIMENT écrite en base, avec une action annulable', async () => {
    seed();
    const r = await runner();
    const res = await r.execute('add_knowledge', { title: 'Coque Spiderman', content: 'Coque Spiderman — iPhone 13 à 16 — 1900 DA', category: 'produits' });
    expect(res).toMatchObject({ ok: true, id: 'cp_1', title: 'Coque Spiderman' });

    expect(savedNotes()).toHaveLength(1);
    expect(savedNotes()[0]).toMatchObject({ id: 'cp_1', title: 'Coque Spiderman', category: 'produits', enabled: true, source: 'manual', createdAt: '2026-10-02T10:00:00.000Z' });
    expect(r.patch.knowledgeNotes).toHaveLength(1);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]).toMatchObject({ tool: 'add_knowledge', icon: 'note', goto: 'knowledge', undo: { type: 'knowledge_remove', noteId: 'cp_1' } });
    expect(r.actions[0].detail).toBe('Coque Spiderman — iPhone 13 à 16 — 1900 DA'); // le titre n'est pas répété quand le contenu l'ouvre déjà
  });

  it('un titre déjà pris est refusé AVANT d’écrire (pas de doublon) et l’IA est guidée vers update_knowledge', async () => {
    seed({ notes: [note()] });
    const r = await runner();
    const res: any = await r.execute('add_knowledge', { title: 'livraison', content: 'autre chose' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/existe déjà.*update_knowledge/);
    expect(savedNotes()).toHaveLength(1);
    expect(r.actions).toHaveLength(0);
  });

  it('contenu trop long ou vide → erreur claire, rien d’écrit', async () => {
    seed();
    const r = await runner();
    const tooLong: any = await r.execute('add_knowledge', { title: 'Gros', content: 'x'.repeat(COPILOT_LIMITS.maxNoteContent + 5) });
    expect(tooLong.error).toMatch(/plusieurs fiches/);
    const empty: any = await r.execute('add_knowledge', { title: 'Vide' });
    expect(empty.ok).toBe(false);
    expect(savedNotes()).toHaveLength(0);
  });

  it('la carte « fait » montre « Titre — contenu » quand le contenu ne commence pas par le titre', async () => {
    seed();
    const r = await runner();
    await r.execute('add_knowledge', { title: 'Livraison Alger', content: 'Livré en 24h pour 400 DA.', category: 'livraison' });
    expect(r.actions[0].detail).toBe('Livraison Alger — Livré en 24h pour 400 DA.');
  });

  it('update_knowledge : « append » ajoute sans rien perdre ; « content » remplace ; le titre peut changer', async () => {
    seed({ notes: [note({ content: 'Livraison 48h partout.' })] });
    const r = await runner();
    await r.execute('update_knowledge', { id: 'n1', append: 'Gratuite dès 5000 DA.' });
    expect(savedNotes()[0].content).toBe('Livraison 48h partout.\nGratuite dès 5000 DA.');
    await r.execute('update_knowledge', { id: 'n1', content: 'Livraison 24h à Alger.', title: 'Livraison Alger' });
    expect(savedNotes()[0]).toMatchObject({ title: 'Livraison Alger', content: 'Livraison 24h à Alger.', id: 'n1' });
    expect(r.actions.map((a) => a.title)).toEqual(['Fiche modifiée', 'Fiche modifiée']);
    // l'annulation de la 2e action remet la fiche telle qu'elle était juste avant
    expect((r.actions[1].undo as any).note.content).toBe('Livraison 48h partout.\nGratuite dès 5000 DA.');
  });

  it('update_knowledge : retrouve la fiche par son titre, signale l’ambiguïté, l’inconnu, et « rien à changer »', async () => {
    seed({ notes: [note({ id: 'a', title: 'Livraison Alger' }), note({ id: 'b', title: 'Livraison Oran' }), note({ id: 'c', title: 'Garantie', content: '1 an', category: 'garanties' })] });
    const r = await runner();
    expect(await r.execute('update_knowledge', { id: 'garantie', append: 'Retour sous 7 jours.' })).toMatchObject({ ok: true });
    expect(savedNotes().find((n) => n.id === 'c').content).toBe('1 an\nRetour sous 7 jours.');
    const ambiguous: any = await r.execute('update_knowledge', { id: 'livraison', append: 'x' });
    expect(ambiguous.error).toMatch(/Plusieurs fiches.*id=a.*id=b/);
    expect(((await r.execute('update_knowledge', { id: 'zzz', append: 'x' })) as any).error).toMatch(/introuvable/);
    const same: any = await r.execute('update_knowledge', { id: 'c', title: 'Garantie' });
    expect(same).toMatchObject({ ok: true, unchanged: true });
    expect(r.actions).toHaveLength(1); // une seule vraie modification
  });

  it('update_knowledge enabled:false met la fiche de côté (sans la supprimer)', async () => {
    seed({ notes: [note()] });
    const r = await runner();
    await r.execute('update_knowledge', { id: 'n1', enabled: false });
    expect(savedNotes()[0].enabled).toBe(false);
    expect(r.actions[0].title).toBe('Fiche mise de côté');
  });

  it('on ne peut pas renommer une fiche avec le titre d’une autre', async () => {
    seed({ notes: [note({ id: 'a', title: 'A' }), note({ id: 'b', title: 'B' })] });
    const r = await runner();
    expect(((await r.execute('update_knowledge', { id: 'a', title: 'b' })) as any).error).toMatch(/s’appelle déjà/);
  });

  it('delete_knowledge : supprime, garde la fiche pour l’annulation, refuse l’ambigu', async () => {
    seed({ notes: [note({ id: 'a', title: 'Promo été' }), note({ id: 'b', title: 'Promo hiver' })] });
    const r = await runner();
    expect(((await r.execute('delete_knowledge', { id: 'promo' })) as any).error).toMatch(/Plusieurs fiches/);
    expect(savedNotes()).toHaveLength(2);
    await r.execute('delete_knowledge', { id: 'a' });
    expect(savedNotes().map((n) => n.id)).toEqual(['b']);
    expect(r.actions[0].undo).toMatchObject({ type: 'knowledge_restore', note: { id: 'a', title: 'Promo été' } });
  });

  it('search_knowledge renvoie le contenu COMPLET (pour modifier en connaissance de cause)', async () => {
    seed({ notes: [note({ id: 'a', title: 'Jean noir', content: 'x'.repeat(900), category: 'produits' })] });
    const r = await runner();
    const res: any = await r.execute('search_knowledge', { query: 'jean' });
    expect(res.count).toBe(1);
    expect(res.notes[0].content).toHaveLength(900);
    expect(r.actions).toHaveLength(0);
  });

  it('une écriture qui échoue en cours de route : erreur claire et AUCUNE action enregistrée', async () => {
    seed();
    const r = await runner();
    fx.supabase.failTables.add('assistants');
    const res: any = await r.execute('add_knowledge', { title: 'Produit', content: 'Prix 100 DA' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Rien n’a été modifié/);
    expect(r.actions).toHaveLength(0);
    expect(r.patch.knowledgeNotes).toBeUndefined();
  });
});

describe('informations officielles et comportement', () => {
  it('set_business_info : écrit dans la configuration, propose l’annulation avec l’ancienne valeur', async () => {
    seed({ config: { businessInfo: { phone: '0550000000' } } });
    const r = await runner();
    const res: any = await r.execute('set_business_info', { hours: '9h–18h', closed_days: 'vendredi', phone: '0555123456' });
    expect(res.ok).toBe(true);
    expect(savedConfig().businessInfo).toEqual({ phone: '0555123456', hours: '9h–18h', closedDays: 'vendredi' });
    expect(r.actions[0].undo).toEqual({ type: 'business_info_revert', set: { phone: '0550000000', hours: '', closedDays: '' } });
    expect(r.patch.businessInfo).toEqual({ phone: '0555123456', hours: '9h–18h', closedDays: 'vendredi' });
  });

  it('set_behavior : « réponds court en darija » change vraiment la configuration lue par le robot', async () => {
    seed({ config: { behavior: { language: 'auto', length: 'normal', customRules: 'Tutoie le client.' }, widgetConfig: { color: 'red' } } });
    const r = await runner();
    const res: any = await r.execute('set_behavior', { language: 'darija_dz', length: 'short', add_rules: ['Termine toujours par une question.'] });
    expect(res.ok).toBe(true);
    expect(savedConfig().behavior).toMatchObject({
      language: 'darija_dz',
      length: 'short',
      customRules: 'Tutoie le client.\nTermine toujours par une question.',
      stopWhenConfused: true,
    });
    expect(savedConfig().widgetConfig).toEqual({ color: 'red' }); // le reste de la configuration est intact
    expect(r.actions[0]).toMatchObject({
      icon: 'behavior',
      goto: 'behavior',
      undo: { type: 'behavior_revert', revert: { set: { language: 'auto', length: 'normal' }, removeRules: ['Termine toujours par une question.'], addRules: [] } },
    });
  });

  it('set_behavior sans vrai changement → pas de carte « fait », et une valeur invalide est refusée', async () => {
    seed({ config: { behavior: { language: 'fr' } } });
    const r = await runner();
    expect(await r.execute('set_behavior', { language: 'fr' })).toMatchObject({ ok: true, unchanged: true });
    expect(((await r.execute('set_behavior', { language: 'klingon' })) as any).ok).toBe(false);
    expect(r.actions).toHaveLength(0);
  });

  it('trop de règles : l’IA reçoit la liste actuelle pour pouvoir en retirer une', async () => {
    const rules = Array.from({ length: 6 }, (_, i) => `Règle ${i} ${'x'.repeat(150)}`).join('\n');
    seed({ config: { behavior: { customRules: rules } } });
    const r = await runner();
    const res: any = await r.execute('set_behavior', { add_rules: ['Une règle de plus qui ne rentre pas dans la limite.'.repeat(4)] });
    expect(res.ok).toBe(false);
    expect(res.currentRules).toHaveLength(6);
  });

  it('set_instagram_greeting : écrit dans l’intégration ; refusé si Instagram n’est pas connecté', async () => {
    seed();
    const r = await runner();
    expect(await r.execute('set_instagram_greeting', { text: 'Salam ! Comment puis-je t’aider ?' })).toMatchObject({ ok: true });
    expect(fx.supabase.rows('instagram_integrations')[0].custom_greeting).toBe('Salam ! Comment puis-je t’aider ?');
    expect(r.actions[0].undo).toEqual({ type: 'greeting_restore', text: '' });
    expect(r.patch.instagramChanged).toBe(true);
  });

  it('sans Instagram connecté : message clair, rien d’écrit', async () => {
    seed({ instagram: false });
    const r = await runner();
    const res: any = await r.execute('set_instagram_greeting', { text: 'Salut' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/pas encore connecté/);
    expect(fx.supabase.rows('instagram_integrations')).toHaveLength(0);
  });
});

describe('automatisations Instagram (commentaires, messages…)', () => {
  const priceArgs = {
    trigger: 'comment',
    name: 'Prix en commentaire',
    keywords: ['prix', 'ch7al', 'سعر'],
    public_replies: ['Merci {@pseudo} ! Regarde tes messages 📩', 'Je t’envoie ça en privé 😉'],
    dm_text: 'Salut {prenom} 👋 Voici nos tarifs : coque 1900 DA.',
    dm_buttons: [{ title: 'Voir le catalogue', url: 'https://nour.dz/catalogue' }],
  };

  it('create_automation : créée EN PAUSE par défaut, avec un bouton « Activer » et une annulation', async () => {
    seed();
    const r = await runner();
    const res: any = await r.execute('create_automation', priceArgs);
    expect(res).toMatchObject({ ok: true, enabled: false, name: 'Prix en commentaire' });
    expect(res.warnings).toEqual([]);

    expect(automationRows()).toHaveLength(1);
    const row = automationRows()[0];
    expect(row).toMatchObject({ user_id: USER_ID, name: 'Prix en commentaire', trigger_type: 'comment', enabled: false });
    expect(row.config.match).toEqual({ mode: 'contains', keywords: ['prix', 'ch7al', 'سعر'] });
    expect(row.config.publicReply.variations).toHaveLength(2);
    expect(row.config.dm.buttons).toEqual([{ title: 'Voir le catalogue', url: 'https://nour.dz/catalogue' }]);

    expect(r.actions[0]).toMatchObject({
      icon: 'automation',
      title: 'Réponse automatique créée (en pause)',
      goto: 'automations',
      undo: { type: 'automation_delete', automationId: row.id },
      activate: { automationId: row.id },
    });
    expect(r.patch.automationsChanged).toBe(true);
  });

  it('activate:true (demandé explicitement) → créée ACTIVE, sans bouton « Activer »', async () => {
    seed();
    const r = await runner();
    await r.execute('create_automation', { ...priceArgs, activate: true });
    expect(automationRows()[0].enabled).toBe(true);
    expect(r.actions[0].title).toBe('Réponse automatique créée et activée');
    expect(r.actions[0].activate).toBeUndefined();
  });

  it('données incomplètes → l’IA reçoit les erreurs en français (et rien n’est créé)', async () => {
    seed();
    const r = await runner();
    const noWord: any = await r.execute('create_automation', { trigger: 'comment', public_replies: ['Merci'] });
    expect(noWord.error).toMatch(/mot-clé/);
    const badLink: any = await r.execute('create_automation', { ...priceArgs, dm_buttons: [{ title: 'Site', url: 'pas un lien' }] });
    expect(badLink.error).toMatch(/lien du bouton/);
    const dmNoText: any = await r.execute('create_automation', { trigger: 'dm_keyword', keywords: ['livraison'] });
    expect(dmNoText.error).toMatch(/message privé/);
    expect(((await r.execute('create_automation', { trigger: 'inconnu' })) as any).error).toMatch(/Type inconnu/);
    expect(automationRows()).toHaveLength(0);
    expect(r.actions).toHaveLength(0);
  });

  it('Instagram pas connecté : elle est créée mais l’IA reçoit un avertissement à répéter au marchand', async () => {
    seed({ instagram: false });
    const r = await runner();
    const res: any = await r.execute('create_automation', priceArgs);
    expect(res.ok).toBe(true);
    expect(res.warnings[0]).toMatch(/pas encore connecté/);
  });

  it('la base des automatisations n’est pas prête → message clair, aucune exception', async () => {
    seed();
    fx.supabase.missing.add('ig_automations');
    const r = await runner();
    const res: any = await r.execute('create_automation', priceArgs);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/en cours d’activation/);
  });

  it('update_automation : modifie seulement ce qui est demandé (mots-clés ajoutés, texte du message privé)', async () => {
    seed();
    const created = seedAutomation(fx.supabase, { name: 'Prix', enabled: true });
    const r = await runner();
    const res: any = await r.execute('update_automation', { id: created.id, add_keywords: ['tarif'], dm_text: 'Salut {prenom} ! Nouveaux prix : 2000 DA.' });
    expect(res.ok).toBe(true);
    const row = automationRows()[0];
    expect(row.config.match.keywords).toEqual(['prix', 'tarif']);
    expect(row.config.dm.text).toBe('Salut {prenom} ! Nouveaux prix : 2000 DA.');
    expect(row.config.publicReply.variations).toEqual(['Merci {@pseudo} ! Regarde tes messages 📩']); // inchangé
    expect(row.enabled).toBe(true); // modifier ne change jamais « active / en pause »
    expect(r.actions[0].undo).toMatchObject({ type: 'automation_restore', automation: { id: created.id, enabled: true } });
  });

  it('update_automation sur une automatisation inconnue ou qui deviendrait invalide', async () => {
    seed();
    const created = seedAutomation(fx.supabase);
    const r = await runner();
    expect(((await r.execute('update_automation', { id: 'inconnue' })) as any).error).toMatch(/introuvable/);
    const invalid: any = await r.execute('update_automation', { id: created.id, keywords: [] });
    expect(invalid.ok).toBe(false);
    expect(automationRows()[0].config.match.keywords).toEqual(['prix']);
  });

  it('set_automation_enabled : active / met en pause, annulable ; « déjà ainsi » ne crée pas de carte', async () => {
    seed();
    const created = seedAutomation(fx.supabase, { enabled: false });
    const r = await runner();
    expect(await r.execute('set_automation_enabled', { id: created.id, enabled: true })).toMatchObject({ ok: true, enabled: true });
    expect(automationRows()[0].enabled).toBe(true);
    expect(r.actions[0].undo).toEqual({ type: 'automation_set_enabled', automationId: created.id, enabled: false });
    expect(await r.execute('set_automation_enabled', { id: created.id, enabled: true })).toMatchObject({ ok: true, unchanged: true });
    expect(r.actions).toHaveLength(1);
    expect(((await r.execute('set_automation_enabled', { id: created.id })) as any).ok).toBe(false);
  });

  it('on n’active pas une automatisation incomplète (même demandé par l’IA)', async () => {
    seed();
    const created = seedAutomation(fx.supabase, { enabled: false, config: { media: { scope: 'any' }, match: { mode: 'contains', keywords: [] }, publicReply: { enabled: true, variations: [] }, dm: { enabled: false, text: '', buttons: [] }, gate: { enabled: false }, oncePerUser: true } });
    const r = await runner();
    const res: any = await r.execute('set_automation_enabled', { id: created.id, enabled: true });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Impossible d’activer/);
    expect(automationRows()[0].enabled).toBe(false);
  });

  it('delete_automation : supprimée, avec de quoi la remettre à l’identique', async () => {
    seed();
    const created = seedAutomation(fx.supabase, { name: 'À supprimer' });
    const r = await runner();
    const res: any = await r.execute('delete_automation', { id: created.id });
    expect(res).toMatchObject({ ok: true, deleted: 'À supprimer' });
    expect(automationRows()).toHaveLength(0);
    expect(r.actions[0].undo).toMatchObject({ type: 'automation_restore', automation: { id: created.id, name: 'À supprimer', triggerType: 'comment' } });
  });

  it('on peut enchaîner dans le même message : créer puis activer', async () => {
    seed();
    const r = await runner();
    const made: any = await r.execute('create_automation', priceArgs);
    const on: any = await r.execute('set_automation_enabled', { id: made.id, enabled: true });
    expect(on).toMatchObject({ ok: true, enabled: true });
    expect(automationRows()[0].enabled).toBe(true);
  });

  it('list_instagram_posts + post_id : vise UNE publication précise, refuse un identifiant inventé', async () => {
    seed();
    fx.meta.media = [
      { id: '17900000000000001', caption: 'Robe rouge — nouvelle collection', media_type: 'VIDEO', media_product_type: 'REELS', thumbnail_url: 'https://cdn/t1.jpg', permalink: 'https://www.instagram.com/reel/abc/', timestamp: '2026-09-30T10:00:00+0000', comments_count: 12 },
      { id: '17900000000000002', caption: 'Sac cuir', media_type: 'IMAGE', media_url: 'https://cdn/t2.jpg', permalink: 'https://www.instagram.com/p/def/', timestamp: '2026-09-20T10:00:00+0000', comments_count: 3 },
    ];
    const r = await runner();
    const list: any = await r.execute('list_instagram_posts', {});
    expect(list.posts[0]).toMatchObject({ id: '17900000000000001', type: 'REEL', date: '2026-09-30', comments: 12 });

    const bad: any = await r.execute('create_automation', { ...priceArgs, post_id: '99999999999999' });
    expect(bad.error).toMatch(/Publication introuvable/);
    expect(automationRows()).toHaveLength(0);

    const ok: any = await r.execute('create_automation', { ...priceArgs, post_id: '17900000000000001' });
    expect(ok.ok).toBe(true);
    expect(automationRows()[0].config.media).toMatchObject({ scope: 'one', id: '17900000000000001', type: 'REEL', permalink: 'https://www.instagram.com/reel/abc/' });
  });

  it('viser une publication sans Instagram connecté → erreur claire', async () => {
    seed({ instagram: false });
    const r = await runner();
    expect(((await r.execute('list_instagram_posts', {})) as any).error).toMatch(/pas encore connecté/);
    expect(((await r.execute('create_automation', { ...priceArgs, post_id: '17900000000000001' })) as any).error).toMatch(/pas encore connecté/);
  });
});

describe('ce que l’IA écrit est EXACTEMENT ce que lit le robot des clients (site et Instagram)', () => {
  it('comportement, infos officielles et fiches passent par les mêmes blocs de consigne que le chat des clients', async () => {
    seed();
    const r = await runner();
    await r.execute('set_behavior', { language: 'darija_dz', length: 'short', website_mentions: 'never', add_rules: ['Tutoie toujours le client.'] });
    await r.execute('set_business_info', { phone: '0555 12 34 56', hours: '9h–18h', closed_days: 'vendredi' });
    await r.execute('add_knowledge', { title: 'Coque Spiderman', content: 'Coque Spiderman — iPhone 13 à 16 — 1900 DA', category: 'produits' });
    await r.execute('add_knowledge', { title: 'Livraison', content: 'Livraison 48h — 600 DA', category: 'livraison' });

    const config = { ...savedConfig(), knowledgeNotes: savedNotes() };
    const behavior = behaviorBlock(config.behavior);
    expect(behavior).toMatch(/100% ALGÉRIEN/);
    expect(behavior).toMatch(/réponds COURT/);
    expect(behavior).toMatch(/ne mentionne JAMAIS le site web/);
    expect(behavior).toContain('Tutoie toujours le client.');

    const official = officialInfoBlock(config);
    expect(official).toContain('Téléphone : 0555 12 34 56');
    expect(official).toContain('Horaires : 9h–18h');
    expect(official).toContain('Jours fermés : vendredi');

    const knowledge = compactKnowledgeNotes(config.knowledgeNotes, 'combien coûte la coque spiderman ?');
    expect(knowledge).toContain('Coque Spiderman — iPhone 13 à 16 — 1900 DA');
    expect(knowledge).toContain('Livraison 48h — 600 DA'); // « livraison » fait partie des fiches toujours lues
  });

  it('une fiche mise de côté n’est plus lue par le robot (sans être supprimée)', async () => {
    seed({ notes: [note({ id: 'n1', title: 'Promo été', content: 'Promo -20 %', category: 'tarifs' })] });
    const r = await runner();
    await r.execute('update_knowledge', { id: 'n1', enabled: false });
    expect(savedNotes()).toHaveLength(1);
    expect(compactKnowledgeNotes(savedNotes(), 'promo')).toBe('');
  });
});

describe('garde-fous', () => {
  it('au plus 12 actions par message : la 13e est refusée avec une consigne', async () => {
    seed();
    const r = await runner();
    for (let i = 0; i < COPILOT_LIMITS.maxToolCalls; i += 1) {
      expect(((await r.execute('add_knowledge', { title: `Fiche ${i}`, content: `Contenu ${i}` })) as any).ok).toBe(true);
    }
    const over: any = await r.execute('add_knowledge', { title: 'Fiche en trop', content: 'x' });
    expect(over.ok).toBe(false);
    expect(over.error).toMatch(/Trop d’actions/);
    expect(savedNotes()).toHaveLength(COPILOT_LIMITS.maxToolCalls);
  });

  it('outil inconnu ou arguments absurdes : jamais d’exception', async () => {
    seed();
    const r = await runner();
    expect(((await r.execute('format_disk', {})) as any).ok).toBe(false);
    expect(((await r.execute('add_knowledge', null as any)) as any).ok).toBe(false);
    expect(((await r.execute('set_behavior', 'oups' as any)) as any).unchanged).toBe(true);
    expect(((await r.execute('delete_knowledge', { id: { evil: true } })) as any).ok).toBe(false);
  });
});

describe('annuler / activer en un clic (opérations directes)', () => {
  it('annuler un ajout de fiche, puis remettre une fiche supprimée à l’identique', async () => {
    seed({ notes: [note()] });
    let r = await runner();
    await r.execute('add_knowledge', { title: 'Nouvelle', content: 'Contenu' });
    const added = r.actions[0];
    const undone = await applyOp(ENV, USER_ID, 'asst1', assistantRow(), added.undo);
    expect(undone).toMatchObject({ ok: true, message: 'Fiche retirée.' });
    expect(savedNotes().map((n) => n.title)).toEqual(['Livraison']);

    r = await runner();
    await r.execute('delete_knowledge', { id: 'n1' });
    expect(savedNotes()).toHaveLength(0);
    const back = await applyOp(ENV, USER_ID, 'asst1', assistantRow(), r.actions[0].undo);
    expect(back).toMatchObject({ ok: true });
    expect(savedNotes()).toEqual([expect.objectContaining({ id: 'n1', title: 'Livraison', content: 'Livraison 48h partout.', category: 'livraison' })]);
  });

  it('annuler une modification de fiche remet l’ancien contenu', async () => {
    seed({ notes: [note()] });
    const r = await runner();
    await r.execute('update_knowledge', { id: 'n1', content: 'Tout autre texte' });
    await applyOp(ENV, USER_ID, 'asst1', assistantRow(), r.actions[0].undo);
    expect(savedNotes()[0].content).toBe('Livraison 48h partout.');
  });

  it('annuler un changement de comportement ou d’infos remet l’état d’avant', async () => {
    seed({ config: { behavior: { language: 'auto', length: 'normal', customRules: '' }, businessInfo: { phone: '0550' } } });
    const r = await runner();
    await r.execute('set_behavior', { language: 'fr', add_rules: ['Tutoie le client.'] });
    await r.execute('set_business_info', { phone: '0777', hours: '9h–18h' });
    expect(savedConfig().behavior.language).toBe('fr');
    const b: any = await applyOp(ENV, USER_ID, 'asst1', assistantRow(), r.actions[0].undo);
    expect(b.patch.behavior).toMatchObject({ language: 'auto', customRules: '' });
    expect(savedConfig().behavior).toMatchObject({ language: 'auto', customRules: '' });
    await applyOp(ENV, USER_ID, 'asst1', assistantRow(), r.actions[1].undo);
    expect(savedConfig().businessInfo).toEqual({ phone: '0550' }); // l'ancien téléphone revient, les horaires ajoutés disparaissent
  });

  it('annuler UN changement ne défait pas les autres (réglages faits avant ou après)', async () => {
    seed({ config: { behavior: { language: 'auto', length: 'normal', customRules: 'Parle poliment.' } } });
    const r = await runner();
    await r.execute('set_behavior', { language: 'darija_dz' });                 // action 0
    await r.execute('set_behavior', { length: 'short', add_rules: ['Tutoie le client.'] }); // action 1
    await r.execute('set_behavior', { add_rules: ['Termine par une question.'], remove_rules: ['poliment'] }); // action 2
    expect(savedConfig().behavior).toMatchObject({ language: 'darija_dz', length: 'short', customRules: 'Tutoie le client.\nTermine par une question.' });

    // On annule la PREMIÈRE (la langue) : seule la langue revient
    await applyOp(ENV, USER_ID, 'asst1', assistantRow(), r.actions[0].undo);
    expect(savedConfig().behavior).toMatchObject({ language: 'auto', length: 'short', customRules: 'Tutoie le client.\nTermine par une question.' });

    // On annule la TROISIÈME : « Termine par une question » part, « Parle poliment » revient, « Tutoie » reste
    await applyOp(ENV, USER_ID, 'asst1', assistantRow(), r.actions[2].undo);
    expect(savedConfig().behavior.customRules.split('\n').sort()).toEqual(['Parle poliment.', 'Tutoie le client.']);
    expect(savedConfig().behavior.length).toBe('short');
  });

  it('le retrait d’une règle à l’annulation est exact : une règle voisine qui contient le même texte n’est pas touchée', async () => {
    seed({ config: { behavior: { customRules: 'Tutoie le client poliment.' } } });
    const r = await runner();
    await r.execute('set_behavior', { add_rules: ['Tutoie le client.'] });
    await applyOp(ENV, USER_ID, 'asst1', assistantRow(), r.actions[0].undo);
    expect(savedConfig().behavior.customRules).toBe('Tutoie le client poliment.');
  });

  it('annuler le message d’accueil Instagram', async () => {
    seed();
    fx.supabase.rows('instagram_integrations')[0].custom_greeting = 'Ancien accueil';
    const r = await runner();
    await r.execute('set_instagram_greeting', { text: 'Nouvel accueil' });
    expect(fx.supabase.rows('instagram_integrations')[0].custom_greeting).toBe('Nouvel accueil');
    await applyOp(ENV, USER_ID, 'asst1', assistantRow(), r.actions[0].undo);
    expect(fx.supabase.rows('instagram_integrations')[0].custom_greeting).toBe('Ancien accueil');
  });

  it('annuler la création d’une automatisation la supprime ; annuler sa suppression la remet avec le MÊME identifiant', async () => {
    seed();
    const r = await runner();
    const made: any = await r.execute('create_automation', { trigger: 'comment', keywords: ['prix'], public_replies: ['Merci !'], dm_text: 'Voici', activate: true });
    expect(automationRows()).toHaveLength(1);
    await applyOp(ENV, USER_ID, 'asst1', assistantRow(), r.actions[0].undo);
    expect(automationRows()).toHaveLength(0);

    const created = seedAutomation(fx.supabase, { name: 'Gardée', enabled: true });
    const r2 = await runner();
    await r2.execute('delete_automation', { id: created.id });
    expect(automationRows()).toHaveLength(0);
    const back: any = await applyOp(ENV, USER_ID, 'asst1', assistantRow(), r2.actions[0].undo);
    expect(back).toMatchObject({ ok: true, message: 'Réponse automatique rétablie.' });
    expect(automationRows()).toHaveLength(1);
    expect(automationRows()[0]).toMatchObject({ id: created.id, name: 'Gardée', enabled: true, user_id: USER_ID });
    expect(made.id).not.toBe(created.id);
  });

  it('annuler une modification d’automatisation remet le texte d’avant ET l’état actif/en pause', async () => {
    seed();
    const created = seedAutomation(fx.supabase, { enabled: true });
    const r = await runner();
    await r.execute('update_automation', { id: created.id, dm_text: 'Texte tout neuf' });
    await applyOp(ENV, USER_ID, 'asst1', assistantRow(), r.actions[0].undo);
    expect(automationRows()[0].config.dm.text).toBe('Salut {prenom} 👋 Voici nos prix.');
    expect(automationRows()[0].enabled).toBe(true);
  });

  it('« Activer » (automation_set_enabled) fonctionne, et refuse une opération inventée', async () => {
    seed();
    const created = seedAutomation(fx.supabase, { enabled: false });
    const ok: any = await applyOp(ENV, USER_ID, 'asst1', assistantRow(), { type: 'automation_set_enabled', automationId: created.id, enabled: true });
    expect(ok.ok).toBe(true);
    expect(automationRows()[0].enabled).toBe(true);
    for (const bad of [null, {}, { type: 'drop_tables' }, { type: 'automation_set_enabled', automationId: created.id }, { type: 'knowledge_restore', note: { id: 'x y', title: 't', content: 'c' } }]) {
      const res: any = await applyOp(ENV, USER_ID, 'asst1', assistantRow(), bad);
      expect(res.ok).toBe(false);
    }
  });

  it('une fiche rétablie venant du navigateur est re-validée : champs inconnus retirés, trop long refusé', async () => {
    seed();
    const res: any = await applyOp(ENV, USER_ID, 'asst1', assistantRow(), { type: 'knowledge_restore', note: { id: 'old1', title: 'Ancienne', content: 'Texte', category: 'learned', enabled: true, evil: '<script>', isAdmin: true } });
    expect(res.ok).toBe(true);
    expect(savedNotes()[0]).toMatchObject({ id: 'old1', title: 'Ancienne', category: 'learned' });
    expect(savedNotes()[0]).not.toHaveProperty('evil');
    expect(savedNotes()[0]).not.toHaveProperty('isAdmin');
    const tooLong: any = await applyOp(ENV, USER_ID, 'asst1', assistantRow(), { type: 'knowledge_restore', note: { id: 'old2', title: 'Longue', content: 'x'.repeat(5000) } });
    expect(tooLong.ok).toBe(false);
  });

  it('annuler quelque chose qui n’existe plus n’est pas une erreur', async () => {
    seed({ notes: [] });
    const res: any = await applyOp(ENV, USER_ID, 'asst1', assistantRow(), { type: 'knowledge_remove', noteId: 'disparue' });
    expect(res).toMatchObject({ ok: true, message: expect.stringMatching(/n’existe plus/) });
    const auto: any = await applyOp(ENV, USER_ID, 'asst1', assistantRow(), { type: 'automation_delete', automationId: '00000000-0000-4000-8000-000000000099' });
    expect(auto.ok).toBe(true);
  });
});

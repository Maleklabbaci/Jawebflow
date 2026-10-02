import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  handleAutomationPostback,
  processCommentEvent,
  runDmAutomations,
  type IgAccount,
} from '../functions/_shared/ig-automations';
import { ENV, IG_ID, USER_ID, dmEvent, installFakes, seedAutomation, seedMerchant } from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;

beforeEach(() => {
  fx = installFakes();
  seedMerchant(fx.supabase);
});
afterEach(() => {
  expect(fx.other).toEqual([]); // aucun appel réseau non prévu
  fx.restore();
});

const commentValue = (over: Record<string, any> = {}) => ({
  id: 'c1',
  from: { id: 'IGSID_SARA', username: 'sara_dz' },
  text: 'Prix svp ?',
  media: { id: 'MEDIA_1', media_product_type: 'FEED' },
  ...over,
});

const account = (): IgAccount => ({ userId: USER_ID, igUserId: IG_ID, token: 'TOKEN1', assistantId: 'asst1', respondToStories: true });

describe('commentaire → réponse publique + message privé', () => {
  it('répond en public ET en privé, journalise, compte, et garde la trace pour l’IA', async () => {
    seedAutomation(fx.supabase);
    const out = await processCommentEvent(ENV, IG_ID, commentValue());
    expect(out.status).toBe('done');

    // réponse publique : POST /{comment_id}/replies { message }
    const [reply] = fx.meta.sent('replies');
    expect(reply.path).toBe('/c1/replies');
    expect(reply.body).toEqual({ message: 'Merci @sara_dz ! Regarde tes messages 📩' });
    expect(reply.auth).toBe('Bearer TOKEN1');

    // réponse privée : POST /{ig_id}/messages { recipient:{comment_id}, message:{text} }
    const [dm] = fx.meta.sent('messages');
    expect(dm.path).toBe(`/${IG_ID}/messages`);
    expect(dm.body.recipient).toEqual({ comment_id: 'c1' });
    expect(dm.body.message).toEqual({ text: 'Salut 👋 Voici nos prix.' }); // prénom inconnu : pas de trou

    // journal
    const [ev] = fx.supabase.rows('ig_automation_events');
    expect(ev).toMatchObject({
      user_id: USER_ID,
      trigger_type: 'comment',
      contact_id: 'IGSID_SARA',
      contact_username: 'sara_dz',
      source_id: 'c1',
      media_id: 'MEDIA_1',
      input_text: 'Prix svp ?',
      public_reply_status: 'sent',
      dm_status: 'sent',
      outcome: 'done',
    });
    expect(ev.error).toBeUndefined();

    // compteurs
    expect(fx.supabase.rows('ig_automations')[0]).toMatchObject({ triggered_count: 1, public_reply_count: 1, dm_count: 1, error_count: 0 });

    // l'IA saura ce qui a déjà été dit à cette personne
    const thread = fx.supabase.rows('instagram_threads')[0];
    expect(thread.messages).toEqual([{ role: 'model', text: 'Salut 👋 Voici nos prix.' }]);

    // témoin de vie pour le diagnostic
    expect(fx.supabase.rows('ig_automation_state')[0]).toMatchObject({ user_id: USER_ID });
  });

  it('ne répond QU’UNE fois si Meta renvoie le même commentaire (anti-doublon)', async () => {
    seedAutomation(fx.supabase);
    expect((await processCommentEvent(ENV, IG_ID, commentValue())).status).toBe('done');
    expect((await processCommentEvent(ENV, IG_ID, commentValue())).status).toBe('duplicate');
    expect(fx.meta.sent('replies')).toHaveLength(1);
    expect(fx.meta.sent('messages')).toHaveLength(1);
    expect(fx.supabase.rows('ig_automation_events')).toHaveLength(1);
  });

  it('même sous une avalanche simultanée, un seul envoi par commentaire', async () => {
    seedAutomation(fx.supabase);
    const results = await Promise.all(Array.from({ length: 5 }, () => processCommentEvent(ENV, IG_ID, commentValue())));
    expect(results.filter((r) => r.status === 'done')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'duplicate')).toHaveLength(4);
    expect(fx.meta.sent('messages')).toHaveLength(1);
  });

  it('ignore ses propres commentaires (anti-boucle) et les réponses à un commentaire', async () => {
    seedAutomation(fx.supabase);
    expect((await processCommentEvent(ENV, IG_ID, commentValue({ from: { id: IG_ID, username: 'boutique_nour' } }))).status).toBe('ignored');
    expect((await processCommentEvent(ENV, IG_ID, commentValue({ id: 'c2', parent_id: 'c1' }))).status).toBe('ignored');
    expect(fx.meta.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(fx.supabase.rows('ig_automation_events')).toHaveLength(0);
  });

  it('ne fait rien si aucun mot-clé ne correspond, si l’automatisation est éteinte, ou si le compte est inconnu', async () => {
    seedAutomation(fx.supabase, { enabled: false });
    expect((await processCommentEvent(ENV, IG_ID, commentValue())).status).toBe('no_match');
    seedAutomation(fx.supabase);
    expect((await processCommentEvent(ENV, IG_ID, commentValue({ id: 'c9', text: 'Superbe photo !' }))).status).toBe('no_match');
    expect((await processCommentEvent(ENV, 'COMPTE_INCONNU', commentValue({ id: 'c10' }))).status).toBe('no_account');
    expect(fx.meta.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('respecte la publication choisie', async () => {
    seedAutomation(fx.supabase, {
      config: {
        media: { scope: 'one', id: 'MEDIA_1' },
        match: { mode: 'contains', keywords: ['prix'] },
        publicReply: { enabled: false, variations: [] },
        dm: { enabled: true, text: 'Voici', buttons: [] },
        gate: { enabled: false },
        oncePerUser: true,
      },
    });
    expect((await processCommentEvent(ENV, IG_ID, commentValue({ media: { id: 'AUTRE' } }))).status).toBe('no_match');
    expect((await processCommentEvent(ENV, IG_ID, commentValue({ id: 'c2' }))).status).toBe('done');
    expect(fx.meta.sent('replies')).toHaveLength(0); // réponse publique désactivée
    expect(fx.meta.sent('messages')).toHaveLength(1);
  });

  it('« une seule fois par personne » : le 2e commentaire de la même personne est ignoré', async () => {
    seedAutomation(fx.supabase);
    expect((await processCommentEvent(ENV, IG_ID, commentValue({ id: 'c1' }))).status).toBe('done');
    const second = await processCommentEvent(ENV, IG_ID, commentValue({ id: 'c2', text: 'prix encore ?' }));
    expect(second.status).toBe('skipped');
    expect(fx.meta.sent('messages')).toHaveLength(1);
    const events = fx.supabase.rows('ig_automation_events');
    expect(events.find((e) => e.source_id === 'c2')).toMatchObject({ outcome: 'skipped' });
    expect(events.find((e) => e.source_id === 'c2')!.note).toMatch(/déjà reçu/);
    // une AUTRE personne est servie normalement
    expect((await processCommentEvent(ENV, IG_ID, commentValue({ id: 'c3', from: { id: 'IGSID_YASMINE', username: 'yasmine' } }))).status).toBe('done');
    expect(fx.meta.sent('messages')).toHaveLength(2);
  });

  it('sans l’option, la même personne est servie à chaque commentaire', async () => {
    const a = seedAutomation(fx.supabase);
    a.config.oncePerUser = false;
    await processCommentEvent(ENV, IG_ID, commentValue({ id: 'c1' }));
    await processCommentEvent(ENV, IG_ID, commentValue({ id: 'c2' }));
    expect(fx.meta.sent('messages')).toHaveLength(2);
  });

  it('une seule automatisation par commentaire : la plus précise', async () => {
    seedAutomation(fx.supabase, { id: 'aaaaaaaa-0000-4000-8000-00000000000a', name: 'Toutes les photos', config: {
      media: { scope: 'any' }, match: { mode: 'contains', keywords: ['prix'] },
      publicReply: { enabled: false, variations: [] }, dm: { enabled: true, text: 'GENERALE', buttons: [] }, gate: { enabled: false }, oncePerUser: true,
    } });
    seedAutomation(fx.supabase, { id: 'aaaaaaaa-0000-4000-8000-00000000000b', name: 'Ce post', created_at: '2026-02-01T00:00:00Z', config: {
      media: { scope: 'one', id: 'MEDIA_1' }, match: { mode: 'contains', keywords: ['prix'] },
      publicReply: { enabled: false, variations: [] }, dm: { enabled: true, text: 'PRECISE', buttons: [] }, gate: { enabled: false }, oncePerUser: true,
    } });
    await processCommentEvent(ENV, IG_ID, commentValue());
    expect(fx.meta.sent('messages')).toHaveLength(1);
    expect(fx.meta.sent('messages')[0].body.message.text).toBe('PRECISE');
  });

  it('variables : {entreprise} vient du nom de l’entreprise, {@pseudo} du commentateur', async () => {
    seedAutomation(fx.supabase, { config: {
      media: { scope: 'any' }, match: { mode: 'any', keywords: [] },
      publicReply: { enabled: true, variations: ['{@pseudo} bienvenue chez {entreprise}'] },
      dm: { enabled: true, text: 'Merci {@pseudo} de la part de {entreprise}', buttons: [] }, gate: { enabled: false }, oncePerUser: true,
    } });
    await processCommentEvent(ENV, IG_ID, commentValue({ text: 'Magnifique 😍' }));
    expect(fx.meta.sent('replies')[0].body.message).toBe('@sara_dz bienvenue chez Boutique Nour');
    expect(fx.meta.sent('messages')[0].body.message.text).toBe('Merci @sara_dz de la part de Boutique Nour');
  });
});

describe('boutons (liens) dans le message privé', () => {
  const withButtons = () =>
    seedAutomation(fx.supabase, { config: {
      media: { scope: 'any' }, match: { mode: 'contains', keywords: ['prix'] },
      publicReply: { enabled: false, variations: [] },
      dm: { enabled: true, text: 'Voici notre catalogue', buttons: [{ title: 'Voir le catalogue', url: 'https://boutique.dz/catalogue' }] },
      gate: { enabled: false }, oncePerUser: true,
    } });

  it('envoie de vrais boutons (modèle « button »)', async () => {
    withButtons();
    await processCommentEvent(ENV, IG_ID, commentValue());
    const msg = fx.meta.sent('messages')[0].body.message;
    expect(msg.attachment).toEqual({
      type: 'template',
      payload: { template_type: 'button', text: 'Voici notre catalogue', buttons: [{ type: 'web_url', url: 'https://boutique.dz/catalogue', title: 'Voir le catalogue' }] },
    });
  });

  it('si Instagram refuse le format à boutons, renvoie un texte simple AVEC le lien', async () => {
    withButtons();
    fx.meta.failWhen((c) => c.path.endsWith('/messages') && Boolean(c.body?.message?.attachment), 400, { message: '(#100) Invalid parameter', code: 100 });
    const out = await processCommentEvent(ENV, IG_ID, commentValue());
    expect(out.status).toBe('done');
    const sent = fx.meta.sent('messages');
    expect(sent).toHaveLength(2); // 1) boutons refusés  2) texte simple
    expect(sent[1].body.message.text).toBe('Voici notre catalogue\n\n👉 Voir le catalogue : https://boutique.dz/catalogue');
  });

  it('si le refus vient d’ailleurs (délai dépassé), on n’insiste pas et on l’explique en français', async () => {
    withButtons();
    fx.meta.failWhen((c) => c.path.endsWith('/messages'), 400, { message: '(#10) This message is sent outside of allowed window.', code: 10, error_subcode: 2534022 }, 5);
    const out = await processCommentEvent(ENV, IG_ID, commentValue());
    expect(out.status).toBe('failed');
    expect(fx.meta.sent('messages')).toHaveLength(1);
    const ev = fx.supabase.rows('ig_automation_events')[0];
    expect(ev).toMatchObject({ dm_status: 'failed', outcome: 'failed' });
    expect(ev.error).toMatch(/7 jours/);
    expect(fx.supabase.rows('ig_automations')[0]).toMatchObject({ triggered_count: 1, dm_count: 0, error_count: 1 });
  });
});

describe('quand Instagram refuse quelque chose', () => {
  it('réponse publique refusée mais message privé envoyé → « partiel », avec la raison', async () => {
    seedAutomation(fx.supabase);
    fx.meta.failWhen((c) => c.path.endsWith('/replies'), 400, { message: '(#100) Unsupported post request. Object with ID does not exist', code: 100 });
    const out = await processCommentEvent(ENV, IG_ID, commentValue());
    expect(out.status).toBe('partial');
    const ev = fx.supabase.rows('ig_automation_events')[0];
    expect(ev).toMatchObject({ public_reply_status: 'failed', dm_status: 'sent', outcome: 'partial' });
    expect(ev.error).toMatch(/Réponse publique/);
    expect(fx.supabase.rows('ig_automations')[0]).toMatchObject({ public_reply_count: 0, dm_count: 1, error_count: 1 });
  });

  it('jeton expiré → message clair pour le marchand', async () => {
    seedAutomation(fx.supabase);
    fx.meta.failWhen(() => true, 400, { message: 'Error validating access token: Session has expired', code: 190 }, 10);
    const out = await processCommentEvent(ENV, IG_ID, commentValue());
    expect(out.status).toBe('failed');
    expect(fx.supabase.rows('ig_automation_events')[0].error).toMatch(/reconnecte ton compte/i);
  });

  it('erreur temporaire de Meta : un seul nouvel essai', async () => {
    seedAutomation(fx.supabase, { config: {
      media: { scope: 'any' }, match: { mode: 'any', keywords: [] }, publicReply: { enabled: false, variations: [] },
      dm: { enabled: true, text: 'Salut', buttons: [] }, gate: { enabled: false }, oncePerUser: true,
    } });
    fx.meta.failWhen((c) => c.path.endsWith('/messages'), 500, { message: 'An unexpected error has occurred', code: 2 }, 1);
    const out = await processCommentEvent(ENV, IG_ID, commentValue());
    expect(out.status).toBe('done');
    expect(fx.meta.sent('messages')).toHaveLength(2);
  });

  it('base de données illisible pour le journal → on N’ENVOIE RIEN (sinon risque de doublons)', async () => {
    seedAutomation(fx.supabase);
    fx.supabase.failTables.add('ig_automation_events');
    const out = await processCommentEvent(ENV, IG_ID, commentValue());
    expect(out.status).toBe('error');
    expect(fx.meta.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('migration SQL pas encore exécutée → aucune erreur, simplement rien à faire', async () => {
    fx.supabase.missing.add('ig_automations');
    const out = await processCommentEvent(ENV, IG_ID, commentValue());
    expect(out.status).toBe('no_match');
  });
});

describe('« suis mon compte avant de recevoir le message »', () => {
  const gated = () =>
    seedAutomation(fx.supabase, { config: {
      media: { scope: 'any' }, match: { mode: 'contains', keywords: ['prix'] },
      publicReply: { enabled: true, variations: ['Check tes messages {@pseudo} 😉'] },
      dm: { enabled: true, text: 'Voici le lien secret', buttons: [{ title: 'Ouvrir', url: 'https://boutique.dz/secret' }] },
      gate: { enabled: true, text: 'Salut {prenom} ! Suis-nous puis appuie 👇', button: '✅ C’est fait', retry: 'Pas encore abonné 🙈' },
      oncePerUser: true,
    } });

  it('envoie d’abord la demande avec un bouton, pas le vrai message', async () => {
    gated();
    const out = await processCommentEvent(ENV, IG_ID, commentValue());
    expect(out.status).toBe('done');
    const msg = fx.meta.sent('messages')[0].body.message;
    expect(msg.attachment.payload.text).toBe('Salut ! Suis-nous puis appuie 👇');
    expect(msg.attachment.payload.buttons).toEqual([{ type: 'postback', title: '✅ C’est fait', payload: `jfg:${out.eventId}` }]);
    expect(JSON.stringify(fx.meta.calls)).not.toContain('lien secret'); // le contenu n'est PAS encore parti
    expect(fx.supabase.rows('ig_automation_events')[0]).toMatchObject({ dm_status: 'awaiting_follow', gate_state: 'awaiting' });
  });

  it('bouton touché, personne PAS abonnée : rappel, et le message reste en attente', async () => {
    gated();
    const { eventId } = await processCommentEvent(ENV, IG_ID, commentValue());
    fx.meta.profiles['IGSID_SARA'] = { name: 'Sara Benali', username: 'sara_dz', is_user_follow_business: false };
    const handled = await handleAutomationPostback(ENV, account(), { sender: { id: 'IGSID_SARA' }, recipient: { id: IG_ID }, postback: { payload: `jfg:${eventId}` } });
    expect(handled).toBe(true);
    const sent = fx.meta.sent('messages');
    expect(sent).toHaveLength(2);
    expect(sent[1].body.recipient).toEqual({ id: 'IGSID_SARA' });
    expect(sent[1].body.message.attachment.payload.text).toBe('Pas encore abonné 🙈');
    expect(fx.supabase.rows('ig_automation_events')[0].gate_state).toBe('awaiting');
  });

  it('bouton touché, personne abonnée : le vrai message part, UNE seule fois même en cas de double clic', async () => {
    gated();
    const { eventId } = await processCommentEvent(ENV, IG_ID, commentValue());
    fx.meta.profiles['IGSID_SARA'] = { name: 'Sara Benali', username: 'sara_dz', is_user_follow_business: true };
    const ev = { sender: { id: 'IGSID_SARA' }, recipient: { id: IG_ID }, postback: { payload: `jfg:${eventId}` } };
    await Promise.all([handleAutomationPostback(ENV, account(), ev), handleAutomationPostback(ENV, account(), ev)]);
    await handleAutomationPostback(ENV, account(), ev);
    const finals = fx.meta.sent('messages').filter((c) => JSON.stringify(c.body).includes('boutique.dz/secret'));
    expect(finals).toHaveLength(1);
    expect(finals[0].body.message.attachment.payload.text).toBe('Voici le lien secret');
    const row = fx.supabase.rows('ig_automation_events')[0];
    expect(row).toMatchObject({ gate_state: 'released', dm_status: 'sent', outcome: 'done' });
    expect(row.note).toMatch(/Abonnement confirmé/);
  });

  it('abonnement invérifiable (profil indisponible) : on fait confiance et on envoie', async () => {
    gated();
    const { eventId } = await processCommentEvent(ENV, IG_ID, commentValue());
    await handleAutomationPostback(ENV, account(), { sender: { id: 'IGSID_SARA' }, recipient: { id: IG_ID }, postback: { payload: `jfg:${eventId}` } });
    expect(JSON.stringify(fx.meta.sent('messages').at(-1)!.body)).toContain('Voici le lien secret');
    expect(fx.supabase.rows('ig_automation_events')[0].note).toMatch(/non vérifiable/);
  });

  it('le bouton d’une AUTRE personne ne débloque rien', async () => {
    gated();
    const { eventId } = await processCommentEvent(ENV, IG_ID, commentValue());
    await handleAutomationPostback(ENV, account(), { sender: { id: 'IGSID_INTRUS' }, recipient: { id: IG_ID }, postback: { payload: `jfg:${eventId}` } });
    expect(fx.meta.sent('messages')).toHaveLength(1);
    expect(fx.supabase.rows('ig_automation_events')[0].gate_state).toBe('awaiting');
  });

  it('un postback qui n’est pas à nous est laissé aux autres', async () => {
    expect(await handleAutomationPostback(ENV, account(), { sender: { id: 'x' }, postback: { payload: 'AUTRE_CHOSE' } })).toBe(false);
  });

  it('format à boutons refusé : demande en texte simple, puis « OK » débloque', async () => {
    gated();
    fx.meta.failWhen((c) => c.path.endsWith('/messages') && Boolean(c.body?.message?.attachment), 400, { message: '(#100) Invalid parameter', code: 100 });
    await processCommentEvent(ENV, IG_ID, commentValue());
    expect(fx.meta.sent('messages')[1].body.message.text).toMatch(/réponds « OK »/);
    fx.meta.profiles['IGSID_SARA'] = { name: 'Sara', username: 'sara_dz', is_user_follow_business: true };
    const verdict = await runDmAutomations(ENV, account(), dmEvent({ text: 'ok' }));
    expect(verdict).toBe('handled');
    expect(JSON.stringify(fx.meta.sent('messages').at(-1)!.body)).toContain('Voici le lien secret');
    // un « ok » ultérieur ne renvoie plus rien
    const before = fx.meta.sent('messages').length;
    await runDmAutomations(ENV, account(), dmEvent({ text: 'ok', mid: 'mid-2' }));
    expect(fx.meta.sent('messages')).toHaveLength(before);
  });
});

describe('mots-clés en message privé, stories', () => {
  const dmRule = (over: Record<string, any> = {}) =>
    seedAutomation(fx.supabase, {
      name: 'Livraison',
      trigger_type: 'dm_keyword',
      config: {
        media: { scope: 'any' }, match: { mode: 'contains', keywords: ['livraison'] },
        publicReply: { enabled: false, variations: [] },
        dm: { enabled: true, text: 'Bonjour {prenom}, nous livrons partout 🚚', buttons: [] },
        gate: { enabled: false }, oncePerUser: false,
      },
      ...over,
    });

  it('répond tout de suite au mot-clé, sans IA, et garde la conversation en mémoire', async () => {
    dmRule();
    const verdict = await runDmAutomations(ENV, account(), dmEvent({ text: 'Bonjour, vous faites la LIVRAISON ?', mid: 'mid-A' }));
    expect(verdict).toBe('handled');
    const [sent] = fx.meta.sent('messages');
    expect(sent.body.recipient).toEqual({ id: 'IGSID_SARA' });
    expect(sent.body.message.text).toBe('Bonjour, nous livrons partout 🚚');
    const thread = fx.supabase.rows('instagram_threads')[0];
    expect(thread.messages).toEqual([
      { role: 'user', text: 'Bonjour, vous faites la LIVRAISON ?' },
      { role: 'model', text: 'Bonjour, nous livrons partout 🚚' },
    ]);
    expect(thread.handled_mids).toContain('mid-A');
    expect(fx.supabase.rows('ig_automations')[0]).toMatchObject({ triggered_count: 1, dm_count: 1 });
  });

  it('le même message reçu deux fois ne déclenche qu’une réponse', async () => {
    dmRule();
    await runDmAutomations(ENV, account(), dmEvent({ text: 'livraison ?', mid: 'mid-A' }));
    expect(await runDmAutomations(ENV, account(), dmEvent({ text: 'livraison ?', mid: 'mid-A' }))).toBe('handled');
    expect(fx.meta.sent('messages')).toHaveLength(1);
  });

  it('aucun mot-clé reconnu → l’IA continue (« pass »)', async () => {
    dmRule();
    expect(await runDmAutomations(ENV, account(), dmEvent({ text: 'Bonjour, vous êtes ouverts ?' }))).toBe('pass');
    expect(fx.meta.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('{prenom} : demandé à Instagram seulement si le message en a besoin', async () => {
    dmRule();
    fx.meta.profiles['IGSID_SARA'] = { name: 'Sara Benali', username: 'sara_dz' };
    await runDmAutomations(ENV, account(), dmEvent({ text: 'livraison' }));
    expect(fx.meta.sent('messages')[0].body.message.text).toBe('Bonjour Sara, nous livrons partout 🚚');

    // sans variable personnelle : aucun appel de profil
    fx.meta.calls.length = 0;
    dmRule({ id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Prix', config: {
      media: { scope: 'any' }, match: { mode: 'exact', keywords: ['prix'] }, publicReply: { enabled: false, variations: [] },
      dm: { enabled: true, text: 'Nos prix : 100 DA', buttons: [] }, gate: { enabled: false }, oncePerUser: false } });
    await runDmAutomations(ENV, account(), dmEvent({ text: 'prix', mid: 'mid-B' }));
    expect(fx.meta.calls.filter((c) => c.method === 'GET')).toHaveLength(0);
  });

  it('quelqu’un qui a dit STOP ne reçoit rien d’automatique', async () => {
    dmRule();
    fx.supabase.seed('bot_mutes', [{ assistant_id: 'asst1', session_id: 'ig_IGSID_SARA' }]);
    expect(await runDmAutomations(ENV, account(), dmEvent({ text: 'livraison' }))).toBe('pass');
    expect(fx.meta.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('réponse à une story : règle « story » d’abord, sinon règle « mot-clé »', async () => {
    dmRule();
    seedAutomation(fx.supabase, { id: 'cccccccc-0000-4000-8000-000000000001', trigger_type: 'story_reply', name: 'Stories', config: {
      media: { scope: 'any' }, match: { mode: 'contains', keywords: ['dispo'] }, publicReply: { enabled: false, variations: [] },
      dm: { enabled: true, text: 'Oui c’est dispo !', buttons: [] }, gate: { enabled: false }, oncePerUser: false } });
    await runDmAutomations(ENV, account(), dmEvent({ text: 'dispo ?', story: true, mid: 'm1' }));
    expect(fx.meta.sent('messages')[0].body.message.text).toBe('Oui c’est dispo !');
    await runDmAutomations(ENV, account(), dmEvent({ text: 'et la livraison ?', story: true, mid: 'm2' }));
    expect(fx.meta.sent('messages')[1].body.message.text).toBe('Bonjour, nous livrons partout 🚚');
    expect(await runDmAutomations(ENV, account(), dmEvent({ text: 'trop beau', story: true, mid: 'm3' }))).toBe('pass');
  });

  it('mention en story : remerciement si une règle existe, sinon on ignore (l’IA ne doit pas répondre)', async () => {
    expect(await runDmAutomations(ENV, account(), dmEvent({ mention: true, mid: 'm1' }))).toBe('ignored');
    expect(fx.meta.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    seedAutomation(fx.supabase, { trigger_type: 'story_mention', name: 'Merci', config: {
      media: { scope: 'any' }, match: { mode: 'any', keywords: [] }, publicReply: { enabled: false, variations: [] },
      dm: { enabled: true, text: 'Merci pour la mention 💜', buttons: [] }, gate: { enabled: false }, oncePerUser: false } });
    expect(await runDmAutomations(ENV, account(), dmEvent({ mention: true, mid: 'm2' }))).toBe('handled');
    expect(fx.meta.sent('messages')[0].body.message.text).toBe('Merci pour la mention 💜');
  });

  it('échec d’envoi : journalisé en français, et on ne bascule PAS sur l’IA', async () => {
    dmRule();
    fx.meta.failWhen((c) => c.path.endsWith('/messages'), 400, { message: '(#10) Application does not have permission for this action', code: 10 }, 5);
    expect(await runDmAutomations(ENV, account(), dmEvent({ text: 'livraison' }))).toBe('handled');
    const ev = fx.supabase.rows('ig_automation_events')[0];
    expect(ev).toMatchObject({ dm_status: 'failed', outcome: 'failed' });
    expect(ev.error).toMatch(/reconnecte/i);
  });
});

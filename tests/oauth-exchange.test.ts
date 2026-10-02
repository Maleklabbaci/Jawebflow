import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as exchange from '../functions/api/instagram/oauth/exchange';
import { ENV, IG_ID, USER_ID, installFakes, seedMerchant } from './helpers/fakes';

let fx: ReturnType<typeof installFakes>;
const env = { ...ENV, INSTAGRAM_APP_ID: 'APPID', INSTAGRAM_APP_SECRET: 'APPSECRET' };

beforeEach(() => {
  fx = installFakes();
  fx.external.handler = (url) =>
    url.host === 'api.instagram.com'
      ? new Response(JSON.stringify({ access_token: 'SHORT_TOKEN', user_id: IG_ID, permissions: 'instagram_business_basic,instagram_business_manage_messages' }), { status: 200 })
      : new Response('{}', { status: 404 });
});
afterEach(() => { expect(fx.other).toEqual([]); fx.restore(); });

const connect = async (body: Record<string, unknown> = {}) => {
  const res = await exchange.onRequestPost({
    request: new Request('https://jawebflow.test/api/instagram/oauth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'CODE123#_', userId: USER_ID, assistantId: 'asst1', redirectUri: 'https://jawebflow.test/', ...body }),
    }),
    env,
  } as any);
  return { status: res.status, json: (await res.json()) as any };
};

describe('connexion Instagram (échange du code)', () => {
  it('première connexion : compte enregistré avec l’identifiant PROFESSIONNEL (celui des webhooks)', async () => {
    const r = await connect();
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ success: true, serverSaved: true, subscribed: true });
    // l'écran réenregistre cette valeur : elle doit être celle que Meta met dans entry.id
    expect(r.json.instagramUserId).toBe(IG_ID);
    expect(r.json.instagramUserId).not.toBe('APP_SCOPED_99');
    expect(r.json.permissions).toEqual(['instagram_business_basic', 'instagram_business_manage_messages']); // pas (encore) les commentaires
    const row = fx.supabase.rows('instagram_integrations')[0];
    expect(row).toMatchObject({ user_id: USER_ID, instagram_user_id: IG_ID, access_token: 'LONG_LIVED_TOKEN', assistant_id: 'asst1', connected: true });
    // abonnement aux messages, aux boutons ET aux commentaires
    expect(fx.meta.subscribedFields).toEqual(['messages', 'messaging_postbacks', 'comments']);
  });

  it('reconnexion : les choix du marchand (IA en pause, stories, accueil) sont conservés', async () => {
    seedMerchant(fx.supabase, { auto_reply_enabled: false, respond_to_stories: false, custom_greeting: 'Ahlan !' });
    const r = await connect();
    expect(r.json.success).toBe(true);
    const row = fx.supabase.rows('instagram_integrations')[0];
    expect(row.auto_reply_enabled).toBe(false);
    expect(row.respond_to_stories).toBe(false);
    expect(row.custom_greeting).toBe('Ahlan !');
    expect(row.access_token).toBe('LONG_LIVED_TOKEN'); // jeton renouvelé
  });

  it('si Meta refuse « commentaires », la connexion et les messages privés restent opérationnels', async () => {
    fx.meta.rejectFields = ['comments'];
    const r = await connect();
    expect(r.json).toMatchObject({ success: true, subscribed: true });
    expect(fx.meta.subscribedFields).toEqual(['messages', 'messaging_postbacks']);
  });

  it('renvoie les autorisations accordées, y compris « commentaires » quand la personne les a acceptées', async () => {
    fx.external.handler = (url) =>
      url.host === 'api.instagram.com'
        ? new Response(JSON.stringify({ access_token: 'SHORT_TOKEN', user_id: IG_ID, permissions: 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments' }), { status: 200 })
        : new Response('{}', { status: 404 });
    const r = await connect();
    expect(r.json.permissions).toContain('instagram_business_manage_comments');
  });
});

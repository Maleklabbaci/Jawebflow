import { describe, expect, it } from 'vitest';
import { CLIENT_CHANNELS, channelIdentity, channelKey, channelLabel } from '../src/lib/channels';

/**
 * Le nom du canal est ce que le marchand lit dans sa liste de clients. Une
 * erreur ici n'est pas cosmétique : elle lui fait croire qu'un message
 * WhatsApp est venu du site web.
 */
describe('identité des canaux', () => {
  it('reconnaît chaque écriture réellement produite par le produit', () => {
    // Ces valeurs viennent du code serveur (webhooks + widget), casse comprise.
    const attendus: Array<[string, string]> = [
      ['instagram', 'instagram'],
      ['Instagram', 'instagram'],
      ['messenger', 'messenger'],
      ['whatsapp', 'whatsapp'],
      ['WhatsApp', 'whatsapp'],
      ['wa', 'whatsapp'],
      ['telegram', 'telegram'],
      ['tiktok', 'tiktok'],
      ['web_widget', 'web'],
      ['site web', 'web'],
      ['Site web', 'web'],
      ['voice', 'voice'],
      ['scan', 'scan'],
    ];
    for (const [brut, cle] of attendus) {
      expect(channelKey(brut), brut).toBe(cle);
    }
  });

  it('accepte les valeurs préfixées et ignore le vide', () => {
    expect(channelKey('canal: wa')).toBe('whatsapp');
    expect(channelKey('ig-dm')).toBe('instagram');
    expect(channelKey('')).toBeNull();
    expect(channelKey(null)).toBeNull();
    expect(channelKey('   ')).toBeNull();
  });

  it('donne le bon nom lisible — plus jamais « Mon site » pour WhatsApp', () => {
    expect(channelLabel('whatsapp')).toBe('WhatsApp');
    expect(channelLabel('messenger')).toBe('Facebook Messenger');
    expect(channelLabel('instagram')).toBe('Instagram');
    expect(channelLabel('web_widget')).toBe('Widget du site web');
    expect(channelLabel('voice')).toBe('Assistant vocal (appel)');
  });

  it('n’invente rien : une valeur inconnue est montrée telle quelle, puis le repli', () => {
    expect(channelLabel('canal-mystere')).toBe('canal-mystere');
    expect(channelLabel('', 'Instagram')).toBe('Instagram');
    expect(channelLabel(null, 'Canal inconnu')).toBe('Canal inconnu');
  });

  it('chaque canal a un badge complet (fond, texte, bordure) et un nom court', () => {
    for (const canal of CLIENT_CHANNELS) {
      expect(canal.badgeClass).toMatch(/border-\S+/);
      expect(canal.badgeClass).toMatch(/bg-\S+/);
      expect(canal.badgeClass).toMatch(/text-\S+/);
      expect(canal.short.length).toBeGreaterThan(0);
      expect(canal.emoji.length).toBeGreaterThan(0);
      expect(channelIdentity(canal.key)?.label).toBe(canal.label);
    }
    // Le filtre affiche les six canaux clients, dans l'ordre du menu.
    expect(CLIENT_CHANNELS.map((c) => c.key)).toEqual(['web', 'instagram', 'messenger', 'whatsapp', 'telegram', 'tiktok', 'voice']);
  });
});

/**
 * 🃏 LES CARTES DU CHAT — tests
 * ============================================================================
 * Ce que ces tests protègent :
 *   1. une réponse « liste de prix / d'horaires / d'étapes » devient une CARTE
 *      propre (titre + puces), jamais un pavé ;
 *   2. une réponse normale reste du texte NORMAL — on ne transforme rien en
 *      carte de force (un « bonjour » ne doit pas ressembler à une fiche) ;
 *   3. les liens deviennent des boutons, et rien ne casse si le modèle écrit
 *      du markdown approximatif ;
 *   4. le texte reste lisible même sans CSS (copier/coller, e-mails, logs).
 */
import { describe, expect, it } from 'vitest';
import { hasCards, parseChatBlocks, plainText } from '../src/lib/chat-cards';

describe('les réponses organisées en cartes', () => {
  it('une liste de formules devient une carte avec son titre', () => {
    const blocks = parseChatBlocks(
      '**Les formules**\n- Basic : 10 $ par mois, 500 conversations\n- Pro : 20 $ par mois, 1 500 conversations\n- Entreprise : sur devis',
    );
    expect(blocks).toHaveLength(1);
    const card = blocks[0] as any;
    expect(card.kind).toBe('card');
    expect(card.title).toBe('Les formules');
    expect(card.items).toHaveLength(3);
    expect(card.items[1]).toContain('Pro');
  });

  it('des puces sans titre font quand même une carte (le cas le plus fréquent)', () => {
    const blocks = parseChatBlocks('- Installation en 5 minutes\n- Compatible WordPress, Shopify, Wix\n- On peut l’installer pour vous');
    const card = blocks[0] as any;
    expect(card.kind).toBe('card');
    expect(card.items).toHaveLength(3);
    expect(card.title).toBe('');
  });

  it('un titre collé juste après une carte ouvre une NOUVELLE carte', () => {
    const blocks = parseChatBlocks('- Basic : 10 $\n- Pro : 20 $\n**Horaires**\n- Samedi à jeudi : 9h → 18h\n- Vendredi : fermé');
    expect(blocks.filter((b) => b.kind === 'card')).toHaveLength(2);
    expect((blocks[1] as any).title).toBe('Horaires');
  });

  it('un simple bonjour ne devient pas une carte', () => {
    const blocks = parseChatBlocks('Salam ! Comment puis-je vous aider aujourd’hui ?');
    expect(hasCards(blocks)).toBe(false);
    expect(blocks[0]).toMatchObject({ kind: 'text' });
  });

  it('les liens deviennent des boutons, et le libellé reste dans le texte', () => {
    const blocks = parseChatBlocks('**Pour commencer**\n- Créer votre assistant gratuitement\n- Aucune carte bancaire\n\n[Voir les tarifs](https://jawebflow.dz/tarifs)');
    const flat = JSON.stringify(blocks);
    expect(flat).toContain('Voir les tarifs');
    expect(flat).toContain('https://jawebflow.dz/tarifs');
  });

  it('survit au markdown approximatif : astérisques collés, numéros, puces mélangées', () => {
    const blocks = parseChatBlocks('**Paiement**\n1) BaridiMob\n2) CCP\n• Virement bancaire');
    const card = blocks[0] as any;
    expect(card.kind).toBe('card');
    expect(card.items).toHaveLength(3);
  });

  it('borne le nombre de lignes d’une carte (jamais de carte interminable)', () => {
    const many = Array.from({ length: 20 }, (_, i) => `- Ligne ${i}`).join('\n');
    const card = parseChatBlocks(many, { maxItems: 5 })[0] as any;
    expect(card.items).toHaveLength(5);
  });

  it('texte vide ou nul : aucun bloc (rien à afficher, rien qui casse)', () => {
    expect(parseChatBlocks('')).toEqual([]);
    expect(parseChatBlocks(null)).toEqual([]);
    expect(parseChatBlocks(undefined)).toEqual([]);
  });

  it('plainText() garde le sens sans les étoiles ni les adresses', () => {
    expect(plainText('**Basic** : [Voir](https://x.dz/a) 10 $')).toBe('Basic : Voir 10 $');
  });
});

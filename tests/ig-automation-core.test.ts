import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_TEMPLATES,
  LIMITS,
  buildDm,
  buildGate,
  buildPublicReply,
  byteLength,
  defaultConfig,
  describeActions,
  describeTrigger,
  firstNameFrom,
  matchKeywords,
  normalizeConfig,
  normalizeText,
  normalizeUrl,
  parseKeywords,
  pickAutomation,
  pickVariation,
  renderTemplate,
  rowToAutomation,
  sanitizeAutomationInput,
  simulateAutomation,
  truncateToBytes,
  unknownVariables,
  type Automation,
  type AutomationConfig,
  type TriggerType,
} from '../functions/_shared/ig-automation-core';

function makeAutomation(over: Partial<Automation> & { config?: Partial<AutomationConfig> } = {}): Automation {
  const triggerType: TriggerType = over.triggerType || 'comment';
  const base = defaultConfig(triggerType);
  return {
    id: over.id || 'a1',
    name: over.name || 'Test',
    triggerType,
    enabled: over.enabled ?? true,
    config: { ...base, ...(over.config || {}) } as AutomationConfig,
    stats: { triggered: 0, publicReplies: 0, dms: 0, errors: 0, lastTriggeredAt: null },
    createdAt: over.createdAt || '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('normalizeText', () => {
  it('ignore majuscules, accents et ponctuation', () => {
    expect(normalizeText('  PRIX ?!  ')).toBe('prix');
    expect(normalizeText('Éléphant à côté')).toBe('elephant a cote');
    expect(normalizeText('c’est   combien,  svp…')).toBe('c est combien svp');
  });

  it('unifie les variantes de lettres arabes et retire les voyelles', () => {
    expect(normalizeText('السِّعْر')).toBe(normalizeText('السعر'));
    expect(normalizeText('أحمد')).toBe(normalizeText('احمد'));
    expect(normalizeText('مدرسة')).toBe(normalizeText('مدرسه'));
  });

  it('convertit les chiffres arabes et garde les chiffres collés aux lettres (arabizi)', () => {
    expect(normalizeText('٠٧٧٠١٢٣')).toBe('0770123');
    expect(normalizeText('ch7al le prix ?')).toBe('ch7al le prix');
  });

  it('conserve les émojis (un émoji peut être un mot-clé)', () => {
    expect(normalizeText('🔥!!')).toBe('🔥');
  });

  it('ne plante jamais sur des valeurs bizarres', () => {
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(42)).toBe('42');
  });
});

describe('matchKeywords', () => {
  it('contains : le mot peut être noyé dans la phrase', () => {
    expect(matchKeywords('Quel est le PRIX svp ?', 'contains', ['prix']).matched).toBe(true);
    expect(matchKeywords('prixxx', 'contains', ['prix']).matched).toBe(true);
    expect(matchKeywords('bonjour', 'contains', ['prix']).matched).toBe(false);
  });

  it('retourne le mot-clé trouvé (tel que saisi par le marchand)', () => {
    expect(matchKeywords('je veux INFO', 'contains', ['Prix', 'Info'])).toEqual({ matched: true, keyword: 'Info' });
  });

  it('exact : le commentaire entier doit être le mot', () => {
    expect(matchKeywords('Prix', 'exact', ['prix']).matched).toBe(true);
    expect(matchKeywords('  prix !! ', 'exact', ['prix']).matched).toBe(true);
    expect(matchKeywords('quel prix ?', 'exact', ['prix']).matched).toBe(false);
  });

  it('any : tout texte non vide, jamais un texte vide', () => {
    expect(matchKeywords('n’importe quoi', 'any', []).matched).toBe(true);
    expect(matchKeywords('   ', 'any', []).matched).toBe(false);
    expect(matchKeywords('', 'any', []).matched).toBe(false);
  });

  it('les très courts mots-clés doivent être un mot entier (« ok » ≠ « book »)', () => {
    expect(matchKeywords('ok merci', 'contains', ['ok']).matched).toBe(true);
    expect(matchKeywords('I love this book', 'contains', ['ok']).matched).toBe(false);
  });

  it('marche en arabe, avec voyelles ou lettres différentes', () => {
    expect(matchKeywords('بكم السِّعر لو سمحت', 'contains', ['سعر']).matched).toBe(true);
    expect(matchKeywords('كم', 'exact', ['كم']).matched).toBe(true);
  });

  it('marche avec des accents, de l’arabizi et un émoji', () => {
    expect(matchKeywords('Où est la livraison ?', 'contains', ['livraison']).matched).toBe(true);
    expect(matchKeywords('ch7al hada', 'contains', ['ch7al']).matched).toBe(true);
    expect(matchKeywords('Trop beau 🔥🔥', 'contains', ['🔥']).matched).toBe(true);
  });

  it('un mot-clé vide n’attrape rien', () => {
    expect(matchKeywords('bonjour', 'contains', ['', '   ', '!!!']).matched).toBe(false);
  });
});

describe('renderTemplate', () => {
  it('remplace les variables', () => {
    expect(renderTemplate('Salut {prenom} !', { firstName: 'Sara' })).toBe('Salut Sara !');
    expect(renderTemplate('Merci {@pseudo}', { username: 'sara_dz' })).toBe('Merci @sara_dz');
    expect(renderTemplate('{pseudo} / {@pseudo}', { username: '@sara_dz' })).toBe('sara_dz / @sara_dz');
    expect(renderTemplate('Bienvenue chez {entreprise}', { businessName: 'Boutique Nour' })).toBe('Bienvenue chez Boutique Nour');
  });

  it('accepte les alias et les doubles accolades', () => {
    expect(renderTemplate('{{first_name}} {username}', { firstName: 'Sara', username: 'sara_dz' })).toBe('Sara sara_dz');
  });

  it('une variable vide ne laisse pas de trous disgracieux', () => {
    expect(renderTemplate('Salut {prenom} 👋', {})).toBe('Salut 👋');
    expect(renderTemplate('Merci {prenom}, bonne journée', {})).toBe('Merci, bonne journée');
    expect(renderTemplate('{@pseudo} Merci !', {})).toBe('Merci !');
  });

  it('garde les sauts de ligne et laisse les variables inconnues visibles', () => {
    expect(renderTemplate('Ligne 1\n\n\n\nLigne 2 {truc}', {})).toBe('Ligne 1\n\nLigne 2 {truc}');
  });

  it('unknownVariables repère les fautes de frappe', () => {
    expect(unknownVariables('Salut {prenom} {prenomm} {@pseudo} {x_y}')).toEqual(['{prenomm}', '{x_y}']);
    expect(unknownVariables('Rien ici')).toEqual([]);
  });
});

describe('firstNameFrom', () => {
  it('garde un prénom crédible et rejette un pseudo', () => {
    expect(firstNameFrom('sara benali')).toBe('Sara');
    expect(firstNameFrom('Peter Chang')).toBe('Peter');
    expect(firstNameFrom('boutique_dz23')).toBe('');
    expect(firstNameFrom('')).toBe('');
    expect(firstNameFrom(undefined)).toBe('');
  });
});

describe('tailles de texte', () => {
  it('truncateToBytes ne coupe jamais un caractère en deux', () => {
    const arabic = 'مرحبا '.repeat(300);
    const cut = truncateToBytes(arabic, 1000);
    expect(byteLength(cut)).toBeLessThanOrEqual(1000);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toContain('\uFFFD');
  });
  it('ne touche pas un texte déjà assez court', () => {
    expect(truncateToBytes('Salut', 1000)).toBe('Salut');
  });
  it('pickVariation ignore les variantes vides et accepte un hasard injecté', () => {
    expect(pickVariation(['', '  '])).toBeNull();
    expect(pickVariation(['a', 'b', 'c'], () => 0)).toBe('a');
    expect(pickVariation(['a', 'b', 'c'], () => 0.99)).toBe('c');
    expect(pickVariation(['', 'seule'], () => 0.5)).toBe('seule');
  });
});

describe('normalizeUrl / parseKeywords', () => {
  it('normalizeUrl ajoute https et refuse le reste', () => {
    expect(normalizeUrl('boutique.dz/promo')).toBe('https://boutique.dz/promo');
    expect(normalizeUrl('https://exemple.com')).toBe('https://exemple.com/');
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('data:text/html,<b>')).toBeNull();
    expect(normalizeUrl('ftp://exemple.com')).toBeNull();
    expect(normalizeUrl('pas un lien')).toBeNull();
    expect(normalizeUrl('localhost')).toBeNull();
    expect(normalizeUrl('')).toBeNull();
  });
  it('parseKeywords découpe, nettoie et dédoublonne (accents/majuscules ignorés)', () => {
    expect(parseKeywords('Prix, prix ;  PRIX\nInfo،Éco')).toEqual(['Prix', 'Info', 'Éco']);
    expect(parseKeywords(['a', 'A', ' b '])).toEqual(['a', 'b']);
    expect(parseKeywords('x'.repeat(100))[0].length).toBe(LIMITS.maxKeywordLength);
  });
});

describe('sanitizeAutomationInput', () => {
  const validComment = () => ({
    name: 'Prix',
    triggerType: 'comment',
    config: {
      media: { scope: 'any' },
      match: { mode: 'contains', keywords: ['prix', 'info'] },
      publicReply: { enabled: true, variations: ['Merci {@pseudo} !', ''] },
      dm: { enabled: true, text: 'Salut {prenom}', buttons: [{ title: 'Voir', url: 'boutique.dz/offre' }] },
    },
  });

  it('accepte une automatisation de commentaire complète et la nettoie', () => {
    const r = sanitizeAutomationInput(validComment());
    expect(r.ok).toBe(true);
    const c = r.value!.config;
    expect(c.publicReply.variations).toEqual(['Merci {@pseudo} !']);
    expect(c.dm.buttons).toEqual([{ title: 'Voir', url: 'https://boutique.dz/offre' }]);
    expect(c.oncePerUser).toBe(true); // « une seule fois par personne » par défaut
    expect(c.gate.enabled).toBe(false);
  });

  it('exige des mots-clés quand le mode n’est pas « n’importe lequel »', () => {
    const input: any = validComment();
    input.config.match.keywords = [];
    const r = sanitizeAutomationInput(input);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/mot-clé/);
    input.config.match.mode = 'any';
    expect(sanitizeAutomationInput(input).ok).toBe(true);
  });

  it('exige au moins une action', () => {
    const input: any = validComment();
    input.config.publicReply.enabled = false;
    input.config.dm.enabled = false;
    const r = sanitizeAutomationInput(input);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/au moins une action/);
  });

  it('exige un texte de message privé et une réponse publique quand ils sont activés', () => {
    const a: any = validComment();
    a.config.dm.text = '   ';
    expect(sanitizeAutomationInput(a).errors.join(' ')).toMatch(/message privé à envoyer/);
    const b: any = validComment();
    b.config.publicReply.variations = [];
    expect(sanitizeAutomationInput(b).errors.join(' ')).toMatch(/réponse publique/);
  });

  it('refuse un lien dangereux ou un bouton sans titre', () => {
    const a: any = validComment();
    a.config.dm.buttons = [{ title: 'Clique', url: 'javascript:alert(1)' }];
    expect(sanitizeAutomationInput(a).errors.join(' ')).toMatch(/lien du bouton/);
    const b: any = validComment();
    b.config.dm.buttons = [{ title: '', url: 'https://ok.com' }];
    expect(sanitizeAutomationInput(b).errors.join(' ')).toMatch(/titre/);
  });

  it('limite à 3 boutons de 20 caractères et ignore les lignes vides', () => {
    const a: any = validComment();
    a.config.dm.buttons = [
      { title: 'A'.repeat(50), url: 'https://a.com' },
      { title: '', url: '' },
      { title: 'B', url: 'https://b.com' },
      { title: 'C', url: 'https://c.com' },
      { title: 'D', url: 'https://d.com' },
    ];
    const r = sanitizeAutomationInput(a);
    expect(r.ok).toBe(true);
    expect(r.value!.config.dm.buttons.length).toBeLessThanOrEqual(LIMITS.maxButtons);
    expect(r.value!.config.dm.buttons[0].title.length).toBe(LIMITS.maxButtonTitle);
  });

  it('signale une variable inconnue (faute de frappe)', () => {
    const a: any = validComment();
    a.config.dm.text = 'Salut {prenomm}';
    expect(sanitizeAutomationInput(a).errors.join(' ')).toMatch(/\{prenomm\}/);
  });

  it('refuse un message privé trop long (octets UTF-8, pas caractères)', () => {
    const a: any = validComment();
    a.config.dm.text = 'م'.repeat(600); // 1200 octets
    expect(sanitizeAutomationInput(a).errors.join(' ')).toMatch(/trop long/);
  });

  it('une publication précise exige un identifiant valide', () => {
    const a: any = validComment();
    a.config.media = { scope: 'one', id: '' };
    expect(sanitizeAutomationInput(a).ok).toBe(false);
    a.config.media = { scope: 'one', id: '17895695668004550', permalink: 'https://www.instagram.com/p/abc/', thumbnail: 'http://evil', caption: 'Légende' };
    const r = sanitizeAutomationInput(a);
    expect(r.ok).toBe(true);
    expect(r.value!.config.media.id).toBe('17895695668004550');
    expect(r.value!.config.media.permalink).toBe('https://www.instagram.com/p/abc/');
    expect(r.value!.config.media.thumbnail).toBeUndefined(); // http:// refusé
  });

  it('« suis mon compte » n’est possible qu’avec un message privé', () => {
    const a: any = validComment();
    a.config.gate = { enabled: true };
    expect(sanitizeAutomationInput(a).value!.config.gate.enabled).toBe(true);
    a.config.dm.enabled = false;
    expect(sanitizeAutomationInput(a).value!.config.gate.enabled).toBe(false);
  });

  it('mot-clé en message privé : « n’importe quel message » est interdit (il couperait l’IA)', () => {
    const r = sanitizeAutomationInput({
      triggerType: 'dm_keyword',
      config: { match: { mode: 'any' }, dm: { text: 'Salut' } },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/au moins un mot-clé/);
  });

  it('mot-clé en message privé : valide avec des mots et un texte, jamais de réponse publique', () => {
    const r = sanitizeAutomationInput({
      triggerType: 'dm_keyword',
      config: { match: { mode: 'contains', keywords: ['livraison'] }, dm: { text: 'On livre partout' }, publicReply: { enabled: true, variations: ['x'] } },
    });
    expect(r.ok).toBe(true);
    expect(r.value!.config.publicReply).toEqual({ enabled: false, variations: [] });
    expect(r.value!.config.oncePerUser).toBe(false);
  });

  it('mention en story : pas de mot-clé, un message suffit', () => {
    const r = sanitizeAutomationInput({ triggerType: 'story_mention', config: { dm: { text: 'Merci !' } } });
    expect(r.ok).toBe(true);
    expect(r.value!.config.match).toEqual({ mode: 'any', keywords: [] });
  });

  it('refuse un type inconnu ou des données absurdes', () => {
    expect(sanitizeAutomationInput({ triggerType: 'hack' }).ok).toBe(false);
    expect(sanitizeAutomationInput(null).ok).toBe(false);
    expect(sanitizeAutomationInput('texte').ok).toBe(false);
  });

  it('chaque modèle prêt à l’emploi est valide dès qu’on complète le texte', () => {
    for (const t of AUTOMATION_TEMPLATES) {
      const filled: any = JSON.parse(JSON.stringify(t.config));
      filled.dm = { ...(filled.dm || {}), enabled: true, text: `${filled.dm?.text || ''} voici l’info` };
      const r = sanitizeAutomationInput({ name: t.name, triggerType: t.triggerType, config: filled });
      expect(r.errors).toEqual([]);
      expect(r.ok).toBe(true);
    }
  });
});

describe('pickAutomation', () => {
  const kw = (words: string[], mode: 'contains' | 'exact' = 'contains') => ({ match: { mode, keywords: words } });

  it('ignore les automatisations éteintes ou d’un autre type', () => {
    const list = [
      makeAutomation({ id: 'off', enabled: false, config: kw(['prix']) }),
      makeAutomation({ id: 'dm', triggerType: 'dm_keyword', config: kw(['prix']) }),
    ];
    expect(pickAutomation(list, { type: 'comment', text: 'prix' })).toBeNull();
  });

  it('une publication précise l’emporte sur « toutes les publications »', () => {
    const list = [
      makeAutomation({ id: 'toutes', config: kw(['prix']), createdAt: '2026-01-01' }),
      makeAutomation({ id: 'precise', config: { ...kw(['prix']), media: { scope: 'one', id: 'M1' } }, createdAt: '2026-02-01' }),
    ];
    expect(pickAutomation(list, { type: 'comment', text: 'prix', mediaId: 'M1' })!.automation.id).toBe('precise');
    // sous une autre publication, seule « toutes » correspond
    expect(pickAutomation(list, { type: 'comment', text: 'prix', mediaId: 'M2' })!.automation.id).toBe('toutes');
  });

  it('un mot-clé précis l’emporte sur « n’importe quel commentaire »', () => {
    const list = [
      makeAutomation({ id: 'tout', config: { match: { mode: 'any', keywords: [] } }, createdAt: '2026-01-01' }),
      makeAutomation({ id: 'prix', config: kw(['prix']), createdAt: '2026-03-01' }),
    ];
    expect(pickAutomation(list, { type: 'comment', text: 'quel prix ?' })!.automation.id).toBe('prix');
    expect(pickAutomation(list, { type: 'comment', text: 'superbe photo' })!.automation.id).toBe('tout');
  });

  it('à égalité, la plus ancienne gagne', () => {
    const list = [
      makeAutomation({ id: 'recente', config: kw(['prix']), createdAt: '2026-05-01' }),
      makeAutomation({ id: 'ancienne', config: kw(['prix']), createdAt: '2026-01-01' }),
    ];
    expect(pickAutomation(list, { type: 'comment', text: 'prix' })!.automation.id).toBe('ancienne');
  });

  it('mention en story : aucun mot-clé requis', () => {
    const list = [makeAutomation({ triggerType: 'story_mention' })];
    expect(pickAutomation(list, { type: 'story_mention' })).not.toBeNull();
  });

  it('renvoie le mot-clé reconnu', () => {
    const list = [makeAutomation({ config: kw(['prix', 'info']) })];
    expect(pickAutomation(list, { type: 'comment', text: 'une info svp' })!.keyword).toBe('info');
  });
});

describe('simulateAutomation / construction des messages', () => {
  const comment = makeAutomation({
    config: {
      media: { scope: 'one', id: 'M1' },
      match: { mode: 'contains', keywords: ['prix'] },
      publicReply: { enabled: true, variations: ['Merci {@pseudo} !', 'Ça arrive {@pseudo}'] },
      dm: { enabled: true, text: 'Salut {prenom} 👋 voici le prix', buttons: [{ title: 'Voir', url: 'https://a.com/' }] },
      gate: { enabled: false, text: '', button: '', retry: '' },
      oncePerUser: true,
    },
  });

  it('simule un commentaire qui déclenche', () => {
    const r = simulateAutomation(comment, { text: 'Prix ?', username: 'sara_dz', mediaId: 'M1' });
    expect(r.triggers).toBe(true);
    expect(r.keyword).toBe('prix');
    expect(r.publicReply).toBe('Merci @sara_dz !');
    expect(r.dm!.text).toBe('Salut 👋 voici le prix'); // prénom inconnu → pas de trou
    expect(r.dm!.buttons).toHaveLength(1);
  });

  it('explique pourquoi ça ne déclenche pas', () => {
    expect(simulateAutomation(comment, { text: 'superbe', username: 'x', mediaId: 'M1' })).toMatchObject({ triggers: false, reason: expect.stringMatching(/mots-clés/) });
    expect(simulateAutomation(comment, { text: 'prix', mediaId: 'AUTRE' })).toMatchObject({ triggers: false, reason: expect.stringMatching(/autre publication/) });
    expect(simulateAutomation(comment, { text: '' })).toMatchObject({ triggers: false });
  });

  it('construit la demande d’abonnement quand l’option est active', () => {
    const gated = makeAutomation({ config: { ...comment.config, gate: { enabled: true, text: 'Suis-nous {prenom}', button: '✅ Fait', retry: 'Pas encore' } } });
    const r = simulateAutomation(gated, { text: 'prix', mediaId: 'M1', firstName: 'Sara' });
    expect(r.gate).toEqual({ text: 'Suis-nous Sara', button: '✅ Fait' });
    expect(buildGate(gated.config, {})!.retry).toBe('Pas encore');
    // sans message privé, pas de demande d'abonnement
    expect(buildGate({ ...gated.config, dm: { ...gated.config.dm, enabled: false } }, {})).toBeNull();
  });

  it('buildPublicReply / buildDm respectent les interrupteurs', () => {
    expect(buildPublicReply({ ...comment.config, publicReply: { enabled: false, variations: ['x'] } }, {})).toBeNull();
    expect(buildDm({ ...comment.config, dm: { ...comment.config.dm, enabled: false } }, {})).toBeNull();
    expect(buildDm({ ...comment.config, dm: { ...comment.config.dm, text: '{prenom}' } }, {})).toBeNull(); // message vide après rendu
  });

  it('le message privé ne dépasse jamais la limite Instagram', () => {
    const dm = buildDm({ ...comment.config, dm: { ...comment.config.dm, text: 'م'.repeat(2000) } }, {})!;
    expect(byteLength(dm.text)).toBeLessThanOrEqual(LIMITS.hardDmBytes);
  });

  it('describeTrigger / describeActions donnent une phrase lisible', () => {
    expect(describeTrigger(comment)).toBe('Quand un commentaire contient « prix » sous la publication choisie');
    expect(describeActions(comment)).toBe('➜ réponse publique + message privé');
    expect(describeTrigger(makeAutomation({ triggerType: 'story_mention' }))).toMatch(/mentionne/);
  });
});

describe('rowToAutomation / normalizeConfig', () => {
  it('relit une ligne de base de données, même ancienne ou incomplète', () => {
    const a = rowToAutomation({ id: 'x', trigger_type: 'dm_keyword', enabled: true, config: { match: { mode: 'contains', keywords: ['a'] } }, triggered_count: 4, error_count: 1 });
    expect(a.triggerType).toBe('dm_keyword');
    expect(a.stats).toMatchObject({ triggered: 4, errors: 1, dms: 0 });
    expect(a.config.dm.text).toBe('');
    expect(a.config.gate.button.length).toBeGreaterThan(0);
  });
  it('une config corrompue ne fait jamais planter', () => {
    expect(() => normalizeConfig('comment', 'n’importe quoi')).not.toThrow();
    expect(() => normalizeConfig('comment', { match: 5, dm: { buttons: 'oups' } })).not.toThrow();
    expect(normalizeConfig('comment', null).media.scope).toBe('any');
  });
  it('un type inconnu retombe sur « commentaire »', () => {
    expect(rowToAutomation({ id: 'x', trigger_type: 'zzz' }).triggerType).toBe('comment');
  });
});

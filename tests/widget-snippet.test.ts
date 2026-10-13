/**
 * 🧩 Le code d'installation du widget
 * ============================================================================
 * Ce que ces tests protègent (bug réel corrigé) : le marchand réglait la
 * taille, le badge « en ligne », le titre, la mention JawebFlow ou le teaser
 * dans son tableau de bord — l'aperçu changeait, le vrai widget NON.
 *
 * Deux règles :
 *   1. un réglage affiché dans l'aperçu doit exister dans le code collé ;
 *   2. le widget servi doit lire chaque attribut que le code lui donne.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWidgetSnippet, escapeHtmlAttr } from '../src/lib/widget-snippet';

const ROOT = path.resolve(__dirname, '..');
const base = { scriptUrl: 'https://app.jawebflow.dz/widget.js', assistantId: 'asst1', businessName: 'Maison Lila' };

describe('code d’installation du widget', () => {
  it('transporte le réglage complet du marchand', () => {
    const code = buildWidgetSnippet({
      ...base,
      config: {
        primaryColor: '#10b981',
        gradientSecondary: '#06b6d4',
        position: 'bottom-left',
        shape: 'squircle',
        size: 'large',
        iconType: 'bot',
        themeMode: 'light',
        showTeaser: true,
        teaserText: 'Besoin d’un conseil ?',
        welcomeMessage: 'Salam !',
        headerTitle: 'Service client',
        headerSubtitle: 'Réponse en 1 minute',
        onlineBadge: false,
        showBranding: false,
      },
    });

    for (const fragment of [
      'src="https://app.jawebflow.dz/widget.js"',
      'data-assistant-id="asst1"',
      'data-business-name="Maison Lila"',
      'data-position="bottom-left"',
      'data-size="large"',
      'data-shape="squircle"',
      'data-theme="light"',
      'data-primary-color="#10b981"',
      'data-secondary-color="#06b6d4"',
      'data-icon="bot"',
      'data-teaser="Besoin d’un conseil ?"',
      'data-welcome="Salam !"',
      'data-header-title="Service client"',
      'data-header-subtitle="Réponse en 1 minute"',
      'data-badge="false"',
      'data-branding="false"',
    ]) expect(code).toContain(fragment);
  });

  it('teaser éteint = attribut VIDE (le widget ne doit pas remettre sa phrase)', () => {
    const code = buildWidgetSnippet({ ...base, config: { showTeaser: false, teaserText: 'coucou' } });
    expect(code).toContain('data-teaser=""');
    expect(code).not.toContain('coucou');
  });

  it('défauts prudents : badge et marque allumés, position à droite', () => {
    const code = buildWidgetSnippet(base);
    expect(code).toContain('data-position="bottom-right"');
    expect(code).toContain('data-size="standard"');
    expect(code).toContain('data-badge="true"');
    expect(code).toContain('data-branding="true"');
  });

  it('logo personnalisé : l’avatar n’apparaît que dans ce cas', () => {
    const avec = buildWidgetSnippet({ ...base, config: { iconType: 'custom_logo', customLogoUrl: 'https://cdn.x/logo.png' } });
    expect(avec).toContain('data-avatar-url="https://cdn.x/logo.png"');
    const sans = buildWidgetSnippet({ ...base, config: { iconType: 'bot' } });
    expect(sans).not.toContain('data-avatar-url');
  });

  it('agent vocal : l’appel se voit dès le code collé, et disparaît s’il est éteint', () => {
    const on = buildWidgetSnippet({ ...base, config: { voice: { enabled: true, voice: 'Kore', greeting: 'Salam, je vous écoute.', maxMinutes: 5 } } });
    expect(on).toContain('data-voice="on"');
    expect(on).toContain('data-voice-greeting="Salam, je vous écoute."');
    const off = buildWidgetSnippet({ ...base, config: { voice: { enabled: false, voice: 'Kore', greeting: 'Salam', maxMinutes: 5 } } });
    expect(off).not.toContain('data-voice');
  });

  it('guillemets et chevrons échappés : un nom de boutique ne casse pas le code', () => {
    expect(escapeHtmlAttr('Chez "Ali" & <frères>')).toBe('Chez &quot;Ali&quot; &amp; &lt;frères&gt;');
    const code = buildWidgetSnippet({ ...base, businessName: 'Café "El Bahdja"', config: { teaserText: 'Devis < 1 min' } });
    expect(code).toContain('data-business-name="Café &quot;El Bahdja&quot;"');
    expect(code).toContain('data-teaser="Devis &lt; 1 min"');
  });

  it('contact WhatsApp : les espaces du numéro sont nettoyés', () => {
    const code = buildWidgetSnippet({ ...base, whatsappEscalation: '+213 555 12 34 56' });
    expect(code).toContain('data-whatsapp="+213555123456"');
  });
});

describe('le widget servi lit ce que le code lui donne', () => {
  const widget = fs.readFileSync(path.join(ROOT, 'public/widget.js'), 'utf8');

  it('chaque attribut du code est réellement lu par widget.js', () => {
    for (const attr of [
      'data-position', 'data-size', 'data-theme', 'data-shape', 'data-primary-color',
      'data-secondary-color', 'data-icon', 'data-teaser', 'data-welcome',
      'data-header-title', 'data-header-subtitle', 'data-badge', 'data-branding',
      'data-avatar-url', 'data-voice', 'data-whatsapp',
    ]) expect(widget).toContain(attr);
  });

  it('taille, badge et marque s’appliquent aussi quand la config arrive du serveur', () => {
    expect(widget).toContain('c.size');
    expect(widget).toContain('c.onlineBadge');
    expect(widget).toContain('c.showBranding');
    expect(widget).toContain('c.headerSubtitle');
    expect(widget).toContain('c.showTeaser === false');
  });

  it('un seul widget : la vieille copie /cdn/widget.js n’existe plus mais reste servie', () => {
    expect(fs.existsSync(path.join(ROOT, 'public/cdn/widget.js'))).toBe(false);
    const redirects = fs.readFileSync(path.join(ROOT, 'public/_redirects'), 'utf8');
    expect(redirects).toContain('/cdn/widget.js  /widget.js  200');
  });
});

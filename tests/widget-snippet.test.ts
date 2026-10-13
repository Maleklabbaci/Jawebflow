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

  it('mode « le bot qui appelle » : aucun chat, un seul bouton d’appel', () => {
    const code = buildWidgetSnippet({
      ...base,
      config: { mode: 'voice', voice: { enabled: true, voice: 'Kore', greeting: '', maxMinutes: 5 } },
    });
    expect(code).toContain('data-mode="voice"');
    const chat = buildWidgetSnippet({ ...base, config: { mode: 'chat' } });
    expect(chat).toContain('data-mode="chat"');
    // Sans réglage : les deux modes, comme avant.
    expect(buildWidgetSnippet(base)).toContain('data-mode="both"');
  });

  it('accroche : pulsation, retard, ouverture auto, message proactif, libellé d’appel', () => {
    const code = buildWidgetSnippet({
      ...base,
      config: {
        attention: {
          pulse: false,
          teaserDelaySeconds: 5,
          autoOpenSeconds: 10,
          proactiveText: 'Vous cherchez un prix ?',
          callCtaText: 'Appelez-moi maintenant',
        },
      },
    });
    expect(code).toContain('data-pulse="off"');
    expect(code).toContain('data-teaser-delay="5"');
    expect(code).toContain('data-auto-open="10"');
    expect(code).toContain('data-proactive="Vous cherchez un prix ?"');
    expect(code).toContain('data-call-cta="Appelez-moi maintenant"');
    // Par défaut : bulle qui pulse, aucune ouverture forcée.
    const defaut = buildWidgetSnippet(base);
    expect(defaut).toContain('data-pulse="on"');
    expect(defaut).not.toContain('data-auto-open');
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

  it('mode, accroche et CSS libre sont réellement lus par widget.js', () => {
    for (const attr of ['data-mode', 'data-pulse', 'data-teaser-delay', 'data-auto-open', 'data-proactive', 'data-call-cta']) {
      expect(widget).toContain(attr);
    }
    expect(widget).toContain('applyCustomCss');
    expect(widget).toContain('armAttentionTimers');
    expect(widget).toContain("widgetMode === 'voice'");
  });

  it('le moteur d’appel arrive TOUT DE SUITE après un correctif (adresse versionnée)', () => {
    // Le moteur est mis en cache par le navigateur : sans `?v=`, un visiteur
    // garderait l'ancien code pendant des heures après un correctif — donc
    // l'ancien raccrochage, alors que le serveur est réparé.
    expect(widget).toMatch(/\/cdn\/voice\.js\?v=\d+/);
    const bulle = fs.readFileSync(path.join(ROOT, 'src/components/FloatingLiveWidget.tsx'), 'utf8');
    expect(bulle).toMatch(/\/cdn\/voice\.js\?v=\d+/);
    // Et le cache des fichiers /cdn/* reste court (une heure, pas un jour).
    const headers = fs.readFileSync(path.join(ROOT, 'public/_headers'), 'utf8');
    expect(headers).toContain('max-age=3600');
    expect(headers).not.toContain('max-age=86400');
  });

  it('un seul widget : la vieille copie /cdn/widget.js n’existe plus mais reste servie', () => {
    expect(fs.existsSync(path.join(ROOT, 'public/cdn/widget.js'))).toBe(false);
    const redirects = fs.readFileSync(path.join(ROOT, 'public/_redirects'), 'utf8');
    expect(redirects).toContain('/cdn/widget.js  /widget.js  200');
  });
});

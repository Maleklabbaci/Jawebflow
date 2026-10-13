/**
 * 🧩 Le code d'installation du widget — UNE seule source de vérité.
 * ============================================================================
 * Pourquoi ce fichier existe : le marchand voyait son aperçu dans le tableau de
 * bord (taille, badge « en ligne », titre, marque JawebFlow masquée…) mais le
 * vrai widget sur son site ne recevait qu'une partie des réglages. Résultat :
 * « j'ai tout réglé et rien ne change ».
 *
 * Trois générateurs de code coexistaient (tableau de bord, personnalisateur,
 * admin) et produisaient chacun un code différent. Ils passent tous par ici.
 *
 * Les attributs `data-*` servent à afficher le widget JUSTE à la bonne couleur
 * dès la première milliseconde ; la config distante (`/api/widget-config`) met
 * ensuite tout à jour en direct, sans recoller de code.
 */
import type { WidgetCustomization } from './supabase';

export interface WidgetSnippetInput {
  /** URL du script, telle qu'elle doit apparaître dans le code collé. */
  scriptUrl: string;
  assistantId: string;
  businessName?: string;
  config?: Partial<WidgetCustomization> | null;
  /** Contact humain de secours (WhatsApp) réglé par le marchand. */
  whatsappEscalation?: string;
}

/** Échappe ce qui casserait l'attribut HTML (guillemet, chevron, esperluette). */
export function escapeHtmlAttr(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Construit le `<script>` à coller dans le site du marchand.
 * Chaque réglage du personnalisateur a son attribut — sinon le réglage ne veut
 * rien dire pour le visiteur.
 */
export function buildWidgetSnippet(input: WidgetSnippetInput): string {
  const config = input.config || {};
  const assistantId = String(input.assistantId || '').trim() || 'asst_live';
  const businessName = String(input.businessName || '').trim() || 'Mon Entreprise';

  const lines: string[] = [];
  const attr = (name: string, value: unknown) => lines.push(`  ${name}="${escapeHtmlAttr(value)}"`);

  attr('src', input.scriptUrl);
  attr('data-assistant-id', assistantId);
  attr('data-business-name', businessName);
  attr('data-position', config.position || 'bottom-right');
  attr('data-theme', config.themeMode || 'dark');
  attr('data-primary-color', config.primaryColor || '#9333ea');
  attr('data-secondary-color', config.gradientSecondary || '#6366f1');
  attr('data-shape', config.shape || 'circle');
  attr('data-size', config.size || 'standard');
  attr('data-icon', config.iconType || 'sparkles');
  if (config.iconType === 'custom_logo' && config.customLogoUrl) {
    attr('data-avatar-url', config.customLogoUrl);
  }
  // Teaser : on écrit TOUJOURS l'attribut. Vide = éteint (le widget ne doit pas
  // remettre sa phrase par défaut derrière le dos du marchand).
  attr('data-teaser', config.showTeaser === false ? '' : config.teaserText || '');
  if (String(config.welcomeMessage || '').trim()) attr('data-welcome', config.welcomeMessage);
  if (String(config.headerTitle || '').trim()) attr('data-header-title', config.headerTitle);
  if (String(config.headerSubtitle || '').trim()) attr('data-header-subtitle', config.headerSubtitle);
  attr('data-badge', config.onlineBadge === false ? 'false' : 'true');
  attr('data-branding', config.showBranding === false ? 'false' : 'true');
  if (config.voice?.enabled === true) {
    attr('data-voice', 'on');
    if (String(config.voice.greeting || '').trim()) attr('data-voice-greeting', config.voice.greeting);
  }
  // 🎯 Mode + accroche : le widget obéit dès le premier affichage, sans
  // attendre la config du serveur (pas de flash « chat » en mode appel).
  attr('data-mode', config.mode || 'both');
  attr('data-pulse', config.attention?.pulse === false ? 'off' : 'on');
  if (config.attention?.teaserDelaySeconds) attr('data-teaser-delay', config.attention.teaserDelaySeconds);
  if (config.attention?.autoOpenSeconds) attr('data-auto-open', config.attention.autoOpenSeconds);
  if (String(config.attention?.proactiveText || '').trim()) attr('data-proactive', config.attention!.proactiveText);
  if (String(config.attention?.callCtaText || '').trim()) attr('data-call-cta', config.attention!.callCtaText);
  const whatsapp = String(input.whatsappEscalation || '').replace(/\s+/g, '');
  if (whatsapp) attr('data-whatsapp', whatsapp);

  const safeName = escapeHtmlAttr(businessName).replace(/--/g, '-');
  return `<!-- Bulle de discussion JawebFlow pour ${safeName} -->\n<script\n${lines.join('\n')}\n  defer>\n</script>`;
}

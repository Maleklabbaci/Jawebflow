/**
 * Navigation dans l'espace client : entrées principales et sous-sections animées.
 * `goTo('behavior')` ouvre le groupe « Mon assistant », puis choisit son onglet.
 */
import { fireEvent } from '@testing-library/react';

/** Entrée du menu qui contient chaque écran. */
export const MENU_ENTRY: Record<string, string> = {
  overview: 'overview', summary: 'summary', simulator: 'simulator', leads: 'leads', orders: 'orders',
  // ESPACE « MON ASSISTANT WEB » : le chatbot à intégrer dans le site.
  knowledge: 'knowledge', crawler: 'knowledge', behavior: 'knowledge', widget: 'knowledge', learning: 'knowledge',
  integration: 'knowledge',
  // ESPACE « RÉSEAUX SOCIAUX » : module à part (cadenas + demande d'activation
  // tant que l'équipe ne l'a pas ouvert). Un onglet par réseau.
  instagram: 'instagram', automations: 'instagram',
  messenger: 'instagram', whatsapp: 'instagram', telegram: 'instagram', tiktok: 'instagram',
};

export function goTo(id: string) {
  const entry = MENU_ENTRY[id];
  if (entry) {
    const button = document.getElementById(`nav-${entry}`);
    if (!button) throw new Error(`entrée de menu introuvable : nav-${entry}`);

    // Les entrées groupées ouvrent d'abord leur sous-menu ; les éléments
    // « leads » et « integration » désignent aussi leur premier écran par défaut.
    if (button.hasAttribute('aria-expanded')) {
      const tabId = id === 'leads' ? 'analytics' : id;
      if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button);
      const tab = document.querySelector(`[data-tab="${tabId}"]`) as HTMLElement | null;
      if (!tab) throw new Error(`sous-section introuvable : ${tabId}`);
      if (tab.getAttribute('aria-current') !== 'page') fireEvent.click(tab);
      return;
    }

    if (button.getAttribute('aria-current') !== 'page') fireEvent.click(button);
    return;
  }

  const direct = document.getElementById(`nav-${id}`);
  if (!direct) throw new Error(`entrée introuvable : ${id}`);
  fireEvent.click(direct);
}

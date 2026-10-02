/**
 * Navigation dans l'espace client (menu à 6 entrées + petits onglets).
 * `goTo('behavior')` clique sur l'entrée de menu du groupe, puis sur l'onglet voulu.
 */
import { fireEvent } from '@testing-library/react';

/** Entrée du menu qui ouvre chaque écran. */
export const MENU_ENTRY: Record<string, string> = {
  overview: 'overview', summary: 'summary', simulator: 'simulator', leads: 'leads',
  knowledge: 'knowledge', crawler: 'knowledge', behavior: 'knowledge', widget: 'knowledge', learning: 'knowledge',
  integration: 'integration', instagram: 'integration', automations: 'integration',
};

export function goTo(id: string) {
  const entry = MENU_ENTRY[id];
  if (entry) {
    const btn = document.getElementById(`nav-${entry}`);
    if (!btn) throw new Error(`entrée de menu introuvable : nav-${entry}`);
    if (btn.getAttribute('aria-current') !== 'page' || entry === id) fireEvent.click(btn);
    if (entry !== id) {
      const tab = document.querySelector(`[data-tab="${id}"]`);
      if (!tab) throw new Error(`onglet introuvable : ${id}`);
      fireEvent.click(tab);
    }
    return;
  }
  const direct = document.getElementById(`nav-${id}`);
  if (!direct) throw new Error(`entrée introuvable : ${id}`);
  fireEvent.click(direct);
}

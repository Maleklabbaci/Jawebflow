// @vitest-environment jsdom
//
// Garde-fou « la page Tarifs dit la vérité ».
//
// Le site promet des chiffres ; le moteur en applique d'autres (fonctions
// serverless). Ce test compare les DEUX sources : si quelqu'un modifie une
// limite côté serveur sans toucher à la page (ou l'inverse), il échoue.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PLAN_TRUTH, conversationsLabel } from '../src/lib/plans';
import {
  DEFAULT_PLAN_LIMITS,
  SCAN_LIMITS_PER_MONTH,
  COST_CAP_USD_PER_PLAN,
} from '../functions/_shared/limits.ts';
import { PricingPage } from '../src/pages/PricingPage';

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null, loading: false, logout: vi.fn() }),
}));

afterEach(() => cleanup());

describe('les chiffres affichés = les limites réellement appliquées', () => {
  it('conversations : mêmes valeurs que DEFAULT_PLAN_LIMITS', () => {
    expect(PLAN_TRUTH.free.conversations).toBe(DEFAULT_PLAN_LIMITS.free);
    expect(PLAN_TRUTH.basic.conversations).toBe(DEFAULT_PLAN_LIMITS.basic);
    expect(PLAN_TRUTH.pro.conversations).toBe(DEFAULT_PLAN_LIMITS.pro);
    expect(PLAN_TRUTH.enterprise.conversations).toBe(DEFAULT_PLAN_LIMITS.enterprise);
  });

  it('imports de site : mêmes valeurs que SCAN_LIMITS_PER_MONTH', () => {
    expect(PLAN_TRUTH.free.scans).toBe(SCAN_LIMITS_PER_MONTH.free);
    expect(PLAN_TRUTH.basic.scans).toBe(SCAN_LIMITS_PER_MONTH.basic);
    expect(PLAN_TRUTH.pro.scans).toBe(SCAN_LIMITS_PER_MONTH.pro);
    expect(PLAN_TRUTH.enterprise.scans).toBe(SCAN_LIMITS_PER_MONTH.enterprise);
  });

  it('garde-fou de coût : mêmes valeurs que COST_CAP_USD_PER_PLAN', () => {
    expect(PLAN_TRUTH.free.costCapUsd).toBe(COST_CAP_USD_PER_PLAN.free);
    expect(PLAN_TRUTH.basic.costCapUsd).toBe(COST_CAP_USD_PER_PLAN.basic);
    expect(PLAN_TRUTH.pro.costCapUsd).toBe(COST_CAP_USD_PER_PLAN.pro);
    expect(PLAN_TRUTH.enterprise.costCapUsd).toBe(COST_CAP_USD_PER_PLAN.enterprise);
  });

  it('l’écran « Abonnement » du tableau de bord affiche les mêmes quotas', () => {
    const dashboard = fs.readFileSync(path.resolve(__dirname, '../src/components/DashboardPlatform.tsx'), 'utf8');
    // Les conversations par plan
    expect(dashboard).toContain('Jusqu’à <strong>1 000</strong> conversations par mois');
    expect(dashboard).toContain('Jusqu’à <strong>5 000</strong> conversations par mois');
    // Plus de promesse « illimité » : le plan Enterprise a un garde-fou réel
    expect(dashboard).not.toMatch(/Conversations <strong>illimitées<\/strong>/);
    // Plus de « WhatsApp et réseaux sociaux (bientôt) » alors qu'Instagram est déjà là
    expect(dashboard).not.toContain('WhatsApp et réseaux sociaux (bientôt)');
    expect(dashboard).toContain('Instagram inclus · WhatsApp en préparation');
  });
});

describe('page Tarifs — aucune promesse que le produit ne tient pas', () => {
  const renderPricing = () => render(<PricingPage onOpenAssistantModal={vi.fn()} onNavigate={vi.fn()} />);
  // Le texte affiché utilise l'espace insécable fine de toLocaleString('fr-FR') :
  // on compare donc sur une version normalisée (espaces uniformisés).
  const norm = (value: string) => value.replace(/\s+/g, ' ').trim();

  it('affiche exactement les quotas du moteur', () => {
    const { container } = renderPricing();
    const page = norm(container.textContent || '');
    for (const line of [
      `Jusqu’à ${conversationsLabel('basic')} conversations par mois`,
      `Jusqu’à ${conversationsLabel('pro')} conversations par mois (5× Basic)`,
      `${PLAN_TRUTH.basic.scans} imports / analyses de votre site par mois`,
      `${PLAN_TRUTH.pro.scans} imports / analyses de votre site par mois (2× Basic)`,
      `${PLAN_TRUTH.enterprise.scans} imports / analyses de votre site par mois`,
      'Volume très élevé : au-delà de 5 000 conversations par mois',
    ]) {
      expect(page, line).toContain(norm(line));
    }
  });

  it('dit clairement que le plan gratuit ne répond pas aux clients', () => {
    const { container } = renderPricing();
    expect(screen.getByText('Réponses automatiques de l’IA')).toBeTruthy();
    expect(screen.getAllByText('Non inclus').length).toBeGreaterThanOrEqual(3);
    expect(container.textContent).toContain('Coordonnées des clients enregistrées');

    // Et le vocabulaire d'activation est bien celui utilisé par le moteur
    // (LIMIT_BLOCK_FREE parle d'un assistant « pas encore activé »).
    fireEvent.click(screen.getByRole('button', { name: /Afficher les questions fréquentes/ }));
    expect(norm(container.textContent || '')).toContain(norm('s’activent dès que vous passez sur Basic'));
  });

  it('n’annonce ni WhatsApp ni « illimité » comme disponibles', () => {
    renderPricing();
    // WhatsApp n'est JAMAIS présenté comme inclus, seulement « en préparation ».
    const whatsapp = screen.getAllByText(/WhatsApp/);
    expect(whatsapp.length).toBeGreaterThan(0);
    for (const node of whatsapp) {
      expect(node.textContent).toMatch(/préparation/);
    }
    expect(screen.queryByText(/conversations illimitées/i)).toBeNull();
    expect(screen.getByText(/Volume très élevé : au-delà de 5 000 conversations par mois/)).toBeTruthy();
  });

  it('explique le vrai mode de comptage (unités) au lieu de le cacher', () => {
    const { container } = renderPricing();
    // L'explication du compteur pondéré (1 / 3 / 5 unités, 8 unités = 1 conversation)
    // est visible sans même ouvrir la FAQ…
    expect(screen.getAllByText(/Une réponse simple compte 1 unité/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Afficher les questions fréquentes/ }));
    // …et reprise dans la FAQ, avec la pause + la reprise automatique, comme le
    // message réellement renvoyé au visiteur par le moteur.
    expect(screen.getAllByText(/Une réponse simple compte 1 unité/).length).toBeGreaterThanOrEqual(2);
    expect(norm(container.textContent || '')).toContain(norm('se met en pause automatiquement'));
  });

  it('le plan gratuit mène à la création de compte, Enterprise au contact', () => {
    const open = vi.fn();
    const nav = vi.fn();
    render(<PricingPage onOpenAssistantModal={open} onNavigate={nav} />);

    fireEvent.click(screen.getByRole('button', { name: /Commencer gratuitement/ }));
    fireEvent.click(screen.getByRole('button', { name: /Demander une étude/ }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledWith('contact');
  });
});

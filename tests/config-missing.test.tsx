// @vitest-environment jsdom
/**
 * ÉCRAN « CONFIGURATION MANQUANTE » (src/components/ConfigMissing.tsx)
 * ============================================================================
 * Avant : le site plantait à l'import (`supabaseUrl is required`) et affichait
 * une page **blanche**, avec pour seule piste une ligne technique dans la
 * console du navigateur.
 *
 * Maintenant : le module s'importe sans planter, `isSupabaseConfigured` vaut
 * faux, et l'écran explique la cause et les deux corrections — en français, à
 * l'écran.
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigMissing } from '../src/components/ConfigMissing';

afterEach(cleanup);

describe('écran « configuration manquante »', () => {
  it('s’affiche au lieu d’une page blanche, en français', () => {
    render(<ConfigMissing />);
    expect(screen.getByTestId('config-missing')).toBeTruthy();
    expect(screen.getByText(/le site n’est pas encore configuré/i)).toBeTruthy();
  });

  it('nomme les deux variables manquantes', () => {
    render(<ConfigMissing />);
    const text = screen.getByTestId('config-missing').textContent || '';
    expect(text).toContain('VITE_SUPABASE_URL');
    expect(text).toContain('VITE_SUPABASE_ANON_KEY');
  });

  it('explique les DEUX corrections (construction locale, construction Cloudflare)', () => {
    render(<ConfigMissing />);
    const text = screen.getByTestId('config-missing').textContent || '';
    expect(text).toContain('.env');                       // correction A
    expect(text).toContain('Environment variables');      // correction B
    expect(text).toContain('relance un déploiement');     // le piège de la variable ajoutée trop tard
  });

  it('dit clairement que ce n’est pas une panne (le marchand ne doit pas paniquer)', () => {
    render(<ConfigMissing />);
    expect(screen.getByText(/Ce n’est pas une panne/i)).toBeTruthy();
  });

  it('n’affiche jamais de clé ni de valeur secrète', () => {
    render(<ConfigMissing />);
    const text = screen.getByTestId('config-missing').textContent || '';
    expect(text).not.toMatch(/eyJ[A-Za-z0-9]{10,}/); // empreinte d'une clé JWT
  });
});

describe('module Supabase sans configuration', () => {
  it('s’importe SANS planter et signale l’absence de configuration', async () => {
    // Les variables VITE_* ne sont pas définies dans l'environnement de test :
    // c'est exactement le cas d'un bundle construit sans configuration.
    const mod = await import('../src/lib/supabase');
    expect(mod.isSupabaseConfigured).toBe(false);
    // Le client existe quand même : le reste du site ne plante pas au chargement,
    // et l'écran ci-dessus explique quoi corriger.
    expect(mod.supabase).toBeTruthy();
    expect(typeof mod.supabase.auth.getSession).toBe('function');
  });
});

// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Navbar, PageId } from '../src/components/Navbar';

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderNavbar = (currentPage: PageId = 'home') => render(
  <Navbar
    currentPage={currentPage}
    onNavigate={() => {}}
    onOpenAssistantModal={() => {}}
  />,
);

describe('couleurs de la navigation', () => {
  it('utilise le violet sur le hero blanc de la page d’accueil', () => {
    const { container } = renderNavbar('home');

    expect(container.querySelector('#nav-link-home')?.className).toContain('text-purple-700');
    expect(container.querySelector('#nav-link-services')?.className).toContain('text-purple-950/70');
    expect(screen.getByRole('button', { name: 'Connexion' }).className).toContain('text-purple-800');
    expect(container.querySelector('#navbar-cta-btn')?.className).toContain('bg-purple-700');
  });

  it('garde les couleurs claires sur les pages au fond sombre', () => {
    const { container } = renderNavbar('services');

    expect(container.querySelector('#nav-link-services')?.className).toContain('text-white');
    expect(container.querySelector('#nav-link-home')?.className).toContain('text-neutral-400');
  });
});

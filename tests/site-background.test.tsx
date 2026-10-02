// @vitest-environment jsdom
//
// Page d'accueil : le fond du site et le haut de page doivent rester LÉGERS.
//   - plus de photos du robot (201 images, ~10 Mo par visiteur) ;
//   - le fond est purement décoratif (jamais cliquable, ignoré des lecteurs d'écran) ;
//   - tout fichier image/vidéo cité dans le code existe vraiment dans « public/ »
//     (sinon le visiteur reçoit une image cassée).
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackgroundVideo } from '../src/components/BackgroundVideo';
import { HeroSection } from '../src/components/HeroSection';

const ROOT = path.resolve(__dirname, '..');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('fond du site vitrine', () => {
  it('ne contient ni image, ni vidéo, ni canvas, et ne précharge rien', () => {
    const created: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        constructor() {
          created.push('Image');
        }
      },
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { container } = render(<BackgroundVideo opacity={0.88} />);

    expect(container.querySelector('img, video, canvas, picture, source')).toBeNull();
    expect(created).toEqual([]); // l'ancien fond créait 201 objets Image au démarrage
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('est purement décoratif : caché des lecteurs d’écran et jamais cliquable', () => {
    const { container } = render(<BackgroundVideo />);
    const bg = container.querySelector('#site-background') as HTMLElement;
    expect(bg).not.toBeNull();
    expect(bg.getAttribute('aria-hidden')).toBe('true');
    expect(bg.className).toContain('pointer-events-none'); // ne bloque aucun bouton de la page
    expect(bg.className).toContain('fixed');
  });

  it('l’intensité des lueurs se règle (App.tsx l’utilise à 0,88)', () => {
    const { container } = render(<BackgroundVideo opacity={0.5} />);
    const glowLayer = container.querySelector('.site-bg-glow')!.parentElement as HTMLElement;
    expect(glowLayer.style.opacity).toBe('0.5');
  });
});

describe('haut de la page d’accueil', () => {
  it('les deux boutons fonctionnent toujours', () => {
    const onOpen = vi.fn();
    const onScroll = vi.fn();
    render(<HeroSection onOpenAssistantModal={onOpen} onScrollToParcours={onScroll} />);

    fireEvent.click(screen.getByRole('button', { name: /Créer mon assistant/i }));
    fireEvent.click(screen.getByRole('button', { name: /Comment ça marche/i }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onScroll).toHaveBeenCalledTimes(1);
  });

  it('l’aperçu de conversation est décoratif, léger et réservé aux grands écrans', () => {
    const { container } = render(<HeroSection onOpenAssistantModal={() => {}} onScrollToParcours={() => {}} />);
    const preview = container.querySelector('#hero-chat-preview') as HTMLElement;

    expect(preview).not.toBeNull();
    expect(preview.getAttribute('aria-hidden')).toBe('true'); // faux chat : rien à lire à voix haute
    expect(preview.className).toMatch(/\bhidden\b/); // masqué par défaut…
    expect(preview.className).toMatch(/\bxl:flex\b/); // …visible dès 1280 px
    expect(preview.className).toContain('pointer-events-none');

    // Seule image : le petit logo déjà utilisé ailleurs (aucune nouvelle photo).
    const imgs = Array.from(preview.querySelectorAll('img')).map((i) => i.getAttribute('src'));
    expect(imgs).toEqual(['/logo.png']);
    expect(preview.textContent).toContain('Maison Lila');
  });
});

describe('fichiers cités dans le code', () => {
  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });
  }

  it('chaque image / vidéo / police citée existe dans public/', () => {
    // « "/logo.png" », « '/background.mp4' », « url(/x.webp) »… (pas les adresses http(s):// ni //cdn)
    const ASSET = /["'`(](\/(?!\/)[A-Za-z0-9_\-./]+\.(?:png|jpe?g|gif|webp|avif|svg|ico|mp4|webm|woff2?))["'`)]/g;
    const files = [
      ...walk(path.join(ROOT, 'src')).filter((f) => /\.(tsx?|css)$/.test(f)),
      path.join(ROOT, 'index.html'),
    ];

    const found = new Set<string>();
    const missing: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(ASSET)) {
        found.add(m[1]);
        if (!fs.existsSync(path.join(ROOT, 'public', m[1]))) {
          missing.push(`${path.relative(ROOT, file)} → ${m[1]}`);
        }
      }
    }

    expect(found.size).toBeGreaterThan(0); // le contrôle lit bien quelque chose
    expect(missing).toEqual([]);
  });
});

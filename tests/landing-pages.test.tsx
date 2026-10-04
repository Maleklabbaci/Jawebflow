// @vitest-environment jsdom
//
// Site vitrine : chaque page publique s'affiche sans erreur et ses boutons /
// champs répondent vraiment. C'est le filet de sécurité du design « luxe sobre »
// (Poppins, titres gras, sous-titres légers, boutons plats).
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null, loading: false, logout: vi.fn() }),
}));

// La page de connexion s'appuie sur Supabase uniquement pour « mot de passe oublié ».
const resetPassword = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../src/lib/supabase', () => ({ sendResetPassword: resetPassword }));

import { Navbar } from '../src/components/Navbar';
import { InteractiveChatMockup } from '../src/components/InteractiveChatMockup';
import { KnowledgeBaseSection } from '../src/components/KnowledgeBaseSection';
import { ProcessSection } from '../src/components/ProcessSection';
import { TrustSection } from '../src/components/TrustSection';
import { FaqSection } from '../src/components/FaqSection';
import { CtaSection } from '../src/components/CtaSection';
import { SiteFooter } from '../src/components/SiteFooter';
import { FloatingLiveWidget } from '../src/components/FloatingLiveWidget';
import { ServicesPage } from '../src/pages/ServicesPage';
import { PricingPage } from '../src/pages/PricingPage';
import { DemoPage } from '../src/pages/DemoPage';
import { ContactPage } from '../src/pages/ContactPage';
import { AuthPage } from '../src/pages/AuthPage';
import { PrivacyPage } from '../src/pages/PrivacyPage';

let errors: string[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { errors.push(a.map(String).join(' ').slice(0, 300)); });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  // Réponse vide côté serveur : le widget retombe alors sur ses réponses
  // instantanées, ce qui vérifie exactement ce que voit un visiteur sans API.
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: '' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  (window as any).scrollTo = () => undefined;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const noErrors = () => expect(errors, errors.join('\n')).toEqual([]);

describe('site vitrine — sections de l’accueil', () => {
  it('la démo intégrée répond à une question cliquée', async () => {
    const onOpen = vi.fn();
    render(<InteractiveChatMockup onOpenAssistantModal={onOpen} />);

    expect(screen.getByText(/Écrivez comme vos clients écrivent/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Délais & Wilayas/ }));
    expect(await screen.findByText(/Nous livrons dans les 58 wilayas/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Créer mon assistant/ }));
    expect(onOpen).toHaveBeenCalled();
    noErrors();
  });

  it('les bénéfices, le parcours, la FAQ et la section finale affichent le message de vente', () => {
    const open = vi.fn();
    const nav = vi.fn();
    render(
      <>
        <TrustSection onOpenAssistantModal={open} onNavigate={nav} />
        <KnowledgeBaseSection />
        <ProcessSection onOpenAssistantModal={open} />
        <FaqSection onOpenAssistantModal={open} onNavigate={nav} />
        <CtaSection onOpenAssistantModal={open} onNavigate={nav} />
        <SiteFooter onOpenAssistantModal={open} onNavigate={nav} showCallToAction={false} />
      </>,
    );

    expect(screen.getByText(/Ce sont les clients qui partent sans réponse/)).toBeTruthy();
    expect(screen.getByText(/enfin disponible 24h\/24/)).toBeTruthy();
    expect(screen.getByText(/Votre assistant en ligne aujourd’hui/)).toBeTruthy();
    expect(screen.getByText(/Répondez-leur avant qu’ils aillent ailleurs/)).toBeTruthy();
    // Le pied de page ne répète pas l'appel juste en dessous sur l'accueil,
    // mais il reste complet (liens, contact, mentions).
    expect(screen.queryAllByText(/Répondez-leur avant qu’ils aillent ailleurs/)).toHaveLength(1);

    // La première question est ouverte d'emblée (la réponse rassure tout de suite),
    // et la FAQ se referme / se rouvre au clic.
    const question = screen.getByRole('button', { name: /En combien de temps mon assistant est-il en ligne/ });
    expect(question.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(question);
    expect(question.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(question);
    expect(question.getAttribute('aria-expanded')).toBe('true');

    // Les liens du pied de page mènent aux bonnes pages (présent sur tout le site)
    // et les coordonnées directes restent accessibles.
    fireEvent.click(screen.getByRole('button', { name: 'Confidentialité' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tarifs' }));
    expect(nav).toHaveBeenCalledWith('privacy');
    expect(nav).toHaveBeenCalledWith('pricing');
    expect(screen.getByText('contact@jawebflow.dz')).toBeTruthy();

    // Le bouton de copie du script fonctionne.
    fireEvent.click(screen.getByRole('button', { name: /Copier le script/ }));
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    noErrors();
  });
});

describe('site vitrine — pages', () => {
  it('Services : onglets de métiers et détails à la demande', () => {
    const open = vi.fn();
    render(<ServicesPage onOpenAssistantModal={open} onNavigate={vi.fn()} />);

    expect(screen.getByText(/Votre métier a ses questions/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Automobile & Garages/ }));
    expect(screen.getByText(/forfait révision \+ vidange/)).toBeTruthy();

    const toggle = screen.getByRole('button', { name: /Voir les intégrations & garanties/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByText(/S’intègre sur n’importe quel site web/)).toBeTruthy();

    noErrors();
  });

  it('Tarifs : bascule mensuel / annuel et boutons menant au bon endroit', () => {
    const open = vi.fn();
    const nav = vi.fn();
    render(<PricingPage onOpenAssistantModal={open} onNavigate={nav} />);

    expect(screen.getByText(/moins de 250 DA par jour/)).toBeTruthy();
    // Prix en dinars affiché avec l'espace insécable produit par toLocaleString('fr-FR').
    const dzd = (value: string) => screen.getAllByText((_, el) => {
      const text = el?.textContent || '';
      return el?.tagName === 'DIV' && /DZD \/ mois/.test(text) && new RegExp(value).test(text);
    });
    expect(dzd('6\\s*850')[0].textContent).toContain('mois');

    fireEvent.click(screen.getByRole('button', { name: /Annuel/ }));
    expect(dzd('5\\s*480').length).toBeGreaterThan(0);

    // Le plan gratuit mène à la création de compte, Enterprise au contact :
    // plus aucun bouton n'envoie vers une caisse impossible.
    fireEvent.click(screen.getByRole('button', { name: /Commencer gratuitement/ }));
    fireEvent.click(screen.getByRole('button', { name: /Demander une étude/ }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledWith('contact');

    noErrors();
  });

  it('Démo : changement de secteur, question suggérée et réponse sourcée', async () => {
    render(<DemoPage onOpenAssistantModal={vi.fn()} onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Restauration & Hôtellerie/ }));
    expect(screen.getByText('Le Jardin Gourmand (Restaurant & Réceptions)')).toBeTruthy();

    // Chaque question d'exemple reçoit la réponse du métier, pas une phrase générique.
    fireEvent.click(screen.getAllByRole('button', { name: /végétariens \/ sans gluten/ })[0]);
    expect(await screen.findByText(/4 plats certifiés sans gluten/, {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText(/Base de connaissances : Restauration & Hôtellerie/)).toBeTruthy();
    noErrors();
  });

  it('Contact : un envoi refusé ne prétend jamais avoir réussi', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: 'Envoi indisponible.' }), { status: 503 }));
    render(<ContactPage onOpenAssistantModal={vi.fn()} onNavigate={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Nom et prénom'), { target: { value: 'Karim' } });
    fireEvent.change(screen.getByLabelText('Entreprise ou marque'), { target: { value: 'SARL Test' } });
    fireEvent.change(screen.getByLabelText('Adresse email'), { target: { value: 'karim@test.dz' } });
    fireEvent.change(screen.getByLabelText('Téléphone (DZ)'), { target: { value: '0550123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Recevoir ma proposition/ }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Envoi indisponible');
    expect(screen.queryByText(/Demande transmise à l’équipe/)).toBeNull();

    // …et un envoi accepté confirme bien à l'écran.
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, delivered: { email: true } }), { status: 200 }));
    fireEvent.click(screen.getByRole('button', { name: /Recevoir ma proposition/ }));
    expect(await screen.findByText(/Demande transmise à l’équipe/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/contact', expect.objectContaining({ method: 'POST' }));
    noErrors();
  });

  it('Connexion : bascule inscription / connexion et champs accessibles', () => {
    render(<AuthPage initialMode="login" onNavigate={vi.fn()} />);

    expect(screen.getByText('Content de vous revoir.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Créez votre compte gratuitement/ }));
    expect(screen.getByText(/Votre assistant peut être en ligne aujourd’hui/)).toBeTruthy();

    // Chaque champ du formulaire est relié à son libellé (accessibles au clavier).
    for (const label of ['Nom complet', 'Entreprise / site', 'Adresse email', 'Mot de passe', 'Confirmer le mot de passe']) {
      expect(screen.getByLabelText(label), label).toBeTruthy();
    }
    noErrors();
  });

  it('Connexion : « mot de passe oublié » demande l’email puis envoie le lien', async () => {
    render(<AuthPage initialMode="login" onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Mot de passe oublié/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/Indiquez d’abord votre adresse email/);
    expect(resetPassword).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Adresse email'), { target: { value: 'nour@test.dz' } });
    fireEvent.click(screen.getByRole('button', { name: /Mot de passe oublié/ }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(resetPassword).toHaveBeenCalledWith('nour@test.dz');
    noErrors();
  });

  it('Pages légales : titres lisibles, retour à l’accueil et contact', () => {
    const nav = vi.fn();
    render(<PrivacyPage type="privacy" onNavigate={nav} />);

    expect(screen.getByText(/Politique de Confidentialité/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Retour à l'accueil/ }));
    fireEvent.click(screen.getByRole('button', { name: /Nous contacter/ }));
    expect(nav).toHaveBeenCalledWith('home');
    expect(nav).toHaveBeenCalledWith('contact');
    noErrors();
  });
});

describe('site vitrine — navigation et widget flottant', () => {
  it('la navigation change de page et ouvre le menu mobile', () => {
    const nav = vi.fn();
    render(<Navbar currentPage="services" onNavigate={nav} onOpenAssistantModal={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tarifs' }));
    expect(nav).toHaveBeenCalledWith('pricing');

    const burger = screen.getByRole('button', { name: 'Menu' });
    expect(burger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(burger);
    expect(burger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/Installation en 5 minutes · Sans engagement/)).toBeTruthy();
    noErrors();
  });

  it('le widget flottant s’ouvre, répond aux tarifs réels et propose de créer un assistant', async () => {
    const open = vi.fn();
    render(<FloatingLiveWidget onOpenCreateAssistant={open} />);

    fireEvent.click(screen.getByRole('button', { name: /Ouvrir l'assistant/ }));
    expect(screen.getByText(/Assistant JawebFlow/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Combien ça coûte/ }));
    const answer = await screen.findByText(/6\s*850 DA\/mois/, {}, { timeout: 3000 });
    expect(answer.textContent).toMatch(/18\s*700 DA\/mois/);
    expect(answer.textContent).not.toContain('2 900');

    fireEvent.click(screen.getByRole('button', { name: /Créer mon assistant gratuitement/ }));
    expect(open).toHaveBeenCalled();
    noErrors();
  });
});

describe('typographie du site vitrine', () => {
  it('une seule famille (Poppins) : aucun élément en police « code »', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.resolve(__dirname, '../src/index.css'), 'utf8');
    expect(css).toContain('Poppins');
    // Les titres sont grands et gras, les sous-titres légers : les tailles viennent
    // des classes .lux-* (clamp) et non plus de valeurs codées un peu partout.
    expect(css).toMatch(/\.lux-h1[\s\S]{0,200}font-weight: 800/);
    expect(css).toMatch(/\.lux-sub,[\s\S]{0,120}font-weight: 300/);
    // Le « code » et le « mono » suivent la même police.
    expect(css).toMatch(/\.font-mono[\s\S]{0,80}var\(--font-sans\)/);

    const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    expect(html).toContain('family=Poppins:wght@300;400;500;600;700;800');
  });
});

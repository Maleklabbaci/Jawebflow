import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BackgroundVideo } from './components/BackgroundVideo';
import { Navbar, PageId } from './components/Navbar';
import { FloatingLiveWidget } from './components/FloatingLiveWidget';
import { SiteFooter } from './components/SiteFooter';
import { useAuth } from './context/AuthContext';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const ServicesPage = lazy(() => import('./pages/ServicesPage').then((m) => ({ default: m.ServicesPage })));
const PricingPage = lazy(() => import('./pages/PricingPage').then((m) => ({ default: m.PricingPage })));
const DemoPage = lazy(() => import('./pages/DemoPage').then((m) => ({ default: m.DemoPage })));
const ContactPage = lazy(() => import('./pages/ContactPage').then((m) => ({ default: m.ContactPage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const DashboardPlatform = lazy(() => import('./components/DashboardPlatform').then((m) => ({ default: m.DashboardPlatform })));

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-400" />
      <p className="text-[0.78rem] font-light tracking-[0.14em] text-neutral-500 uppercase">Chargement…</p>
    </div>
  );
}

/** Écran d'attente affiché pendant la restauration de la session. */
function SplashScreen() {
  // Même univers que le site vitrine : l'écran d'attente ne « flashe » plus en blanc
  // avant l'ouverture d'une page publique ou de l'espace client.
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#08070f]">
      <img src="/logo.jpg" alt="JawebFlow" className="h-11 w-11 rounded-xl object-cover" />
      <div className="h-1 w-28 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-purple-500 to-indigo-400" />
      </div>
      <p className="text-[0.7rem] font-light tracking-[0.16em] text-neutral-500 uppercase">Chargement…</p>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageId>('home');
  const [dashboardSection, setDashboardSection] = useState<string>('overview');
  const [routeReady, setRouteReady] = useState(false);

  useEffect(() => {
    const parseRoute = (path: string): { page: PageId; section: string } => {
      const clean = path.replace(/^\/+|\/+$/g, '').toLowerCase();
      const [root = '', sub = 'overview'] = clean.split('/');
      if (root === 'services') return { page: 'services', section: 'overview' };
      if (root === 'pricing' || root === 'tarifs') return { page: 'pricing', section: 'overview' };
      if (root === 'demo') return { page: 'demo', section: 'overview' };
      if (root === 'contact') return { page: 'contact', section: 'overview' };
      if (root === 'checkout' || root === 'paiement' || root === 'caisse' || root === 'buy') return { page: 'checkout', section: 'overview' };
      if (root === 'login' || root === 'connexion' || root === 'signin') return { page: 'login', section: 'overview' };
      if (root === 'signup' || root === 'register' || root === 'inscription') return { page: 'signup', section: 'overview' };
      if (root === 'privacy' || root === 'privacy-policy' || root === 'confidentialite') return { page: 'privacy', section: 'overview' };
      if (root === 'admin') return { page: 'admin', section: 'overview' };
      if (root === 'terms' || root === 'terms-of-service' || root === 'conditions') return { page: 'terms', section: 'overview' };
      if (root === 'data-deletion' || root === 'suppression-donnees' || root === 'deletion') return { page: 'data-deletion', section: 'overview' };
      if (root === 'dashboard' || root === 'create-assistant' || root === 'creer-assistant' || root === 'cockpit') {
        const sections: Record<string, string> = {
          crawler: 'crawler', scan: 'crawler', site: 'crawler', knowledge: 'knowledge', faq: 'knowledge', connaissances: 'knowledge',
          widget: 'widget', bulle: 'widget', appearance: 'widget', style: 'widget', customization: 'widget', simulator: 'simulator',
          test: 'simulator', chatbot: 'simulator', integration: 'integration', script: 'integration', embed: 'integration',
          instagram: 'instagram', ig: 'instagram', meta: 'instagram', direct: 'instagram',
          automations: 'automations', automatisations: 'automations', automatisation: 'automations', commentaires: 'automations', comments: 'automations', manychat: 'automations', leads: 'leads', crm: 'leads', prospects: 'leads',
          settings: 'settings', parametres: 'settings', whatsapp: 'settings',
          summary: 'summary', resume: 'summary',
          behavior: 'behavior', comportement: 'behavior', personnalite: 'behavior',
        };
        return { page: 'create-assistant', section: sections[sub] || 'overview' };
      }
      return { page: 'home', section: 'overview' };
    };

    const applyRoute = () => {
      const route = parseRoute(window.location.pathname);
      setCurrentPage(route.page);
      setDashboardSection(route.section);
      setRouteReady(true);
    };
    const searchParams = new URLSearchParams(window.location.search);
    const authCode = searchParams.get('code');
    const authError = searchParams.get('error') || searchParams.get('error_description');
    // 🏢 Retour OAuth du NOTIFICATEUR (compte officiel JawebFlow) : ne PAS
    // traiter comme une connexion marchand — relayer à /admin qui a ouvert le popup.
    if (authCode && searchParams.get('state') === 'notificator') {
      const sanitized = authCode.split('#')[0].replace(/_$/, '').trim();
      if (window.opener && window.opener !== window) {
        try { window.opener.postMessage({ type: 'JAWEBFLOW_NOTIFICATOR_AUTH', code: sanitized }, window.location.origin); } catch { /* ignore */ }
        setTimeout(() => window.close(), 300);
      } else {
        window.location.replace(`/admin?notif_code=${encodeURIComponent(sanitized)}`);
      }
      return;
    }
    if (authCode) {
      const sanitizedCode = authCode.split('#')[0].replace(/_$/, '').trim();
      try { localStorage.setItem('jawebflow_last_ig_auth_code', sanitizedCode); } catch { /* storage may be unavailable */ }
      if (window.opener && window.opener !== window) {
        try { window.opener.postMessage({ type: 'INSTAGRAM_AUTH_SUCCESS', code: sanitizedCode }, window.location.origin); } catch { /* ignore */ }
        setTimeout(() => window.close(), 300);
      } else {
        setCurrentPage('create-assistant');
        setDashboardSection('instagram');
        setRouteReady(true);
      }
      return;
    }
    if (authError && window.opener && window.opener !== window) {
      try { window.opener.postMessage({ type: 'INSTAGRAM_AUTH_ERROR', error: authError }, window.location.origin); } catch { /* ignore */ }
      setTimeout(() => window.close(), 300);
      return;
    }
    if (authError) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    applyRoute();
    window.addEventListener('popstate', applyRoute);
    return () => window.removeEventListener('popstate', applyRoute);
  }, []);

  // Redirections liées à la session (exécutées une fois la session restaurée).
  useEffect(() => {
    if (!routeReady || loading) return;

    // /admin est exclu volontairement : la console admin possède son propre
    // formulaire de déverrouillage (signInWithPassword) et ne doit JAMAIS
    // être renvoyée vers /login quand aucune session globale n'existe —
    // c'est ce renvoi qui faisait "recharger" /admin en boucle.
    const needsAccount = currentPage === 'create-assistant' || currentPage === 'checkout';

    if (!user && needsAccount) {
      // Petit délai avant de renvoyer vers la connexion : sur un réseau lent la
      // session peut arriver juste après le filet de sécurité, et un client
      // connecté ne doit jamais voir la page de connexion clignoter.
      const timer = setTimeout(() => {
        // On mémorise la destination exacte (page ET onglet) pour y revenir
        // juste après la connexion : un rechargement ne perd jamais le fil.
        try {
          const path = window.location.pathname;
          const intended = currentPage === 'checkout'
            ? '/checkout'
            : (path.startsWith('/dashboard') || path.startsWith('/checkout') || path.startsWith('/admin'))
              ? path
              : (dashboardSection && dashboardSection !== 'overview' ? `/dashboard/${dashboardSection}` : '/dashboard');
          sessionStorage.setItem('jw_after_login', intended);
        } catch { /* storage indisponible */ }
        // CTA "Créer mon assistant" sans compte -> inscription (pas connexion) :
        // un visiteur qui veut créer un assistant n'a pas encore de compte.
        const dest = currentPage === 'create-assistant' ? 'signup' : 'login';
        setCurrentPage(dest as PageId);
        window.history.replaceState({ page: dest, section: 'overview' }, '', `/${dest}`);
      }, 350);
      return () => clearTimeout(timer);
    }

    if (user && (currentPage === 'login' || currentPage === 'signup')) {
      let target = '/dashboard';
      try {
        target = sessionStorage.getItem('jw_after_login') || '/dashboard';
        sessionStorage.removeItem('jw_after_login');
      } catch { /* storage indisponible */ }

      if (target.startsWith('/checkout')) {
        setCurrentPage('checkout');
        window.history.replaceState({ page: 'checkout', section: 'overview' }, '', '/checkout');
        return;
      }

      if (target.startsWith('/admin')) {
        setCurrentPage('admin');
        window.history.replaceState({ page: 'admin', section: 'overview' }, '', '/admin');
        return;
      }

      // /dashboard/<onglet> : on rouvre exactement l'onglet demandé.
      const requested = target.replace(/^\/dashboard\/?/, '').split('/')[0];
      const section = requested || dashboardSection || 'overview';
      setDashboardSection(section);
      setCurrentPage('create-assistant');
      window.history.replaceState(
        { page: 'create-assistant', section },
        '',
        section === 'overview' ? '/dashboard' : `/dashboard/${section}`
      );
    }
  }, [routeReady, loading, user, currentPage, dashboardSection]);

  const handleNavigate = (page: PageId | string, subSection?: string) => {
    if (typeof page === 'string' && page.startsWith('/')) {
      const [root, sub = 'overview'] = page.replace(/^\/+|\/+$/g, '').toLowerCase().split('/');
      if (root === 'dashboard') {
        setCurrentPage('create-assistant');
        setDashboardSection(sub);
        if (window.location.pathname !== page) window.history.pushState({ page: 'create-assistant', section: sub }, '', page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }
    const validPage = (['home', 'services', 'pricing', 'demo', 'contact', 'create-assistant', 'login', 'signup', 'checkout', 'privacy', 'terms', 'data-deletion', 'admin'].includes(page) ? page : 'home') as PageId;
    setCurrentPage(validPage);
    let targetUrl = validPage === 'home' ? '/' : `/${validPage}`;
    if (validPage === 'create-assistant') {
      const section = subSection || dashboardSection || 'overview';
      setDashboardSection(section);
      targetUrl = section === 'overview' ? '/dashboard' : `/dashboard/${section}`;
    }
    if (window.location.pathname !== targetUrl) window.history.pushState({ page: validPage, section: subSection }, '', targetUrl);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Pendant la restauration de session on affiche un écran d'attente : sinon la
  // page publique clignotait avant l'ouverture du tableau de bord (et un
  // rechargement sur /dashboard donnait l'impression d'être déconnecté).
  if (loading && !routeReady) {
    return <SplashScreen />;
  }
  if (loading) {
    const isPrivateRoute = currentPage === 'create-assistant' || currentPage === 'checkout' || currentPage === 'admin';
    if (isPrivateRoute) return <SplashScreen />;
  }

  const isInsideDashboard = ((currentPage === 'create-assistant' || currentPage === 'checkout') && !!user) || currentPage === 'admin';
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#08070f] text-neutral-100 selection:bg-purple-500/30 selection:text-purple-200">
      {!isInsideDashboard && <BackgroundVideo opacity={0.88} />}
      <div className="relative z-10 flex min-h-screen flex-col">
        {!isInsideDashboard && <Navbar currentPage={currentPage} onNavigate={handleNavigate} onOpenAssistantModal={() => handleNavigate('create-assistant')} />}
        <main className="flex-grow">
          <Suspense fallback={<RouteFallback />}>
            {currentPage === 'home' && <HomePage onOpenAssistantModal={() => handleNavigate('create-assistant')} onNavigate={handleNavigate} />}
            {currentPage === 'services' && <ServicesPage onOpenAssistantModal={() => handleNavigate('create-assistant')} onNavigate={handleNavigate} />}
            {currentPage === 'pricing' && <PricingPage onOpenAssistantModal={() => handleNavigate('create-assistant')} onNavigate={handleNavigate} />}
            {currentPage === 'demo' && <DemoPage onOpenAssistantModal={() => handleNavigate('create-assistant')} onNavigate={handleNavigate} />}
            {currentPage === 'contact' && <ContactPage onOpenAssistantModal={() => handleNavigate('create-assistant')} onNavigate={handleNavigate} />}
            {(currentPage === 'login' || currentPage === 'signup') && <AuthPage initialMode={currentPage === 'login' ? 'login' : 'signup'} onNavigate={handleNavigate} />}
            {currentPage === 'checkout' && (user ? <DashboardPlatform initialSection="billing" onNavigate={handleNavigate} /> : <AuthPage initialMode="login" onNavigate={handleNavigate} />)}
            {currentPage === 'privacy' && <PrivacyPage type="privacy" onNavigate={handleNavigate} />}
            {currentPage === 'terms' && <PrivacyPage type="terms" onNavigate={handleNavigate} />}
            {currentPage === 'data-deletion' && <PrivacyPage type="deletion" onNavigate={handleNavigate} />}
            {currentPage === 'create-assistant' && (user
              ? <DashboardPlatform initialSection={dashboardSection} onNavigate={handleNavigate} />
              : <AuthPage initialMode="login" onNavigate={handleNavigate} />)}
            {currentPage === 'admin' && <AdminPage />}
          </Suspense>
        </main>
        {/* Un seul pied de page pour tout le site vitrine : coordonnées, pages utiles
            et un dernier appel à l'action sur chaque page publique. */}
        {!isInsideDashboard && (
          <SiteFooter
            onOpenAssistantModal={() => handleNavigate('create-assistant')}
            onNavigate={handleNavigate}
            showCallToAction={currentPage !== 'home'}
          />
        )}
      </div>
      {!isInsideDashboard && <FloatingLiveWidget onOpenCreateAssistant={() => handleNavigate('create-assistant')} onNavigate={handleNavigate} />}
    </div>
  );
}

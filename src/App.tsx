import React, { useState, useEffect } from 'react';
import { BackgroundVideo } from './components/BackgroundVideo';
import { Navbar, PageId } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { ServicesPage } from './pages/ServicesPage';
import { PricingPage } from './pages/PricingPage';
import { DemoPage } from './pages/DemoPage';
import { ContactPage } from './pages/ContactPage';
import { CreateAssistantPage } from './pages/CreateAssistantPage';
import { AuthPage } from './pages/AuthPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { AdminPage } from './pages/AdminPage';
import { DashboardPlatform } from './components/DashboardPlatform';
import { FloatingLiveWidget } from './components/FloatingLiveWidget';
import { useAuth } from './context/AuthContext';

export default function App() {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageId>('home');

  const [dashboardSection, setDashboardSection] = useState<string>('overview');

  // Determine initial route and sub-route from current pathname on first load
  useEffect(() => {
    const parseRoute = (path: string): { page: PageId; section: string } => {
      const clean = path.replace(/^\/+|\/+$/g, '').toLowerCase();
      const parts = clean.split('/');
      const root = parts[0] || '';
      const sub = parts[1] || 'overview';

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
        let validSection = 'overview';
        if (sub === 'crawler' || sub === 'scan' || sub === 'site') validSection = 'crawler';
        else if (sub === 'knowledge' || sub === 'faq' || sub === 'connaissances') validSection = 'knowledge';
        else if (sub === 'widget' || sub === 'bulle' || sub === 'appearance' || sub === 'style' || sub === 'customization') validSection = 'widget';
        else if (sub === 'simulator' || sub === 'test' || sub === 'chatbot') validSection = 'simulator';
        else if (sub === 'integration' || sub === 'script' || sub === 'embed') validSection = 'integration';
        else if (sub === 'instagram' || sub === 'ig' || sub === 'meta' || sub === 'direct') validSection = 'instagram';
        else if (sub === 'leads' || sub === 'crm' || sub === 'prospects') validSection = 'leads';
        else if (sub === 'settings' || sub === 'parametres' || sub === 'whatsapp') validSection = 'settings';
        return { page: 'create-assistant', section: validSection };
      }

      return { page: 'home', section: 'overview' };
    };

    const initialRoute = parseRoute(window.location.pathname);
    
    // Check for Instagram OAuth callback in URL parameters
    const searchParams = new URLSearchParams(window.location.search);
    const authCode = searchParams.get('code');
    const authError = searchParams.get('error') || searchParams.get('error_description');

    if (authCode) {
      // Strip any trailing #_ added by Instagram
      const sanitizedCode = authCode.split('#')[0].replace(/_$/, '').trim();

      // Store in localStorage for cross-tab or redirect resilience
      try {
        localStorage.setItem('jawebflow_last_ig_auth_code', sanitizedCode);
      } catch (e) {
        // Safe fallback
      }

      // If opened inside a popup window, inform the parent opener and close itself immediately
      if (window.opener && window.opener !== window) {
        try {
          window.opener.postMessage({ type: 'INSTAGRAM_AUTH_SUCCESS', code: sanitizedCode }, '*');
        } catch (err) {
          console.warn('Popup postMessage error:', err);
        }
        setTimeout(() => {
          try { window.close(); } catch (e) {}
        }, 300);
        return;
      }
      // If opened in the main window (e.g. mobile redirect), navigate straight to the Instagram cockpit
      setCurrentPage('create-assistant');
      setDashboardSection('instagram');
      return;
    } else if (authError) {
      if (window.opener && window.opener !== window) {
        try {
          window.opener.postMessage({ type: 'INSTAGRAM_AUTH_ERROR', error: authError }, '*');
        } catch (e) {}
        setTimeout(() => {
          try { window.close(); } catch (e) {}
        }, 300);
        return;
      }
    }

    setCurrentPage(initialRoute.page);
    setDashboardSection(initialRoute.section);

    // Listen to browser forward/back buttons (popstate)
    const handlePopState = () => {
      const route = parseRoute(window.location.pathname);
      setCurrentPage(route.page);
      setDashboardSection(route.section);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Navigate handler with pushState URL update
  const handleNavigate = (page: PageId | string, subSection?: string) => {
    // If navigating directly with path like '/dashboard/knowledge'
    if (typeof page === 'string' && page.startsWith('/')) {
      const parts = page.replace(/^\/+|\/+$/g, '').toLowerCase().split('/');
      const root = parts[0];
      const sub = parts[1] || 'overview';
      if (root === 'dashboard') {
        setCurrentPage('create-assistant');
        setDashboardSection(sub);
        if (window.location.pathname !== page) {
          window.history.pushState({ page: 'create-assistant', section: sub }, '', page);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    const validPage: PageId = (['home', 'services', 'pricing', 'demo', 'contact', 'create-assistant', 'login', 'signup', 'checkout', 'privacy', 'terms', 'data-deletion', 'admin'].includes(page) 
      ? page 
      : 'home') as PageId;

    setCurrentPage(validPage);
    
    let targetUrl = validPage === 'home' ? '/' : `/${validPage}`;
    if (validPage === 'create-assistant') {
      const sec = subSection || dashboardSection || 'overview';
      setDashboardSection(sec);
      targetUrl = sec === 'overview' ? '/dashboard' : `/dashboard/${sec}`;
    }

    // Only push if different from current path
    if (window.location.pathname !== targetUrl) {
      window.history.pushState({ page: validPage, section: subSection }, '', targetUrl);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenCreateAssistant = () => {
    handleNavigate('create-assistant');
  };

  const isInsideDashboard = ((currentPage === 'create-assistant' || currentPage === 'checkout') && !!user) || currentPage === 'admin';

  return (
    <div className="relative min-h-screen bg-[#0d0f17] text-neutral-100 overflow-x-hidden selection:bg-purple-500/30 selection:text-purple-200">
      {/* 
        Video Background Component:
        - Fixed in place behind all content on public marketing pages
      */}
      {!isInsideDashboard && <BackgroundVideo opacity={0.88} />}

      {/* Main Foreground Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Navigation Bar: Hidden when inside the Pro SaaS Dashboard to give clean workspace */}
        {!isInsideDashboard && (
          <Navbar 
            currentPage={currentPage}
            onNavigate={handleNavigate}
            onOpenAssistantModal={handleOpenCreateAssistant}
          />
        )}



        {/* Dynamic Multi-Page Router */}
        <main className="flex-grow">
          {currentPage === 'home' && (
            <HomePage 
              onOpenAssistantModal={handleOpenCreateAssistant}
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'services' && (
            <ServicesPage 
              onOpenAssistantModal={handleOpenCreateAssistant}
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'pricing' && (
            <PricingPage 
              onOpenAssistantModal={handleOpenCreateAssistant}
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'demo' && (
            <DemoPage 
              onOpenAssistantModal={handleOpenCreateAssistant}
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'contact' && (
            <ContactPage 
              onOpenAssistantModal={handleOpenCreateAssistant}
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'login' && (
            <AuthPage 
              initialMode="login" 
              onNavigate={handleNavigate} 
            />
          )}

          {currentPage === 'signup' && (
            <AuthPage 
              initialMode="signup" 
              onNavigate={handleNavigate} 
            />
          )}

          {currentPage === 'checkout' && (
            user ? (
              <DashboardPlatform 
                initialSection="billing"
                onNavigate={handleNavigate}
              />
            ) : (
              <AuthPage 
                initialMode="login"
                onNavigate={handleNavigate}
              />
            )
          )}

          {currentPage === 'privacy' && (
            <PrivacyPage 
              type="privacy"
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'terms' && (
            <PrivacyPage 
              type="terms"
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'data-deletion' && (
            <PrivacyPage 
              type="deletion"
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'create-assistant' && (
            user ? (
              <DashboardPlatform 
                initialSection={dashboardSection}
                onNavigate={handleNavigate} 
              />
            ) : (
              <CreateAssistantPage 
                onNavigate={handleNavigate}
              />
            )
          )}

          {currentPage === 'admin' && (
            <AdminPage />
          )}
        </main>
      </div>

      {/* Floating Live Assistant Widget (demonstrating the actual widget embedded in client accounts) */}
      {!isInsideDashboard && (
        <FloatingLiveWidget 
          onOpenCreateAssistant={handleOpenCreateAssistant}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}

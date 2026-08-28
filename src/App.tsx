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
import { DashboardPlatform } from './components/DashboardPlatform';
import { Sparkles } from 'lucide-react';
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
      if (root === 'login' || root === 'connexion' || root === 'signin') return { page: 'login', section: 'overview' };
      if (root === 'signup' || root === 'register' || root === 'inscription') return { page: 'signup', section: 'overview' };
      
      if (root === 'dashboard' || root === 'create-assistant' || root === 'creer-assistant' || root === 'cockpit') {
        let validSection = 'overview';
        if (sub === 'crawler' || sub === 'scan' || sub === 'site') validSection = 'crawler';
        else if (sub === 'knowledge' || sub === 'faq' || sub === 'connaissances') validSection = 'knowledge';
        else if (sub === 'widget' || sub === 'bulle' || sub === 'appearance' || sub === 'style' || sub === 'customization') validSection = 'widget';
        else if (sub === 'simulator' || sub === 'test' || sub === 'chatbot') validSection = 'simulator';
        else if (sub === 'integration' || sub === 'script' || sub === 'embed') validSection = 'integration';
        else if (sub === 'leads' || sub === 'crm' || sub === 'prospects') validSection = 'leads';
        else if (sub === 'settings' || sub === 'parametres' || sub === 'whatsapp') validSection = 'settings';
        return { page: 'create-assistant', section: validSection };
      }

      return { page: 'home', section: 'overview' };
    };

    const initialRoute = parseRoute(window.location.pathname);
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

    const validPage: PageId = (['home', 'services', 'pricing', 'demo', 'contact', 'create-assistant', 'login', 'signup'].includes(page) 
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

  const isInsideDashboard = currentPage === 'create-assistant' && !!user;

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
        </main>
      </div>

      {/* Floating Action Button for Quick Assistant Generation (only on public pages) */}
      {!isInsideDashboard && (
        <div className="fixed bottom-6 right-6 z-40">
          <button
            onClick={handleOpenCreateAssistant}
            className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-neutral-950/70 hover:bg-neutral-900/90 text-purple-300 border border-purple-500/40 backdrop-blur-2xl shadow-2xl shadow-purple-950/50 hover:scale-105 active:scale-95 transition-all text-xs font-semibold group cursor-pointer"
          >
            <div className="w-2 h-2 rounded-full bg-purple-400 animate-ping"></div>
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="hidden sm:inline">Créer mon assistant</span>
          </button>
        </div>
      )}
    </div>
  );
}

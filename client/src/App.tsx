import { useEffect, useRef, useState } from 'react';
import { LocalSessionProvider, useLocalSession } from './contexts/LocalSessionContext';
import { BackgroundVideo } from './components/BackgroundVideo';
import { Navbar, PageId } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { ServicesPage } from './pages/ServicesPage';
import { PricingPage } from './pages/PricingPage';
import { DemoPage } from './pages/DemoPage';
import { ContactPage } from './pages/ContactPage';
import { CreateAssistantPage } from './pages/CreateAssistantPage';
import Dashboard from './pages/Dashboard';
import { Sparkles } from 'lucide-react';

function AppRoutes() {
  const [currentPage, setCurrentPage] = useState<PageId>('home');
  const sceneRef = useRef<HTMLElement>(null);
  const { isAuthenticated } = useLocalSession();

  useEffect(() => {
    const getPageFromPath = (path: string): PageId => {
      const clean = path.replace(/^\/+|\/+$/g, '').toLowerCase();
      if (clean === 'services') return 'services';
      if (clean === 'pricing' || clean === 'tarifs') return 'pricing';
      if (clean === 'demo') return 'demo';
      if (clean === 'contact') return 'contact';
      if (clean === 'create-assistant' || clean === 'creer-assistant' || clean === 'formulaire') return 'create-assistant';
      if (clean === 'dashboard' || clean === 'app') return 'dashboard';
      if (clean === 'dashboard-preview' && import.meta.env.DEV) return 'dashboard-preview';
      return 'home';
    };
    setCurrentPage(getPageFromPath(window.location.pathname));
    const handlePopState = () => setCurrentPage(getPageFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (page: PageId | string) => {
    const validPage: PageId = (['home', 'services', 'pricing', 'demo', 'contact', 'create-assistant', 'dashboard', 'dashboard-preview'].includes(page) ? page : 'home') as PageId;
    setCurrentPage(validPage);
    const targetUrl = validPage === 'home' ? '/' : `/${validPage}`;
    if (window.location.pathname !== targetUrl) window.history.pushState({ page: validPage }, '', targetUrl);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenCreateAssistant = () => handleNavigate('create-assistant');
  const authenticatedArea = isAuthenticated && (currentPage === 'dashboard' || currentPage === 'create-assistant');
  const dashboardPreview = currentPage === 'dashboard-preview' && import.meta.env.DEV;
  const createAssistantPreview = currentPage === 'create-assistant' && import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === '1';

  if (authenticatedArea || dashboardPreview || createAssistantPreview) {
    return <Dashboard onNavigate={handleNavigate} />;
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-transparent text-neutral-100 selection:bg-purple-500/30 selection:text-purple-200">
      <BackgroundVideo src="https://res.cloudinary.com/gz65ybug/video/upload/v1787915454/Metallic_robot_agent_activating___202608281209.mp4" sceneRef={sceneRef} />
      <div className="relative z-10 flex min-h-screen flex-col">
        <Navbar currentPage={currentPage} onNavigate={handleNavigate} onOpenAssistantModal={handleOpenCreateAssistant} />
        <main ref={sceneRef} className="flex-grow">
          {currentPage === 'home' && <HomePage onOpenAssistantModal={handleOpenCreateAssistant} onNavigate={handleNavigate} />}
          {currentPage === 'services' && <ServicesPage onOpenAssistantModal={handleOpenCreateAssistant} onNavigate={handleNavigate} />}
          {currentPage === 'pricing' && <PricingPage onOpenAssistantModal={handleOpenCreateAssistant} onNavigate={handleNavigate} />}
          {currentPage === 'demo' && <DemoPage onOpenAssistantModal={handleOpenCreateAssistant} onNavigate={handleNavigate} />}
          {currentPage === 'contact' && <ContactPage onOpenAssistantModal={handleOpenCreateAssistant} onNavigate={handleNavigate} />}
          {currentPage === 'create-assistant' && <CreateAssistantPage onNavigate={handleNavigate} />}
        </main>
      </div>
      {currentPage !== 'create-assistant' && (
        <div className="fixed bottom-6 right-6 z-40">
          <button onClick={handleOpenCreateAssistant} className="flex cursor-pointer items-center gap-2.5 rounded-2xl border border-purple-500/40 bg-neutral-950/70 px-4 py-3 text-xs font-semibold text-purple-300 shadow-2xl shadow-purple-950/50 backdrop-blur-2xl transition-all hover:scale-105 hover:bg-neutral-900/90 active:scale-95">
            <div className="h-2 w-2 animate-ping rounded-full bg-purple-400" /><Sparkles className="h-4 w-4 text-purple-400" /><span className="hidden sm:inline">Créer mon assistant</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return <LocalSessionProvider><AppRoutes /></LocalSessionProvider>;
}

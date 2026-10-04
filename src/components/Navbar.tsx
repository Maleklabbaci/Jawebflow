import React, { useState, useEffect } from 'react';
import { Menu, X, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type PageId = 'home' | 'services' | 'pricing' | 'demo' | 'contact' | 'create-assistant' | 'login' | 'signup' | 'checkout' | 'privacy' | 'terms' | 'data-deletion' | 'admin';

interface NavbarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  onOpenAssistantModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPage,
  onNavigate,
  onOpenAssistantModal,
}) => {
  const { user, profile } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 15);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const lightHeroNav = currentPage === 'home' && !isScrolled;
  const navItems: { id: PageId; label: string }[] = [
    { id: 'home', label: 'Accueil' },
    { id: 'services', label: 'Services' },
    { id: 'pricing', label: 'Tarifs' },
    { id: 'demo', label: 'Démo' },
    { id: 'contact', label: 'Contact' },
  ];

  const handleItemClick = (pageId: PageId) => {
    onNavigate(pageId);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const desktopLinkColor = (active: boolean) => lightHeroNav
    ? active ? 'text-purple-700 font-semibold' : 'text-purple-950/70 hover:text-purple-700'
    : active ? 'text-white font-semibold' : 'text-neutral-400 hover:text-white';

  return (
    <header
      id="main-navbar"
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'border-b border-white/5 bg-neutral-950/40 py-3.5 shadow-lg shadow-black/20 backdrop-blur-md'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="mx-auto grid max-w-[1440px] grid-cols-3 items-center px-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-start">
          <button
            id="brand-logo-btn"
            onClick={() => handleItemClick('home')}
            className="group flex cursor-pointer items-center gap-3 text-left focus:outline-none"
            aria-label="Accueil"
          >
            <img
              src="/logo.jpg"
              alt="Logo"
              className="h-8 w-auto rounded-lg object-cover shadow-md shadow-purple-500/20 transition-all group-hover:scale-105 sm:h-9"
            />
          </button>
        </div>

        <nav id="center-navigation" className="hidden items-center justify-center gap-8 md:flex lg:gap-10">
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                id={`nav-link-${item.id}`}
                onClick={() => handleItemClick(item.id)}
                className={`relative cursor-pointer py-1 text-sm font-medium transition-colors duration-200 focus:outline-none ${desktopLinkColor(isActive)}`}
              >
                <span>{item.label}</span>
                {isActive && (
                  <span className={`absolute bottom-0 left-0 right-0 h-[2px] rounded-full ${lightHeroNav ? 'bg-purple-600' : 'bg-white'}`} />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center justify-end gap-3">
          {!user ? (
            <button
              id="navbar-login-btn"
              onClick={() => handleItemClick('login')}
              className={`hidden cursor-pointer rounded-xl border px-3.5 py-1.5 text-xs font-medium transition-all sm:inline-flex ${
                lightHeroNav
                  ? 'border-purple-200 text-purple-800 hover:border-purple-300 hover:text-purple-950'
                  : 'border-white/10 text-neutral-300 hover:border-white/20 hover:text-white'
              }`}
            >
              Connexion
            </button>
          ) : (
            <button
              onClick={() => handleItemClick('create-assistant')}
              className={`hidden cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors sm:flex ${
                lightHeroNav
                  ? 'border-purple-200 text-purple-800 hover:border-purple-300 hover:text-purple-950'
                  : 'border-white/15 text-neutral-300 hover:border-white/30 hover:text-white'
              }`}
              title={`Connecté: ${user.email}`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span className="max-w-[120px] truncate">{profile?.displayName || user.email?.split('@')[0]}</span>
            </button>
          )}

          <button
            id="navbar-cta-btn"
            onClick={onOpenAssistantModal}
            className={`flex-shrink-0 cursor-pointer rounded-lg px-4 py-2 text-xs font-semibold transition-colors sm:px-5 sm:text-sm ${
              lightHeroNav
                ? 'bg-purple-700 text-white hover:bg-purple-800'
                : 'bg-white text-neutral-900 hover:bg-neutral-200'
            }`}
          >
            <span>{user ? 'Mon espace' : 'Créer mon assistant'}</span>
          </button>

          <button
            id="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`cursor-pointer p-2 transition-colors md:hidden ${
              lightHeroNav ? 'text-purple-800 hover:text-purple-950' : 'text-neutral-300 hover:text-white'
            }`}
            aria-label="Menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div
          id="mobile-nav-menu"
          className={`space-y-3 border-b px-6 pb-6 pt-4 backdrop-blur-xl animate-in slide-in-from-top-4 duration-200 md:hidden ${
            lightHeroNav ? 'border-purple-100 bg-white/95' : 'border-white/10 bg-neutral-950/95'
          }`}
        >
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={`block w-full py-2 text-left text-sm font-medium transition-colors ${
                  lightHeroNav
                    ? isActive ? 'text-purple-700 font-semibold' : 'text-purple-950/75 hover:text-purple-700'
                    : isActive ? 'text-white font-semibold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}

          <div className={`space-y-2 border-t pt-3 ${lightHeroNav ? 'border-purple-100' : 'border-white/10'}`}>
            {!user && (
              <button
                onClick={() => handleItemClick('login')}
                className={`flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium ${
                  lightHeroNav
                    ? 'border-purple-200 text-purple-800 hover:bg-purple-50'
                    : 'border-white/10 text-neutral-300 hover:text-white'
                }`}
              >
                <span>Connexion / Inscription</span>
              </button>
            )}
            <button
              onClick={() => {
                onOpenAssistantModal();
                setMobileMenuOpen(false);
              }}
              className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold ${
                lightHeroNav ? 'bg-purple-700 text-white hover:bg-purple-800' : 'bg-white text-neutral-900'
              }`}
            >
              <span>{user ? 'Mon espace' : 'Créer mon assistant'}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

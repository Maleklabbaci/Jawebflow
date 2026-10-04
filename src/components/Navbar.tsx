import React, { useState, useEffect } from 'react';
import { Menu, X, UserCheck, ArrowRight } from 'lucide-react';
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

  // Sur l'accueil, le hero est blanc : la barre passe en violet foncé pour rester lisible.
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

  const desktopUnderline = lightHeroNav ? 'bg-purple-600' : 'bg-gradient-to-r from-purple-400 to-indigo-300';

  return (
    <header
      id="main-navbar"
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'border-b border-white/[0.06] bg-[#08070f]/75 py-3 shadow-[0_18px_40px_-32px_rgba(0,0,0,0.95)] backdrop-blur-xl'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="mx-auto grid max-w-[1440px] grid-cols-3 items-center px-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-start">
          <button
            id="brand-logo-btn"
            onClick={() => handleItemClick('home')}
            className="group flex cursor-pointer items-center gap-2.5 text-left focus:outline-none"
            aria-label="Accueil JawebFlow"
          >
            <img
              src="/logo.jpg"
              alt="Logo JawebFlow"
              className="h-8 w-auto rounded-lg object-cover shadow-md shadow-purple-500/20 transition-transform duration-300 group-hover:scale-[1.04] sm:h-9"
            />
            <span className={`hidden text-[0.95rem] font-bold tracking-[-0.02em] sm:inline ${lightHeroNav ? 'text-purple-950' : 'text-white'}`}>
              JawebFlow
            </span>
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
                className={`relative cursor-pointer py-1.5 text-[0.82rem] font-medium tracking-[0.01em] transition-colors duration-200 focus:outline-none ${desktopLinkColor(isActive)}`}
              >
                <span>{item.label}</span>
                {isActive && (
                  <span className={`absolute bottom-0 left-0 right-0 h-[1.5px] rounded-full ${desktopUnderline}`} />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center justify-end gap-2.5">
          {!user ? (
            <button
              id="navbar-login-btn"
              onClick={() => handleItemClick('login')}
              className={`hidden cursor-pointer rounded-[10px] border px-3.5 py-1.5 text-[0.78rem] font-medium transition-all sm:inline-flex ${
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
              className={`hidden cursor-pointer items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[0.78rem] font-medium transition-colors sm:flex ${
                lightHeroNav
                  ? 'border-purple-200 text-purple-800 hover:border-purple-300 hover:text-purple-950'
                  : 'border-white/15 text-neutral-300 hover:border-white/30 hover:text-white'
              }`}
              title={`Connecté : ${user.email}`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span className="max-w-[120px] truncate">{profile?.displayName || user.email?.split('@')[0]}</span>
            </button>
          )}

          <button
            id="navbar-cta-btn"
            onClick={onOpenAssistantModal}
            className={`group flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-[11px] px-4 py-2 text-[0.78rem] font-semibold tracking-[0.005em] transition-all duration-200 sm:text-[0.84rem] ${
              lightHeroNav
                ? 'bg-purple-700 text-white shadow-[0_10px_22px_-16px_rgba(109,40,217,1)] hover:bg-purple-800'
                : 'bg-white text-neutral-900 hover:bg-neutral-200'
            }`}
          >
            <span>{user ? 'Mon espace' : 'Créer mon assistant'}</span>
            <ArrowRight className="hidden h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 sm:inline" />
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
          className={`animate-in slide-in-from-top-4 space-y-1.5 border-b px-6 pb-6 pt-4 backdrop-blur-xl duration-200 md:hidden ${
            lightHeroNav ? 'border-purple-100 bg-white/95' : 'border-white/10 bg-[#08070f]/95'
          }`}
        >
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={`block w-full rounded-xl px-3 py-2.5 text-left text-[0.9rem] font-medium transition-colors ${
                  lightHeroNav
                    ? isActive
                      ? 'bg-purple-50 font-semibold text-purple-700'
                      : 'text-purple-950/75 hover:bg-purple-50/60 hover:text-purple-700'
                    : isActive
                      ? 'bg-white/[0.06] font-semibold text-white'
                      : 'text-neutral-400 hover:bg-white/[0.04] hover:text-white'
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
                className={`btn btn-block ${
                  lightHeroNav
                    ? 'border-purple-200 text-purple-800 hover:bg-purple-50'
                    : 'btn-glass'
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
              className={`btn btn-block btn-primary ${
                lightHeroNav ? 'border-transparent bg-purple-700 bg-none text-white hover:bg-purple-800' : ''
              }`}
            >
              <span>{user ? 'Mon espace' : 'Créer mon assistant'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <p className={`pt-1 text-center text-[0.7rem] font-light ${lightHeroNav ? 'text-purple-900/60' : 'text-neutral-500'}`}>
              Installation en 5 minutes · Sans engagement
            </p>
          </div>
        </div>
      )}
    </header>
  );
};

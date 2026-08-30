import React, { useState, useEffect } from 'react';
import { Sparkles, Menu, X, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type PageId = 'home' | 'services' | 'pricing' | 'demo' | 'contact' | 'create-assistant' | 'login' | 'signup' | 'checkout' | 'privacy' | 'terms' | 'data-deletion';

interface NavbarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  onOpenAssistantModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  currentPage, 
  onNavigate, 
  onOpenAssistantModal 
}) => {
  const { user, profile } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems: { id: PageId; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'services', label: 'Services' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'demo', label: 'Demo' },
    { id: 'contact', label: 'Contact' },
  ];

  const handleItemClick = (pageId: PageId) => {
    onNavigate(pageId);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header 
      id="main-navbar"
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        isScrolled 
          ? 'bg-neutral-950/40 backdrop-blur-md py-3.5 border-b border-white/5 shadow-lg shadow-black/20' 
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        {/* Left: Fixed Brand Logo */}
        <div className="flex-shrink-0 flex items-center">
          <button 
            id="brand-logo-btn"
            onClick={() => handleItemClick('home')}
            className="flex items-center gap-3 text-left group focus:outline-none cursor-pointer"
            aria-label="Accueil"
          >
            <img
              src="https://i.ibb.co/zVGSpyTS/jawebflow.png"
              alt="Logo"
              className="h-8 sm:h-9 w-auto object-contain brightness-0 invert opacity-95 group-hover:opacity-100 transition-all hover:scale-105"
              referrerPolicy="no-referrer"
            />
          </button>
        </div>

        {/* Center: Simple Pure Text Navigation Links (Sans background, sans carte, simple texte normal) */}
        <nav 
          id="center-navigation"
          className="hidden md:flex items-center justify-center gap-8 lg:gap-10"
        >
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                id={`nav-link-${item.id}`}
                onClick={() => handleItemClick(item.id)}
                className={`relative py-1 text-sm font-medium transition-colors duration-200 cursor-pointer focus:outline-none ${
                  isActive
                    ? 'text-white font-semibold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <span>{item.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-purple-400 rounded-full"></span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: Fixed "Créer mon assistant" CTA Button & User badge */}
        <div className="flex-shrink-0 flex items-center gap-3">
          {!user ? (
            <button
              id="navbar-login-btn"
              onClick={() => handleItemClick('login')}
              className="hidden sm:inline-flex items-center px-3.5 py-1.5 rounded-xl border border-white/10 text-xs font-medium text-neutral-300 hover:text-white hover:border-white/20 transition-all cursor-pointer"
            >
              Connexion
            </button>
          ) : (
            <button
              onClick={() => handleItemClick('create-assistant')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold hover:bg-purple-500/25 transition-all cursor-pointer"
              title={`Connecté: ${user.email}`}
            >
              <UserCheck className="w-3.5 h-3.5 text-purple-400" />
              <span className="max-w-[120px] truncate">{profile?.displayName || user.email?.split('@')[0]}</span>
            </button>
          )}

          <button
            id="navbar-cta-btn"
            onClick={onOpenAssistantModal}
            className="relative group overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-purple-600/30 hover:shadow-purple-600/50 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex-shrink-0"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{user ? 'Mon Assistant' : 'Créer mon assistant'}</span>
            </div>
          </button>

          {/* Mobile Menu Toggle */}
          <button
            id="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-neutral-300 hover:text-white cursor-pointer transition-colors"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div 
          id="mobile-nav-menu"
          className="md:hidden px-6 pt-4 pb-6 bg-neutral-950/95 backdrop-blur-xl border-b border-white/10 space-y-3 animate-in slide-in-from-top-4 duration-200"
        >
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={`block w-full text-left py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-purple-300 font-semibold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}

          <div className="pt-3 border-t border-white/10 space-y-2">
            {!user && (
              <button
                onClick={() => handleItemClick('login')}
                className="w-full py-2.5 rounded-xl border border-white/10 text-neutral-300 hover:text-white text-sm font-medium flex items-center justify-center gap-2"
              >
                <span>Connexion / Inscription</span>
              </button>
            )}
            <button
              onClick={() => {
                onOpenAssistantModal();
                setMobileMenuOpen(false);
              }}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30"
            >
              <Sparkles className="w-4 h-4" />
              <span>{user ? 'Mon Assistant' : 'Créer mon assistant'}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

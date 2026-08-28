import React, { useState } from 'react';
import { 
  Lock, 
  Mail, 
  User, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  Check, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthPageProps {
  initialMode?: 'login' | 'signup';
  onNavigate?: (page: string) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ initialMode = 'login', onNavigate }) => {
  const { user, signInWithGoogle, loginWithEmail, registerWithEmail } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'signup'>(initialMode);
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState<string>('');
  const [authFullName, setAuthFullName] = useState<string>('');
  const [authCompanyName, setAuthCompanyName] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);

  // If already logged in, show quick redirection
  if (user) {
    return (
      <div className="relative pt-28 sm:pt-36 pb-20 px-4 sm:px-6 max-w-lg mx-auto w-full text-center">
        <div className="rounded-3xl bg-neutral-950/60 border border-purple-500/30 backdrop-blur-2xl p-8 shadow-2xl shadow-purple-950/50">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center mx-auto mb-4 border border-purple-500/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Vous êtes déjà connecté</h2>
          <p className="text-neutral-300 text-sm mb-6">
            Session active en tant que <span className="text-purple-300 font-semibold">{user.email}</span>.
          </p>
          <button
            onClick={() => onNavigate?.('create-assistant')}
            className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold text-sm shadow-lg shadow-purple-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Accéder au Dashboard Assistant</span>
          </button>
        </div>
      </div>
    );
  }

  const handleGoogleLogin = async () => {
    try {
      setIsSubmittingAuth(true);
      setAuthError('');
      await signInWithGoogle();
      if (onNavigate) {
        onNavigate('create-assistant');
      }
    } catch (err: any) {
      console.error('Google sign in error:', err);
      const isPopupBlocked = err?.code === 'auth/popup-blocked' || err?.message?.includes('popup') || err?.code === 'auth/cancelled-popup-request';
      if (isPopupBlocked) {
        setAuthError("La fenêtre popup Google a été bloquée par le navigateur ou l'aperçu. Vous pouvez vous inscrire ou vous connecter immédiatement avec le formulaire Email ci-dessous.");
      } else {
        setAuthError(err.message || 'Erreur lors de la connexion avec Google.');
      }
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('Veuillez renseigner votre email et mot de passe.');
      return;
    }

    if (authMode === 'signup') {
      if (authPassword !== authConfirmPassword) {
        setAuthError('Les mots de passe ne correspondent pas.');
        return;
      }
      if (authPassword.length < 6) {
        setAuthError('Le mot de passe doit contenir au moins 6 caractères.');
        return;
      }
    }

    try {
      setIsSubmittingAuth(true);
      if (authMode === 'signup') {
        await registerWithEmail(authEmail.trim(), authPassword, authFullName.trim(), authCompanyName.trim());
      } else {
        await loginWithEmail(authEmail.trim(), authPassword);
      }
      if (onNavigate) {
        onNavigate('create-assistant');
      }
    } catch (err: any) {
      console.error('Auth submit error:', err);
      let msg = err.message || 'Une erreur est survenue lors de l\'authentification.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Email ou mot de passe incorrect.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'Cet email est déjà associé à un compte. Veuillez vous connecter.';
      }
      setAuthError(msg);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  return (
    <div className="relative pt-24 sm:pt-32 pb-20 px-4 sm:px-6 max-w-4xl mx-auto w-full">
      {/* Header Badge & Title */}
      <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold backdrop-blur-xl mb-4 shadow-lg shadow-purple-950/30">
          <Lock className="w-3.5 h-3.5 text-purple-400" />
          <span>Espace Sécurisé · Connexion Cloud Firestore</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-display tracking-tight text-neutral-100 mb-3 leading-tight">
          {authMode === 'login' ? 'Connexion à votre espace' : 'Créer votre compte'}
        </h1>

        <p className="text-sm sm:text-base text-neutral-300 leading-relaxed max-w-xl mx-auto">
          {authMode === 'login' 
            ? 'Connectez-vous pour accéder à votre interface de contrôle, gérer votre base de connaissances et configurer votre assistant IA.'
            : 'Inscrivez-vous pour activer l’assistant intelligent de votre site web et l’analyse automatique.'}
        </p>
      </div>

      {/* Auth Card Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Form */}
        <div className="lg:col-span-7 rounded-2xl sm:rounded-3xl bg-neutral-950/50 border border-white/15 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl shadow-purple-950/50 flex flex-col justify-between">
          <div>
            {/* Google 1-Click Login Button */}
            <button
              type="button"
              id="google-signin-btn"
              onClick={handleGoogleLogin}
              disabled={isSubmittingAuth}
              className="w-full mb-5 py-3 px-4 rounded-xl bg-white text-neutral-900 font-semibold text-sm shadow-md hover:bg-neutral-100 active:scale-[0.99] transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Continuer avec Google</span>
            </button>

            {/* Divider */}
            <div className="relative flex items-center justify-center mb-5">
              <div className="border-t border-white/10 w-full"></div>
              <span className="bg-neutral-900/80 px-3 text-xs text-neutral-400 font-medium uppercase tracking-wider absolute">
                ou avec email
              </span>
            </div>

            {/* Error banner */}
            {authError && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 leading-snug">{authError}</div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleEmailAuthSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">Nom complet</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <input
                        type="text"
                        placeholder="Ex: Karim Benali"
                        value={authFullName}
                        onChange={(e) => setAuthFullName(e.target.value)}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-neutral-900/70 border border-white/10 text-white placeholder:text-neutral-500 text-xs sm:text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">Nom d'entreprise / Site</label>
                    <input
                      type="text"
                      placeholder="Ex: Clinique Al-Amal"
                      value={authCompanyName}
                      onChange={(e) => setAuthCompanyName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900/70 border border-white/10 text-white placeholder:text-neutral-500 text-xs sm:text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">Adresse Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="email"
                    required
                    placeholder="contact@votre-entreprise.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-neutral-900/70 border border-white/10 text-white placeholder:text-neutral-500 text-xs sm:text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">Mot de passe</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Minimum 6 caractères"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-neutral-900/70 border border-white/10 text-white placeholder:text-neutral-500 text-xs sm:text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {authMode === 'signup' && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">Confirmer le mot de passe</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder="Répétez le mot de passe"
                      value={authConfirmPassword}
                      onChange={(e) => setAuthConfirmPassword(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-neutral-900/70 border border-white/10 text-white placeholder:text-neutral-500 text-xs sm:text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                id="auth-submit-btn"
                disabled={isSubmittingAuth}
                className="w-full mt-2 py-3 px-5 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 text-white font-semibold text-sm shadow-lg shadow-purple-600/30 hover:shadow-purple-600/50 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingAuth ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Traitement sécurisé en cours...</span>
                  </>
                ) : (
                  <>
                    <span>{authMode === 'login' ? 'Se connecter' : 'Créer mon compte & Démarrer'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Toggle between Login and Signup */}
          <div className="mt-6 pt-4 border-t border-white/5 text-center text-xs sm:text-sm text-neutral-400">
            {authMode === 'login' ? (
              <p>
                Vous n'avez pas encore de compte ?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthError('');
                  }}
                  className="text-purple-400 font-semibold hover:text-purple-300 underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Inscrivez-vous gratuitement
                </button>
              </p>
            ) : (
              <p>
                Vous avez déjà un compte ?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                  }}
                  className="text-purple-400 font-semibold hover:text-purple-300 underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Connectez-vous ici
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Highlights & Social Proof */}
        <div className="lg:col-span-5 rounded-2xl sm:rounded-3xl bg-neutral-950/30 border border-white/10 backdrop-blur-xl p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center mb-4 border border-purple-500/30">
              <Sparkles className="w-5 h-5" />
            </div>

            <h3 className="text-lg font-bold text-white mb-2">Pourquoi créer votre compte ?</h3>
            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-6">
              Votre assistant IA apprend en temps réel à partir de votre site web et répond à vos prospects 24/7 sur tous les canaux.
            </p>

            <div className="space-y-3.5">
              {[
                { icon: Zap, title: 'Crawler IA 1-Click', desc: 'Analyse automatique de vos pages et génération de FAQ.' },
                { icon: ShieldCheck, title: 'Sauvegarde Cloud Firestore', desc: 'Vos données et règles sont stockées de façon sécurisée.' },
                { icon: Check, title: 'Intégration Script Universelle', desc: 'Ajoutez votre assistant sur WordPress, Webflow, Shopify ou HTML.' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <item.icon className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-semibold text-white">{item.title}</h4>
                    <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/5 text-[11px] text-neutral-400 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span>Données hébergées en base de données sécurisée.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

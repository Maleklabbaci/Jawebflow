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
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sendResetPassword } from '../lib/supabase';

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
  const [authNotice, setAuthNotice] = useState<string>('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);
  const [isSendingReset, setIsSendingReset] = useState<boolean>(false);

  // If already logged in, show quick redirection
  if (user) {
    return (
      <div className="relative mx-auto w-full max-w-lg px-4 pb-20 pt-28 text-center sm:px-6 sm:pt-36">
        <div className="lux-card p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-400/25 bg-purple-500/15 text-purple-200">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="lux-h3 text-[1.35rem]">Vous êtes déjà connecté</h1>
          <p className="lux-sub mt-2 text-[0.86rem]">
            Session active en tant que <span className="font-medium text-purple-200">{user.email}</span>.
          </p>
          <button
            onClick={() => onNavigate?.('create-assistant')}
            className="btn btn-primary btn-block mt-6"
          >
            <Sparkles className="h-4 w-4" />
            <span>Accéder à mon espace</span>
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

  const handleForgotPassword = async () => {
    setAuthError('');
    setAuthNotice('');

    if (!authEmail.trim()) {
      setAuthError('Indiquez d’abord votre adresse email : nous vous envoyons le lien de réinitialisation.');
      return;
    }

    try {
      setIsSendingReset(true);
      await sendResetPassword(authEmail.trim());
      setAuthNotice('Si un compte existe pour cette adresse, un lien de réinitialisation vient de vous être envoyé. Pensez à regarder vos spams.');
    } catch (err: any) {
      setAuthError(err?.message || 'Impossible d’envoyer le lien pour le moment. Réessayez dans un instant.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthNotice('');

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
    <div className="relative mx-auto w-full max-w-4xl px-4 pb-20 pt-24 sm:px-6 sm:pt-32">
      {/* Header Badge & Title */}
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <span className="lux-eyebrow">
          <Lock className="h-3.5 w-3.5 text-purple-300" />
          Espace client sécurisé
        </span>

        <h1 className="lux-h2 mt-5">
          {authMode === 'login' ? 'Content de vous revoir.' : 'Votre assistant peut être en ligne aujourd’hui.'}
        </h1>

        <p className="lux-lead mx-auto mt-4 max-w-xl">
          {authMode === 'login'
            ? 'Retrouvez votre assistant, vos informations et les clients intéressés — tout est là où vous l’avez laissé.'
            : 'Créez votre espace gratuitement, ajoutez vos informations et installez la bulle sur votre site en 5 minutes. Sans carte bancaire.'}
        </p>
      </div>

      {/* Auth Card Layout */}
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        {/* Left Column: Form */}
        <div className="lux-card flex flex-col justify-between p-6 sm:p-8 lg:col-span-7">
          <div>
            {/* Google 1-Click Login Button */}
            <button
              type="button"
              id="google-signin-btn"
              onClick={handleGoogleLogin}
              disabled={isSubmittingAuth}
              className="btn btn-light btn-block mb-5 gap-3"
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
            <div className="relative mb-5 flex items-center justify-center">
              <div className="w-full border-t border-white/[0.08]"></div>
              <span className="absolute bg-transparent px-3 text-[0.66rem] font-medium uppercase tracking-[0.16em] text-neutral-500">
                ou avec email
              </span>
            </div>

            {/* Bonne nouvelle (ex. lien de réinitialisation envoyé) */}
            {authNotice && (
              <div role="status" className="animate-in fade-in mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.08] p-3.5 text-[0.82rem] text-emerald-200 duration-200">
                <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
                <div className="flex-1 leading-snug">{authNotice}</div>
              </div>
            )}

            {/* Error banner */}
            {authError && (
              <div role="alert" className="animate-in fade-in mb-5 flex items-start gap-2.5 rounded-xl border border-rose-400/30 bg-rose-500/[0.08] p-3.5 text-[0.82rem] text-rose-200 duration-200">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-300" />
                <div className="flex-1 leading-snug">{authError}</div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleEmailAuthSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="lux-label" htmlFor="auth-fullname">Nom complet</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <input
                        id="auth-fullname"
                        type="text"
                        autoComplete="name"
                        placeholder="Ex : Karim Benali"
                        value={authFullName}
                        onChange={(e) => setAuthFullName(e.target.value)}
                        className="lux-input pl-10"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="lux-label" htmlFor="auth-company">Entreprise / site</label>
                    <input
                      id="auth-company"
                      type="text"
                      autoComplete="organization"
                      placeholder="Ex : Clinique Al-Amal"
                      value={authCompanyName}
                      onChange={(e) => setAuthCompanyName(e.target.value)}
                      className="lux-input"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="lux-label" htmlFor="auth-email">Adresse email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="contact@votre-entreprise.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="lux-input pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="lux-label" htmlFor="auth-password">Mot de passe</label>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                    placeholder="Minimum 6 caractères"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="lux-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-neutral-400 transition-colors hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {authMode === 'login' && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isSendingReset}
                    className="mt-2 cursor-pointer text-[0.74rem] font-light text-neutral-400 transition-colors hover:text-purple-200 disabled:opacity-60"
                  >
                    {isSendingReset ? 'Envoi du lien…' : 'Mot de passe oublié ?'}
                  </button>
                )}
              </div>

              {authMode === 'signup' && (
                <div>
                  <label className="lux-label" htmlFor="auth-confirm-password">Confirmer le mot de passe</label>
                  <div className="relative">
                    <input
                      id="auth-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      placeholder="Répétez le mot de passe"
                      value={authConfirmPassword}
                      onChange={(e) => setAuthConfirmPassword(e.target.value)}
                      className="lux-input pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-neutral-400 transition-colors hover:text-white"
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
                className="btn btn-primary btn-block btn-lg mt-1"
              >
                {isSubmittingAuth ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Traitement sécurisé…</span>
                  </>
                ) : (
                  <>
                    <span>{authMode === 'login' ? 'Se connecter' : 'Créer mon compte gratuitement'}</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              {authMode === 'signup' && (
                <p className="lux-note text-center text-[0.74rem]">
                  Gratuit, sans engagement. Vous ne payez que si vous activez votre assistant.
                </p>
              )}
            </form>
          </div>

          {/* Toggle between Login and Signup */}
          <div className="mt-6 border-t border-white/[0.06] pt-4 text-center text-[0.82rem] font-light text-neutral-400">
            {authMode === 'login' ? (
              <p>
                Vous n'avez pas encore de compte ?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthError('');
                    setAuthNotice('');
                  }}
                  className="cursor-pointer font-medium text-purple-300 underline underline-offset-4 transition-colors hover:text-purple-200"
                >
                  Créez votre compte gratuitement
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
                    setAuthNotice('');
                  }}
                  className="cursor-pointer font-medium text-purple-300 underline underline-offset-4 transition-colors hover:text-purple-200"
                >
                  Connectez-vous ici
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Highlights & Social Proof */}
        <div className="lux-card flex flex-col justify-between p-6 sm:p-8 lg:col-span-5">
          <div>
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/15 text-purple-200">
              <Sparkles className="h-5 w-5" />
            </div>

            <h2 className="lux-h3 text-[1.05rem]">Ce que vous retrouvez dans votre espace</h2>
            <p className="lux-sub mt-2 text-[0.84rem]">
              Votre assistant répond à vos visiteurs jour et nuit, en français et en darija,
              et vous transmet le contact des clients intéressés.
            </p>

            <div className="mt-6 space-y-3">
              {[
                { icon: Zap, title: 'Votre site analysé pour vous', desc: 'Vos prix, horaires et produits importés automatiquement en un clic.' },
                { icon: ShieldCheck, title: 'Données protégées', desc: 'Vos informations servent uniquement à répondre à vos visiteurs.' },
                { icon: Check, title: 'Installation en 5 minutes', desc: 'WordPress, Shopify, Webflow ou site sur mesure : un copier-coller suffit.' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3.5">
                  <item.icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-300" />
                  <div>
                    <h3 className="text-[0.8rem] font-semibold text-white">{item.title}</h3>
                    <p className="lux-sub mt-0.5 text-[0.74rem] leading-snug">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2 border-t border-white/[0.06] pt-4 text-[0.68rem] font-light text-neutral-500">
            <Lock className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
            <span>Connexion protégée. Vos données restent confidentielles.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

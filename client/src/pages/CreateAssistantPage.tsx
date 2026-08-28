import React, { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocalSession } from '@/contexts/LocalSessionContext';
import Dashboard from './Dashboard';
import { 
  Sparkles, 
  UploadCloud, 
  Layers, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  Copy, 
  FileText, 
  Bot, 
  ShieldCheck, 
  Globe, 
  Settings2, 
  MessageSquare,
  HelpCircle,
  Clock,
  Code2,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  LogOut,
  Zap,
  Check,
  BarChart3,
  CreditCard,
  Palette,
} from 'lucide-react';

interface CreateAssistantPageProps {
  onNavigate?: (page: string) => void;
}

export const CreateAssistantPage: React.FC<CreateAssistantPageProps> = ({ onNavigate }) => {
  // Auth state is owned by the secure local session adapter exposed by tRPC.
  const { user, token, isAuthenticated, login, register, logout } = useLocalSession();
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState<string>('');
  const [authFullName, setAuthFullName] = useState<string>('');
  const [authCompanyName, setAuthCompanyName] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');
  const [authBusy, setAuthBusy] = useState(false);
  const currentUser = user ? { email: user.email, name: user.name, company: authCompanyName || undefined } : null;
  const saveBotMutation = trpc.workspace.saveBot.useMutation();
  const overviewQuery = trpc.workspace.overview.useQuery({ token: token ?? '0'.repeat(24) }, {
    enabled: Boolean(token),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const subscription = overviewQuery.data?.subscription;
  const metrics = overviewQuery.data?.metrics;
  // Assistant Form State
  const [step, setStep] = useState<number>(1);
  const [copied, setCopied] = useState<boolean>(false);

  const [businessName, setBusinessName] = useState<string>('');
  const [websiteUrl, setWebsiteUrl] = useState<string>('');
  const [businessCategory, setBusinessCategory] = useState<string>('');
  const [customCategory, setCustomCategory] = useState<string>('');
  const [businessDescription, setBusinessDescription] = useState<string>('');
  
  // Knowledge Base Data
  const [faqText, setFaqText] = useState<string>('');
  const [pricingServicesText, setPricingServicesText] = useState<string>('');
  const [specialRulesText, setSpecialRulesText] = useState<string>('');
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; type: string; size: number; base64: string }>>([]);
  const [widgetSnippet, setWidgetSnippet] = useState<string | null>(null);
  const [botId, setBotId] = useState<string | null>(null);
  const widgetQuery = trpc.workspace.getWidget.useQuery({
    token: token ?? '0'.repeat(24),
    botId: botId ?? '00000000-0000-0000-0000-000000000000',
  }, {
    enabled: Boolean(token && botId && subscription?.apiEnabled),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Tone & Style Settings
  const [assistantTone, setAssistantTone] = useState<string>('professionnel');
  const [bubbleTheme, setBubbleTheme] = useState<'violet' | 'cyan' | 'orange' | 'mono'>('violet');
  const [bubblePosition, setBubblePosition] = useState<'bottom-right' | 'bottom-left'>('bottom-right');
  const [languages, setLanguages] = useState<{ fr: boolean; darija: boolean; en: boolean; ar: boolean }>({
    fr: true,
    darija: true,
    en: true,
    ar: true
  });
  const [autoLeadCapture, setAutoLeadCapture] = useState<boolean>(true);
  const [whatsappEscalation, setWhatsappEscalation] = useState<string>('');

  useEffect(() => {
    const overview = overviewQuery.data;
    if (!overview?.bot) return;
    if (!businessName) setBusinessName(overview.bot.businessName);
    if (!websiteUrl && overview.bot.websiteUrl) setWebsiteUrl(overview.bot.websiteUrl);
    if (!businessCategory && overview.bot.businessCategory) setBusinessCategory(overview.bot.businessCategory);
    if (!businessDescription && (overview.bot.businessDescription || overview.bot.rawKnowledge)) setBusinessDescription(overview.bot.businessDescription || overview.bot.rawKnowledge || '');
    if (!pricingServicesText && overview.bot.pricingServicesText) setPricingServicesText(overview.bot.pricingServicesText);
    if (!faqText && overview.bot.faqText) setFaqText(overview.bot.faqText);
    if (!specialRulesText && overview.bot.specialRulesText) setSpecialRulesText(overview.bot.specialRulesText);
    if (overview.bot.assistantTone) setAssistantTone(overview.bot.assistantTone);
    if (overview.bot.bubbleTheme && ['violet', 'cyan', 'orange', 'mono'].includes(overview.bot.bubbleTheme)) setBubbleTheme(overview.bot.bubbleTheme as 'violet' | 'cyan' | 'orange' | 'mono');
    if (overview.bot.bubblePosition && ['bottom-right', 'bottom-left'].includes(overview.bot.bubblePosition)) setBubblePosition(overview.bot.bubblePosition as 'bottom-right' | 'bottom-left');
    if (!widgetSnippet && overview.widgetSnippet) setWidgetSnippet(overview.widgetSnippet);
    if (!widgetSnippet && widgetQuery.data?.widgetSnippet) setWidgetSnippet(widgetQuery.data.widgetSnippet);
    if (!botId) setBotId(overview.bot.id);
    if (step === 1 && (overview.widgetSnippet || widgetQuery.data?.widgetSnippet)) setStep(3);
  }, [overviewQuery.data, widgetQuery.data, businessDescription, businessName, botId, step, widgetSnippet]);

  const categorySuggestions = [
    'Services & Agence',
    'E-commerce & Retail',
    'Formation & Coaching',
    'Cabinet & Santé',
    'Immobilier & Architecture',
    'Restauration & Hôtellerie',
    'Artisanat & Industrie',
    'SaaS & Tech',
    'Autre activité personnalisée'
  ];

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!authEmail || !authEmail.includes('@')) {
      setAuthError('Veuillez renseigner une adresse email valide.');
      return;
    }
    if (!authPassword || authPassword.length < 8) {
      setAuthError('Le mot de passe doit comporter au moins 8 caractères.');
      return;
    }
    if (authMode === 'signup') {
      if (!authFullName.trim()) {
        setAuthError('Veuillez renseigner votre nom complet.');
        return;
      }
      if (!authCompanyName.trim()) {
        setAuthError("Veuillez renseigner le nom de votre business.");
        return;
      }
      if (authPassword !== authConfirmPassword) {
        setAuthError('Les mots de passe ne correspondent pas.');
        return;
      }
    }
    setAuthBusy(true);
    try {
      if (authMode === 'signup') {
        await register(authEmail.trim(), authPassword);
        if (authCompanyName.trim() && !businessName) setBusinessName(authCompanyName.trim());
      } else {
        await login(authEmail.trim(), authPassword);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Connexion impossible.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = () => {
    logout();
    setStep(1);
    setWidgetSnippet(null);
    setBotId(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 3 - uploadedFiles.length);
    if (files.length === 0) return;
    const toBase64 = async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...Array.from(bytes.subarray(index, index + 0x8000)));
      }
      return { name: file.name, type: file.type || 'text/plain', size: file.size, base64: btoa(binary) };
    };
    try {
      const nextFiles = await Promise.all(files.map(toBase64));
      setUploadedFiles(prev => [...prev, ...nextFiles]);
    } catch {
      setAuthError('Impossible de lire ce fichier. Réessaie avec un fichier texte, CSV, Markdown ou JSON.');
    } finally {
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const widgetScript = widgetSnippet ?? `<!-- Le script sera généré après l'enregistrement de votre assistant. -->`;
  const handleGenerateWidget = async () => {
    if (!token) {
      setAuthError('Ta session a expiré. Connecte-toi de nouveau.');
      return;
    }
    setAuthError('');
    const knowledge = [
      businessDescription && `Description du business :\n${businessDescription}`,
      websiteUrl && `Site web : ${websiteUrl}`,
      pricingServicesText && `Offres et tarifs :\n${pricingServicesText}`,
      faqText && `FAQ :\n${faqText}`,
      specialRulesText && `Consignes :\n${specialRulesText}`,
      `Ton : ${assistantTone}. Langues : ${Object.entries(languages).filter(([, enabled]) => enabled).map(([language]) => language).join(', ')}. Capture de leads : ${autoLeadCapture ? 'oui' : 'non'}. ${whatsappEscalation ? `Transfert WhatsApp : ${whatsappEscalation}.` : ''}`,
    ].filter(Boolean).join('\n\n');
    try {
      const result = await saveBotMutation.mutateAsync({
        token,
        businessName: businessName.trim(),
        websiteUrl: websiteUrl.trim(),
        businessCategory: (customCategory.trim() || businessCategory.trim()),
        businessDescription: businessDescription.trim(),
        pricingServicesText: pricingServicesText.trim(),
        faqText: faqText.trim(),
        specialRulesText: specialRulesText.trim(),
        assistantTone,
        languages,
        autoLeadCapture,
        bubbleTheme,
        bubblePosition,
        rawKnowledge: knowledge,
        files: uploadedFiles,
      });
      setBotId(result.bot.id);
      setWidgetSnippet(result.widgetSnippet);
      setStep(3);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Impossible d'enregistrer l'assistant.");
    }
  };

  const handleCopyCode = () => {
    if (!widgetSnippet) {
      setAuthError('Le script widget est disponible après activation d’un abonnement.');
      return;
    }
    navigator.clipboard.writeText(widgetScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canProceedStep1 = businessName.trim().length >= 2
    && (businessCategory.trim().length > 0 || customCategory.trim().length > 0)
    && businessDescription.trim().length >= 10;
  const isSaving = saveBotMutation.isPending;
  const existingKnowledge = overviewQuery.data?.knowledge ?? [];

  // VIEW 1: AUTHENTICATION (LOGIN / SIGNUP) SCREEN
  if (isAuthenticated) return <Dashboard onNavigate={onNavigate} />;

  return (
    <div className="relative pt-24 sm:pt-32 pb-20 px-4 sm:px-6 max-w-4xl mx-auto w-full">
        {/* Header Badge & Title */}
        <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold backdrop-blur-xl mb-4 shadow-lg shadow-purple-950/30">
            <Lock className="w-3.5 h-3.5 text-purple-400" />
            <span>Espace Sécurisé Créateur</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-display tracking-tight text-neutral-100 mb-3 leading-tight">
            {authMode === 'login' ? 'Connexion à votre espace' : 'Créer votre compte'}
          </h1>

          <p className="text-sm sm:text-base text-neutral-300 leading-relaxed max-w-xl mx-auto">
            {authMode === 'login' 
              ? 'Connectez-vous pour accéder à vos assistants, modifier vos règles de conversation et obtenir vos scripts.'
              : 'Inscrivez-vous en 30 secondes pour configurer, sauvegarder et déployer l’assistant intelligent de votre site web.'}
          </p>
        </div>

        {/* Auth Card Layout with 2 Columns on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column: Form */}
          <div className="lg:col-span-7 rounded-2xl sm:rounded-3xl bg-neutral-950/50 border border-white/15 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl shadow-purple-950/50 flex flex-col justify-between">
            <div>
              {/* Tab Switcher: Se connecter d'abord / Créer un compte */}
              <div className="grid grid-cols-2 p-1 bg-neutral-900/80 rounded-xl border border-white/10 mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                  }}
                  className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                    authMode === 'login'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Se connecter (Login)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthError('');
                  }}
                  className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                    authMode === 'signup'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Créer un compte (Sign in)
                </button>
              </div>

              {/* Error Message */}
              {authError && (
                <div className="p-3 mb-4 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
                  <span>{authError}</span>
                </div>
              )}

              {/* Form Inputs */}
              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authMode === 'signup' && (
                  <>
                    {/* Nom complet */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-200 mb-1.5">
                        Nom complet *
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={authFullName}
                          onChange={(e) => setAuthFullName(e.target.value)}
                          placeholder="Ex: Karim Benali"
                          className="w-full bg-neutral-900/80 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                    </div>

                    {/* Nom de l'entreprise */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-200 mb-1.5">
                        Nom de l'entreprise *
                      </label>
                      <div className="relative">
                        <Layers className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={authCompanyName}
                          onChange={(e) => setAuthCompanyName(e.target.value)}
                          placeholder="Ex: Studio Alpha, Boutique Zina, Clinique El Chifa..."
                          className="w-full bg-neutral-900/80 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Adresse email */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-200 mb-1.5">
                    Adresse email {authMode === 'signup' ? '*' : ''}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="contact@votre-entreprise.com"
                      className="w-full bg-neutral-900/80 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>

                {/* Mot de passe */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-200 mb-1.5 flex items-center justify-between">
                    <span>Mot de passe {authMode === 'signup' ? '*' : ''}</span>
                    {authMode === 'login' && (
                      <span className="text-[11px] text-purple-300 hover:underline cursor-pointer">
                        Mot de passe oublié ?
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-neutral-900/80 border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirmation du mot de passe (Uniquement lors de l'inscription) */}
                {authMode === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold text-neutral-200 mb-1.5">
                      Confirmation du mot de passe *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={authConfirmPassword}
                        onChange={(e) => setAuthConfirmPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-neutral-900/80 border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200 cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full mt-2 py-3 rounded-xl disabled:opacity-50 disabled:cursor-wait bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 text-white font-bold text-xs sm:text-sm shadow-xl shadow-purple-600/35 hover:shadow-purple-600/50 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {authBusy ? 'Connexion sécurisée…' : authMode === 'login' ? 'Se connecter & Accéder au formulaire' : 'Créer mon compte & Configurer mon assistant'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 text-center text-xs text-neutral-400">
              <span>{authMode === 'login' ? 'Pas encore de compte ?' : 'Déjà inscrit ?'} </span>
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'signup' : 'login');
                  setAuthError('');
                }}
                className="text-purple-300 font-semibold hover:underline cursor-pointer ml-1"
              >
                {authMode === 'login' ? 'Créer un compte (Sign in)' : 'Se connecter (Login)'}
              </button>
            </div>
          </div>

          {/* Right Column: Benefits & Trust Details */}
          <div className="lg:col-span-5 rounded-2xl sm:rounded-3xl bg-neutral-950/30 border border-white/10 backdrop-blur-xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div>
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 mb-4">
                <Bot className="w-5 h-5" />
              </div>

              <h3 className="text-lg font-bold font-display text-neutral-100 mb-2">
                Pourquoi un compte JawebFlow ?
              </h3>
              <p className="text-xs text-neutral-300 leading-relaxed mb-6">
                Votre compte vous permet de sauvegarder vos bases de connaissances, de générer plusieurs assistants et de consulter l'historique des requêtes clients.
              </p>

              <div className="space-y-3.5">
                {[
                  'Sauvegarde sécurisée de vos fiches, tarifs et documents',
                  'Adapté à 100% des métiers et formats de sites web',
                  'Code d’intégration instantané en 1 ligne',
                  'Génération multilingue (Français, Darija, Anglais, Arabe)',
                  'Support technique & accompagnement à l’intégration'
                ].map((benefit, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs text-neutral-200">
                    <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                      <Check className="w-2.5 h-2.5" />
                    </div>
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex items-center gap-3 text-[11px] text-neutral-400">
              <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Données cryptées & hébergées conformément aux normes de confidentialité.</span>
            </div>
          </div>
        </div>
      </div>
    );

};

import React, { useState, useEffect } from 'react';
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
  Loader2,
  Database,
  Search,
  RefreshCw,
  Send,
  ExternalLink,
  Sliders,
  CheckCheck,
  MessageCircle,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { saveAssistantToDatabase, getUserAssistants, AssistantConfig } from '../lib/firebase';

interface CreateAssistantPageProps {
  onNavigate?: (page: string) => void;
}

export const CreateAssistantPage: React.FC<CreateAssistantPageProps> = ({ onNavigate }) => {
  const { user, profile, loading: authLoading, signInWithGoogle, loginWithEmail, registerWithEmail, logout } = useAuth();

  // Auth local state for logged-out visitors
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState<string>('');
  const [authFullName, setAuthFullName] = useState<string>('');
  const [authCompanyName, setAuthCompanyName] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);

  // View state once authenticated: 'dashboard' (default when logged in) vs 'wizard' (for initial onboarding or re-run)
  const [activeTab, setActiveTab] = useState<'crawler' | 'knowledge' | 'simulator' | 'embed'>('crawler');
  const [isWizardMode, setIsWizardMode] = useState<boolean>(false);
  const [step, setStep] = useState<number>(1);
  const [copied, setCopied] = useState<boolean>(false);
  const [isSavingDb, setIsSavingDb] = useState<boolean>(false);
  const [savedDbSuccess, setSavedDbSuccess] = useState<boolean>(false);

  // Assistant Configuration State
  const [assistantId, setAssistantId] = useState<string>('');
  const [widgetId, setWidgetId] = useState<string>('');
  const [businessName, setBusinessName] = useState<string>('');
  const [websiteUrl, setWebsiteUrl] = useState<string>('');
  const [businessCategory, setBusinessCategory] = useState<string>('Services & Agence');
  const [customCategory, setCustomCategory] = useState<string>('');
  const [businessDescription, setBusinessDescription] = useState<string>('');
  
  // Knowledge Base Data
  const [faqText, setFaqText] = useState<string>(
`Q : Quels sont vos délais d'intervention ou de livraison ?
R : Nous intervenons sous 24h à 48h ouvrées selon votre formule.

Q : Quels sont les modes de règlement acceptés ?
R : Virement bancaire, chèque d'entreprise, ou paiement sécurisé en ligne.

Q : Proposez-vous un devis gratuit ?
R : Oui, nos devis et diagnostics sont 100% gratuits et sans engagement.`
  );
  const [pricingServicesText, setPricingServicesText] = useState<string>(
    `Formule Starter : À partir de 4 500 DA / mois (Support standard & Réponses FAQ)
Formule Pro : 9 800 DA / mois (Prise de rendez-vous automatique & Transfert WhatsApp 24/7)
Formule Entreprise : Sur devis personnalisé avec intégration CRM sur-mesure.`
  );
  const [specialRulesText, setSpecialRulesText] = useState<string>(
    `Toujours rester courtois, professionnel et concis. Si le client demande un devis spécifique, demander systématiquement son numéro de téléphone ou son email. Ne jamais promettre une réduction de prix sans validation préalable d'un conseiller.`
  );
  const [uploadedFiles, setUploadedFiles] = useState<string[]>(['Catalogue-Services-2026.pdf']);

  // Tone & Style Settings
  const [assistantTone, setAssistantTone] = useState<string>('professionnel');
  const [languages, setLanguages] = useState<{ fr: boolean; darija: boolean; en: boolean; ar: boolean }>({
    fr: true,
    darija: true,
    en: true,
    ar: true
  });
  const [autoLeadCapture, setAutoLeadCapture] = useState<boolean>(true);
  const [whatsappEscalation, setWhatsappEscalation] = useState<string>('+213 550 12 34 56');

  // AI Crawler State
  const [crawlerUrl, setCrawlerUrl] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scanStage, setScanStage] = useState<string>('');
  const [scannedPages, setScannedPages] = useState<Array<{ url: string; title: string; status: 'done' | 'pending' }>>([]);
  const [scanResultKnowledge, setScanResultKnowledge] = useState<{
    summary: string;
    servicesDetected: string[];
    faqGenerated: Array<{ q: string; a: string }>;
    contactInfo: string;
  } | null>(null);

  // Chat Simulator State
  const [messages, setMessages] = useState<Array<{ sender: 'bot' | 'user'; text: string; time: string }>>([
    {
      sender: 'bot',
      text: "Bonjour ! 👋 Je suis l'assistant intelligent de votre site web. Comment puis-je vous aider aujourd'hui ?",
      time: '12:00'
    }
  ]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isBotTyping, setIsBotTyping] = useState<boolean>(false);

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

  // Load existing assistant from Firestore when user logs in
  useEffect(() => {
    if (user) {
      if (profile?.companyName && !businessName) {
        setBusinessName(profile.companyName);
      }
      // Fetch assistant from Firestore
      const loadUserAssistant = async () => {
        try {
          const assistants = await getUserAssistants(user.uid);
          if (assistants.length > 0) {
            const current = assistants[0];
            setAssistantId(current.id || '');
            setWidgetId(current.widgetId || `asst_${Math.random().toString(36).substring(2, 10)}`);
            if (current.businessName) setBusinessName(current.businessName);
            if (current.websiteUrl) {
              setWebsiteUrl(current.websiteUrl);
              setCrawlerUrl(current.websiteUrl);
            }
            if (current.businessCategory) setBusinessCategory(current.businessCategory);
            if (current.businessDescription) setBusinessDescription(current.businessDescription);
            if (current.faqText) setFaqText(current.faqText);
            if (current.pricingServicesText) setPricingServicesText(current.pricingServicesText);
            if (current.specialRulesText) setSpecialRulesText(current.specialRulesText);
            if (current.assistantTone) setAssistantTone(current.assistantTone);
            if (current.languages) setLanguages(current.languages);
            if (current.whatsappEscalation) setWhatsappEscalation(current.whatsappEscalation);
            setIsWizardMode(false);
          } else {
            // New user without assistant yet: default widget ID
            const newWid = `asst_${Math.random().toString(36).substring(2, 10)}`;
            setWidgetId(newWid);
          }
        } catch (e) {
          console.warn('Failed to load user assistant:', e);
        }
      };
      loadUserAssistant();
    }
  }, [user, profile]);

  const handleGoogleLogin = async () => {
    try {
      setIsSubmittingAuth(true);
      setAuthError('');
      await signInWithGoogle();
      setIsWizardMode(false);
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

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (!authEmail || !authEmail.includes('@')) {
      setAuthError('Veuillez renseigner une adresse email valide.');
      return;
    }

    if (!authPassword || authPassword.length < 6) {
      setAuthError('Le mot de passe doit comporter au moins 6 caractères.');
      return;
    }

    if (authMode === 'signup') {
      if (!authFullName.trim()) {
        setAuthError('Veuillez renseigner votre nom complet.');
        return;
      }
      if (!authCompanyName.trim()) {
        setAuthError("Veuillez renseigner le nom de votre entreprise.");
        return;
      }
      if (authPassword !== authConfirmPassword) {
        setAuthError('Les mots de passe ne correspondent pas.');
        return;
      }
    }

    try {
      setIsSubmittingAuth(true);
      if (authMode === 'signup') {
        await registerWithEmail(authEmail, authPassword, authFullName, authCompanyName);
        if (authCompanyName) {
          setBusinessName(authCompanyName);
        }
        // For new sign up, let user do the fast onboarding wizard or explore dashboard
        setIsWizardMode(true);
        setStep(1);
      } else {
        // Direct Login: Immediately go into the Dashboard interface
        await loginWithEmail(authEmail, authPassword);
        setIsWizardMode(false);
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setAuthError('Identifiants incorrects. Vérifiez votre email et mot de passe.');
      } else if (err.code === 'auth/email-already-in-use') {
        setAuthError('Cet email est déjà utilisé. Essayez de vous connecter.');
      } else {
        setAuthError(err.message || 'Erreur de connexion. Veuillez réessayer.');
      }
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error', err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map((f: File) => f.name);
      setUploadedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const currentWidgetId = widgetId || 'asst_live_preview';
  const widgetScript = `<!-- Script JawebFlow pour ${businessName || 'votre site'} -->
<script 
  src="https://cdn.jawebflow.com/widget.js" 
  data-assistant-id="${currentWidgetId}" 
  data-theme="dark" 
  defer>
</script>`;

  const handleSaveToDatabase = async () => {
    if (!user) return;
    try {
      setIsSavingDb(true);
      const effectiveWidgetId = widgetId || `asst_${Math.random().toString(36).substring(2, 10)}`;
      const savedId = await saveAssistantToDatabase({
        id: assistantId || undefined,
        userId: user.uid,
        businessName: businessName.trim() || 'Mon Entreprise',
        websiteUrl: websiteUrl.trim(),
        businessCategory: customCategory.trim() || businessCategory || 'Services & Agence',
        businessDescription: businessDescription.trim(),
        faqText: faqText.trim(),
        pricingServicesText: pricingServicesText.trim(),
        specialRulesText: specialRulesText.trim(),
        assistantTone,
        languages,
        autoLeadCapture,
        whatsappEscalation: whatsappEscalation.trim(),
        widgetId: effectiveWidgetId
      });
      if (savedId) setAssistantId(savedId);
      setSavedDbSuccess(true);
      setTimeout(() => setSavedDbSuccess(false), 3000);
      if (isWizardMode) {
        setIsWizardMode(false);
      }
    } catch (err) {
      console.error('Error saving assistant:', err);
    } finally {
      setIsSavingDb(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(widgetScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Run AI Website Crawl & Knowledge Extraction Simulation
  const handleRunWebsiteScan = () => {
    const url = crawlerUrl.trim() || websiteUrl.trim();
    if (!url) return;

    setIsScanning(true);
    setScanProgress(10);
    setScanStage('Connexion au domaine et analyse du sitemap...');
    setScannedPages([
      { url: `${url}`, title: 'Page d\'accueil (Hero & Proposition de valeur)', status: 'pending' },
      { url: `${url}/services`, title: 'Catalogue des Services & Offres', status: 'pending' },
      { url: `${url}/tarifs`, title: 'Grille tarifaire & Modalités de paiement', status: 'pending' },
      { url: `${url}/faq`, title: 'Questions fréquentes & Délais', status: 'pending' },
      { url: `${url}/contact`, title: 'Coordonnées, Horaires & WhatsApp', status: 'pending' },
    ]);

    setTimeout(() => {
      setScanProgress(35);
      setScanStage('Extraction sémantique du texte et des offres...');
      setScannedPages(prev => prev.map((p, idx) => idx === 0 ? { ...p, status: 'done' } : p));
    }, 1200);

    setTimeout(() => {
      setScanProgress(65);
      setScanStage('Synthèse des questions/réponses et règles de réponses...');
      setScannedPages(prev => prev.map((p, idx) => idx <= 2 ? { ...p, status: 'done' } : p));
    }, 2400);

    setTimeout(() => {
      setScanProgress(100);
      setScanStage('Analyse terminée avec succès !');
      setScannedPages(prev => prev.map(p => ({ ...p, status: 'done' })));
      setIsScanning(false);

      const domainName = url.replace(/^https?:\/\//, '').split('/')[0];
      setScanResultKnowledge({
        summary: `Site web analysé (${domainName}) : Spécialiste dans le domaine avec offre multi-services et support client réactif.`,
        servicesDetected: [
          'Prestation de services clés en main & accompagnement',
          'Intervention rapide sous 24h/48h',
          'Tarification transparente et devis personnalisé'
        ],
        faqGenerated: [
          { q: `Comment prendre contact avec l'équipe de ${businessName || domainName} ?`, a: `Vous pouvez nous contacter directement par ce chat, par email, ou via notre ligne WhatsApp pour un rappel immédiat.` },
          { q: 'Quels sont les délais habituels de traitement ?', a: 'Nos équipes traitent chaque demande sous un délai moyen de 24 heures ouvrées.' },
          { q: 'Puis-je obtenir un devis avant de m\'engager ?', a: 'Absolument, chaque proposition commence par un diagnostic et un devis 100% gratuit et sans engagement.' }
        ],
        contactInfo: 'WhatsApp & Formulaire en ligne disponibles 7j/7.'
      });
    }, 3600);
  };

  const handleApplyScannedKnowledge = () => {
    if (!scanResultKnowledge) return;
    
    // Append generated FAQs to existing FAQ
    const newFaqEntries = scanResultKnowledge.faqGenerated
      .map(item => `Q : ${item.q}\nR : ${item.a}`)
      .join('\n\n');
    
    setFaqText(prev => prev ? `${prev}\n\n${newFaqEntries}` : newFaqEntries);
    setWebsiteUrl(crawlerUrl);
    setBusinessDescription(prev => prev ? `${prev}\n${scanResultKnowledge.summary}` : scanResultKnowledge.summary);
    
    handleSaveToDatabase();
    setActiveTab('knowledge');
  };

  // Chat Simulator logic
  const handleSendMessage = () => {
    if (!inputMessage.trim() || isBotTyping) return;
    const userText = inputMessage.trim();
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMessages(prev => [...prev, { sender: 'user', text: userText, time }]);
    setInputMessage('');
    setIsBotTyping(true);

    setTimeout(() => {
      let botReply = `Merci pour votre message concernant ${businessName || 'notre service'}. `;
      const lower = userText.toLowerCase();

      if (lower.includes('prix') || lower.includes('tarif') || lower.includes('combien') || lower.includes('da') || lower.includes('coût')) {
        botReply = `Nos tarifs débutent à partir de 4 500 DA/mois pour la formule Starter et 9 800 DA/mois pour la formule Pro avec support 24/7. Souhaitez-vous un devis sur-mesure pour votre structure ?`;
      } else if (lower.includes('délai') || lower.includes('temps') || lower.includes('quand') || lower.includes('rapidité')) {
        botReply = `Nous intervenons très rapidement, généralement sous 24h à 48h ouvrées. Avez-vous une date limite particulière ?`;
      } else if (lower.includes('whatsapp') || lower.includes('humain') || lower.includes('téléphone') || lower.includes('conseiller') || lower.includes('parler')) {
        botReply = `Vous pouvez échanger directement avec notre conseiller sur WhatsApp au ${whatsappEscalation || '+213 550 12 34 56'}. Je peux également lui transmettre vos coordonnées !`;
      } else if (lower.includes('salam') || lower.includes('labas') || lower.includes('wach') || lower.includes('merhba')) {
        botReply = `Marhaban bik ! Labas alhamdoulillah. Kifech ne9der n3awnek lyoum pour ${businessName || 'notre service'} ?`;
      } else {
        botReply += `D'après notre base de connaissances, nous serons ravis de vous accompagner. Souhaitez-vous que nous vous contactions par WhatsApp (${whatsappEscalation || '+213 550 12 34 56'}) ou préférez-vous recevoir un devis par email ?`;
      }

      setMessages(prev => [...prev, {
        sender: 'bot',
        text: botReply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
      setIsBotTyping(false);
    }, 700);
  };

  // Loading spinner during Firebase auth check
  if (authLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3 text-neutral-300">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
        <span className="text-sm font-medium">Vérification de la session en cours…</span>
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: AUTHENTICATION SCREEN (LOGIN & SIGN UP)
  // =========================================================================
  if (!user) {
    return (
      <div className="relative pt-24 sm:pt-32 pb-20 px-4 sm:px-6 max-w-4xl mx-auto w-full">
        {/* Header Badge & Title */}
        <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold backdrop-blur-xl mb-4 shadow-lg shadow-purple-950/30">
            <Lock className="w-3.5 h-3.5 text-purple-400" />
            <span>Espace Sécurisé · Connexion Automatique</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-display tracking-tight text-neutral-100 mb-3 leading-tight">
            {authMode === 'login' ? 'Connexion à votre espace' : 'Créer votre compte'}
          </h1>

          <p className="text-sm sm:text-base text-neutral-300 leading-relaxed max-w-xl mx-auto">
            {authMode === 'login' 
              ? 'Connectez-vous pour accéder à votre interface de contrôle, gérer votre base de connaissances et analyser votre site.'
              : 'Inscrivez-vous pour configurer l’assistant intelligent de votre site web et activer l’analyse automatique.'}
          </p>
        </div>

        {/* Auth Card Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column: Form */}
          <div className="lg:col-span-7 rounded-2xl sm:rounded-3xl bg-neutral-950/50 border border-white/15 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl shadow-purple-950/50 flex flex-col justify-between">
            <div>
              {/* Google 1-Click Login Button - Optimized Display & Senior Design */}
              <button
                type="button"
                id="google-signin-btn"
                onClick={handleGoogleLogin}
                disabled={isSubmittingAuth}
                className="w-full mb-5 py-3 px-4 rounded-xl bg-white text-neutral-900 font-semibold text-sm shadow-md hover:bg-neutral-100 active:scale-[0.99] transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
              >
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.02 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
                <span className="font-semibold text-sm text-neutral-900 tracking-tight whitespace-nowrap select-none">
                  Continuer avec Google (1-Clic)
                </span>
              </button>

              {/* Clean single-line Divider */}
              <div className="flex items-center my-5">
                <div className="flex-grow border-t border-white/10"></div>
                <span className="flex-shrink-0 px-3.5 text-[11px] font-medium text-neutral-400 uppercase tracking-wider whitespace-nowrap select-none">
                  ou par email
                </span>
                <div className="flex-grow border-t border-white/10"></div>
              </div>

              {/* Tab Switcher: Se connecter d'abord / Créer un compte */}
              <div className="grid grid-cols-2 p-1 bg-neutral-900/80 rounded-xl border border-white/10 mb-5">
                <button
                  type="button"
                  id="tab-login-btn"
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
                  Se connecter
                </button>
                <button
                  type="button"
                  id="tab-signup-btn"
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
                  Créer un compte
                </button>
              </div>

              {/* Error Message */}
              {authError && (
                <div className="p-3 mb-4 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              {/* Form Inputs */}
              <form onSubmit={handleAuthSubmit} className="space-y-3.5">
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
                        Nom de votre entreprise *
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
                    <span>Mot de passe {authMode === 'signup' ? '*' : ''} (min. 6 caractères)</span>
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

                {/* Submit button: Clean 'Se connecter' without 'accéder au formulaire' */}
                <button
                  type="submit"
                  id="auth-submit-btn"
                  disabled={isSubmittingAuth}
                  className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 text-white font-bold text-xs sm:text-sm shadow-xl shadow-purple-600/35 hover:shadow-purple-600/50 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingAuth ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>
                    {authMode === 'login' ? 'Se connecter' : 'Créer mon compte & Configurer mon IA'}
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
                {authMode === 'login' ? 'Créer un compte' : 'Se connecter'}
              </button>
            </div>
          </div>

          {/* Right Column: Benefits & Trust Details */}
          <div className="lg:col-span-5 rounded-2xl sm:rounded-3xl bg-neutral-950/30 border border-white/10 backdrop-blur-xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div>
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 mb-4">
                <Database className="w-5 h-5" />
              </div>

              <h3 className="text-lg font-bold font-display text-neutral-100 mb-2">
                Sauvegarde & Analyse Automatique
              </h3>
              <p className="text-xs text-neutral-300 leading-relaxed mb-6">
                Connectez votre compte pour piloter l'assistant de votre site web, scanner vos pages et synchroniser votre base de connaissances en direct.
              </p>

              <div className="space-y-3.5">
                {[
                  'Analyse automatique du site web & extraction des connaissances',
                  'Base de connaissances synchronisée en temps réel dans Firestore',
                  'Simulateur de test interactif en direct',
                  'Code d’intégration instantané en 1 ligne',
                  'Gestion multilingue (Français, Darija, Anglais, Arabe)',
                  'Mises à jour sans réinstaller le script'
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
              <span>Base Firestore certifiée & synchronisée en temps réel.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: LOGGED-IN ASSISTANT CONTROL CENTER & AI KNOWLEDGE DASHBOARD
  // =========================================================================
  return (
    <div className="relative pt-24 sm:pt-32 pb-20 px-4 sm:px-6 max-w-6xl mx-auto w-full">
      {/* Top Status & Control Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-neutral-950/70 border border-purple-500/30 backdrop-blur-xl mb-8 shadow-xl shadow-purple-950/30">
        <div className="flex items-center gap-3.5 w-full md:w-auto">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600 via-purple-500 to-indigo-600 border border-purple-400/40 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-purple-600/30 shrink-0">
            {businessName?.[0]?.toUpperCase() || profile?.displayName?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-neutral-100">
                {businessName || profile?.companyName || 'Mon Assistant IA'}
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                En ligne · Firestore Sync
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              ID Widget : <span className="font-mono text-purple-300">{widgetId || 'asst_live'}</span> · {user.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end flex-wrap">
          {savedDbSuccess && (
            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center gap-1.5 animate-in fade-in">
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Modifications sauvegardées !</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleSaveToDatabase}
            disabled={isSavingDb}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-600/30 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            {isSavingDb ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
            <span>Enregistrer en Base</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="px-3.5 py-2 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </div>

      {/* Main Navigation Tabs of the Assistant Dashboard */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6 border-b border-white/10 scrollbar-none">
        {[
          { id: 'crawler', label: '🌐 Analyse & Scan IA de votre Site', icon: Globe },
          { id: 'knowledge', label: '🧠 Base de Connaissances & FAQ', icon: Database },
          { id: 'simulator', label: '💬 Simulateur de Chat IA en Direct', icon: MessageSquare },
          { id: 'embed', label: '⚡ Code d\'Intégration & Widget', icon: Code2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-purple-600/30 text-purple-200 border border-purple-400/50 shadow-md shadow-purple-950/40'
                  : 'bg-neutral-950/40 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60 border border-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: WEBSITE AI CRAWLER & AUTO-KNOWLEDGE INGESTION */}
      {activeTab === 'crawler' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-6 sm:p-8 rounded-3xl bg-neutral-950/50 border border-white/15 backdrop-blur-xl shadow-2xl">
            <div className="max-w-2xl mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold mb-3">
                <Globe className="w-3.5 h-3.5 text-purple-400" />
                <span>Auto-Knowledge Crawler IA</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold font-display text-neutral-100 mb-2">
                Laissez l'IA analyser et contrôler les connaissances de votre site
              </h3>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                Entrez simplement l'adresse de votre site web. L'intelligence artificielle explore vos pages, extrait automatiquement vos services, tarifs, horaires et génère la base de connaissances idéale.
              </p>
            </div>

            {/* Input URL Box */}
            <div className="flex flex-col sm:flex-row items-stretch gap-3 mb-6">
              <div className="relative flex-1">
                <Globe className="w-4 h-4 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={crawlerUrl}
                  onChange={(e) => setCrawlerUrl(e.target.value)}
                  placeholder="https://votre-site-web.com"
                  className="w-full bg-neutral-900/80 border border-white/15 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 shadow-inner"
                />
              </div>
              <button
                type="button"
                onClick={handleRunWebsiteScan}
                disabled={isScanning || (!crawlerUrl && !websiteUrl)}
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 text-white font-bold text-xs sm:text-sm shadow-xl shadow-purple-600/35 hover:shadow-purple-600/50 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyse du site en cours…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Lancer l'analyse IA du site</span>
                  </>
                )}
              </button>
            </div>

            {/* Scanning Progress Bar & Stages */}
            {isScanning && (
              <div className="p-5 rounded-2xl bg-neutral-900/70 border border-purple-500/30 space-y-3 mb-6 animate-in fade-in">
                <div className="flex items-center justify-between text-xs text-neutral-200">
                  <span className="font-semibold flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                    {scanStage}
                  </span>
                  <span className="font-mono text-purple-300 font-bold">{scanProgress}%</span>
                </div>
                <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full transition-all duration-300"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Scanned Pages List */}
            {scannedPages.length > 0 && (
              <div className="space-y-4 mb-6">
                <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-purple-400" />
                  <span>Pages explorées & extraites</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {scannedPages.map((page, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-neutral-900/40 border border-white/10 flex items-center justify-between text-xs">
                      <div className="truncate mr-2">
                        <span className="block font-semibold text-neutral-200 truncate">{page.title}</span>
                        <span className="text-[11px] text-neutral-400 font-mono truncate">{page.url}</span>
                      </div>
                      {page.status === 'done' ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold shrink-0">
                          Extrait
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 text-[10px] font-bold shrink-0 animate-pulse">
                          En cours…
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Result Extracted Knowledge */}
            {scanResultKnowledge && (
              <div className="p-6 rounded-2xl bg-purple-950/20 border border-purple-500/40 space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Connaissances extraites prêtes à être injectées</span>
                  </h4>
                  <button
                    type="button"
                    onClick={handleApplyScannedKnowledge}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 hover:scale-[1.02] transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Appliquer et Sauvegarder dans l'IA</span>
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-neutral-900/80 border border-white/10 text-xs text-neutral-300 space-y-2">
                  <p className="font-semibold text-purple-300">{scanResultKnowledge.summary}</p>
                  <div>
                    <span className="font-bold text-neutral-200 block mb-1">Services clés détectés :</span>
                    <ul className="list-disc list-inside space-y-0.5 text-neutral-400">
                      {scanResultKnowledge.servicesDetected.map((srv, i) => (
                        <li key={i}>{srv}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="pt-2 border-t border-white/10">
                    <span className="font-bold text-neutral-200 block mb-1">FAQ générée automatiquement ({scanResultKnowledge.faqGenerated.length} questions) :</span>
                    <div className="space-y-2">
                      {scanResultKnowledge.faqGenerated.map((item, i) => (
                        <div key={i} className="bg-neutral-950/60 p-2.5 rounded-lg border border-white/5">
                          <strong className="text-neutral-200 block">Q: {item.q}</strong>
                          <span className="text-neutral-400 block mt-0.5">R: {item.a}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: KNOWLEDGE BASE & FAQ EDITOR */}
      {activeTab === 'knowledge' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-6 sm:p-8 rounded-3xl bg-neutral-950/50 border border-white/15 backdrop-blur-xl shadow-2xl space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-xl font-bold font-display text-neutral-100">
                  Base de Connaissances & Règles de Réponses
                </h3>
                <p className="text-xs text-neutral-400">
                  Modifiez les réponses types, la grille tarifaire et les consignes strictes de votre assistant.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveToDatabase}
                disabled={isSavingDb}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-600/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSavingDb ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                <span>Sauvegarder en Firestore</span>
              </button>
            </div>

            {/* General Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-200 mb-1.5">
                  Nom de l'entreprise ou du projet
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Ex: Studio Alpha"
                  className="w-full bg-neutral-900/60 border border-white/10 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-200 mb-1.5">
                  Lien du site internet
                </label>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => {
                    setWebsiteUrl(e.target.value);
                    setCrawlerUrl(e.target.value);
                  }}
                  placeholder="https://monsite.com"
                  className="w-full bg-neutral-900/60 border border-white/10 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* FAQ Text */}
            <div>
              <label className="block text-xs font-semibold text-neutral-200 mb-1.5 flex items-center justify-between">
                <span>Questions Fréquentes (FAQ) - Connaissances Réelles</span>
                <span className="text-[11px] text-neutral-400">Format Q / R</span>
              </label>
              <textarea
                rows={6}
                value={faqText}
                onChange={(e) => setFaqText(e.target.value)}
                placeholder="Q : ...&#10;R : ..."
                className="w-full bg-neutral-900/70 border border-white/10 rounded-xl p-3.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 font-mono resize-none"
              />
            </div>

            {/* Pricing & Services */}
            <div>
              <label className="block text-xs font-semibold text-neutral-200 mb-1.5">
                Grille tarifaire, forfaits & modalités
              </label>
              <textarea
                rows={3}
                value={pricingServicesText}
                onChange={(e) => setPricingServicesText(e.target.value)}
                placeholder="Ex: Formule Starter à 4 500 DA..."
                className="w-full bg-neutral-900/70 border border-white/10 rounded-xl p-3.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 resize-none"
              />
            </div>

            {/* Special Instructions */}
            <div>
              <label className="block text-xs font-semibold text-neutral-200 mb-1.5">
                Consignes strictes & Interdictions
              </label>
              <textarea
                rows={3}
                value={specialRulesText}
                onChange={(e) => setSpecialRulesText(e.target.value)}
                placeholder="Ex: Ne pas inventer de prix non listés..."
                className="w-full bg-neutral-900/70 border border-white/10 rounded-xl p-3.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 resize-none"
              />
            </div>

            {/* Tone & WhatsApp escalation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-neutral-200 mb-1.5">
                  Ton de communication
                </label>
                <select
                  value={assistantTone}
                  onChange={(e) => setAssistantTone(e.target.value)}
                  className="w-full bg-neutral-900/70 border border-white/10 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-neutral-100 focus:outline-none focus:border-purple-500"
                >
                  <option value="professionnel">Professionnel & Courtois</option>
                  <option value="chaleureux">Chaleureux & Commercial</option>
                  <option value="technique">Technique & Précis</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-200 mb-1.5">
                  Numéro WhatsApp pour transfert humain
                </label>
                <input
                  type="text"
                  value={whatsappEscalation}
                  onChange={(e) => setWhatsappEscalation(e.target.value)}
                  placeholder="+213 550 12 34 56"
                  className="w-full bg-neutral-900/70 border border-white/10 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LIVE ASSISTANT TEST SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-6 sm:p-8 rounded-3xl bg-neutral-950/50 border border-white/15 backdrop-blur-xl shadow-2xl">
            <div className="max-w-xl mb-6">
              <h3 className="text-xl font-bold font-display text-neutral-100 mb-1">
                Simulateur de Test en Direct
              </h3>
              <p className="text-xs sm:text-sm text-neutral-400">
                Testez les réponses de votre assistant telles que vos clients les verront sur votre site.
              </p>
            </div>

            {/* Chat Window Frame */}
            <div className="max-w-xl mx-auto rounded-2xl bg-neutral-900/90 border border-white/15 shadow-2xl overflow-hidden flex flex-col h-[480px]">
              {/* Chat Header */}
              <div className="p-3.5 bg-neutral-950/80 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-neutral-100">
                      {businessName || 'Assistant IA'}
                    </span>
                    <span className="block text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      En ligne 24h/24
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-neutral-400 px-2 py-0.5 rounded-md bg-neutral-800 border border-white/10">
                  Mode Simulation
                </span>
              </div>

              {/* Chat Messages Body */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl p-3.5 leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-purple-600 text-white rounded-br-none shadow-md shadow-purple-600/30'
                          : 'bg-neutral-800/90 text-neutral-100 rounded-bl-none border border-white/10'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-neutral-400 mt-1 px-1">{msg.time}</span>
                  </div>
                ))}

                {isBotTyping && (
                  <div className="flex items-center gap-1.5 p-3 rounded-2xl bg-neutral-800/80 rounded-bl-none border border-white/10 w-fit">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce"></span>
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                )}
              </div>

              {/* Chat Input Bar */}
              <div className="p-3 bg-neutral-950/80 border-t border-white/10 flex items-center gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Posez une question (ex: Quels sont vos tarifs ? Délais ?)"
                  className="flex-1 bg-neutral-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim()}
                  className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-all cursor-pointer disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: EMBED SCRIPT & INTEGRATION */}
      {activeTab === 'embed' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-6 sm:p-8 rounded-3xl bg-neutral-950/50 border border-white/15 backdrop-blur-xl shadow-2xl space-y-6">
            <div className="max-w-xl">
              <h3 className="text-xl font-bold font-display text-neutral-100 mb-1">
                Code d'Intégration Universel
              </h3>
              <p className="text-xs sm:text-sm text-neutral-300">
                Collez simplement ce script avant la fermeture de la balise <code className="text-purple-300 font-mono">&lt;/body&gt;</code> de votre site web.
              </p>
            </div>

            {/* Script Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-300">
                <span className="font-semibold flex items-center gap-1.5">
                  <Code2 className="w-4 h-4 text-purple-400" />
                  Script CDN JawebFlow :
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 text-xs font-semibold transition-all cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied ? 'Copié dans le presse-papier !' : 'Copier le script'}</span>
                </button>
              </div>

              <div className="relative rounded-2xl bg-neutral-950/90 border border-purple-500/30 p-4 font-mono text-xs text-purple-200 overflow-x-auto shadow-inner">
                <pre>{widgetScript}</pre>
              </div>
            </div>

            {/* Compatibility Grid */}
            <div className="pt-4 border-t border-white/10">
              <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider mb-3">
                100% Compatible avec toutes les plateformes
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {['WordPress & WooCommerce', 'Shopify & Dropizi', 'Webflow & Framer', 'HTML5 / React / Next.js'].map((platform, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-neutral-900/50 border border-white/10 flex items-center gap-2 text-neutral-200">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{platform}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Bot,
  Globe,
  Database,
  MessageSquare,
  BarChart3,
  Store,
  Code2,
  Settings,
  Users,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Zap,
  PhoneCall,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Check,
  Copy,
  Send,
  Loader2,
  FileText,
  LogOut,
  HelpCircle,
  Clock,
  ChevronRight,
  Palette,
  Save,
  User,
  Menu,
  X,
  AlertCircle,
  Truck,
  DollarSign,
  Phone,
  Search,
  Target,
  Filter,
  TrendingUp,
  CreditCard,
  Crown,
  Download,
  Building2,
  CheckCircle,
  ArrowLeft,
  Smartphone,
  Monitor,
  Instagram,
  Lock,
  Shield,
  BrainCircuit,
  SlidersHorizontal,
  Activity,
  ChevronDown,
  Share2,
  ShoppingCart
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { saveAssistantToDatabase, getUserAssistants, WidgetCustomization, isUserAdmin, supabase, updateAssistantPlan } from '../lib/supabase';
import { WidgetCustomizer } from './WidgetCustomizer';
import { KnowledgeNotesManager } from './KnowledgeNotesManager';
import { AccountProfileView } from './AccountProfileView';
import { CheckoutWizard } from './CheckoutWizard';
import { InstagramIntegration } from './InstagramIntegration';
import { InstagramAutomations } from './InstagramAutomations';
import { CopilotChat, CopilotLauncher } from './CopilotChat';
import { StatCard } from './dashboard/StatCard';
import type { CopilotSection } from './CopilotChat';
import type { CopilotStatePatch } from '../lib/copilot-api';
import { InsightsDashboard } from './InsightsDashboard';
import { LockedFeatureGate } from './LockedFeatureGate';
import { SiteInstallWizard } from './dashboard/SiteInstallWizard';
import { KnowledgeNote, PaymentPlanId, InvoiceRecord } from '../types';

export type DashboardSectionId = 'overview' | 'summary' | 'crawler' | 'knowledge' | 'behavior' | 'widget' | 'simulator' | 'learning' | 'leads' | 'orders' | 'integration' | 'instagram' | 'automations' | 'settings' | 'billing';

type LeadOrder = {
  id: string;
  reference: string;
  status: string;
  channel: string;
  summary: string;
  customerName: string;
  phone: string;
  city: string;
  deliveryAddress?: string;
  totalAmount: number | null;
  createdAt: string;
  updatedAt: string;
  cancellationReason?: string;
  changeHistory?: Array<{ type: string; details?: string; reason?: string; confirmedAt?: string }>;
};

/**
 * Menu de l'espace client.
 * Règle : un libellé = une action concrète pour le commerçant.
 * On évite volontairement le vocabulaire technique (crawler, widget, webhook,
 * simulateur, CRM, API) qui perdait les utilisateurs non techniques.
 */
type NavItem = { id: DashboardSectionId; label: string; icon: React.ComponentType<{ className?: string }>; pro?: boolean };

/**
 * UNE SEULE plateforme, entrées de menu simples :
 *   Accueil · Résumé · Mon assistant · Tester · Canaux · Clients · Commandes
 * « Mon assistant » et « Canaux » regroupent plusieurs écrans, affichés en petits onglets.
 */
const SECTION_GROUPS: Record<string, { title: string; tabs: Array<{ id: DashboardSectionId; label: string }> }> = {
  assistant: {
    title: 'Mon assistant',
    tabs: [
      { id: 'knowledge', label: 'Mes informations' },
      { id: 'crawler', label: 'Mon site web' },
      { id: 'behavior', label: 'Comportement' },
      { id: 'widget', label: 'Apparence' },
      { id: 'learning', label: 'Apprentissage' },
    ],
  },
  channels: {
    title: 'Canaux',
    tabs: [
      { id: 'instagram', label: 'Instagram' },
      { id: 'integration', label: 'Mon site' },
      { id: 'automations', label: 'Automatisations' },
    ],
  },
};

const groupOf = (id: DashboardSectionId): string | null =>
  Object.keys(SECTION_GROUPS).find((g) => SECTION_GROUPS[g].tabs.some((t) => t.id === id)) || null;

const menuGroupOf = (id: DashboardSectionId): string | null => groupOf(id) || (id === 'leads' ? 'clients' : null);

const NAV_ITEMS: Array<NavItem & { group?: string }> = [
  { id: 'overview', label: 'Accueil', icon: LayoutDashboard },
  { id: 'summary', label: 'Résumé', icon: TrendingUp },
  { id: 'knowledge', label: 'Mon assistant', icon: Bot, group: 'assistant' },
  { id: 'simulator', label: 'Tester', icon: MessageSquare, pro: true },
  { id: 'integration', label: 'Canaux', icon: Share2, group: 'channels' },
  { id: 'leads', label: 'Clients', icon: BarChart3, pro: true, group: 'clients' },
  { id: 'orders', label: 'Commandes', icon: ShoppingCart, pro: true },
];

interface DashboardPlatformProps {
  initialSection?: string;
  onNavigate?: (page: string, subSection?: string) => void;
}

const DEFAULT_INITIAL_NOTES = (_bizName: string): KnowledgeNote[] => [];

function parseVisitorTags(userAgent: string, language: string): string[] {
  const tags: string[] = [];
  if (!userAgent) return tags;
  
  // OS
  if (/windows/i.test(userAgent)) tags.push('🖥️ Windows');
  else if (/macintosh|mac os x/i.test(userAgent)) tags.push('🍎 macOS');
  else if (/iphone|ipad|ipod/i.test(userAgent)) tags.push('📱 iOS');
  else if (/android/i.test(userAgent)) tags.push('🤖 Android');
  else if (/linux/i.test(userAgent)) tags.push('🐧 Linux');

  // Browser
  if (/edg/i.test(userAgent)) tags.push('🌊 Edge');
  else if (/chrome|crios/i.test(userAgent)) tags.push('🌐 Chrome');
  else if (/safari/i.test(userAgent) && !/chrome|crios/i.test(userAgent)) tags.push('🧭 Safari');
  else if (/firefox|fxios/i.test(userAgent)) tags.push('🦊 Firefox');

  // Device type
  if (/mobile/i.test(userAgent) && !/ipad|tablet/i.test(userAgent)) tags.push('📱 Mobile');
  else if (/ipad|tablet/i.test(userAgent)) tags.push('💻 Tablette');
  else tags.push('💻 Desktop');

  // Language
  if (language) {
    const lang = language.split('-')[0].toUpperCase();
    if (lang) tags.push(`🌍 ${lang}`);
  }

  return Array.from(new Set(tags)).slice(0, 4);
}

export const DashboardPlatform: React.FC<DashboardPlatformProps> = ({ initialSection = 'overview', onNavigate }) => {
  const { user, profile, logout } = useAuth();

  // Navigation sections
  const [currentSection, setCurrentSection] = useState<DashboardSectionId>(
    (initialSection as DashboardSectionId) || 'overview'
  );
  const [openGroup, setOpenGroup] = useState<string | null>(() => menuGroupOf(initialSection as DashboardSectionId));
  const [insightsTab, setInsightsTab] = useState<'analytics' | 'prospects'>('analytics');
  // Venue des Automatisations : l'onglet Instagram met en avant « Autoriser les commentaires ».
  const [instagramFocus, setInstagramFocus] = useState<'comments' | null>(null);

  // Mobile sidebar drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Menu du profil (en haut à droite) : Mon profil, Se déconnecter
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  // Sync when initialSection prop changes
  useEffect(() => {
    if (initialSection && initialSection !== currentSection) {
      setCurrentSection(initialSection as DashboardSectionId);
      setOpenGroup(menuGroupOf(initialSection as DashboardSectionId));
    }
  }, [initialSection]);

  useEffect(() => {
    const el = document.getElementById(`nav-${currentSection}`) as (HTMLElement & { scrollIntoView?: (o?: object) => void }) | null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [currentSection]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) setAccountMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAccountMenuOpen(false);
        document.getElementById('account-menu-button')?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountMenuOpen]);

  const handleSectionChange = (section: DashboardSectionId) => {
    setCurrentSection(section);
    setOpenGroup(menuGroupOf(section));
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
    if (onNavigate) {
      onNavigate('create-assistant', section);
    } else {
      const targetUrl = section === 'overview' ? '/dashboard' : `/dashboard/${section}`;
      if (window.location.pathname !== targetUrl) {
        window.history.pushState({ page: 'create-assistant', section }, '', targetUrl);
      }
    }
  };

  // Assistant Configuration State
  const [assistantId, setAssistantId] = useState<string>('');
  const [assistantLoaded, setAssistantLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // « Parler à mon IA »
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotUnread, setCopilotUnread] = useState(false);
  const copilotOpenRef = useRef(false);
  // Accueil = chat plein écran : l'élément où il se dessine (une seule instance du chat, déplacée selon l'écran).
  const [copilotHost, setCopilotHost] = useState<HTMLElement | null>(null);
  const currentSectionRef = useRef<DashboardSectionId>('overview');
  const copilotBusyRef = useRef(false);
  const autosavePendingRef = useRef(false);
  const [autosaveNonce, setAutosaveNonce] = useState(0);
  const handleSaveRef = useRef<((...args: any[]) => Promise<string | undefined>) | null>(null);
  const assistantIdRef = useRef('');
  const assistantLoadedRef = useRef(false);
  // Changent quand l'IA modifie les automatisations / Instagram : l'écran concerné se recharge.
  const [automationsVersion, setAutomationsVersion] = useState(0);
  const [instagramVersion, setInstagramVersion] = useState(0);
  const [widgetId, setWidgetId] = useState<string>('');
  const [businessName, setBusinessName] = useState<string>('');
  const [websiteUrl, setWebsiteUrl] = useState<string>('');
  const [siteType, setSiteType] = useState<string>('');
  const [siteTypeConfidence, setSiteTypeConfidence] = useState<number>(0);
  const [scrapingStrategy, setScrapingStrategy] = useState<string[]>([]);
  const [businessCategory, setBusinessCategory] = useState<string>('Services');
  const [businessDescription, setBusinessDescription] = useState<string>('');
  
  // Structured Knowledge Base Notes
  const [knowledgeNotes, setKnowledgeNotes] = useState<KnowledgeNote[]>(DEFAULT_INITIAL_NOTES(businessName));
  const [faqText, setFaqText] = useState<string>('');
  const [pricingServicesText, setPricingServicesText] = useState<string>('');
  const [specialRulesText, setSpecialRulesText] = useState<string>('');
  const [behavior, setBehavior] = useState<{ language: string; length: string; websiteMentions: string; stopWhenConfused: boolean; stopCommand: boolean; customRules: string } & { autoInsights?: string }>({
    language: 'auto',
    length: 'normal',
    websiteMentions: 'auto',
    stopWhenConfused: true,
    stopCommand: true,
    customRules: '',
  });
  const [behaviorSaveMessage, setBehaviorSaveMessage] = useState<'success' | 'error' | null>(null);
  const updateBehavior = (patch: Partial<typeof behavior>) => {
    setBehavior((current) => ({ ...current, ...patch }));
    setBehaviorSaveMessage(null);
  };

  // Widget Customizer State
  const [widgetConfig, setWidgetConfig] = useState<WidgetCustomization>({
    iconType: 'sparkles',
    customLogoUrl: '',
    primaryColor: '#9333ea',
    gradientSecondary: '#6366f1',
    useGradient: true,
    position: 'bottom-right',
    shape: 'circle',
    size: 'standard',
    showTeaser: true,
    teaserText: 'Une question ? Discutons en direct 👋',
    onlineBadge: true,
    headerTitle: '',
    headerSubtitle: 'En ligne · Réponse immédiate',
    welcomeMessage: 'Bonjour ! 👋 Comment puis-je vous aider aujourd\'hui ?',
    themeMode: 'light',
    showBranding: true,
  });

  const handleUpdateWidgetConfig = (updated: Partial<WidgetCustomization>) => {
    setWidgetConfig(prev => ({ ...prev, ...updated }));
  };

  const [showLeadTech, setShowLeadTech] = useState(false);
  const [assistantTone, setAssistantTone] = useState<string>('professionnel');
  const [languages, setLanguages] = useState<{ fr: boolean; darija: boolean; en: boolean; ar: boolean }>({
    fr: true,
    darija: true,
    en: true,
    ar: true
  });
  const [autoLeadCapture, setAutoLeadCapture] = useState<boolean>(true);
  const [whatsappEscalation, setWhatsappEscalation] = useState<string>('');
  // Informations officielles structurées (toujours citées telles quelles par l'IA)
  const [businessInfo, setBusinessInfo] = useState<{ address?: string; phone?: string; hours?: string; closedDays?: string }>({});
  // "Tout passe par mon site" : l'IA cherche les produits sur le site et envoie les liens
  const [siteShopping, setSiteShopping] = useState<boolean>(false);
  // Boucle d'apprentissage : questions sans réponse signalées par l'IA / les 👎
  const [learningQuestions, setLearningQuestions] = useState<any[]>([]);
  const [learningLoading, setLearningLoading] = useState(false);
  const [learningDrafts, setLearningDrafts] = useState<Record<string, string>>({});
  const [learningSaving, setLearningSaving] = useState<string | null>(null);
  const [learningNotice, setLearningNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string>('');

  // Billing & Plan State
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [activePlan, setActivePlan] = useState<PaymentPlanId>('free');
  const [billingNotification, setBillingNotification] = useState<string | null>(null);
  const isPlanGated = activePlan === 'free';

  // PLAN FIXÉ PAR L'ADMIN (colonne users.plan) : fait foi pour débloquer le
  // compte, même quand le client n'a pas encore d'assistant. Un plan payant
  // présent sur l'assistant lui-même reste prioritaire (chargé plus haut).
  useEffect(() => {
    const p = String(profile?.plan || '').toLowerCase();
    if (p === 'basic' || p === 'pro' || p === 'enterprise') {
      setActivePlan(prev => (prev === 'free' ? (p as PaymentPlanId) : prev));
    }
  }, [profile?.plan]);

  // Cohérence avec la page Tarifs : le plan Gratuit garde l'accès à TOUTE la
  // configuration (scan, apparence, test, Instagram, statistiques) — seules
  // les RÉPONSES de l'IA sont bloquées, côté serveur. Plus de pages verrouillées.
  const showLockedGates = false;
  const isFreePlan = activePlan === 'free';
  
  const [billingViewMode, setBillingViewMode] = useState<'overview' | 'checkout'>(() => {
    if (typeof window !== 'undefined' && (window.location.pathname === '/checkout' || window.location.search.includes('plan='))) {
      return 'checkout';
    }
    return 'overview';
  });
  
  const [selectedCheckoutPlan, setSelectedCheckoutPlan] = useState<PaymentPlanId>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const plan = params.get('plan') as PaymentPlanId;
      if (plan && ['free', 'basic', 'pro', 'enterprise'].includes(plan)) return plan;
    }
    return 'free';
  });

  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<'slickpay_dzd' | 'stripe_card' | 'baridimob_ccp'>('slickpay_dzd');
  const [checkoutSlickpayType, setCheckoutSlickpayType] = useState<'edahabia' | 'cib' | 'baridimob'>('edahabia');
  const [checkoutStep, setCheckoutStep] = useState<number>(1);

  // Checkout Form State
  const [checkoutName, setCheckoutName] = useState(user?.displayName || '');
  const [checkoutEmail, setCheckoutEmail] = useState(user?.email || '');
  const [checkoutCompany, setCheckoutCompany] = useState(profile?.companyName || '');
  const [checkoutPhone, setCheckoutPhone] = useState('');
  const [checkoutCardNumber, setCheckoutCardNumber] = useState('');
  const [checkoutCardExp, setCheckoutCardExp] = useState('');
  const [checkoutCardCvc, setCheckoutCardCvc] = useState('');
  const [checkoutRipRef, setCheckoutRipRef] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [invoicesList, setInvoicesList] = useState<InvoiceRecord[]>([]);

  // Usage & stats du client (jauge de quota, prospects, renouvellement) — /api/usage
  const [usageInfo, setUsageInfo] = useState<{
    used: number; limit: number | null; prospects: number; openQuestions: number; daysLeft: number | null;
    costUsd?: number; costCap?: number;
  } | null>(null);
  const [emailTestBusy, setEmailTestBusy] = useState(false);
  const [emailTestMsg, setEmailTestMsg] = useState('');

  // Mode MANUEL (SlickPay non configuré, virement, ou plan gratuit) :
  // validation immédiate comme avant l'arrivée du paiement en ligne.
  const finalizeManualPayment = () => {
    setIsProcessingPayment(true);
    setTimeout(() => {
      let amountUsd = selectedCheckoutPlan === 'free' ? 0 : selectedCheckoutPlan === 'basic' ? 29 : selectedCheckoutPlan === 'pro' ? 79 : 199;
      if (billingCycle === 'yearly') {
        amountUsd = Math.round(amountUsd * 0.8 * 12);
      }
      let amountDzd = selectedCheckoutPlan === 'free' ? 0 : selectedCheckoutPlan === 'basic' 
        ? (billingCycle === 'monthly' ? 6850 : 65760) 
        : selectedCheckoutPlan === 'pro' 
          ? (billingCycle === 'monthly' ? 18700 : 179500) 
          : (billingCycle === 'monthly' ? 47100 : 452160);

      const planNameStr = selectedCheckoutPlan === 'free' ? 'Découverte' : selectedCheckoutPlan === 'basic' ? 'Basic' : selectedCheckoutPlan === 'pro' ? 'Pro' : 'Entreprise';
      const paymentMethodStr = checkoutPaymentMethod === 'slickpay_dzd' 
        ? `SlickPay (${checkoutSlickpayType.toUpperCase()})` 
        : checkoutPaymentMethod === 'stripe_card' 
          ? 'Carte Visa/Mastercard' 
          : 'Virement CCP/BaridiMob';

      const newInv: InvoiceRecord = {
        id: `INV-${Math.floor(100000 + Math.random() * 900000)}`,
        date: new Date().toLocaleDateString('fr-FR'),
        planName: planNameStr,
        billingCycle: billingCycle,
        amountUsd: amountUsd,
        amountDzd: amountDzd,
        paymentMethod: paymentMethodStr,
        status: 'paid'
      };

      setActivePlan(selectedCheckoutPlan);
      // Persiste le plan DANS LA BASE immédiatement : sans ça, le blocage IA
      // (qui lit config.plan côté serveur) laissait le client bloqué même
      // après son paiement.
      if (assistantId) {
        const persistPaidPlan = async () => {
          try {
            const sess = await supabase.auth.getSession();
            const token = sess.data?.session?.access_token;
            if (token) {
              await fetch('/api/plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ plan: selectedCheckoutPlan }),
              });
            }
          } catch { /* le filet ci-dessous prend le relais */ }
        };
        persistPaidPlan();
        updateAssistantPlan(assistantId, selectedCheckoutPlan).catch((e) =>
          console.error('[checkout] plan non persisté dans Supabase:', e)
        );
      }
      setInvoicesList(prev => [newInv, ...prev]);
      setIsProcessingPayment(false);
      setBillingNotification(`Abonnement ${planNameStr} activé avec succès ! Quittance N° ${newInv.id} enregistrée.`);
      setBillingViewMode('overview');
    }, 800);
  };

  // PAIEMENT EN LIGNE SLICKPAY : le montant est fixé côté serveur, le client
  // est redirigé vers la page sécurisée SATIM (CIB / EDAHABIA). À son retour,
  // le "webhook" (effet ci-dessous) vérifie le paiement chez SlickPay et
  // active le plan. Si SlickPay n'est pas configuré => mode manuel.
  const handleConfirmPayment = async () => {
    if (selectedCheckoutPlan === 'free' || checkoutPaymentMethod !== 'slickpay_dzd') {
      finalizeManualPayment();
      return;
    }
    setIsProcessingPayment(true);
    try {
      const sess = await supabase.auth.getSession();
      const token = sess.data?.session?.access_token;
      const res = await fetch('/api/slickpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          plan: selectedCheckoutPlan,
          billingCycle,
          cardType: checkoutSlickpayType,
          name: checkoutName,
          phone: checkoutPhone,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && data?.url) {
        // Facture `pending` créée côté serveur ; le webhook la confirmera.
        window.location.href = data.url;
        return;
      }
      console.warn('[checkout] SlickPay indisponible, mode manuel :', data?.error);
      setIsProcessingPayment(false);
      finalizeManualPayment();
    } catch (e) {
      console.error('[checkout] erreur SlickPay :', e);
      setIsProcessingPayment(false);
      finalizeManualPayment();
    }
  };

  // WEBHOOK RETOUR SLICKPAY : dès que le client revient sur le tableau de
  // bord, on demande au serveur de vérifier chez SlickPay chaque facture
  // `pending` (méthode SlickPay) et d'activer le plan si le paiement est
  // confirmé. Idempotent : sans risque de double activation.
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    const verifyPendingSlickPay = async () => {
      try {
        const { data: pend } = await supabase
          .from('invoices')
          .select('id, planName')
          .eq('status', 'pending')
          .ilike('paymentMethod', 'SlickPay%');
        if (!pend?.length || cancelled) return;
        for (const inv of pend) {
          const res = await fetch('/api/webhooks/slickpay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoiceId: inv.id }),
          });
          const data = await res.json().catch(() => ({}));
          if (data?.ok && data?.paid && !cancelled) {
            const planId = String(data.plan || '') as PaymentPlanId;
            if (['basic', 'pro', 'enterprise'].includes(planId)) {
              setActivePlan(planId);
              if (assistantId) {
                updateAssistantPlan(assistantId, planId).catch(() => {});
              }
            }
            setBillingNotification(`Paiement SlickPay confirmé — plan ${inv.planName} activé ! Facture ${inv.id}.`);
            setBillingViewMode('overview');
          }
        }
      } catch { /* silencieux : revérifié à la prochaine visite */ }
    };
    verifyPendingSlickPay();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, assistantId]);

  // Jauge + stats : chargées au départ puis rafraîchies toutes les 2 minutes.
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    const fetchUsage = async () => {
      try {
        const sess = await supabase.auth.getSession();
        const token = sess.data?.session?.access_token;
        if (!token) return;
        const res = await fetch('/api/usage', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => null);
        if (data?.ok && !cancelled) setUsageInfo(data);
      } catch { /* silencieux */ }
    };
    fetchUsage();
    const t = setInterval(fetchUsage, 120000);
    return () => { cancelled = true; clearInterval(t); };
  }, [user?.uid, assistantId, activePlan]);

  const handleSendTestEmail = async () => {
    setEmailTestBusy(true);
    setEmailTestMsg('');
    try {
      const sess = await supabase.auth.getSession();
      const token = sess.data?.session?.access_token;
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json().catch(() => ({}));
      setEmailTestMsg(data?.ok
        ? '✅ Exemple envoyé ! Vérifie ta boîte mail (et les spams).'
        : '⚠️ ' + (data?.error || 'Service email pas encore activé.'));
    } catch {
      setEmailTestMsg('⚠️ Erreur réseau — réessaie.');
    } finally {
      setEmailTestBusy(false);
    }
  };

  // Persistence status
  const [isSavingDb, setIsSavingDb] = useState<boolean>(false);
  const [saveDbError, setSaveDbError] = useState<boolean>(false);

  // Crawler & Scanner state
  const [crawlerUrl, setCrawlerUrl] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scanStage, setScanStage] = useState<string>('');
  const [scannedPages, setScannedPages] = useState<Array<{ url: string; title: string; status: 'done' | 'pending' | 'failed' }>>([]);
  const [scanResultNotes, setScanResultNotes] = useState<KnowledgeNote[] | null>(null);
  const [detectedBusinessMeta, setDetectedBusinessMeta] = useState<{
    businessName?: string;
    businessCategory?: string;
    businessDescription?: string;
    phone?: string;
    email?: string;
    deliveryInfo?: string;
    paymentMethods?: string;
  } | null>(null);
  const [scanSuccessMessage, setScanSuccessMessage] = useState<string | null>(null);

  // Simulator state
  const [messages, setMessages] = useState<Array<{ sender: 'bot' | 'user'; text: string; time: string }>>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isBotTyping, setIsBotTyping] = useState<boolean>(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadFollowUpBusy, setLeadFollowUpBusy] = useState<string | null>(null);
  const [leadFollowUpError, setLeadFollowUpError] = useState<string>('');
  const [orderActionBusy, setOrderActionBusy] = useState<string | null>(null);
  const [orderActionError, setOrderActionError] = useState<string>('');
  const [handoffBusy, setHandoffBusy] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string>('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'nouveau' | 'qualifie'>('all');
  const [hasContactFilter, setHasContactFilter] = useState<boolean>(false);
  const [showExportDetails, setShowExportDetails] = useState<boolean>(false);

  // Real leads captured by the assistant
  const [leadsList, setLeadsList] = useState<Array<{
    id: string;
    name: string;
    phone: string;
    email: string;
    need: string;
    status: 'nouveau' | 'qualifie' | 'converti';
    date: string;
    referer?: string;
    currentPage?: string;
    language?: string;
    timezone?: string;
    screenResolution?: string;
    userAgent?: string;
    messages?: Array<{ sender: 'bot' | 'user'; text: string; timestamp?: string }>;
    timeSpent?: number;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    source?: string;
    channel?: string;
    salesIntentType?: string;
    salesStage?: string;
    followUpStatus?: string;
    followUpAt?: string;
    followUpCompletedAt?: string;
    followUpReason?: string;
    followUpNote?: string;
    nextAction?: string;
    lastInteractionAt?: string;
    sessionId?: string;
    igUserId?: string;
    handoffStatus?: string;
    instagramOrigin?: { caption?: string; permalink?: string; thumbnail?: string; mediaId?: string; type?: string };
    orders?: LeadOrder[];
  }>>([]);

  // Load user data from Firestore on mount
  useEffect(() => {
    if (user) {
      if (profile?.companyName && !businessName) {
        setBusinessName(profile.companyName);
      }
      const loadUserAssistant = async () => {
        try {
          const assistants = await getUserAssistants(user.uid);
          if (assistants.length > 0) {
            const activeId = localStorage.getItem(`jawebflow_active_assistant_${user.uid}`);
            const current = assistants.find(item => item.id === activeId) || assistants[0];
            setAssistantId(current.id || '');
            if (current.id) localStorage.setItem(`jawebflow_active_assistant_${user.uid}`, current.id);
            setWidgetId(current.widgetId || `asst_${Math.random().toString(36).substring(2, 10)}`);
            const asstPlan = String(current.plan || '').toLowerCase();
            if (asstPlan === 'basic' || asstPlan === 'pro' || asstPlan === 'enterprise') {
              setActivePlan(asstPlan as PaymentPlanId);
            }
            if (current.businessName) setBusinessName(current.businessName);
            if (current.websiteUrl) {
              setWebsiteUrl(current.websiteUrl);
              setCrawlerUrl(current.websiteUrl);
            }
            if (current.siteType) setSiteType(current.siteType);
            if (current.siteTypeConfidence) setSiteTypeConfidence(current.siteTypeConfidence);
            if (current.scrapingStrategy) setScrapingStrategy(current.scrapingStrategy);
            if (current.businessCategory) setBusinessCategory(current.businessCategory);
            if (current.businessDescription) setBusinessDescription(current.businessDescription);
            if (current.knowledgeNotes && current.knowledgeNotes.length > 0) {
              setKnowledgeNotes(current.knowledgeNotes);
            }
            if (current.faqText) setFaqText(current.faqText);
            if (current.pricingServicesText) setPricingServicesText(current.pricingServicesText);
            if (current.specialRulesText) setSpecialRulesText(current.specialRulesText);
            if (current.assistantTone) setAssistantTone(current.assistantTone);
            if (current.languages) setLanguages(current.languages);
            if (current.whatsappEscalation) setWhatsappEscalation(current.whatsappEscalation);
            if (current.businessInfo) setBusinessInfo(current.businessInfo);
            setSiteShopping(Boolean(current.siteShopping));
            if (current.webhookUrl) setWebhookUrl(current.webhookUrl);
            if (current.behavior) setBehavior({ language: 'auto', length: 'normal', websiteMentions: 'auto', stopWhenConfused: true, stopCommand: true, customRules: '', ...current.behavior });
            if (current.widgetConfig) {
              setWidgetConfig(prev => ({
                ...prev,
                ...current.widgetConfig,
                headerTitle: current.widgetConfig?.headerTitle || current.businessName || prev.headerTitle
              }));
            }
          } else {
            const newWid = `asst_${Math.random().toString(36).substring(2, 10)}`;
            setWidgetId(newWid);
          }
          setAssistantLoaded(true);
        } catch (e) {
          setAssistantLoaded(true);
          console.warn('Failed to load user assistant:', e);
        }
      };
      loadUserAssistant();
    }
  }, [user, profile]);

  // ------------------------------------------------------------------
  // APPRENTISSAGE IA : questions sans réponse (onglet "Apprentissage IA")
  // ------------------------------------------------------------------
  const fetchLearningQuestions = async () => {
    if (!assistantId) return;
    setLearningLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || null;
      const res = await fetch(`/api/learning?assistantId=${encodeURIComponent(assistantId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) setLearningQuestions((await res.json()).questions || []);
    } catch (e) {
      console.warn('Error fetching learning questions:', e);
    } finally {
      setLearningLoading(false);
    }
  };

  const handleResolveLearning = async (q: any) => {
    const answer = (learningDrafts[q.id] || '').trim();
    if (!answer) {
      setLearningNotice({ ok: false, text: 'Écris la bonne réponse avant de valider.' });
      return;
    }
    setLearningSaving(q.id);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || null;
      const res = await fetch('/api/learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ assistantId, questionId: q.id, answer, title: q.question, question: q.question })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erreur serveur');
      setLearningNotice({ ok: true, text: "✅ Réponse ajoutée à la base de connaissance de l'IA !" });
      setLearningDrafts(prev => ({ ...prev, [q.id]: '' }));
      fetchLearningQuestions();
    } catch (e: any) {
      setLearningNotice({ ok: false, text: 'Erreur : ' + (e?.message || e) });
    } finally {
      setLearningSaving(null);
    }
  };

  useEffect(() => {
    if (currentSection === 'learning') fetchLearningQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSection, assistantId]);

  // Initial welcome message in simulator
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          sender: 'bot',
          text: widgetConfig.welcomeMessage || `Bonjour ! 👋 Je suis l'assistant IA de ${businessName || 'votre entreprise'}. Comment puis-je vous aider aujourd'hui ?`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  }, [businessName, widgetConfig.welcomeMessage]);

  // Load real prospects in real-time from Firestore
  useEffect(() => {
    if (!assistantId) return;

    // La table `prospects` est en RLS service_role uniquement côté Supabase
    // (pas de onSnapshot possible depuis le navigateur) : on fait du polling
    // sur l'endpoint /api/leads toutes les 8s à la place.
    let cancelled = false;

    const fetchLeads = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/leads?assistantId=${encodeURIComponent(assistantId)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok || cancelled) return;
        const { prospects: rows } = await res.json();
        const prospects = (rows || []).map((data: any) => ({
          id: data.id,
          name: data.name || 'Visiteur Anonyme',
          city: data.city || '',
          phone: data.phone || 'Non fourni',
          email: data.email || 'Non fourni',
          need: data.need || (data.status === 'visited' ? 'Visite simple du site' : (data.status === 'opened_bubble' ? 'A ouvert la bulle de chat' : 'En attente de discussion')),
          status: data.status === 'visited' || data.status === 'opened_bubble' ? 'nouveau' : 'qualifie',
          date: data.updatedAt ? new Date(data.updatedAt).toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          }) : 'À l\'instant',
          referer: data.referer || '',
          currentPage: data.currentPage || '',
          userAgent: data.userAgent || '',
          language: data.language || '',
          messages: data.messages || [],
          source: data.source || '',
          channel: data.channel || '',
          salesIntentType: data.salesIntentType || '',
          salesStage: data.salesStage || '',
          followUpStatus: data.followUpStatus || '',
          followUpAt: data.followUpAt || '',
          followUpCompletedAt: data.followUpCompletedAt || '',
          followUpReason: data.followUpReason || '',
          followUpNote: data.followUpNote || '',
          nextAction: data.nextAction || '',
          lastInteractionAt: data.lastInteractionAt || '',
          sessionId: data.sessionId || '',
          igUserId: data.igUserId || '',
          handoffStatus: data.handoffStatus || 'bot',
          instagramOrigin: data.instagramOrigin || null,
          orders: Array.isArray(data.orders) ? data.orders : [],
        }));
        if (!cancelled) setLeadsList(prospects);
      } catch (error) {
        console.warn('Error fetching prospects:', error);
      }
    };

    fetchLeads();
    const interval = setInterval(fetchLeads, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [assistantId]);

  const handleCompleteLeadFollowUp = async (leadId: string) => {
    if (!assistantId || leadFollowUpBusy) return;
    setLeadFollowUpBusy(leadId);
    setLeadFollowUpError('');
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ assistantId, prospectId: leadId, followUpStatus: 'done' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Impossible de mettre à jour le suivi.');
      setLeadsList((current) => current.map((lead) => lead.id === leadId
        ? { ...lead, followUpStatus: 'done', followUpCompletedAt: data.completedAt, nextAction: 'Suivi terminé' }
        : lead));
    } catch (error: any) {
      setLeadFollowUpError(error?.message || 'Erreur réseau. Réessaie.');
    } finally {
      setLeadFollowUpBusy(null);
    }
  };

  const updateOrderStatus = async (prospectId: string, orderId: string, orderStatus: string) => {
    const actionKey = `${prospectId}:${orderId}`;
    if (!assistantId || orderActionBusy) return;
    setOrderActionBusy(actionKey);
    setOrderActionError('');
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ assistantId, prospectId, orderId, orderStatus }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result?.ok) throw new Error(result?.error || 'Impossible de mettre à jour la commande.');
      setLeadsList((current) => current.map((lead) => lead.id === prospectId
        ? { ...lead, orders: (lead.orders || []).map((order) => order.id === orderId ? { ...order, status: orderStatus, updatedAt: result.updatedAt } : order) }
        : lead));
    } catch (error: any) {
      setOrderActionError(error?.message || 'Erreur réseau. Réessaie.');
    } finally {
      setOrderActionBusy(null);
    }
  };

  const setLeadHandoff = async (lead: any, action: 'takeover' | 'resume') => {
    if (!assistantId || handoffBusy) return;
    setHandoffBusy(lead.id);
    setHandoffError('');
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ assistantId, prospectId: lead.id, action }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result?.ok) throw new Error(result?.error || 'Impossible de changer la prise en main.');
      setLeadsList((current) => current.map((item) => item.id === lead.id ? { ...item, handoffStatus: result.handoffStatus } : item));
    } catch (error: any) {
      setHandoffError(error?.message || 'Erreur réseau. Réessaie.');
    } finally {
      setHandoffBusy(null);
    }
  };

  const handleSaveToDatabase = async (rawNotesOverride?: KnowledgeNote[], rawMetadataOverride?: Partial<{ websiteUrl: string; businessName: string; businessCategory: string; businessDescription: string; siteType: string; siteTypeConfidence: number; scrapingStrategy: string[]; businessInfo: { address?: string; phone?: string; hours?: string; closedDays?: string; } }>): Promise<string | undefined> => {
    if (!user) return undefined;
    // 🛡️ Les boutons « Enregistrer » branchés directement (onClick={handleSaveToDatabase}) transmettent
    // l'ÉVÉNEMENT du clic en premier argument. Il était enregistré À LA PLACE des fiches « Mes informations »
    // (la base de connaissances se retrouvait vidée). On n'accepte donc que de vrais tableaux / objets de données.
    const notesOverride = Array.isArray(rawNotesOverride) ? rawNotesOverride : undefined;
    const metadataOverride = rawMetadataOverride && typeof rawMetadataOverride === 'object' && !('nativeEvent' in (rawMetadataOverride as object)) ? rawMetadataOverride : undefined;
    try {
      setIsSavingDb(true);
      const effectiveWidgetId = widgetId || `asst_${Math.random().toString(36).substring(2, 10)}`;
      const savedId = await saveAssistantToDatabase({
        id: assistantId || undefined,
        userId: user.uid,
        plan: activePlan !== 'free' ? activePlan : (profile?.plan || activePlan), // plan payé > plan admin (fiche client) > gratuit
        businessName: (metadataOverride?.businessName ?? businessName).trim() || 'Mon Entreprise',
        websiteUrl: (metadataOverride?.websiteUrl ?? websiteUrl).trim(),
        siteType: metadataOverride?.siteType ?? siteType,
        siteTypeConfidence: metadataOverride?.siteTypeConfidence ?? siteTypeConfidence,
        scrapingStrategy: metadataOverride?.scrapingStrategy ?? scrapingStrategy,
        businessCategory: (metadataOverride?.businessCategory ?? businessCategory) || 'Services',
        businessDescription: (metadataOverride?.businessDescription ?? businessDescription).trim(),
        knowledgeNotes: notesOverride ?? knowledgeNotes,
        faqText: faqText.trim(),
        pricingServicesText: pricingServicesText.trim(),
        specialRulesText: specialRulesText.trim(),
        behavior,
        assistantTone,
        languages,
        autoLeadCapture,
        whatsappEscalation: whatsappEscalation.trim(),
        businessInfo: metadataOverride?.businessInfo ?? businessInfo,
        siteShopping,
        webhookUrl: webhookUrl.trim(),
        widgetId: effectiveWidgetId,
        widgetConfig: {
          ...widgetConfig,
          headerTitle: widgetConfig.headerTitle || businessName.trim() || 'Assistant IA'
        }
      });
      if (savedId) {
        setAssistantId(savedId);
        localStorage.setItem(`jawebflow_active_assistant_${user.uid}`, savedId);
        // Plan effectif immédiat dans l'interface : plan payé choisi > plan admin (fiche client) > gratuit
        const eff = activePlan !== 'free' ? activePlan : String(profile?.plan || '').toLowerCase();
        if (['basic', 'pro', 'enterprise'].includes(eff)) setActivePlan(eff as PaymentPlanId);
      }
      setSaveDbError(false);
      return savedId || undefined;
    } catch (err) {
      console.error('Error saving assistant:', err);
      // Plus d'échec silencieux : le témoin d'enregistrement (en haut à droite) le dit et le garde affiché
      // jusqu'au prochain succès (sinon le marchand croit avoir enregistré).
      setSaveDbError(true);
      return undefined;
    } finally {
      setIsSavingDb(false);
    }
  };

  const handleSaveBehavior = async () => {
    setBehaviorSaveMessage(null);
    const savedId = await handleSaveToDatabase();
    setBehaviorSaveMessage(savedId ? 'success' : 'error');
  };

  // Autosave : les modifications ne doivent pas disparaître si l’utilisateur recharge ou se déconnecte.
  // La sauvegarde utilise TOUJOURS l'état le plus récent (handleSaveRef) et se met en attente pendant
  // que « Mon IA » travaille (sinon elle pourrait écraser ce que l'IA vient d'écrire en base).
  handleSaveRef.current = handleSaveToDatabase;
  useEffect(() => {
    if (!user || !assistantLoaded || !assistantId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    autosavePendingRef.current = true;
    saveTimerRef.current = setTimeout(() => {
      if (copilotBusyRef.current) return; // reprise automatique dès que l'IA a fini (voir handleCopilotBusy)
      autosavePendingRef.current = false;
      handleSaveRef.current?.().catch((error) => console.error('Autosave assistant failed:', error));
    }, 900);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [user?.uid, assistantLoaded, assistantId, businessName, websiteUrl, siteType, siteTypeConfidence, businessCategory, businessDescription, knowledgeNotes, faqText, pricingServicesText, specialRulesText, behavior, assistantTone, languages, autoLeadCapture, whatsappEscalation, webhookUrl, widgetConfig, autosaveNonce]);

  // ------------------------------------------------------------------
  // « PARLER À MON IA » : le serveur écrit directement dans la base ;
  // on remet donc les écrans à jour avec ce qu'il vient de changer.
  // ------------------------------------------------------------------
  assistantIdRef.current = assistantId;
  assistantLoadedRef.current = assistantLoaded;
  copilotOpenRef.current = copilotOpen;
  currentSectionRef.current = currentSection;

  const openCopilot = () => {
    setCopilotUnread(false);
    setMobileMenuOpen(false);
    // Sur l'Accueil, le chat EST la page : on met simplement le curseur dans le champ de texte.
    if (currentSectionRef.current === 'overview') {
      document.getElementById('copilot-input')?.focus();
      return;
    }
    setCopilotOpen(true);
  };

  /** Avant chaque demande : on enregistre ce qui est en attente, pour que l'IA lise la même chose que l'écran. */
  const ensureAssistantReady = async (): Promise<string | { error: string } | null> => {
    if (!user || !assistantLoadedRef.current) return null;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    autosavePendingRef.current = false;
    const savedId = await handleSaveRef.current?.();
    if (!savedId) return { error: 'Je n’arrive pas à enregistrer tes dernières modifications (connexion ?). Réessaie dans un instant.' };
    assistantIdRef.current = savedId;
    return savedId;
  };

  const applyCopilotPatch = (patch: CopilotStatePatch) => {
    if (patch.knowledgeNotes) setKnowledgeNotes(patch.knowledgeNotes as unknown as KnowledgeNote[]);
    if (patch.behavior) setBehavior((prev) => ({ ...prev, ...(patch.behavior as any) }));
    if (patch.businessInfo) setBusinessInfo(patch.businessInfo);
    if (patch.automationsChanged) setAutomationsVersion((v) => v + 1);
    if (patch.instagramChanged) setInstagramVersion((v) => v + 1);
  };

  /** La réponse de l'IA s'est perdue en route : on relit la base pour que les écrans montrent ce qui a vraiment été enregistré. */
  const resyncFromDatabase = async () => {
    if (!user) return;
    try {
      const list = await getUserAssistants(user.uid); // renvoie [] en cas d'erreur : on ne remplace alors rien
      const current = list.find((a) => a.id === assistantIdRef.current) || list[0];
      if (!current) return;
      if (Array.isArray(current.knowledgeNotes)) setKnowledgeNotes(current.knowledgeNotes);
      if (current.behavior) setBehavior((prev) => ({ ...prev, ...current.behavior }));
      if (current.businessInfo) setBusinessInfo(current.businessInfo);
      setAutomationsVersion((v) => v + 1);
      setInstagramVersion((v) => v + 1);
    } catch (e) {
      console.warn('Resynchronisation impossible:', e);
    }
  };

  const handleCopilotBusy = (busy: boolean) => {
    copilotBusyRef.current = busy;
    // Une modification faite à l'écran pendant l'attente est enregistrée maintenant.
    if (!busy && autosavePendingRef.current) setAutosaveNonce((n) => n + 1);
  };

  const handleExportCSV = () => {
    const headers = ['ID Prospect', 'Nom', 'Email', 'Telephone', 'Besoin Detecte', 'Statut', 'Date Capture', 'Referer', 'Page Actuelle', 'Langue', 'User Agent'];
    const rows = leadsList.map(lead => [
      lead.id,
      lead.name,
      lead.email,
      lead.phone,
      lead.need.replace(/"/g, '""'),
      lead.status,
      lead.date,
      (lead as any).referer || '',
      (lead as any).currentPage || '',
      (lead as any).language || '',
      ((lead as any).userAgent || '').replace(/"/g, '""')
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `jawebflow_prospects_${assistantId || 'export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportAdsCSV = () => {
    const headers = ['email', 'phone', 'first_name', 'last_name', 'country', 'locale', 'value'];
    const rows = leadsList.map(lead => {
      const nameParts = (lead.name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Visiteur';
      const lastName = nameParts.slice(1).join(' ') || 'Anonyme';
      
      let cleanPhone = (lead.phone || '').replace(/[^0-9+]/g, '');
      if (cleanPhone === 'Nonfourni') {
        cleanPhone = '';
      } else if (cleanPhone.startsWith('0') && !cleanPhone.startsWith('00')) {
        cleanPhone = '213' + cleanPhone.substring(1);
      }
      if (cleanPhone.startsWith('+')) {
        cleanPhone = cleanPhone.substring(1);
      }
      
      const isAlgeria = ((lead as any).timezone || '').toLowerCase().includes('algiers') || 
                        ((lead as any).phone || '').includes('+213') || 
                        ((lead as any).phone || '').startsWith('05') || 
                        ((lead as any).phone || '').startsWith('06') || 
                        ((lead as any).phone || '').startsWith('07');
      const country = isAlgeria ? 'DZ' : 'FR';
      const locale = (lead as any).language || 'fr';
      
      const hasEmail = lead.email && lead.email !== 'Non fourni';
      const hasPhone = lead.phone && lead.phone !== 'Non fourni';
      let value = '1.00';
      if (hasEmail && hasPhone) value = '15.00';
      else if (hasEmail || hasPhone) value = '5.00';
      if (lead.status === 'qualifie') value = '30.00';

      return [
        lead.email === 'Non fourni' ? '' : lead.email,
        cleanPhone,
        firstName,
        lastName,
        country,
        locale,
        value
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `jawebflow_facebook_google_audiences.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyField = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleRunWebsiteScan = async () => {
    const url = crawlerUrl.trim() || websiteUrl.trim();
    if (!url) return;

    setIsScanning(true);
    setScanProgress(15);
    setScanStage("Lecture de votre site et recherche des pages importantes…");
    setScanResultNotes(null);
    setScanSuccessMessage(null);
    
    setScannedPages([
      { url: `${url}`, title: "Page d'accueil (Hero & Proposition de valeur)", status: "pending" },
      { url: `${url}/services`, title: "Catalogue & Prestations de services", status: "pending" },
      { url: `${url}/tarifs`, title: "Tarifs & Formules d'abonnement", status: "pending" },
      { url: `${url}/contact`, title: "Coordonnées, Wilayas & Assistance", status: "pending" }
    ]);

    try {
      setScanProgress(35);
      setScanStage("Recherche des informations, prix, horaires et coordonnées…");

      // Le scan écrit dans la base de connaissances : le serveur exige un jeton
      // supabase prouvant que l'assistant appartient bien à l'utilisateur connecté.
      // `true` force un jeton frais : sans ça, le SDK peut renvoyer un jeton en
      // cache déjà expiré (onglet resté ouvert longtemps, veille mobile...),
      // ce qui provoquait un 401 intermittent sans rien changer côté serveur.
      const idToken = (await supabase.auth.getSession()).data.session?.access_token || null;
      const response = await fetch("/api/crawler/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          siteUrl: url.startsWith("http") ? url : `https://${url}`,
          assistantId: assistantId || undefined,
          userId: user?.uid || undefined
        })
      });

      setScanProgress(70);
      setScanStage("Organisation des informations trouvées…");

      if (response.ok) {
        const data = await response.json();
        
        if (data.siteType) {
          setSiteType(data.siteType);
          setSiteTypeConfidence(data.confidence || 90);
        }
        if (data.scrapingStrategy) {
          setScrapingStrategy(data.scrapingStrategy);
        }
        if (data.scannedPages && Array.isArray(data.scannedPages) && data.scannedPages.length > 0) {
          setScannedPages(data.scannedPages);
        } else {
          setScannedPages(prev => prev.map(p => ({ ...p, status: 'done' as const })));
        }

        if (data.businessName && (!businessName || businessName === 'Mon Entreprise')) {
          setBusinessName(data.businessName);
        }
        if (data.businessCategory) {
          setBusinessCategory(data.businessCategory);
        }
        if (data.businessDescription) {
          setBusinessDescription(data.businessDescription);
        }
        // AUTO-CONFIGURATION : FAQ, ton et message d'accueil remplis
        // automatiquement depuis le site — « colle ton lien, c'est prêt ».
        // L'utilisateur peut toujours corriger, mais plus rien n'est vide.
        if (data.faqText && !faqText.trim()) {
          setFaqText(data.faqText);
        }
        if (data.suggestedTone) {
          setAssistantTone(data.suggestedTone);
        }
        if (data.welcomeMessage) {
          setWidgetConfig(prev => (!prev.welcomeMessage ? { ...prev, welcomeMessage: data.welcomeMessage } : prev));
        }

        setDetectedBusinessMeta({
          businessName: data.businessName,
          businessCategory: data.businessCategory,
          businessDescription: data.businessDescription,
          phone: data.phone,
          email: data.email,
          deliveryInfo: data.deliveryInfo,
          paymentMethods: data.paymentMethods,
        });

        setScanProgress(100);
        setScanStage(`Terminé ! ${data.knowledgeNotes?.length || 0} informations trouvées.${data.aiNotice ? ' ⚠️ ' + data.aiNotice : ''}`);
        
        if (data.knowledgeNotes && data.knowledgeNotes.length > 0) {
          const scannedNotes: KnowledgeNote[] = data.knowledgeNotes.map((n: any) => ({
            ...n,
            id: n.id || "scanned_" + Math.random().toString(36).substring(2, 9),
            updatedAt: new Date().toISOString()
          }));
          const existingTitles = new Set(knowledgeNotes.map(n => n.title.toLowerCase().trim()));
          const notesToSave = [...scannedNotes.filter(n => !existingTitles.has(n.title.toLowerCase().trim())), ...knowledgeNotes];
          setScanResultNotes(scannedNotes);
          setKnowledgeNotes(notesToSave);
          setWebsiteUrl(url);
          await handleSaveToDatabase(notesToSave, {
            websiteUrl: url,
            businessName: data.businessName || businessName,
            businessCategory: data.businessCategory || businessCategory,
            businessDescription: data.businessDescription || businessDescription,
            siteType: data.siteType || siteType,
            siteTypeConfidence: data.confidence || siteTypeConfidence,
            scrapingStrategy: data.scrapingStrategy || scrapingStrategy
          });
          setScanSuccessMessage(`${scannedNotes.length} informations enregistrées avec leurs liens sources.`);
        }
        // ⚠️ Site partiellement lisible (JavaScript/anti-robot) : avertissement
        // renvoyé par le serveur, affiché en plus du succès.
        if (data.siteWarning) {
          setScanSuccessMessage((prev: string | null) => (prev ? `${data.siteWarning} ${prev}` : data.siteWarning));
        }
        setIsScanning(false);
      } else {
        // Message d'erreur PRÉCIS du serveur (site protégé, JS, limite atteinte…)
        let serverMsg = "";
        try {
          const errData = await response.json();
          if (errData?.error) serverMsg = errData.error;
        } catch { /* pas de JSON */ }
        setScanProgress(0);
        setScanStage("Le site n’a pas pu être lu. Aucune donnée inventée n’a été ajoutée.");
        setScannedPages(prev => prev.map(p => ({ ...p, status: "failed" })));
        setScanResultNotes(null);
        setScanSuccessMessage(serverMsg || "Scan impossible : vérifiez l’URL et rendez le site accessible publiquement.");
        setIsScanning(false);
      }
    } catch (e: any) {
      console.error("Crawler réel échoué", e);
      setScanProgress(0);
      setScanStage("Le site n’a pas pu être lu. Aucune donnée inventée n’a été ajoutée.");
      setScannedPages(prev => prev.map(p => ({ ...p, status: "failed" })));
      setScanResultNotes(null);
      setScanSuccessMessage(`Scan impossible : ${e?.message || "vérifiez l’URL et rendez le site accessible publiquement."}`);
      setIsScanning(false);
    }
  };

  const handleApplyScannedNotes = (mode: 'merge' | 'replace' = 'merge') => {
    if (!scanResultNotes || scanResultNotes.length === 0) return;
    
    let updatedNotes: KnowledgeNote[] = [];
    if (mode === 'replace') {
      updatedNotes = [...scanResultNotes];
    } else {
      const existingTitles = new Set(knowledgeNotes.map(n => n.title.toLowerCase().trim()));
      const newUnique = scanResultNotes.filter(n => !existingTitles.has(n.title.toLowerCase().trim()));
      updatedNotes = [...newUnique, ...knowledgeNotes];
    }

    setKnowledgeNotes(updatedNotes);
    setWebsiteUrl(crawlerUrl.trim() || websiteUrl.trim());
    setScanSuccessMessage(`${scanResultNotes.length} fiches importées avec succès et enregistrées dans la base de connaissances !`);
    // Utiliser explicitement la nouvelle valeur : setState est asynchrone.
    handleSaveToDatabase(updatedNotes);
  };

  // AI response in simulator leveraging live backend API with real knowledge notes and error handling
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isBotTyping) return;
    const userText = inputMessage.trim();
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMessages(prev => [...prev, { sender: 'user', text: userText, time }]);
    setInputMessage('');
    setIsBotTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId: assistantId || businessName || 'asst_default',
          sessionId: `dashboard_simulator_${assistantId || 'preview'}`,
          isSimulator: true,
          message: userText,
          history: messages.slice(-6).map(({ sender, text }) => ({ sender, text })),
          website: websiteUrl,
          knowledgeNotes: knowledgeNotes.filter(n => n.enabled)
        })
      });

      let botReply = '';
      if (response.ok) {
        const data = await response.json();
        botReply = data.text || data.message || data.response || '';
      } else {
        const errData = await response.json().catch(() => ({}));
        // Le tableau de bord doit rester compréhensible pour un commerçant.
        const diagnostics: string[] = Array.isArray(errData.diagnostics) ? errData.diagnostics : [];
        if (diagnostics.length > 0) {
          console.warn(`Simulateur indisponible (${errData.code || response.status}):`, diagnostics);
        } else if (errData.code) {
          console.warn(`Simulateur — réponse ${response.status} (${errData.code}):`, errData.error || errData.message);
        }
        botReply = errData.message || 'Bonjour ! L\'assistant est momentanément indisponible. Veuillez vérifier vos réglages ou réessayer dans un instant.';
        if (diagnostics.length > 0) {
          botReply += `\n\nRéessayez dans quelques instants ou vérifiez que vos informations sont bien enregistrées.`;
        }
      }

      if (!botReply) {
        botReply = 'Bonjour ! Comment puis-je vous aider aujourd\'hui ?';
      }

      setMessages(prev => [...prev, {
        sender: 'bot',
        text: botReply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } catch (err) {
      console.error('Simulator API chat error:', err);
      setMessages(prev => [...prev, {
        sender: 'bot',
        text: 'Bonjour ! Une courte interruption est survenue. Veuillez réessayer dans quelques instants.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsBotTyping(false);
    }
  };

  const currentWidgetId = assistantId || widgetId || 'asst_live';
  const liveScriptCdnUrl = typeof window !== 'undefined' ? `${window.location.origin}/widget.js` : 'https://cdn.jawebflow.com/widget.js';
  
  // Universal Embed Script HTML
  const widgetScriptHtml = `<!-- Bulle de discussion JawebFlow pour ${businessName || 'votre site'} -->
<script 
  src="${liveScriptCdnUrl}" 
  data-assistant-id="${currentWidgetId}" 
  data-business-name="${(businessName || 'Mon Entreprise').replace(/"/g, '&quot;')}"
  data-position="${widgetConfig.position}" 
  data-theme="${widgetConfig.themeMode}" 
  data-primary-color="${widgetConfig.primaryColor}"
  data-secondary-color="${widgetConfig.gradientSecondary || '#6366f1'}"
  data-shape="${widgetConfig.shape}"
  data-icon="${widgetConfig.iconType}"
  data-teaser="${(widgetConfig.teaserText || 'Une question ? Discutons en direct 👋').replace(/"/g, '&quot;')}"
  data-welcome="${(widgetConfig.welcomeMessage || 'Bonjour ! Comment puis-je vous aider ?').replace(/"/g, '&quot;')}"${whatsappEscalation ? `\n  data-whatsapp="${whatsappEscalation}"` : ''}${widgetConfig.iconType === 'custom_logo' && widgetConfig.customLogoUrl ? `\n  data-avatar-url="${widgetConfig.customLogoUrl}"` : ''}
  defer>
</script>`;

  // Completion calculation
  const hasIdentity = Boolean(businessName.trim());
  const hasKnowledge = knowledgeNotes.some(n => n.enabled);
  const isReadyToDeploy = hasIdentity && hasKnowledge;

  // ── Accueil façon Gemini / Claude : prénom, étapes restantes et alerte urgente ──
  const homeFirstName = (() => {
    const first = (profile?.displayName || user?.displayName || '').trim().split(/\s+/)[0] || '';
    return first.includes('@') ? '' : first;
  })();
  const homeTodo: Array<{ label: string; onClick: () => void }> = [
    !hasIdentity && { label: 'Renseigner le nom de mon entreprise', onClick: () => handleSectionChange('settings') },
    !hasKnowledge && { label: 'Ajouter mes informations', onClick: () => handleSectionChange('knowledge') },
    websiteUrl.trim().length === 0 && { label: 'Indiquer l’adresse de mon site', onClick: () => handleSectionChange('crawler') },
    !isReadyToDeploy && { label: 'Installer la bulle sur mon site', onClick: () => handleSectionChange('integration') },
  ].filter(Boolean) as Array<{ label: string; onClick: () => void }>;
  // Seules les urgences remontent sur l'Accueil ; le détail reste dans « Résumé ».
  const homeNotice = (() => {
    if (!usageInfo || isPlanGated) return null;
    const unitsPct = usageInfo.limit !== null && usageInfo.limit > 0 ? Math.round((usageInfo.used / usageInfo.limit) * 100) : usageInfo.limit === 0 ? 100 : 0;
    const costPct = (usageInfo.costCap ?? 0) > 0 ? Math.round(((usageInfo.costUsd || 0) / usageInfo.costCap!) * 100) : 0;
    if (usageInfo.limit !== null && Math.max(unitsPct, costPct) >= 100) {
      return { text: 'Limite atteinte : l’assistant est en pause.', tone: 'danger' as const, actionLabel: 'Voir mon abonnement', onAction: () => handleSectionChange('billing') };
    }
    const daysLeft = (usageInfo as any).daysLeft;
    if (daysLeft != null && daysLeft <= 7) {
      return { text: `Ton plan expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`, tone: 'warn' as const, actionLabel: 'Renouveler', onAction: () => handleSectionChange('billing') };
    }
    return null;
  })();

  const renewalDate = (usageInfo as any)?.daysLeft != null ? new Date(Date.now() + (usageInfo as any).daysLeft * 86400000) : null;
  const renewalShort = renewalDate ? renewalDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
  const renewalLong = renewalDate ? renewalDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="dash-theme min-h-screen bg-white text-slate-900 flex antialiased selection:bg-purple-500/20 selection:text-purple-900">
      
      {/* 
        =======================================================================
        LOCKED / FIXED SIDEBAR NAVIGATION (Pure White, Crisp Borders)
        =======================================================================
      */}
      <aside className={`
        fixed top-0 bottom-0 left-0 w-64 bg-white z-30 flex flex-col
        transition-transform duration-200 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex-1 overflow-y-auto">
          {/* Logo */}
          <div className="flex h-[72px] items-center justify-between px-5">
            <div className="flex flex-col justify-center">
              <img src="/jawebflow-logo.png" alt="JawebFlow" className="block h-6 w-auto max-w-[120px] object-contain object-left" />
              <span className="mt-0.5 block text-[9px] font-medium leading-none tracking-[0.02em] text-slate-400">Espace client</span>
            </div>

            <div className="flex items-center gap-0.5">
              {onNavigate && (
                <button
                  onClick={() => onNavigate('home')}
                  className="text-xs text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Retour au site public"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Fermer le menu"
                className="lg:hidden text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Navigation : libellés simples, dont la vue Commandes */}
          <nav className="px-3 pb-4 pt-3" aria-label="Menu principal">
            <div className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const group = item.group;
                const isActive = group ? menuGroupOf(currentSection) === group : currentSection === item.id;
                const isOpen = !!group && openGroup === group;
                const orderCount = leadsList.reduce((count, lead) => count + (lead.orders?.length || 0), 0);
                // KnowledgeNotesManager compte les fiches relationnelles et les pages scannées.
                // `knowledgeNotes` seul est un miroir incomplet : ne pas afficher un badge trompeur.
                const badge = item.id === 'leads' && leadsList.length > 0
                  ? String(leadsList.length)
                  : item.id === 'orders' && orderCount > 0
                    ? String(orderCount)
                    : null;
                const subItems: Array<{ key: string; label: string; selected: boolean; onSelect: () => void }> = !group ? [] : group === 'clients'
                  ? [
                      { key: 'analytics', label: "Vue d'ensemble", selected: currentSection === 'leads' && insightsTab === 'analytics', onSelect: () => { setInsightsTab('analytics'); handleSectionChange('leads'); } },
                      { key: 'prospects', label: 'Mes clients', selected: currentSection === 'leads' && insightsTab === 'prospects', onSelect: () => { setInsightsTab('prospects'); handleSectionChange('leads'); } },
                    ]
                  : SECTION_GROUPS[group].tabs.map((tab) => ({ key: tab.id, label: tab.label, selected: currentSection === tab.id, onSelect: () => handleSectionChange(tab.id) }));
                return (
                  <div key={item.id}>
                    <button
                      type="button"
                      id={`nav-${item.id}`}
                      title={item.label}
                      aria-current={isActive && !group ? 'page' : undefined}
                      aria-expanded={group ? isOpen : undefined}
                      aria-controls={group ? `submenu-${group}` : undefined}
                      onClick={() => {
                        if (!group) { handleSectionChange(item.id); return; }
                        setOpenGroup((g) => (g === group ? null : group));
                      }}
                      className={`group flex h-11 w-full items-center gap-3 rounded-full px-4 text-[14px] outline-none transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#a23dff]/40 focus-visible:ring-offset-2 ${
                        isActive
                          ? 'bg-gradient-to-r from-[#a23dff] to-[#5a2cff] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(110,50,255,0.6)]'
                          : 'font-normal text-slate-500 hover:bg-[#f4f2ff] hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`h-[19px] w-[19px] shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-purple-600'}`} />
                      <span className="flex-1 truncate text-left">{item.label}</span>
                      {item.pro && showLockedGates && <Lock className="w-3 h-3 text-amber-500" />}
                      {badge && (
                        <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${isActive ? 'bg-white/25 text-white' : 'bg-[#efe9ff] text-[#5a2cff]'}`}>
                          {badge}
                        </span>
                      )}
                      {group && <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${isActive ? 'text-white' : 'text-slate-400'}`} />}
                    </button>
                    {group && (
                      <div
                        id={`submenu-${group}`}
                        aria-hidden={!isOpen}
                        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="ml-[25px] mt-1 space-y-0.5 border-l border-slate-200 pl-[10px] pb-1">
                            {subItems.map((sub, index) => (
                              <button
                                key={sub.key}
                                type="button"
                                tabIndex={isOpen ? 0 : -1}
                                onClick={sub.onSelect}
                                data-tab={sub.key}
                                aria-current={sub.selected ? 'page' : undefined}
                                className={`flex h-9 w-full items-center rounded-full px-[11px] text-left text-[13px] outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#a23dff]/40 ${sub.selected ? 'bg-[#f1ecff] font-semibold text-[#5a2cff]' : 'text-slate-500 hover:bg-[#f7f5ff] hover:text-slate-900'}`}
                                style={{ transitionDelay: isOpen ? `${index * 35}ms` : '0ms', transform: isOpen ? 'translateY(0)' : 'translateY(-4px)' }}
                              >
                                <span className="truncate">{sub.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>
        </div>
      </aside>

      {/* Backdrop overlay for mobile drawer */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-25 lg:hidden"
        />
      )}

      {/* 
        =======================================================================
        MAIN CONTENT WORKSPACE (Clean, Responsive, High Contrast)
        =======================================================================
      */}
      <div className={`flex-1 min-w-0 lg:ml-64 bg-white flex flex-col ${currentSection === 'overview' ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'}`}>
        
        {/* Sticky Top Header Bar */}
        <header className="sticky top-0 z-20 h-[72px] shrink-0 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Ouvrir le menu"
              className="lg:hidden p-2 rounded-full text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="dash-title truncate text-lg sm:text-2xl">
                {currentSection === 'overview' && 'Accueil'}
                {currentSection === 'summary' && 'Résumé'}
                {currentSection === 'simulator' && 'Tester mon assistant'}
                {currentSection === 'billing' && 'Abonnement & factures'}
                {currentSection === 'settings' && 'Mon profil'}
                {currentSection === 'orders' && 'Commandes'}
                {currentSection === 'leads' && (insightsTab === 'prospects' ? 'Mes clients' : "Vue d'ensemble")}
                {groupOf(currentSection) && SECTION_GROUPS[groupOf(currentSection) as string].tabs.find((t) => t.id === currentSection)?.label}
              </h1>
              <p className="dash-subtitle truncate text-xs">
                {groupOf(currentSection) ? `${SECTION_GROUPS[groupOf(currentSection) as string].title} · ` : currentSection === 'leads' ? 'Clients · ' : ''}
                {businessName || 'Assistant en configuration'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Enregistrement automatique : un simple témoin (plus de bouton). L'échec reste affiché et réessayable. */}
            {saveDbError ? (
              <button
                type="button"
                onClick={() => { void handleSaveToDatabase(); }}
                disabled={isSavingDb}
                aria-label={isSavingDb ? 'Nouvelle tentative en cours' : 'Échec — réessayer'}
                title={isSavingDb ? 'Nouvelle tentative en cours' : 'L’enregistrement a échoué : vérifie ta connexion internet puis clique pour réessayer.'}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-rose-50 px-3 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-wait disabled:opacity-70 cursor-pointer"
              >
                {isSavingDb ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertCircle className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{isSavingDb ? 'Nouvelle tentative…' : 'Échec — réessayer'}</span>
              </button>
            ) : isSavingDb ? (
              <span role="status" aria-live="polite" title="Enregistrement en cours" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="sr-only">Enregistrement…</span>
              </span>
            ) : null}

            {/* Abonnement & factures */}
            <button
              type="button"
              id="nav-billing"
              title="Abonnement & factures"
              aria-label="Abonnement & factures"
              aria-current={currentSection === 'billing' ? 'page' : undefined}
              onClick={() => handleSectionChange('billing')}
              className={`inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-all cursor-pointer xl:px-4 ${
                currentSection === 'billing'
                  ? 'bg-gradient-to-r from-[#a23dff] to-[#5a2cff] text-white shadow-[0_8px_18px_-8px_rgba(110,50,255,0.6)]'
                  : 'bg-slate-100 text-slate-600 hover:bg-[#efe9ff] hover:text-[#6d28d9]'
              }`}
            >
              <CreditCard className="h-4 w-4" />
              <span className="hidden xl:inline">Abonnement & factures</span>
            </button>

            {/* Mon profil */}
            <div className="relative" ref={accountMenuRef}>
              <button
                type="button"
                id="account-menu-button"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                aria-current={currentSection === 'settings' ? 'page' : undefined}
                title="Mon compte"
                onClick={() => setAccountMenuOpen((o) => !o)}
                className={`inline-flex h-10 items-center gap-2 rounded-full pl-1 pr-3 text-sm font-medium transition-all cursor-pointer ${
                  currentSection === 'settings'
                    ? 'bg-gradient-to-r from-[#a23dff] to-[#5a2cff] text-white shadow-[0_8px_18px_-8px_rgba(110,50,255,0.6)]'
                    : 'bg-slate-100 text-slate-700 hover:bg-[#efe9ff]'
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-100 text-sm font-bold text-purple-700">
                  {profile?.photoURL || user?.photoURL ? (
                    <img src={profile?.photoURL || user?.photoURL || ''} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (profile?.displayName || user?.displayName || user?.email || 'U')[0].toUpperCase()
                  )}
                </span>
                <span className="hidden max-w-[110px] truncate sm:inline">{homeFirstName || 'Mon compte'}</span>
                <ChevronDown className={`h-4 w-4 opacity-60 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {accountMenuOpen && (
                <div
                  role="menu"
                  aria-label="Mon compte"
                  className="absolute right-0 top-12 z-40 w-64 overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_20px_50px_-12px_rgba(27,22,71,0.35)] ring-1 ring-slate-100"
                >
                  <div className="px-3 py-2.5">
                    <p className="truncate text-sm font-bold text-[#1b1647]">{profile?.displayName || user?.displayName || 'Mon compte'}</p>
                    <p className="truncate text-xs text-slate-500">{user?.email || 'Connecté'}</p>
                    {businessName && <p className="mt-0.5 truncate text-xs text-slate-400">{businessName}</p>}
                  </div>
                  <div className="my-1 h-px bg-slate-100" />
                  <button
                    type="button"
                    role="menuitem"
                    id="nav-settings"
                    onClick={() => handleSectionChange('settings')}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-[#f4f2ff] cursor-pointer"
                  >
                    <User className="h-4 w-4 text-slate-400" /> Mon profil
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setAccountMenuOpen(false); logout(); }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" /> Se déconnecter
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        </header>

        {/* Feuille lavande aux grands angles arrondis (comme les plateformes modernes) */}
        <div className="flex min-h-0 flex-1 flex-col rounded-t-[28px] bg-[#eef1fb] lg:rounded-tl-[44px] lg:rounded-tr-none">
        {/* Workspace Body */}
        <main className={currentSection === 'overview' ? 'flex-1 min-h-0 w-full' : 'p-4 sm:p-8 flex-1 max-w-6xl w-full mx-auto'}>
          
          {/* =================================================================
              SECTION: ACCUEIL — version simple, orientée résultats
              ================================================================= */}
          {currentSection === 'overview' && (
            // « Bonjour {prénom} » + grand champ de texte : le chat « Mon IA » s'affiche ici (voir <CopilotChat mode="page" />).
            <div ref={setCopilotHost} className="h-full" data-testid="copilot-home-host" />
          )}

          {/* =================================================================
              SECTION: RÉSUMÉ — l'ancien écran d'accueil (statut, chiffres, à faire, usage)
              ================================================================= */}
          {currentSection === 'summary' && (
            <div className="space-y-6 animate-in fade-in duration-200">

              {/* Message d'accueil + action principale */}
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-slate-900">
                  {businessName ? `Votre assistant pour ${businessName}` : 'Votre assistant est presque prêt'}
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">
                  {isReadyToDeploy
                    ? "Il répond à vos visiteurs en français et en arabe, 24h/24, et enregistre les coordonnées des clients intéressés."
                    : "Ajoutez vos informations (prix, horaires, livraison) puis installez la bulle sur votre site. Cela prend quelques minutes."}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {!isReadyToDeploy && (
                    <button
                      type="button"
                      onClick={() => handleSectionChange('knowledge')}
                      className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      Ajouter mes informations
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSectionChange(isReadyToDeploy ? 'integration' : 'widget')}
                    className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
                      isReadyToDeploy
                        ? 'bg-slate-900 text-white hover:bg-slate-800'
                        : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {isReadyToDeploy ? 'Mettre sur mon site' : 'Choisir l\'apparence'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSectionChange('simulator')}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Tester une conversation
                  </button>
                </div>
              </div>

              {/* Trois informations essentielles, sans surcharge */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                  icon={Activity}
                  label="Statut de mon assistant"
                  value={isReadyToDeploy ? 'En ligne' : 'En préparation'}
                  hint={isReadyToDeploy ? 'Répond à vos visiteurs' : 'Complétez les étapes ci-dessous'}
                  badge={isReadyToDeploy ? { text: '✓ Actif', tone: 'good' } : { text: 'À compléter', tone: 'warn' }}
                />
                <StatCard
                  icon={Users}
                  label="Clients intéressés"
                  value={leadsList.length}
                  hint="Avec nom ou numéro de téléphone"
                />
                <StatCard
                  icon={Database}
                  label="Informations utilisées"
                  value={knowledgeNotes.filter(n => n.enabled).length}
                  hint="Fiches lues par l'assistant"
                />
              </div>

              {/* Ce qu'il reste à faire (3 étapes maximum) */}
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-3.5">
                  <h3 className="text-sm font-semibold text-slate-900">À faire</h3>
                </div>
                <ul className="divide-y divide-slate-100">
                  {[
                    { done: hasIdentity, label: 'Renseigner le nom de mon entreprise', section: 'settings' as DashboardSectionId },
                    { done: hasKnowledge, label: 'Ajouter mes informations (prix, livraison, horaires)', section: 'knowledge' as DashboardSectionId },
                    { done: websiteUrl.trim().length > 0, label: 'Indiquer l\'adresse de mon site web', section: 'crawler' as DashboardSectionId },
                    { done: isReadyToDeploy, label: 'Installer la bulle sur mon site', section: 'integration' as DashboardSectionId },
                  ].map((step) => (
                    <li key={step.label}>
                      <button
                        type="button"
                        onClick={() => handleSectionChange(step.section)}
                        className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50"
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          step.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'
                        }`}>
                          {step.done && <Check className="h-3 w-3" />}
                        </span>
                        <span className={`flex-1 text-sm ${step.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                          {step.label}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Jauge d'usage + stats du mois (source : /api/usage) */}
              {usageInfo && !isPlanGated && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Conversations ce mois-ci</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {usageInfo.used}{usageInfo.limit !== null ? ` / ${usageInfo.limit}` : ' · illimité'}
                    </p>
                    {(() => {
                      if (usageInfo.limit === null) return null;
                      const unitsPct = usageInfo.limit > 0 ? Math.min(100, Math.round((usageInfo.used / usageInfo.limit) * 100)) : 100;
                      // L'activité RÉELLE de l'assistant (plafond interne) peut dépasser
                      // le compteur de conversations : on affiche toujours le plus juste.
                      const costPct = (usageInfo.costCap ?? 0) > 0 ? Math.min(100, Math.round(((usageInfo.costUsd || 0) / usageInfo.costCap!) * 100)) : 0;
                      const pct = Math.max(unitsPct, costPct);
                      return (
                        <>
                          <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
                            <div className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1.5 text-[11px] text-slate-400">Forfait utilisé à {pct} % ce mois-ci</p>
                          {pct >= 80 && pct < 100 && (
                            <p className="mt-2 text-xs font-medium text-amber-600">Vous approchez de la limite — pensez au plan supérieur.</p>
                          )}
                          {pct >= 100 && (
                            <p className="mt-2 text-xs font-medium text-red-600">Limite atteinte : l'assistant est en pause. Passez au plan supérieur pour débloquer.</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clients intéressés captés</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{usageInfo.prospects}</p>
                    <p className="mt-1 text-xs text-slate-500">Téléphones et demandes enregistrés automatiquement.</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Questions en apprentissage</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{usageInfo.openQuestions}</p>
                    <p className="mt-1 text-xs text-slate-500">Le bot note ce qu'il ne sait pas encore répondre.</p>
                  </div>
                </div>
              )}

              {/* Résumé quotidien : envoyé AUTOMATIQUEMENT chaque soir (automation plateforme) */}
              {!isPlanGated && (
                <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">📧 Résumé quotidien par email</p>
                    <p className="text-sm text-slate-500">Chaque soir à 21h : conversations du jour, contacts captés, questions à traiter — envoyé automatiquement à ton adresse, rien à configurer.</p>
                    {emailTestMsg && <p className="mt-1 text-xs font-medium text-slate-700">{emailTestMsg}</p>}
                  </div>
                  <span className="shrink-0 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm font-medium text-emerald-700">
                    ✅ Automatique chaque soir
                  </span>
                </div>
              )}

              {/* Rappel de renouvellement (7 derniers jours du cycle de 30 jours) */}
              {usageInfo?.daysLeft != null && (usageInfo as any).daysLeft <= 7 && !isPlanGated && (
                <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      ⏳ Votre plan expire dans {(usageInfo as any).daysLeft} jour{((usageInfo as any).daysLeft > 1) ? 's' : ''}
                    </p>
                    <p className="text-sm text-amber-800">Renouvelez en 2 clics pour que votre assistant continue de répondre sans interruption.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSectionChange('billing')}
                    className="shrink-0 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700"
                  >
                    Renouveler maintenant
                  </button>
                </div>
              )}

              {/* Rappel du plan, uniquement s'il y a quelque chose à débloquer */}
              {isPlanGated && (
                <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Compte découverte</p>
                    <p className="text-sm text-slate-500">
                      L'installation et la personnalisation sont incluses. L'activation des réponses automatiques se fait avec un abonnement.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSectionChange('billing')}
                    className="shrink-0 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Voir les offres
                  </button>
                </div>
              )}
            </div>
          )}

          {/* =================================================================
              SECTION 1: CRAWLER & WEBSITE SCANNER
              ================================================================= */}
          {currentSection === 'crawler' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Notification Banner when scan notes applied */}
              {scanSuccessMessage && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-xs sm:text-sm">{scanSuccessMessage}</p>
          <p className="text-[11px] text-emerald-700">Votre assistant répond désormais avec ces nouvelles informations.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSectionChange('knowledge')}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs transition-colors cursor-pointer"
                    >
                      Voir ma Base
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSectionChange('simulator')}
                      className="px-3.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-medium text-xs transition-colors cursor-pointer"
                    >
                        Tester mon assistant
                    </button>
                  </div>
                </div>
              )}

              {/* Main Scanner Card */}
              <div className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-200/80 text-purple-700 text-xs font-semibold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Analyse automatique de mon site</span>
                  </div>
                  <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
                    Importer les informations de mon site
                  </h2>
                  <p className="text-sm text-slate-500 max-w-2xl leading-relaxed">
                    Indiquez l'adresse de votre site : nous lisons automatiquement vos pages
                    (services, prix, livraison, contact) et préparons les informations que votre
                    assistant utilisera pour répondre. Vous pourrez tout modifier ensuite.
                  </p>
                </div>

                {/* URL Input Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!isScanning && (crawlerUrl.trim() || websiteUrl.trim())) {
                      handleRunWebsiteScan();
                    }
                  }}
                  className="space-y-3"
                >
                  <label htmlFor="crawler-url-input" className="block text-xs font-semibold text-slate-700">
                    Adresse de mon site
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="crawler-url-input"
                        type="url"
                        value={crawlerUrl}
                        onChange={(e) => setCrawlerUrl(e.target.value)}
                        placeholder="votresite.com"
                        className="w-full pl-10 pr-4 py-3 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm placeholder:text-slate-400 focus:border-slate-900 focus:outline-none transition-colors"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isScanning || (!crawlerUrl.trim() && !websiteUrl.trim())}
                      className="px-6 py-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                    >
                      {isScanning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Lecture de votre site en cours…</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Importer les informations</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Rien n'est publié sans ta validation.</span>
                  </div>
                </form>

                {/* Scanning Progress Banner */}
                {isScanning && (
                  <div className="p-5 rounded-xl bg-purple-50/60 border border-purple-100 space-y-3.5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 text-purple-600 animate-spin" />
                        {scanStage}
                      </span>
                      <span className="font-mono text-purple-700 font-bold">{scanProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-purple-100 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 transition-all duration-300 rounded-full"
                        style={{ width: `${scanProgress}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {scannedPages.map((page, idx) => (
                        <div key={idx} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white border border-purple-100 text-xs shadow-2xs">
                          {page.status === 'done' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Loader2 className="w-4 h-4 text-purple-600 animate-spin shrink-0" />
                          )}
                          <span className="truncate font-medium text-slate-800">{page.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Scanned Summary & Detected Business Metadata */}
                {detectedBusinessMeta && !isScanning && (
                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-purple-600" />
                        Données d'entreprise détectées
                      </h3>
                      {siteType && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800">
                          {siteType.toUpperCase()} ({siteTypeConfidence}% certitude)
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-400">Nom & Marque</span>
                        <p className="font-semibold text-slate-900 truncate">{detectedBusinessMeta.businessName || businessName || "Non spécifié"}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-400">Secteur d'activité</span>
                        <p className="font-semibold text-slate-900 truncate">{detectedBusinessMeta.businessCategory || businessCategory}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-400">Contact / Téléphone</span>
                        <p className="font-semibold text-slate-900 truncate">{detectedBusinessMeta.phone || "Non détecté sur le site"}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-400">Livraison & Couverture</span>
                        <p className="font-semibold text-slate-900 truncate">{detectedBusinessMeta.deliveryInfo || "Non détecté sur le site"}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Scanned Notes Preview Result */}
                {scanResultNotes && scanResultNotes.length > 0 && !isScanning && (
                  <div className="space-y-4 pt-2 animate-in fade-in">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
                      <div>
                        <h3 className="font-bold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          <span>{scanResultNotes.length} fiches de connaissances extraites</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Passez en revue les informations avant de les intégrer à la mémoire de votre assistant.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleApplyScannedNotes('merge')}
                          className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center gap-2 shadow-sm shadow-purple-600/20 cursor-pointer transition-all min-h-[40px]"
                        >
                          <Check className="w-4 h-4" />
                          <span>Ajouter à ma Base (Fusionner)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyScannedNotes('replace')}
                          className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs transition-colors cursor-pointer min-h-[40px]"
                          title="Remplace toutes les fiches existantes par celles extraites"
                        >
                          Remplacer ma base
                        </button>
                      </div>
                    </div>

                    {/* Notes Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {scanResultNotes.map((note, index) => {
                        const categoryLabels: Record<string, { label: string; color: string }> = {
                          general: { label: "Général", color: "bg-blue-50 text-blue-700 border-blue-200" },
                          services: { label: "Services & Produits", color: "bg-purple-50 text-purple-700 border-purple-200" },
                          tarifs: { label: "Tarifs & Devis", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                          livraison: { label: "Livraison", color: "bg-amber-50 text-amber-700 border-amber-200" },
                          faq: { label: "Questions Fréquentes", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
                          contact: { label: "Contact & Horaires", color: "bg-rose-50 text-rose-700 border-rose-200" },
                        };
                        const catStyle = categoryLabels[note.category] || { label: note.category, color: "bg-slate-50 text-slate-700 border-slate-200" };

                        return (
                          <div key={note.id || index} className="p-4 rounded-xl bg-white border border-slate-200/80 hover:border-purple-300 transition-all space-y-2 shadow-2xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${catStyle.color}`}>
                                {catStyle.label}
                              </span>
                              <span className="text-[10px] text-slate-400">Trouvé sur votre site</span>
                            </div>
                            <h4 className="font-bold text-xs sm:text-sm text-slate-900 leading-snug">
                              {note.title}
                            </h4>
                            <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                              {note.content}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =================================================================
              SECTION 2: KNOWLEDGE BASE (TITLED NOTES CARDS)
              ================================================================= */}
          {currentSection === 'knowledge' && (
            <div className="animate-in fade-in duration-200">
              {/* Informations officielles structurées : citées telles quelles
                  par l'IA, jamais inventées. */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">📌 Informations officielles (toujours exactes)</h3>
                <p className="text-xs text-slate-500 mt-1 mb-4">
                  Ces champs sont cités tels quels par ton IA — elle ne les invente et ne les contredit jamais.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    value={businessInfo.phone || ''}
                    onChange={e => setBusinessInfo(p => ({ ...p, phone: e.target.value }))}
                    placeholder="Téléphone (ex : 0550 12 34 56)"
                    className="text-xs rounded-lg border border-slate-200 p-2.5 outline-none focus:border-purple-400"
                  />
                  <input
                    value={businessInfo.hours || ''}
                    onChange={e => setBusinessInfo(p => ({ ...p, hours: e.target.value }))}
                    placeholder="Horaires (ex : sam–jeu, 9h–18h)"
                    className="text-xs rounded-lg border border-slate-200 p-2.5 outline-none focus:border-purple-400"
                  />
                  <input
                    value={businessInfo.address || ''}
                    onChange={e => setBusinessInfo(p => ({ ...p, address: e.target.value }))}
                    placeholder="Adresse (ex : 12 rue Didouche Mourad, Alger)"
                    className="text-xs rounded-lg border border-slate-200 p-2.5 outline-none focus:border-purple-400"
                  />
                  <input
                    value={businessInfo.closedDays || ''}
                    onChange={e => setBusinessInfo(p => ({ ...p, closedDays: e.target.value }))}
                    placeholder="Jours fermés (ex : vendredi)"
                    className="text-xs rounded-lg border border-slate-200 p-2.5 outline-none focus:border-purple-400"
                  />
                </div>
                <label className="mt-4 flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={siteShopping}
                    onChange={e => setSiteShopping(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-purple-600"
                  />
                  <span>
                    <span className="text-xs font-semibold text-slate-800">🛒 Mes clients commandent sur mon site</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      L'IA cherche les produits EN DIRECT sur ton site et envoie les liens 🔗 pour commander
                      (ex : « antichoc iPhone 13 » → lien de la fiche produit). Si le client envoie une photo
                      du produit sur Instagram, l'IA la reconnaît et trouve le lien pareil.
                    </span>
                  </span>
                </label>
                <button
                  onClick={() => handleSaveToDatabase()}
                  disabled={isSavingDb}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" /> Enregistrer ces informations
                </button>
              </div>

              <KnowledgeNotesManager
                notes={knowledgeNotes}
                onUpdateNotes={(updated) => {
                  setKnowledgeNotes(updated);
                  // On enregistre la NOUVELLE liste tout de suite (sinon la sauvegarde partait avec l'ancienne).
                  handleSaveToDatabase(updated);
                }}
                onScanClick={() => handleSectionChange('crawler')}
                isScanning={isScanning}
                assistantId={assistantId}
                onOpenCopilot={openCopilot}
              />
            </div>
          )}

          {/* =================================================================
              SECTION APPRENTISSAGE : questions sans réponse -> base de
              connaissance en un clic.
              ================================================================= */}
          {currentSection === 'learning' && (
            <div className="animate-in fade-in duration-200 space-y-4">
              {learningNotice && (
                <div className={`text-xs font-medium rounded-lg px-3 py-2 ${learningNotice.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  {learningNotice.text}
                </div>
              )}
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-1">
                  <BrainCircuit className="w-5 h-5 text-purple-600" />
                  <h2 className="font-bold text-slate-900">Questions sans réponse</h2>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Quand ton IA n'a pas l'information (ou reçoit un 👎 dans le chat), la question arrive ici.
                  Réponds une fois : la réponse entre directement dans sa base de connaissance et elle la connaîtra pour toujours.
                </p>
                {learningLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500 py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Chargement des questions…
                  </div>
                ) : learningQuestions.filter(q => q.status === 'open').length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-500">
                    🎉 Aucune question en attente — ton IA a trouvé ses réponses jusqu'ici !
                  </div>
                ) : (
                  <div className="space-y-3">
                    {learningQuestions.filter(q => q.status === 'open').map(q => (
                      <div key={q.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/60">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-800">« {q.question} »</p>
                          {q.occurrences > 1 && (
                            <span className="shrink-0 text-[10px] font-bold bg-purple-100 text-purple-700 rounded-full px-2 py-0.5">×{q.occurrences}</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {new Date(q.created_at).toLocaleDateString('fr-FR')} · {q.reason === 'thumbs_down' ? '👎 visiteur mécontent' : '❓ information manquante'}
                        </p>
                        <textarea
                          value={learningDrafts[q.id] || ''}
                          onChange={e => setLearningDrafts(prev => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder="Écris la bonne réponse que l'IA devra donner désormais…"
                          className="mt-3 w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 min-h-[60px] outline-none focus:border-purple-400"
                        />
                        <button
                          onClick={() => handleResolveLearning(q)}
                          disabled={learningSaving === q.id}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
                        >
                          {learningSaving === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Apprendre cette réponse à l'IA
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {learningQuestions.some(q => q.status === 'resolved') && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-3">✅ Déjà appris</h3>
                  <div className="space-y-2">
                    {learningQuestions.filter(q => q.status === 'resolved').slice(0, 10).map(q => (
                      <div key={q.id} className="text-xs text-slate-500 border-b border-slate-100 pb-2">
                        <span className="line-through opacity-60">« {q.question} »</span>
                        <span className="ml-2 text-emerald-600 font-medium">→ {q.answer}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =================================================================
              SECTION 3: WIDGET CUSTOMIZER & BUBBLE APPEARANCE
              ================================================================= */}
          {currentSection === 'widget' && (
            <div className="animate-in fade-in duration-200">
              <WidgetCustomizer
                businessName={businessName}
                onBusinessNameChange={(value) => {
                  setBusinessName(value);
                  handleSaveToDatabase(undefined, { businessName: value });
                }}
                widgetId={currentWidgetId}
                config={widgetConfig}
                onChange={handleUpdateWidgetConfig}
                onSave={handleSaveToDatabase}
                onGoToIntegration={() => handleSectionChange('integration')}
                isSaving={isSavingDb}
              />
            </div>
          )}

          {/* =================================================================
              SECTION 4: SIMULATOR & TEST CHATBOT
              ================================================================= */}
          {currentSection === 'simulator' && (
            <>
            {isFreePlan && (
              <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-900">🔒 Réponses IA désactivées (plan gratuit)</p>
                  <p className="text-sm text-amber-800">Tu peux configurer et tester l'apparence — pour que l'assistant RÉPONDE vraiment, active un plan.</p>
                </div>
                <button type="button" onClick={() => handleSectionChange('billing')} className="shrink-0 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700">
                  Activer les réponses IA
                </button>
              </div>
            )}
            {showLockedGates ? (
              <LockedFeatureGate
                title="Tester mon assistant"
                subtitle="Testez l'intelligence conversationnelle de votre assistant en direct, en français, darija ou anglais, avant de le déployer sur votre site public."
                icon={Bot}
                featureName="Tester mon assistant"
                benefits={[
                  "Dialogue interactif en direct avec calcul de pertinence des réponses",
                  "Vérification de la détection de besoin et de capture de leads",
                  "Messages inclus pour tester vos scénarios",
                  "Réinitialisation instantanée et test de personnalisation visuelle"
                ]}
                onUpgradeClick={() => handleSectionChange('billing')}
              />
            ) : (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                    <Bot className="w-3.5 h-3.5 text-amber-600" />
                    <span>Aperçu réel</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    Voir comment votre assistant répond
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
                    Posez des questions sur vos tarifs, livraisons, services ou écrivez en darija pour vérifier que votre assistant utilise bien vos informations.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setMessages([
                    {
                      sender: 'bot',
                      text: widgetConfig.welcomeMessage || `Bonjour ! 👋 Je suis l'assistant de ${businessName || 'votre entreprise'}. Comment puis-je vous aider ?`,
                      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }
                  ])}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer border border-slate-300"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Réinitialiser le chat</span>
                </button>
              </div>

              {/* Chat Simulation Window */}
              <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-md flex flex-col overflow-hidden h-[540px]">
                {/* Chat Topbar */}
                <div 
                  className="p-4 flex items-center justify-between text-white shadow-sm"
                  style={{ backgroundColor: widgetConfig.primaryColor }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="block font-bold text-sm">{widgetConfig.headerTitle || businessName || 'Mon assistant'}</span>
                      <span className="block text-[11px] text-white/80">{widgetConfig.headerSubtitle || 'En ligne · Réponse immédiate'}</span>
                    </div>
                  </div>
                  <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-mono">
                    Mode Test
                  </span>
                </div>

                {/* Messages Body */}
                <div className="p-4 space-y-3 overflow-y-auto flex-1 bg-slate-50">
                  {messages.map((msg, idx) => (
                    <div 
                      key={idx} 
                      className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div 
                        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-xs ${
                          msg.sender === 'user'
                            ? 'text-white rounded-br-none'
                            : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                        }`}
                        style={msg.sender === 'user' ? { backgroundColor: widgetConfig.primaryColor } : undefined}
                      >
                        <p className="whitespace-pre-line">{msg.text}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.time}</span>
                    </div>
                  ))}

                  {isBotTyping && (
                    <div className="flex items-center gap-1.5 p-3 rounded-2xl bg-white border border-slate-200 w-20 text-slate-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-bounce"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  )}
                </div>

                {/* Message Input Bar */}
                <div className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Posez une question (tarifs, livraison, WhatsApp, salam...)..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
                  />
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim() || isBotTyping}
                    className="p-2.5 rounded-xl text-white font-semibold transition-all shadow-sm cursor-pointer disabled:opacity-40"
                    style={{ backgroundColor: widgetConfig.primaryColor }}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            )}
            </>
          )}

          {/* =================================================================
              SECTION 5: INTEGRATION CODE (REACT, NEXT.JS, HTML, WORDPRESS)
              ================================================================= */}
          {currentSection === 'integration' && (
            <div className="animate-in fade-in duration-200">
              <SiteInstallWizard
                scriptHtml={widgetScriptHtml}
                websiteUrl={websiteUrl}
                userId={user?.uid || ''}
                onGoTest={() => handleSectionChange('simulator')}
                onGoInstagram={() => handleSectionChange('instagram')}
              />
            </div>
          )}

          {/* =================================================================
              SECTION: INSTAGRAM INTEGRATION (supabase OAUTH & DM MANAGEMENT)
              ================================================================= */}
          {currentSection === 'instagram' && (
            <>
            {isFreePlan && (
              <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-900">🔒 Réponses IA désactivées (plan gratuit)</p>
                  <p className="text-sm text-amber-800">La configuration est ouverte — active un plan pour que l'assistant réponde sur ce canal.</p>
                </div>
                <button type="button" onClick={() => handleSectionChange('billing')} className="shrink-0 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700">
                  Activer les réponses IA
                </button>
              </div>
            )}
            {showLockedGates ? (
              <LockedFeatureGate
                title="Instagram DMs & Automatisation IA"
                subtitle="Connectez votre compte Instagram Professionnel pour répondre automatiquement aux messages privés et commentaires de vos clients 24h/24."
                icon={Instagram}
                featureName="Instagram DMs"
                benefits={[
                  "Connexion officielle sécurisée à votre page Instagram",
                  "Réponses automatiques intelligentes aux DMs et stories 24h/24",
                  "Qualification automatique et capture des coordonnées",
                  "Gestion centralisée des messages et interactions"
                ]}
                onUpgradeClick={() => handleSectionChange('billing')}
              />
            ) : (
              <InstagramIntegration
                key={`instagram-${instagramVersion}`}
                assistantId={assistantId || currentWidgetId}
                businessName={businessName}
                websiteUrl={websiteUrl || crawlerUrl}
                knowledgeNotes={knowledgeNotes}
                onGoToSimulator={() => handleSectionChange('simulator')}
                onGoToAutomations={() => handleSectionChange('automations')}
                highlightCommentsAuth={instagramFocus === 'comments'}
              />
            )}
            </>
          )}

          {/* =================================================================
              SECTION: AUTOMATISATIONS INSTAGRAM (commentaires → message privé, mots-clés, stories)
              ================================================================= */}
          {currentSection === 'automations' && (
            <InstagramAutomations
              key={`automations-${automationsVersion}`}
              businessName={businessName}
              isAdmin={isUserAdmin(profile)}
              onGoToInstagram={(why) => {
                setInstagramFocus(why === 'comments' ? 'comments' : null);
                handleSectionChange('instagram');
              }}
            />
          )}

          {/* =================================================================
              SECTION 6: CLIENTS
              ================================================================= */}
          {currentSection === 'leads' && (
            <>
            {isFreePlan && (
              <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-900">🔒 Réponses IA désactivées (plan gratuit)</p>
                  <p className="text-sm text-amber-800">La configuration est ouverte — active un plan pour que l'assistant réponde sur ce canal.</p>
                </div>
                <button type="button" onClick={() => handleSectionChange('billing')} className="shrink-0 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700">
                  Activer les réponses IA
                </button>
              </div>
            )}
            {showLockedGates ? (
              <LockedFeatureGate
                title="Clients & statistiques"
                subtitle="Accédez à la liste complète des coordonnées capturées par votre assistant (téléphone, email), filtres de qualification et tags silencieux."
                icon={Users}
                featureName="Clients & statistiques"
                benefits={[
                  "Liste complète de tes clients avec filtres et recherche",
                  "Détection technique des visiteurs (appareil, OS, navigateur, langue)",
                  "Export CSV complet et format publicitaire Google & Facebook Ads",
                  "Nombre de visiteurs, de conversations et de clients intéressés"
                ]}
                onUpgradeClick={() => handleSectionChange('billing')}
              />
            ) : (() => {
            const totalTracked = leadsList.length;
            const leadsWithContact = leadsList.filter(l => (l.email && l.email !== 'Non fourni') || (l.phone && l.phone !== 'Non fourni')).length;
            const captureRate = totalTracked > 0 ? Math.round((leadsWithContact / totalTracked) * 100) : 0;
            const totalCampaigns = new Set(leadsList.map(l => (l as any).utm_campaign).filter(Boolean)).size;
            
            const avgTimeSpent = (() => {
              const withTime = leadsList.filter(l => (l as any).timeSpent);
              if (withTime.length === 0) return '—'; // pas encore de mesure : on n'invente pas un chiffre
              const avg = Math.round(withTime.reduce((acc, curr) => acc + ((curr as any).timeSpent || 0), 0) / withTime.length);
              if (avg < 60) return avg + 's';
              return Math.floor(avg / 60) + 'm ' + (avg % 60) + 's';
            })();

            const filteredLeads = leadsList.filter(lead => {
              if (hasContactFilter) {
                const hasEmail = lead.email && lead.email !== 'Non fourni';
                const hasPhone = lead.phone && lead.phone !== 'Non fourni';
                if (!hasEmail && !hasPhone) return false;
              }
              if (statusFilter !== 'all') {
                if (lead.status !== statusFilter) return false;
              }
              if (searchTerm.trim() !== '') {
                const term = searchTerm.toLowerCase();
                const nameMatch = (lead.name || '').toLowerCase().includes(term);
                const emailMatch = (lead.email || '').toLowerCase().includes(term);
                const phoneMatch = (lead.phone || '').toLowerCase().includes(term);
                const needMatch = (lead.need || '').toLowerCase().includes(term);
                const idMatch = (lead.id || '').toLowerCase().includes(term);
                const utmSourceMatch = ((lead as any).utm_source || '').toLowerCase().includes(term);
                const utmCampaignMatch = ((lead as any).utm_campaign || '').toLowerCase().includes(term);
                const refererMatch = ((lead as any).referer || '').toLowerCase().includes(term);

                if (!nameMatch && !emailMatch && !phoneMatch && !needMatch && !idMatch && !utmSourceMatch && !utmCampaignMatch && !refererMatch) {
                  return false;
                }
              }
              return true;
            });

            return (
              <div className="space-y-6 animate-in fade-in duration-200">
                {insightsTab === 'analytics' ? (
                  <InsightsDashboard user={user} />
                ) : (
                  <>
                    {/* Export : une carte simple, deux boutons */}
                <div className="flex flex-col gap-4 rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(27,22,71,0.04)] sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base">Exporter mes contacts</h3>
                    <p className="mt-0.5 text-sm text-slate-500">{totalTracked} client{totalTracked > 1 ? 's' : ''} enregistré{totalTracked > 1 ? 's' : ''}. Télécharge la liste pour l’ouvrir dans Excel ou l’importer dans tes contacts.</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2.5 sm:flex-nowrap">
                    <button
                      type="button"
                      onClick={handleExportCSV}
                      disabled={leadsList.length === 0}
                      className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-gradient-to-r from-[#a23dff] to-[#5a2cff] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_-12px_rgba(110,50,255,0.7)] transition hover:brightness-110 disabled:opacity-40 cursor-pointer"
                    >
                      <Download className="h-4 w-4" /> Télécharger la liste
                    </button>
                    <button
                      type="button"
                      onClick={handleExportAdsCSV}
                      disabled={leadsList.length === 0}
                      className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#f1eaff] px-5 text-sm font-semibold text-purple-700 transition hover:bg-[#e8dcff] disabled:opacity-40 cursor-pointer"
                    >
                      <Target className="h-4 w-4" /> Pour mes publicités
                    </button>
                  </div>
                </div>

                {/* 1. Analytics & Metrics Dashboard row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Visiteurs Détectés</span>
                      <Users className="w-4 h-4 text-purple-500" />
                    </div>
                    <div className="text-2xl font-extrabold text-slate-900">{totalTracked}</div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span>Enregistrés en temps réel</span>
                    </div>
                  </div>

                  <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contacts Qualifiés</span>
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="text-2xl font-extrabold text-emerald-600">{leadsWithContact}</div>
                    <div className="text-[10px] text-slate-500">
                      Taux de capture de <strong className="text-slate-700">{captureRate}%</strong>
                    </div>
                  </div>

                  <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Campagnes Ads Actives</span>
                      <Target className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div className="text-2xl font-extrabold text-slate-900">{totalCampaigns}</div>
                    <div className="text-[10px] text-slate-500">
                      Sources UTM enregistrées
                    </div>
                  </div>

                  <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Engagement Moyen</span>
                      <Clock className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="text-2xl font-extrabold text-slate-900">{avgTimeSpent}</div>
                    <div className="text-[10px] text-slate-500">
                      Temps d'activité moyen
                    </div>
                  </div>
                </div>

                {/* 3. Main Split View Layout */}
                <div className="flex flex-col lg:flex-row gap-6">
                  
                  {/* CRM Table List */}
                  <div className={`p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4 flex-1 transition-all`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">Mes clients intéressés</h3>
                        <p className="text-xs text-slate-500">Filtrage dynamique et recherche approfondie en temps réel</p>
                      </div>

                      <div className="text-xs text-slate-500 font-medium">
                        {filteredLeads.length} sur {totalTracked} prospects affichés
                      </div>
                    </div>

                    {/* Filter and Search Bar */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      
                      {/* Search Bar */}
                      <div className="relative md:col-span-6">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Rechercher par nom, tel, besoin, UTM, origine..."
                          className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
                        />
                      </div>

                      {/* Status Filter */}
                      <div className="md:col-span-3">
                        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2">
                          <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
                          <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as any)}
                            className="w-full bg-transparent border-0 py-2 px-1 text-xs text-slate-700 focus:outline-none focus:ring-0 cursor-pointer font-semibold"
                          >
                            <option value="all">Tous les statuts</option>
                            <option value="nouveau">Nouveaux simples</option>
                            <option value="qualifie">Qualifiés (Discussions)</option>
                          </select>
                        </div>
                      </div>

                      {/* Contact Toggle Filter */}
                      <button
                        type="button"
                        onClick={() => setHasContactFilter(!hasContactFilter)}
                        className={`md:col-span-3 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                          hasContactFilter 
                            ? 'bg-purple-50 border-purple-200 text-purple-700' 
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Avec Coordonnées</span>
                      </button>

                    </div>

                    {/* Leads Table */}
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                          <tr>
                            <th className="p-3.5">Prospect</th>
                            <th className="p-3.5">Téléphone / WhatsApp</th>
                            <th className="p-3.5">Besoin / Canal UTM</th>
                            <th className="p-3.5">Statut</th>
                            <th className="p-3.5">Suivi</th>
                            <th className="p-3.5">Dernière Activité</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {filteredLeads.length > 0 ? (
                            filteredLeads.map((lead) => {
                              const hasContact = (lead.email && lead.email !== 'Non fourni') || (lead.phone && lead.phone !== 'Non fourni');
                              const utmSource = (lead as any).utm_source;
                              const utmCampaign = (lead as any).utm_campaign;
                              const followUpDate = lead.followUpAt && Number.isFinite(Date.parse(lead.followUpAt))
                                ? new Date(lead.followUpAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                                : '';

                              return (
                                <tr 
                                  key={lead.id} 
                                  onClick={() => setSelectedLeadId(lead.id)}
                                  className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                                    selectedLeadId === lead.id ? 'bg-purple-50/40 hover:bg-purple-50/60' : ''
                                  }`}
                                >
                                  <td className="p-3.5 font-bold text-slate-900">
                                    <div className="flex items-center gap-1.5">
                                      <div className="truncate max-w-[150px]">{lead.name}</div>
                                      {hasContact && (
                                        <span className="w-2 h-2 rounded-full bg-emerald-500" title="Contact qualifié" />
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-normal truncate max-w-[150px]">{lead.email}</div>
                                  </td>
                                  
                                  <td className="p-3.5 font-mono text-purple-700 font-bold whitespace-nowrap">
                                    {lead.phone}
                                  </td>

                                  <td className="p-3.5 max-w-xs">
                                    <div className="truncate font-medium text-slate-800">{lead.need}</div>
                                    {utmSource && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-[9px] font-bold text-indigo-600 border border-indigo-100">
                                          source: {utmSource}
                                        </span>
                                        {utmCampaign && (
                                          <span className="inline-block px-1.5 py-0.5 rounded bg-purple-50 text-[9px] font-bold text-purple-600 border border-purple-100">
                                            campagne: {utmCampaign}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>

                                  <td className="p-3.5">
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide ${
                                      lead.status === 'nouveau' 
                                        ? 'bg-slate-100 text-slate-600 border border-slate-200' 
                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    }`}>
                                      {lead.status === 'nouveau' ? 'visite simple' : 'qualifié'}
                                    </span>
                                  </td>

                                  <td className="p-3.5 min-w-[145px]">
                                    {lead.followUpStatus === 'pending' ? (
                                      <>
                                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-amber-700">À suivre</span>
                                        <div className="mt-1 max-w-[180px] truncate text-[10px] font-medium text-slate-600" title={lead.followUpReason || lead.nextAction}>{lead.followUpReason || lead.nextAction || 'Rappel commercial'}</div>
                                        {followUpDate && <div className="mt-0.5 text-[9px] text-slate-400">Échéance indicative : {followUpDate}</div>}
                                      </>
                                    ) : lead.followUpStatus === 'done' ? (
                                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-emerald-700">Traité</span>
                                    ) : lead.salesIntentType ? (
                                      <span className="text-[10px] font-semibold text-purple-600">Intérêt : {lead.salesIntentType}</span>
                                    ) : <span className="text-[10px] text-slate-300">—</span>}
                                  </td>
                                  <td className="p-3.5 text-slate-400 text-[10px] whitespace-nowrap">{lead.date}</td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">
                                Aucun client ne correspond à votre recherche.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Lead Details Bento Drawer Card */}
                  {selectedLeadId && (() => {
                    const lead = leadsList.find(l => l.id === selectedLeadId) as any;
                    if (!lead) return null;
                    
                    const utmSource = (lead as any).utm_source;
                    const utmMedium = (lead as any).utm_medium;
                    const utmCampaign = (lead as any).utm_campaign;
                    const utmContent = (lead as any).utm_content;
                    const utmTerm = (lead as any).utm_term;
                    const pageHistory = (lead as any).history || [];
                    const activeTime = (lead as any).timeSpent;

                    let device = 'Desktop';
                    let os = 'Inconnu';
                    let browser = 'Inconnu';
                    const ua = lead.userAgent || '';
                    if (ua) {
                      if (/Mobi|Android|iPhone|iPad/i.test(ua)) device = 'Mobile';
                      if (/Tablet|iPad/i.test(ua)) device = 'Tablet';
                      
                      if (/Windows/i.test(ua)) os = 'Windows';
                      else if (/Mac OS X/i.test(ua)) os = 'macOS';
                      else if (/Android/i.test(ua)) os = 'Android';
                      else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
                      else if (/Linux/i.test(ua)) os = 'Linux';
                      
                      if (/Chrome|CriOS/i.test(ua) && !/Edge|Edg|OPR|Opera/i.test(ua)) browser = 'Chrome';
                      else if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) browser = 'Safari';
                      else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
                      else if (/Edg/i.test(ua)) browser = 'Edge';
                      else if (/OPR|Opera/i.test(ua)) browser = 'Opera';
                    }

                    return (
                      <div className="w-full lg:w-[45%] xl:w-[40%] bg-white border border-slate-200 rounded-2xl shadow-md p-6 space-y-6 flex flex-col animate-in slide-in-from-right duration-250">
                        
                        {/* Drawer Header */}
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center text-white font-extrabold text-sm shadow-sm">
                              {lead.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-900 text-base">{lead.name}</h3>
                              <span className="text-[10px] font-mono text-slate-400">{lead.id}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedLeadId(null)}
                            className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Bento Grid: Coordonnées de Contact */}
                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>Informations de contact</span>
                          </h4>
                          
                          <div className="grid grid-cols-1 gap-2.5 text-xs">
                            <div className="flex items-center justify-between py-1 border-b border-slate-100">
                              <span className="text-slate-400">Nom Complet:</span>
                              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                                <span>{lead.name}</span>
                                {lead.city && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-semibold">📍 {lead.city}</span>
                                )}
                                {lead.name !== 'Visiteur Anonyme' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyField(lead.name, 'name')}
                                    className="p-1 hover:bg-slate-200 rounded-md text-slate-400 hover:text-purple-600 transition-all cursor-pointer"
                                  >
                                    {copiedField === 'name' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between py-1 border-b border-slate-100">
                              <span className="text-slate-400">Email:</span>
                              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                                <span>{lead.email}</span>
                                {lead.email !== 'Non fourni' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyField(lead.email, 'email')}
                                    className="p-1 hover:bg-slate-200 rounded-md text-slate-400 hover:text-purple-600 transition-all cursor-pointer"
                                  >
                                    {copiedField === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between py-1 border-b border-slate-100">
                              <span className="text-slate-400">Téléphone / WhatsApp:</span>
                              <div className="flex items-center gap-1.5 font-mono font-bold text-purple-700">
                                <span>{lead.phone}</span>
                                {lead.phone !== 'Non fourni' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyField(lead.phone, 'phone')}
                                    className="p-1 hover:bg-slate-200 rounded-md text-slate-400 hover:text-purple-600 transition-all cursor-pointer"
                                  >
                                    {copiedField === 'phone' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between py-1">
                              <span className="text-slate-400">ID Unique Prospect:</span>
                              <div className="flex items-center gap-1.5 font-mono text-slate-600">
                                <span className="truncate max-w-[180px]">{lead.id}</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyField(lead.id, 'id')}
                                  className="p-1 hover:bg-slate-200 rounded-md text-slate-400 hover:text-purple-600 transition-all cursor-pointer"
                                >
                                  {copiedField === 'id' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {(lead.followUpStatus || lead.salesIntentType) && (
                          <div className={`space-y-3 rounded-xl border p-4 ${lead.followUpStatus === 'pending' ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50'}`}>
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                                <Clock className="h-3.5 w-3.5 text-amber-500" /> Suivi commercial
                              </h4>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-slate-500">{lead.channel === 'instagram' ? 'Instagram' : lead.channel ? 'Mon site' : lead.source || 'Canal inconnu'}</span>
                            </div>
                            {lead.followUpReason && <p className="text-xs font-semibold text-slate-800">{lead.followUpReason}</p>}
                            {lead.nextAction && <p className="text-xs leading-relaxed text-slate-600"><span className="font-semibold">Prochaine action :</span> {lead.nextAction}</p>}
                            {lead.followUpNote && <p className="line-clamp-3 text-[10px] text-slate-500">{lead.followUpNote}</p>}
                            {lead.followUpAt && Number.isFinite(Date.parse(lead.followUpAt)) && (
                              <p className="text-[10px] text-slate-500">Échéance indicative : {new Date(lead.followUpAt).toLocaleString('fr-FR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
                            )}
                            {lead.followUpStatus === 'pending' && (
                              <button
                                type="button"
                                onClick={() => void handleCompleteLeadFollowUp(lead.id)}
                                disabled={leadFollowUpBusy !== null}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
                              >
                                {leadFollowUpBusy === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                Marquer le suivi comme traité
                              </button>
                            )}
                            {lead.followUpStatus === 'done' && <p className="text-[10px] font-semibold text-emerald-700">Suivi terminé{lead.followUpCompletedAt ? ` le ${new Date(lead.followUpCompletedAt).toLocaleDateString('fr-FR')}` : ''}.</p>}
                            {leadFollowUpError && <p role="alert" className="text-[10px] font-medium text-rose-600">{leadFollowUpError}</p>}
                          </div>
                        )}

                        {lead.channel === 'instagram' && lead.igUserId && (
                          <section className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900">Conversation Instagram</h4>
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${lead.handoffStatus === 'human' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                {lead.handoffStatus === 'human' ? 'Prise en main humaine' : 'Bot actif'}
                              </span>
                            </div>
                            <p className="text-[11px] leading-relaxed text-indigo-800">
                              {lead.handoffStatus === 'human'
                                ? 'Le bot est en pause pour ce client. Réponds directement depuis Instagram, puis rends la conversation au bot lorsque tu as terminé.'
                                : 'Tu peux mettre le bot en pause et reprendre la conversation directement dans Instagram.'}
                            </p>
                            <button
                              type="button"
                              onClick={() => void setLeadHandoff(lead, lead.handoffStatus === 'human' ? 'resume' : 'takeover')}
                              disabled={handoffBusy !== null}
                              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold text-white transition disabled:cursor-wait disabled:opacity-60 ${lead.handoffStatus === 'human' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                            >
                              {handoffBusy === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                              {lead.handoffStatus === 'human' ? 'Rendre la main au bot' : 'Reprendre la main'}
                            </button>
                            {handoffError && <p role="alert" className="text-[10px] font-medium text-rose-600">{handoffError}</p>}
                          </section>
                        )}

                        {lead.instagramOrigin && (
                          <section className="space-y-2 rounded-xl border border-pink-200 bg-pink-50/60 p-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-pink-900">Publication à l’origine de la conversation</h4>
                            {lead.instagramOrigin.thumbnail && <img src={lead.instagramOrigin.thumbnail} alt="Miniature de la publication Instagram" loading="lazy" className="max-h-40 w-full rounded-lg object-cover" />}
                            {lead.instagramOrigin.caption && <p className="line-clamp-3 text-xs text-slate-700">{lead.instagramOrigin.caption}</p>}
                            <p className="text-[10px] font-semibold text-pink-800">{lead.instagramOrigin.type || 'Contenu Instagram'}{lead.instagramOrigin.mediaId ? ` · ${lead.instagramOrigin.mediaId}` : ''}</p>
                            {lead.instagramOrigin.permalink && <a href={lead.instagramOrigin.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-pink-700 hover:text-pink-900">Ouvrir la publication <ExternalLink className="h-3 w-3" /></a>}
                          </section>
                        )}

                        {/* Les détails techniques intéressent rarement le commerçant : repliés par défaut */}
                        <button
                          type="button"
                          onClick={() => setShowLeadTech((v) => !v)}
                          className="flex w-full items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showLeadTech ? 'rotate-90' : ''}`} />
                          <span>Détails techniques (appareil, langue, publicité)</span>
                        </button>
                        {showLeadTech && (
                        <>
                        {/* Bento Grid: Profil Technique du Navigateur */}
                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Monitor className="w-3.5 h-3.5 text-slate-400" />
                            <span>Profil de l'appareil</span>
                          </h4>
                          
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex flex-col gap-0.5 p-2 rounded bg-white border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Appareil</span>
                              <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                                {device === 'Mobile' ? <Smartphone className="w-3.5 h-3.5 text-slate-400" /> : <Monitor className="w-3.5 h-3.5 text-slate-400" />}
                                <span>{device}</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-0.5 p-2 rounded bg-white border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Système (OS)</span>
                              <span className="font-semibold text-slate-700">{os}</span>
                            </div>
                            <div className="flex flex-col gap-0.5 p-2 rounded bg-white border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Navigateur</span>
                              <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                                <Globe className="w-3 h-3 text-slate-400" />
                                <span>{browser}</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-0.5 p-2 rounded bg-white border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Langue</span>
                              <span className="font-semibold text-slate-700">{lead.language ? lead.language.toUpperCase() : 'Inconnue'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Bento Grid: Origine & Campagnes UTM Publicitaires */}
                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 text-slate-400" />
                            <span>Origine de la visite</span>
                          </h4>

                          <div className="space-y-2 text-xs">
                            <div className="flex flex-col gap-0.5 p-2 rounded bg-white border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Provenance Initiale (Referer)</span>
                              <span className="font-semibold text-slate-700 truncate">{lead.referer || 'Accès Direct'}</span>
                            </div>

                            <div className="flex flex-col gap-1 p-2 rounded bg-white border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                <Database className="w-3 h-3 text-emerald-500" />
                                Tags Visiteur Silencieux (En-têtes HTTP)
                              </span>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {parseVisitorTags(lead.userAgent || '', lead.language || '').length > 0 ? (
                                  parseVisitorTags(lead.userAgent || '', lead.language || '').map((tag, idx) => (
                                    <span key={idx} className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200/60 shadow-sm">
                                      {tag}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">Méta-données indisponibles</span>
                                )}
                              </div>
                            </div>

                            {utmSource ? (
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-0.5 p-2 rounded bg-white border border-slate-100">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase">Source</span>
                                  <span className="font-semibold text-slate-800">{utmSource}</span>
                                </div>
                                <div className="flex flex-col gap-0.5 p-2 rounded bg-white border border-slate-100">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase">Campagne</span>
                                  <span className="font-semibold text-slate-800 truncate">{utmCampaign || 'Non spécifié'}</span>
                                </div>
                                <div className="flex flex-col gap-0.5 p-2 rounded bg-white border border-slate-100">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase">Support (Medium)</span>
                                  <span className="font-semibold text-slate-800">{utmMedium || 'Non spécifié'}</span>
                                </div>
                                <div className="flex flex-col gap-0.5 p-2 rounded bg-white border border-slate-100">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase">Contenu Ad</span>
                                  <span className="font-semibold text-slate-800 truncate">{utmContent || 'Non spécifié'}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-400 italic bg-white p-2.5 rounded border border-slate-100 text-center">
                                Aucune balise publicitaire UTM détectée (Visite naturelle)
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Bento Grid: Navigation sur le site */}
                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>Comportement & Parcours</span>
                          </h4>

                          <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between p-2 rounded bg-white border border-slate-100">
                              <span className="text-slate-400 font-medium">Temps actif passé :</span>
                              <span className="font-extrabold text-purple-700 font-mono">
                                {activeTime ? (activeTime < 60 ? activeTime + ' s' : Math.floor(activeTime / 60) + ' min ' + (activeTime % 60) + ' s') : '15 s'}
                              </span>
                            </div>

                            <div className="flex flex-col gap-1 p-2 rounded bg-white border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Parcours des pages visitées ({pageHistory.length})</span>
                              <div className="space-y-1 max-h-24 overflow-y-auto text-[10px] font-mono mt-1 text-slate-600 divide-y divide-slate-50">
                                {pageHistory.length > 0 ? (
                                  pageHistory.map((p: string, idx: number) => (
                                    <div key={idx} className="py-1 truncate" title={p}>
                                      <span className="text-purple-600 font-bold mr-1">#{idx + 1}</span> {p}
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-slate-400 italic">Page d'accueil uniquement</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Bento Grid: Terminal Machine Details */}
                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/60 text-[11px] text-slate-600">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-slate-400" />
                            <span>Système d'exploitation & Navigateur</span>
                          </h4>
                          <div className="grid grid-cols-2 gap-2">
                            <div><strong className="text-slate-400">Langue:</strong> {lead.language?.toUpperCase() || 'FR'}</div>
                            <div><strong className="text-slate-400">Timezone:</strong> {lead.timezone || 'Europe/Paris'}</div>
                            <div className="col-span-2 truncate"><strong className="text-slate-400">Résolution:</strong> {lead.screenResolution || 'Standard screen'}</div>
                            <div className="col-span-2 truncate"><strong className="text-slate-400">UserAgent:</strong> {lead.userAgent}</div>
                          </div>
                        </div>
                        </>
                        )}

                        {/* Detailed Chat Logs */}
                        <div className="flex-1 flex flex-col min-h-[200px] max-h-[300px] space-y-2">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Conversation</h4>
                          <div className="flex-1 overflow-y-auto p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
                            {lead.messages && lead.messages.length > 0 ? (
                              lead.messages.map((m: any, idx: number) => (
                                <div key={idx} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                                  <div className={`max-w-[85%] px-3 py-1.5 rounded-xl text-xs leading-relaxed ${
                                    m.sender === 'user'
                                      ? 'bg-purple-600 text-white rounded-br-none'
                                      : 'bg-slate-800 text-slate-100 rounded-bl-none'
                                  }`}>
                                    {m.text}
                                  </div>
                                  <span className="text-[8px] text-slate-500 mt-0.5 px-1">
                                    {m.timestamp ? new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div className="h-full flex items-center justify-center text-[11px] text-slate-500 italic">
                                Aucun message textuel échangé (Visite simple)
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    );
                  })()}

                </div>
                  </>
                )}
              </div>
            );
          })()}
            </>
          )}

          {/* =================================================================
              SECTION: COMPORTEMENT (comment le bot parle)
              ================================================================= */}
          {currentSection === 'behavior' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="mb-1 flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-purple-600" />
                  <h2 className="text-lg font-bold text-slate-800">Comment le bot parle</h2>
                </div>
                <p className="text-sm text-slate-500 mb-5">La personnalité de ton bot. Ces règles sont <b>prioritaires sur sa base de connaissances</b> : si tu interdis ici quelque chose, il l'interdit — même si l'info existe dans « Mes informations ». Actif sur le site ET Instagram.</p>

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">🗣️ Langue de réponse</label>
                    <select value={behavior.language} onChange={(e) => updateBehavior({ language: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 cursor-pointer">
                      <option value="auto">Automatique — il répond dans la langue du client</option>
                      <option value="fr">Français uniquement</option>
                      <option value="darija_dz">100% algérien (darija algérienne)</option>
                      <option value="darija_tn">100% tunisien (darija tunisienne)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">📏 Quantité de parole</label>
                    <div className="flex flex-wrap gap-2">
                      {([['short', 'Bref — parle pas trop'], ['normal', 'Normal'], ['detailed', 'Détaillé']] as const).map(([v, l]) => (
                        <button key={v} type="button" onClick={() => updateBehavior({ length: v })}
                          className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all cursor-pointer ${behavior.length === v ? 'bg-purple-600 text-white border-purple-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">🌐 Le lien de ton site</label>
                    <select value={behavior.websiteMentions} onChange={(e) => updateBehavior({ websiteMentions: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 cursor-pointer">
                      <option value="auto">Automatique — il l'envoie quand c'est utile</option>
                      <option value="on_request">Seulement si le client le demande</option>
                      <option value="never">Ne JAMAIS mentionner le site</option>
                    </select>
                  </div>

                  <div className="space-y-2.5">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={behavior.stopWhenConfused} onChange={(e) => updateBehavior({ stopWhenConfused: e.target.checked })} className="mt-0.5 w-4 h-4 accent-purple-600 cursor-pointer" />
                      <span className="text-sm text-slate-700">Quand il ne comprend pas, il le dit honnêtement au lieu d'inventer une réponse</span>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={behavior.stopCommand} onChange={(e) => updateBehavior({ stopCommand: e.target.checked })} className="mt-0.5 w-4 h-4 accent-purple-600 cursor-pointer" />
                      <span className="text-sm text-slate-700">Le client peut faire taire le bot en écrivant « stop » — et le relancer avec « reprends »</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">📝 Tes règles particulières (obligatoires pour le bot)</label>
                    <textarea value={behavior.customRules} onChange={(e) => updateBehavior({ customRules: e.target.value })} rows={4} maxLength={1000} placeholder="Ex : ne jamais parler de politique · toujours proposer la promo d'abord · tutoyer les clients · ne répondre qu'aux questions sur nos produits" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white" />
                    <p className="text-[11px] text-slate-400 mt-1">Une règle par ligne. Le bot les respecte à la lettre — elles priment sur tout le reste.</p>
                  </div>

                  <button type="button" onClick={() => { void handleSaveBehavior(); }} disabled={isSavingDb} className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold shadow-sm shadow-purple-600/30 disabled:opacity-50 flex items-center gap-2 cursor-pointer">
                    {isSavingDb ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer le comportement
                  </button>
                  {behaviorSaveMessage === 'success' && (
                    <p role="status" aria-live="polite" className="text-sm text-emerald-700">Comportement enregistré.</p>
                  )}
                  {behaviorSaveMessage === 'error' && (
                    <p role="alert" className="text-sm text-rose-700">Échec de l’enregistrement. Vérifie ta connexion puis réessaie.</p>
                  )}
                  {behavior.autoInsights && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-sm font-semibold text-emerald-900">🎯 Ce que le bot a appris de TA cible</p>
                      <p className="text-sm text-emerald-800 mt-1">{behavior.autoInsights}</p>
                      <p className="text-[11px] text-emerald-600 mt-2">Mis à jour automatiquement chaque semaine à partir des vraies conversations de ton assistant (flux « Apprentissage »).</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              SECTION: COMMANDES (confirmées explicitement par le client)
              ================================================================= */}
          {currentSection === 'orders' && (() => {
            const orders = leadsList.flatMap((lead) => (lead.orders || []).map((order) => ({ lead, order })))
              .sort((a, b) => Date.parse(b.order.createdAt || '') - Date.parse(a.order.createdAt || ''));
            const labels: Record<string, string> = {
              pending_merchant_confirmation: 'À confirmer par la boutique',
              confirmed: 'Confirmée', preparing: 'En préparation', shipped: 'Expédiée', delivered: 'Livrée', cancelled: 'Annulée',
            };
            const steps = ['pending_merchant_confirmation', 'confirmed', 'preparing', 'shipped', 'delivered'];
            const nextStatuses: Record<string, Array<{ status: string; label: string; destructive?: boolean }>> = {
              pending_merchant_confirmation: [{ status: 'confirmed', label: 'Confirmer la commande' }, { status: 'cancelled', label: 'Annuler', destructive: true }],
              confirmed: [{ status: 'preparing', label: 'Démarrer la préparation' }, { status: 'cancelled', label: 'Annuler', destructive: true }],
              preparing: [{ status: 'shipped', label: 'Marquer comme expédiée' }, { status: 'cancelled', label: 'Annuler', destructive: true }],
              shipped: [{ status: 'delivered', label: 'Marquer comme livrée' }],
              delivered: [], cancelled: [],
            };
            return (
              <div className="mx-auto max-w-6xl space-y-6 animate-in fade-in duration-200">
                <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-purple-600" /><h2 className="text-lg font-bold text-slate-900">Commandes via l’assistant</h2></div>
                    <p className="mt-1 text-sm text-slate-500">Seules les demandes confirmées explicitement par le client apparaissent ici. Vérifie prix et disponibilité avant de confirmer.</p>
                  </div>
                  <span className="inline-flex w-fit items-center rounded-full bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700">{orders.length} commande{orders.length === 1 ? '' : 's'}</span>
                </div>
                {orderActionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{orderActionError}</p>}
                {orders.length ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {orders.map(({ lead, order }) => {
                      const currentStep = steps.indexOf(order.status);
                      const busyKey = `${lead.id}:${order.id}`;
                      const created = order.createdAt && Number.isFinite(Date.parse(order.createdAt))
                        ? new Date(order.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : 'Date indisponible';
                      return (
                        <article key={`${lead.id}:${order.id}`} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{order.reference || order.id} · {order.channel || lead.channel || 'Assistant'}</p>
                              <h3 className="mt-1 text-base font-bold text-slate-900">{order.customerName || lead.name}</h3>
                              <p className="text-xs text-slate-500">{created}</p>
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${order.status === 'pending_merchant_confirmation' ? 'border-amber-200 bg-amber-50 text-amber-800' : order.status === 'cancelled' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                              {labels[order.status] || order.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                            <div><span className="block text-[10px] font-semibold uppercase text-slate-400">Téléphone</span><span className="font-semibold text-slate-800">{order.phone || lead.phone || 'Non fourni'}</span></div>
                            <div><span className="block text-[10px] font-semibold uppercase text-slate-400">Ville</span><span className="font-semibold text-slate-800">{order.city || lead.city || 'Non précisée'}</span></div>
                            {order.deliveryAddress && <div className="col-span-2"><span className="block text-[10px] font-semibold uppercase text-slate-400">Adresse de livraison</span><span className="font-semibold text-slate-800">{order.deliveryAddress}</span></div>}
                            <div className="col-span-2"><span className="block text-[10px] font-semibold uppercase text-slate-400">Montant</span><span className="font-semibold text-slate-800">{typeof order.totalAmount === 'number' ? `${new Intl.NumberFormat('fr-DZ').format(order.totalAmount)} DA` : 'À vérifier avec le client — montant non confirmé'}</span></div>
                          </div>
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Suivi de commande</p>
                            {order.status === 'cancelled' ? <p className="text-xs font-semibold text-rose-700">Cette demande a été annulée.</p> : (
                              <div className="grid grid-cols-5 gap-1">
                                {steps.map((step, index) => {
                                  const complete = currentStep >= 0 && index <= currentStep;
                                  return <div key={step} className="min-w-0"><div className={`h-1.5 rounded-full ${complete ? 'bg-purple-600' : 'bg-slate-200'}`} /><p className={`mt-1 truncate text-[8px] ${complete ? 'font-bold text-purple-700' : 'text-slate-400'}`}>{labels[step]}</p></div>;
                                })}
                              </div>
                            )}
                          </div>
                          <div className="rounded-xl border border-slate-100 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Résumé transmis par le client</p>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{order.summary || lead.need || 'Aucun détail produit enregistré.'}</p>
                          </div>
                          {Array.isArray(order.changeHistory) && order.changeHistory.length > 0 && (
                            <div className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Changements confirmés par le client</p>
                              {[...order.changeHistory].slice(-3).reverse().map((change, index) => (
                                <div key={`${change.type}:${change.confirmedAt || index}`} className="text-xs text-slate-700">
                                  <span className="font-semibold">{change.type === 'customer_cancellation' ? 'Annulation' : 'Modification'}{change.confirmedAt ? ` · ${new Date(change.confirmedAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                                  {(change.details || change.reason) && <p className="mt-0.5 whitespace-pre-wrap">{change.details || change.reason}</p>}
                                </div>
                              ))}
                            </div>
                          )}
                          {lead.instagramOrigin && (
                            <div className="flex items-center justify-between gap-2 rounded-xl border border-pink-100 bg-pink-50/60 p-3 text-xs">
                              <span className="font-semibold text-pink-900">Origine : {lead.instagramOrigin.type || 'publication Instagram'}</span>
                              {lead.instagramOrigin.permalink && <a href={lead.instagramOrigin.permalink} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-semibold text-pink-700">Ouvrir <ExternalLink className="h-3 w-3" /></a>}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                            <button type="button" onClick={() => { setSelectedLeadId(lead.id); setInsightsTab('prospects'); handleSectionChange('leads'); }} className="text-xs font-semibold text-purple-700 hover:text-purple-900">Voir la conversation</button>
                            <div className="flex flex-wrap gap-2">
                              {(nextStatuses[order.status] || []).map((action) => (
                                <button key={action.status} type="button" onClick={() => void updateOrderStatus(lead.id, order.id, action.status)} disabled={orderActionBusy !== null} className={`rounded-lg px-3 py-2 text-[10px] font-bold transition disabled:cursor-wait disabled:opacity-60 ${action.destructive ? 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
                                  {orderActionBusy === busyKey ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}{action.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                    <ShoppingCart className="mx-auto h-9 w-9 text-slate-300" />
                    <h3 className="mt-3 font-bold text-slate-800">Aucune commande pour le moment</h3>
                    <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">Une commande apparaîtra ici uniquement après une confirmation claire du client dans une conversation avec l’assistant.</p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* =================================================================
              SECTION: BILLING & PLAN (Professional SaaS Billing Dashboard)
              ================================================================= */}
          {currentSection === 'billing' && (
            <div className="space-y-8 animate-in fade-in duration-200">
              
              {/* Notification Banner */}
              {billingNotification && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span className="text-sm font-semibold">{billingNotification}</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setBillingNotification(null)}
                    className="text-emerald-500 hover:text-emerald-800 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {billingViewMode === 'checkout' ? (
                <CheckoutWizard
                  billingCycle={billingCycle}
                  setBillingCycle={setBillingCycle}
                  selectedCheckoutPlan={selectedCheckoutPlan}
                  setSelectedCheckoutPlan={setSelectedCheckoutPlan}
                  checkoutStep={checkoutStep}
                  setCheckoutStep={setCheckoutStep}
                  checkoutName={checkoutName}
                  setCheckoutName={setCheckoutName}
                  checkoutEmail={checkoutEmail}
                  setCheckoutEmail={setCheckoutEmail}
                  checkoutCompany={checkoutCompany}
                  setCheckoutCompany={setCheckoutCompany}
                  checkoutPhone={checkoutPhone}
                  setCheckoutPhone={setCheckoutPhone}
                  checkoutPaymentMethod={checkoutPaymentMethod}
                  setCheckoutPaymentMethod={setCheckoutPaymentMethod}
                  checkoutSlickpayType={checkoutSlickpayType}
                  setCheckoutSlickpayType={setCheckoutSlickpayType}
                  checkoutCardNumber={checkoutCardNumber}
                  setCheckoutCardNumber={setCheckoutCardNumber}
                  checkoutCardExp={checkoutCardExp}
                  setCheckoutCardExp={setCheckoutCardExp}
                  checkoutCardCvc={checkoutCardCvc}
                  setCheckoutCardCvc={setCheckoutCardCvc}
                  checkoutRipRef={checkoutRipRef}
                  setCheckoutRipRef={setCheckoutRipRef}
                  isProcessingPayment={isProcessingPayment}
                  handleConfirmPayment={handleConfirmPayment}
                  setBillingViewMode={setBillingViewMode}
                  user={user}
                />
              ) : (
                null
              )}
              {/* (ancien paiement intégré supprimé : le tunnel CheckoutWizard le remplace) */}
              {billingViewMode === 'overview' && (
                /* NORMAL BILLING OVERVIEW VIEW */
                <>
                  {/* Page Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                      {activePlan === 'free' ? 'Formule gratuite' : 'Abonnement actif'}
                    </span>
                    {renewalShort && <span className="text-xs text-slate-400">· Renouvellement le {renewalShort}</span>}
                  </div>
                  <p className="text-sm text-slate-500">
                    Gérez vos crédits de conversation, votre abonnement et accédez à vos factures.
                  </p>
                </div>

                {/* Billing Cycle Toggle */}
                <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white shadow-[0_1px_2px_rgba(27,22,71,0.06)] shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                      billingCycle === 'monthly'
                        ? 'bg-gradient-to-r from-[#a23dff] to-[#5a2cff] text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Chaque mois
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle('yearly')}
                    className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                      billingCycle === 'yearly'
                        ? 'bg-gradient-to-r from-[#a23dff] to-[#5a2cff] text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>Annuel</span>
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] bg-emerald-400 text-slate-900 font-extrabold uppercase">
                      -20%
                    </span>
                  </button>
                </div>
              </div>

              {/* Grid Top: Active Plan Hero Card + Usage Metrics */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Active Plan Overview Card */}
                <div className="lg:col-span-1 bg-[#1b1647] rounded-[24px] p-6 text-white flex flex-col justify-between">
                  
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-purple-500/20 text-purple-200 border border-purple-400/30 uppercase tracking-wider">
                        Votre formule : {activePlan === 'free' ? 'Découverte' : activePlan === 'basic' ? 'Basic' : activePlan === 'pro' ? 'Pro' : 'Entreprise'}
                      </span>
                      <span className="text-xs text-purple-300 font-medium">Actif</span>
                    </div>

                    <div className="mb-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-semibold tracking-tight">
                          {activePlan === 'free' ? '$0' : ''}
                          {activePlan === 'basic' ? (billingCycle === 'monthly' ? '$29' : '$23') : ''}
                          {activePlan === 'pro' ? (billingCycle === 'monthly' ? '$79' : '$63') : ''}
                          {activePlan === 'enterprise' ? (billingCycle === 'monthly' ? '$199' : '$159') : ''}
                        </span>
                        <span className="text-sm text-purple-200">/ mois</span>
                      </div>
                      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white/10 text-slate-200 text-xs font-medium">
                        ~{activePlan === 'free' 
                          ? '0 DZD'
                          : activePlan === 'basic' 
                          ? (billingCycle === 'monthly' ? '6 850 DZD' : '5 480 DZD') 
                          : activePlan === 'pro' 
                            ? (billingCycle === 'monthly' ? '18 700 DZD' : '14 960 DZD') 
                            : (billingCycle === 'monthly' ? '47 100 DZD' : '37 680 DZD')} / mois
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        {billingCycle === 'yearly' ? 'Facturé une fois par an (-20%)' : 'Facturé chaque mois, sans engagement'}
                      </p>
                    </div>

                    {/* Quick Specs */}
                    <div className="space-y-2.5 pt-4 border-t border-white/10 text-xs text-purple-100">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Prochain paiement</span>
                        <span className="font-semibold">{renewalLong}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setBillingNotification("Un e-mail de confirmation vous a été envoyé pour ajuster les options de votre abonnement.");
                      }}
                      className="w-full py-2.5 px-4 rounded-lg bg-white text-slate-900 hover:bg-slate-200 text-xs font-semibold transition-colors text-center cursor-pointer"
                    >
                      Gérer mon abonnement
                    </button>
                  </div>
                </div>

                {/* Mon utilisation : deux chiffres, pas plus */}
                <div className="lg:col-span-2 bg-white rounded-[24px] p-6 shadow-[0_1px_2px_rgba(27,22,71,0.04)] flex flex-col">
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">Mon utilisation</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Ce que votre assistant a traité ce mois-ci.</p>
                      </div>
                      <span className="text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1">
                        {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                      </span>
                    </div>

                    <div className="grid flex-1 grid-cols-1 gap-4">
                      <div className="flex flex-col justify-center gap-3 rounded-2xl bg-[#f7f8fd] p-5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">Clients intéressés</span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {leadsList.length}
                            <span className="text-slate-400 font-normal">
                              {' / '}
                              {activePlan === 'free' ? 'non activé' : activePlan === 'basic' ? '1 000' : activePlan === 'pro' ? '5 000' : 'illimité'}
                            </span>
                          </span>
                        </div>
                        <div className="w-full h-2 bg-white rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#5a2cff] rounded-full"
                            style={{
                              width: `${activePlan === 'free' ? 0 : activePlan === 'basic' ? Math.min(100, Math.round((leadsList.length / 1000) * 100)) : activePlan === 'pro' ? Math.min(100, Math.round((leadsList.length / 5000) * 100)) : 4}%`
                            }}
                          />
                        </div>
                        <p className="text-xs text-slate-400">Depuis le début de votre abonnement</p>
                      </div>

                      <div className="flex flex-col justify-center gap-3 rounded-2xl bg-[#f7f8fd] p-5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">Informations enregistrées</span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {knowledgeNotes.filter(n => n.enabled).length}
                            <span className="text-slate-400 font-normal">
                              {' / '}
                              {activePlan === 'free' ? '3' : activePlan === 'basic' ? '10' : activePlan === 'pro' ? '50' : 'illimité'}
                            </span>
                          </span>
                        </div>
                        <div className="w-full h-2 bg-white rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#5a2cff] rounded-full"
                            style={{ width: `${Math.min(100, (knowledgeNotes.filter(n => n.enabled).length / (activePlan === 'free' ? 3 : activePlan === 'basic' ? 10 : 50)) * 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-400">Fiches que votre assistant peut utiliser</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Plans Comparison Section */}
              <div className="space-y-6 pt-4">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">Changer de formule</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Vous pouvez changer de formule ou arrêter à tout moment.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

                  {/* Plan 0: Découverte */}
                  <div className={`bg-white rounded-3xl p-6 border transition-all flex flex-col justify-between ${
                    activePlan === 'free'
                      ? 'border-purple-600 shadow-md ring-2 ring-purple-600/20'
                      : 'border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold text-slate-900">Découverte</h3>
                        {activePlan === 'free' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-700">
                            Plan Actuel
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            Test & Intégration
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mb-4 min-h-[32px]">Pour découvrir la plateforme et préparer son intégration sans risque</p>
                      
                      <div className="mb-5 pb-4 border-b border-slate-100">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-slate-900">$0</span>
                          <span className="text-xs text-slate-500"> / mois</span>
                        </div>
                        <span className="text-xs font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 mt-1 inline-block">
                          0 DZD / mois
                        </span>
                      </div>

                      <ul className="space-y-2.5 text-xs text-slate-600 mb-6">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Accès à votre espace client</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Installation de la bulle sur votre site</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Connexion possible à Instagram</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                          <span className="text-slate-400">Réponses automatiques non activées</span>
                        </li>
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCheckoutPlan('free');
                        setBillingViewMode('checkout');
                      }}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activePlan === 'free'
                          ? 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {activePlan === 'free' ? 'Plan Actuel' : 'Commencer gratuitement'}
                    </button>
                  </div>
                  
                  {/* Plan 1: Plan Basic */}
                  <div className={`bg-white rounded-3xl p-6 border transition-all flex flex-col justify-between ${
                    activePlan === 'basic'
                      ? 'border-purple-600 shadow-md ring-2 ring-purple-600/20'
                      : 'border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-slate-900">Basic</h3>
                        {activePlan === 'basic' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-700">
                            Plan Actuel
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            100% Web
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mb-4 min-h-[32px]">Idéal pour intégrer votre premier assistant sur votre site web</p>
                      
                      <div className="mb-5 pb-4 border-b border-slate-100">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-slate-900">{billingCycle === 'monthly' ? '$29' : '$23'}</span>
                          <span className="text-xs text-slate-500"> / mois</span>
                        </div>
                        <span className="text-xs font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 mt-1 inline-block">
                          ~{billingCycle === 'monthly' ? '6 850' : '5 480'} DZD / mois
                        </span>
                      </div>

                      <ul className="space-y-2.5 text-xs text-slate-600 mb-6">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Bulle sur votre site (WordPress, Shopify, Wix…)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Jusqu’à <strong>1 000</strong> conversations par mois</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Vos informations (prix, horaires, livraison)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Réponses en français et en darija</span>
                        </li>
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCheckoutPlan('basic');
                        setBillingViewMode('checkout');
                      }}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activePlan === 'basic'
                          ? 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {activePlan === 'basic' ? 'Renouveler le Plan Basic' : 'Choisir le Plan Basic'}
                    </button>
                  </div>

                  {/* Plan 2: Plan Pro / Business (Popular) */}
                  <div className={`bg-white rounded-3xl p-6 border relative transition-all flex flex-col justify-between ${
                    activePlan === 'pro'
                      ? 'border-purple-600 shadow-xl ring-2 ring-purple-600/30'
                      : 'border-purple-200 shadow-md hover:border-purple-400'
                  }`}>
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[10px] font-extrabold uppercase tracking-wider rounded-full shadow-sm flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Le Plus Populaire
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2 mt-1">
                        <h3 className="text-lg font-semibold text-slate-900">Pro</h3>
                        {activePlan === 'pro' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-700">
                            Plan Actuel
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mb-4 min-h-[32px]">Pour commerces & entreprises voulant le Web + accès prioritaire aux réseaux</p>
                      
                      <div className="mb-5 pb-4 border-b border-purple-100">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-slate-900">{billingCycle === 'monthly' ? '$79' : '$63'}</span>
                          <span className="text-xs text-slate-500"> / mois</span>
                        </div>
                        <span className="text-xs font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 mt-1 inline-block">
                          ~{billingCycle === 'monthly' ? '18 700' : '14 960'} DZD / mois
                        </span>
                      </div>

                      <ul className="space-y-2.5 text-xs text-slate-600 mb-6">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                          <span>Installation sur tous vos sites</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                          <span>WhatsApp et réseaux sociaux (bientôt)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                          <span>Jusqu’à <strong>5 000</strong> conversations par mois</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                          <span>Coordonnées des clients enregistrées automatiquement</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                          <span>Assistance prioritaire</span>
                        </li>
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCheckoutPlan('pro');
                        setBillingViewMode('checkout');
                      }}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activePlan === 'pro'
                          ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm shadow-purple-600/30'
                          : 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm shadow-purple-600/30'
                      }`}
                    >
                      {activePlan === 'pro' ? 'Renouveler le Plan Pro' : 'Choisir le Plan Pro'}
                    </button>
                  </div>

                  {/* Plan 3: Plan Enterprise */}
                  <div className={`bg-white rounded-3xl p-6 border transition-all flex flex-col justify-between ${
                    activePlan === 'enterprise'
                      ? 'border-purple-600 shadow-md ring-2 ring-purple-600/20'
                      : 'border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-slate-900">Entreprise</h3>
                        {activePlan === 'enterprise' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-700">
                            Plan Actuel
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            Sur mesure
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mb-4 min-h-[32px]">Pour grandes structures, réseaux & architectures sur-mesure</p>
                      
                      <div className="mb-5 pb-4 border-b border-slate-100">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-slate-900">{billingCycle === 'monthly' ? '$199' : '$159'}</span>
                          <span className="text-xs text-slate-500"> / mois</span>
                        </div>
                        <span className="text-xs font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 mt-1 inline-block">
                          ~{billingCycle === 'monthly' ? '47 100' : '37 680'} DZD / mois
                        </span>
                      </div>

                      <ul className="space-y-2.5 text-xs text-slate-600 mb-6">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Widget Web complet pour l'ensemble de vos sites</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Tous les canaux inclus (Web actif + WhatsApp/Réseaux dès disponibilité)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Conversations <strong>illimitées</strong> / volume élevé</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Connexion avec tes outils de gestion</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Accompagnement dédié et configuration sur site</span>
                        </li>
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCheckoutPlan('enterprise');
                        setBillingViewMode('checkout');
                      }}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activePlan === 'enterprise'
                          ? 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {activePlan === 'enterprise' ? 'Renouveler Enterprise' : 'Activer Enterprise'}
                    </button>
                  </div>

                </div>
              </div>

              {/* Payment Method & Invoices History */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
                
                {/* Payment Card Info */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-900">Moyen de paiement</h3>
                    <CreditCard className="w-5 h-5 text-purple-600" />
                  </div>
                  
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3 mb-4">
                    <div className="w-10 h-7 rounded bg-purple-900 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                      STRIPE
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Paiement Sécurisé</p>
                      <p className="text-[11px] text-slate-500">Compte vérifié</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600 mb-4">
                    <p className="flex justify-between">
                      <span className="text-slate-400">Titulaire :</span>
                      <span className="font-semibold">{profile?.companyName || user?.displayName || user?.email || 'Compte Actif'}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-400">E-mail de facturation :</span>
                      <span className="font-semibold truncate max-w-[170px]">{user?.email || 'Non renseigné'}</span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCheckoutPlan(activePlan);
                      setBillingViewMode('checkout');
                    }}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-colors cursor-pointer text-center shadow-sm"
                  >
                    Payer / Régler mon Abonnement
                  </button>
                </div>

                {/* Invoices History Table */}
                <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Mes factures</h3>
                      <p className="text-xs text-slate-500">Consultez vos reçus et factures d'abonnement.</p>
                    </div>
                    <FileText className="w-5 h-5 text-slate-400" />
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase text-[10px]">
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Référence</th>
                          <th className="py-2 px-3">Montant</th>
                          <th className="py-2 px-3">Statut</th>
                          <th className="py-2 px-3 text-right">Reçu</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {invoicesList.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400 font-medium">
                              Aucune facture archivée pour le moment. Réglez un abonnement via le bouton ci-contre pour générer votre première quittance.
                            </td>
                          </tr>
                        ) : (
                          invoicesList.map((inv) => (
                            <tr key={inv.id}>
                              <td className="py-3 px-3 font-medium">{inv.date}</td>
                              <td className="py-3 px-3 font-mono text-slate-500">{inv.id}</td>
                              <td className="py-3 px-3 font-bold text-slate-900">${inv.amountUsd}.00 <span className="text-[10px] text-purple-700 font-normal">({inv.amountDzd.toLocaleString('fr-FR')} DZD)</span></td>
                              <td className="py-3 px-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                  Payée
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const txt = `FACTURING RECEIPT - ${inv.id}\nDate: ${inv.date}\nPlan: ${inv.planName}\nAmount: $${inv.amountUsd}.00 (${inv.amountDzd} DZD)\nStatus: PAID`;
                                    const blob = new Blob([txt], { type: 'text/plain' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `Facture_${inv.id}.txt`;
                                    a.click();
                                  }}
                                  className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-800 font-bold hover:underline cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" /> Reçu PDF
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

                </>
              )}

            </div>
          )}

          {/* =================================================================
              SECTION 7: SETTINGS & ACCOUNT MANAGEMENT
              ================================================================= */}
          {currentSection === 'settings' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <AccountProfileView
                onAssistantProfileUpdate={async ({ companyName: nextCompanyName, phoneNumber }) => {
                  if (!assistantLoaded) throw new Error('Votre assistant se charge encore. Réessayez dans quelques instants.');
                  const nextBusinessInfo = { ...businessInfo, phone: phoneNumber };
                  setBusinessName(nextCompanyName);
                  setBusinessInfo(nextBusinessInfo);
                  const savedId = await handleSaveToDatabase(undefined, {
                    businessName: nextCompanyName,
                    businessInfo: nextBusinessInfo,
                  });
                  if (!savedId) throw new Error('Les informations du profil n’ont pas pu être enregistrées dans l’assistant.');
                }}
              />
            </div>
          )}

        </main>
        </div>
      </div>

      {/* =================================================================
          « PARLER À MON IA » : le chat où le marchand donne des ordres à son IA
          (bouton flottant + fenêtre de discussion, disponibles sur tous les écrans)
          ================================================================= */}
      {user && (
        <>
          {currentSection !== 'overview' && !copilotOpen && (
            <CopilotLauncher onClick={openCopilot} unread={copilotUnread} />
          )}
          <CopilotChat
            mode={currentSection === 'overview' ? 'page' : 'drawer'}
            homeHost={copilotHost}
            firstName={homeFirstName}
            summary={{ online: isReadyToDeploy, leads: leadsList.length, notes: knowledgeNotes.filter((n) => n.enabled).length }}
            todo={homeTodo}
            notice={homeNotice}
            open={copilotOpen}
            onClose={() => setCopilotOpen(false)}
            userId={user.uid}
            assistantId={assistantId}
            ensureReady={ensureAssistantReady}
            onStatePatch={applyCopilotPatch}
            onNavigate={(section: CopilotSection) => handleSectionChange(section)}
            onBusyChange={handleCopilotBusy}
            onReply={() => { if (!copilotOpenRef.current && currentSectionRef.current !== 'overview') setCopilotUnread(true); }}
            onResync={resyncFromDatabase}
          />
        </>
      )}

    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Bot,
  Globe,
  Database,
  MessageSquare,
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
  Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { saveAssistantToDatabase, getUserAssistants, WidgetCustomization, db, isUserAdmin } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { WidgetCustomizer } from './WidgetCustomizer';
import { KnowledgeNotesManager } from './KnowledgeNotesManager';
import { AccountProfileView } from './AccountProfileView';
import { CheckoutWizard } from './CheckoutWizard';
import { InstagramIntegration } from './InstagramIntegration';
import { InsightsDashboard } from './InsightsDashboard';
import { LockedFeatureGate } from './LockedFeatureGate';
import { WebhookTestingUtility } from './WebhookTestingUtility';
import { KnowledgeNote, PaymentPlanId, InvoiceRecord } from '../types';

export type DashboardSectionId = 'overview' | 'crawler' | 'knowledge' | 'widget' | 'simulator' | 'leads' | 'integration' | 'instagram' | 'settings' | 'billing';

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
  const [insightsTab, setInsightsTab] = useState<'analytics' | 'prospects'>('analytics');

  // Mobile sidebar drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sync when initialSection prop changes
  useEffect(() => {
    if (initialSection && initialSection !== currentSection) {
      setCurrentSection(initialSection as DashboardSectionId);
    }
  }, [initialSection]);

  const handleSectionChange = (section: DashboardSectionId) => {
    setCurrentSection(section);
    setMobileMenuOpen(false);
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

  // Integration Code & Format
  const [integrationTab, setIntegrationTab] = useState<'react' | 'nextjs' | 'html' | 'wordpress' | 'php'>('react');
  const [assistantTone, setAssistantTone] = useState<string>('professionnel');
  const [languages, setLanguages] = useState<{ fr: boolean; darija: boolean; en: boolean; ar: boolean }>({
    fr: true,
    darija: true,
    en: true,
    ar: true
  });
  const [autoLeadCapture, setAutoLeadCapture] = useState<boolean>(true);
  const [whatsappEscalation, setWhatsappEscalation] = useState<string>('');
  const [webhookUrl, setWebhookUrl] = useState<string>('');

  // Billing & Plan State
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [activePlan, setActivePlan] = useState<PaymentPlanId>('free');
  const [billingNotification, setBillingNotification] = useState<string | null>(null);
  const isPlanGated = activePlan === 'free';
  
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

  const handleConfirmPayment = () => {
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

      const planNameStr = selectedCheckoutPlan === 'free' ? 'Plan Gratuit' : selectedCheckoutPlan === 'basic' ? 'Plan Basic' : selectedCheckoutPlan === 'pro' ? 'Plan Pro / Business' : 'Plan Enterprise';
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
      setInvoicesList(prev => [newInv, ...prev]);
      setIsProcessingPayment(false);
      setBillingNotification(`Abonnement ${planNameStr} activé avec succès ! Quittance N° ${newInv.id} enregistrée.`);
      setBillingViewMode('overview');
    }, 800);
  };

  // Persistence status
  const [isSavingDb, setIsSavingDb] = useState<boolean>(false);
  const [savedDbSuccess, setSavedDbSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState<boolean>(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ success: boolean; message: string; details?: string } | null>(null);

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
            const current = assistants[0];
            setAssistantId(current.id || '');
            setWidgetId(current.widgetId || `asst_${Math.random().toString(36).substring(2, 10)}`);
            if (current.plan) setActivePlan(current.plan as PaymentPlanId);
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
            if (current.webhookUrl) setWebhookUrl(current.webhookUrl);
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
        } catch (e) {
          console.warn('Failed to load user assistant:', e);
        }
      };
      loadUserAssistant();
    }
  }, [user, profile]);

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

    const q = query(
      collection(db, 'prospects'),
      where('assistantId', '==', assistantId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prospects: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        prospects.push({
          id: doc.id,
          name: data.name || 'Visiteur Anonyme',
          phone: data.phone || 'Non fourni',
          email: data.email || 'Non fourni',
          need: data.need || (data.status === 'visited' ? 'Visite simple du site' : (data.status === 'opened_bubble' ? 'A ouvert la bulle de chat' : 'En attente de discussion')),
          status: data.status === 'visited' || data.status === 'opened_bubble' ? 'nouveau' : 'qualifie',
          date: data.updatedAt ? new Date(data.updatedAt.seconds * 1000).toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          }) : 'À l\'instant',
          referer: data.referer || '',
          currentPage: data.currentPage || '',
          userAgent: data.userAgent || '',
          language: data.language || '',
          messages: data.messages || []
        });
      });

      // Simple stable sort client-side to avoid needing complex Firestore indexes
      prospects.sort((a, b) => {
        return b.id.localeCompare(a.id);
      });

      setLeadsList(prospects);
    }, (error) => {
      console.warn('Error listening to prospects:', error);
    });

    return () => unsubscribe();
  }, [assistantId]);

  const handleSaveToDatabase = async (notesOverride?: KnowledgeNote[], metadataOverride?: Partial<{ websiteUrl: string; businessName: string; businessCategory: string; businessDescription: string; siteType: string; siteTypeConfidence: number; scrapingStrategy: string[]; }>) => {
    if (!user) return;
    try {
      setIsSavingDb(true);
      const effectiveWidgetId = widgetId || `asst_${Math.random().toString(36).substring(2, 10)}`;
      const savedId = await saveAssistantToDatabase({
        id: assistantId || undefined,
        userId: user.uid,
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
        assistantTone,
        languages,
        autoLeadCapture,
        whatsappEscalation: whatsappEscalation.trim(),
        webhookUrl: webhookUrl.trim(),
        widgetId: effectiveWidgetId,
        widgetConfig: {
          ...widgetConfig,
          headerTitle: widgetConfig.headerTitle || businessName.trim() || 'Assistant IA'
        }
      });
      if (savedId) setAssistantId(savedId);
      setSavedDbSuccess(true);
      setTimeout(() => setSavedDbSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving assistant:', err);
    } finally {
      setIsSavingDb(false);
    }
  };

  const handleSaveWebhookSetting = async (newUrl: string) => {
    setWebhookUrl(newUrl);
    if (!user) return;
    try {
      setIsSavingDb(true);
      const effectiveWidgetId = widgetId || `asst_${Math.random().toString(36).substring(2, 10)}`;
      const savedId = await saveAssistantToDatabase({
        id: assistantId || undefined,
        userId: user.uid,
        businessName: businessName.trim() || 'Mon Entreprise',
        websiteUrl: websiteUrl.trim(),
        siteType,
        siteTypeConfidence,
        scrapingStrategy,
        businessCategory: businessCategory || 'Services',
        businessDescription: businessDescription.trim(),
        knowledgeNotes,
        faqText: faqText.trim(),
        pricingServicesText: pricingServicesText.trim(),
        specialRulesText: specialRulesText.trim(),
        assistantTone,
        languages,
        autoLeadCapture,
        whatsappEscalation: whatsappEscalation.trim(),
        webhookUrl: newUrl.trim(),
        widgetId: effectiveWidgetId,
        widgetConfig: {
          ...widgetConfig,
          headerTitle: widgetConfig.headerTitle || businessName.trim() || 'Assistant IA'
        }
      });
      if (savedId) setAssistantId(savedId);
      setSavedDbSuccess(true);
      setTimeout(() => setSavedDbSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving webhook setting:', err);
    } finally {
      setIsSavingDb(false);
    }
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
    setScanStage("Connexion au domaine et exploration des pages clés (Services, Tarifs, FAQ, Contact)...");
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
      setScanStage("Extraction du contenu textuel, prix, offres et coordonnées...");

      const response = await fetch("/api/crawler/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.startsWith("http") ? url : `https://${url}`,
          assistantId: assistantId || undefined,
          userId: user?.uid || undefined
        })
      });

      setScanProgress(70);
      setScanStage("Modélisation sémantique et génération des fiches par Gemini IA...");

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
        setScanStage(`Analyse terminée ! ${data.knowledgeNotes?.length || 0} fiches de connaissances générées.`);
        
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
          setScanSuccessMessage(`${scannedNotes.length} fiches réelles enregistrées dans la base de connaissances.`);
        }
        setIsScanning(false);
      } else {
        throw new Error("Crawler API returned non-ok");
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
          message: userText,
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
        botReply = errData.message || 'Bonjour ! L\'assistant est momentanément indisponible. Veuillez vérifier vos réglages ou réessayer dans un instant.';
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
  const widgetScriptHtml = `<!-- Widget Bulle IA JawebFlow pour ${businessName || 'votre site'} -->
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

  // React Component Code
  const widgetReactComponentCode = `import React from 'react';
import { JawebChatWidget } from './components/JawebChatWidget';

export function App() {
  return (
    <div className="min-h-screen">
      {/* Le contenu de votre site web */}
      
      {/* Bulle Assistant IA JawebFlow personnalisée */}
      <JawebChatWidget 
        businessName="${businessName || 'Mon Entreprise'}"
        whatsappNumber="${whatsappEscalation || ''}"
        config={{
          primaryColor: "${widgetConfig.primaryColor}",
          gradientSecondary: "${widgetConfig.gradientSecondary || '#6366f1'}",
          useGradient: ${widgetConfig.useGradient !== false},
          position: "${widgetConfig.position}",
          shape: "${widgetConfig.shape}",
          iconType: "${widgetConfig.iconType}",
          customLogoUrl: "${widgetConfig.customLogoUrl || ''}",
          themeMode: "${widgetConfig.themeMode}",
          showTeaser: ${widgetConfig.showTeaser !== false},
          teaserText: "${(widgetConfig.teaserText || 'Une question ? Discutons en direct 👋').replace(/"/g, '\\"')}",
          welcomeMessage: "${(widgetConfig.welcomeMessage || 'Bonjour ! Comment puis-je vous aider ?').replace(/"/g, '\\"')}",
          onlineBadge: ${widgetConfig.onlineBadge !== false},
          showBranding: ${widgetConfig.showBranding !== false}
        }}
      />
    </div>
  );
}`;

  // Next.js Code
  const widgetNextJsCode = `// Dans votre fichier app/layout.tsx (App Router)
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        
        {/* Widget Assistant IA JawebFlow personnalisé */}
        <Script
          src="${liveScriptCdnUrl}"
          strategy="lazyOnload"
          data-assistant-id="${currentWidgetId}"
          data-business-name="${(businessName || 'Mon Entreprise').replace(/"/g, '&quot;')}"
          data-position="${widgetConfig.position}"
          data-theme="${widgetConfig.themeMode}"
          data-primary-color="${widgetConfig.primaryColor}"
          data-secondary-color="${widgetConfig.gradientSecondary || '#6366f1'}"
          data-shape="${widgetConfig.shape}"
          data-icon="${widgetConfig.iconType}"
          data-teaser="${(widgetConfig.teaserText || 'Une question ? Discutons en direct 👋').replace(/"/g, '&quot;')}"
          data-welcome="${(widgetConfig.welcomeMessage || 'Bonjour ! Comment puis-je vous aider ?').replace(/"/g, '&quot;')}"
        />
      </body>
    </html>
  );
}`;

  // PHP cURL API Code
  const widgetPhpCurlCode = `<?php
// Exemple: Appel API cURL PHP pour JawebFlow Assistant IA
$API_URL = "https://jawebflow.com/api/v1/chat";
$PUBLIC_KEY = "${currentWidgetId}"; // Votre clé/ID d'Assistant unique

$payload = json_encode(array(
    "assistantId" => $PUBLIC_KEY,
    "message" => "Bonjour, quels sont vos tarifs et disponibilités ?"
));

$cURL = curl_init();
curl_setopt($cURL, CURLOPT_URL, $API_URL);
curl_setopt($cURL, CURLOPT_HTTPHEADER, array(
    "Accept: application/json",
    "Content-Type: application/json",
    "Authorization: Bearer " . $PUBLIC_KEY
));
curl_setopt($cURL, CURLOPT_POST, true);
curl_setopt($cURL, CURLOPT_POSTFIELDS, $payload);
curl_setopt($cURL, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($cURL, CURLOPT_RETURNTRANSFER, true);
curl_setopt($cURL, CURLOPT_CONNECTTIMEOUT, 3);
curl_setopt($cURL, CURLOPT_TIMEOUT, 20);

$response = curl_exec($cURL);

if (curl_errno($cURL)) {
    $error_msg = curl_error($cURL);
    curl_close($cURL);
    die("Erreur cURL: " . $error_msg);
}

curl_close($cURL);

$result = json_decode($response, true);

// Exploitation du résultat JSON retourné
echo "Réponse de l'Assistant : " . $result['message'];
?>`;

  const getActiveIntegrationCode = () => {
    switch (integrationTab) {
      case 'react': return widgetReactComponentCode;
      case 'nextjs': return widgetNextJsCode;
      case 'wordpress': return widgetScriptHtml;
      case 'php': return widgetPhpCurlCode;
      case 'html':
      default:
        return widgetScriptHtml;
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(getActiveIntegrationCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Completion calculation
  const hasIdentity = Boolean(businessName.trim());
  const hasKnowledge = knowledgeNotes.some(n => n.enabled);
  const isReadyToDeploy = hasIdentity && hasKnowledge;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex antialiased selection:bg-purple-500/20 selection:text-purple-900">
      
      {/* 
        =======================================================================
        LOCKED / FIXED SIDEBAR NAVIGATION (Pure White, Crisp Borders)
        =======================================================================
      */}
      <aside className={`
        fixed top-0 bottom-0 left-0 w-64 bg-white border-r border-slate-200 shadow-sm z-30 flex flex-col justify-between
        transition-transform duration-200 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="overflow-y-auto flex-1">
          {/* Top Platform Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-sm shadow-purple-600/30">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-sm text-slate-900 tracking-tight block">Cockpit IA</span>
                <span className="text-[10px] text-purple-600 font-semibold font-mono block">JawebFlow Studio</span>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              {onNavigate && (
                <button
                  onClick={() => onNavigate('home')}
                  className="text-xs text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Retour au site public"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="md:hidden text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Assistant Info Pill */}
          <div className="p-3 mx-3 my-3 rounded-xl bg-purple-50/70 border border-purple-100 flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full shrink-0 ${isReadyToDeploy ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></div>
            <div className="truncate flex-1">
              <span className="block text-xs font-bold text-slate-900 truncate">
                {businessName || 'Assistant en configuration'}
              </span>
              <span className="block text-[10px] font-mono text-purple-700 truncate">
                ID: {currentWidgetId}
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1.5">
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Tableau de Bord
            </div>

            <button
              type="button"
              id="nav-dashboard-overview"
              onClick={() => handleSectionChange('overview')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentSection === 'overview'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4" />
                <span>Vue d'ensemble</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>

            <button
              type="button"
              id="nav-leads-crm"
              onClick={() => handleSectionChange('leads')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentSection === 'leads'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4" />
                <span>Insights & CRM</span>
              </div>
              {isPlanGated ? (
                <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-extrabold flex items-center gap-1 border ${
                  currentSection === 'leads' ? 'bg-white/20 text-white border-white/30' : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}>
                  <Lock className="w-2.5 h-2.5 text-amber-600" />
                  <span>PRO</span>
                </span>
              ) : (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  currentSection === 'leads' ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-700'
                }`}>
                  {leadsList.length}
                </span>
              )}
            </button>

            <div className="pt-3 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Configuration IA
            </div>

            <button
              type="button"
              id="nav-step-crawler"
              onClick={() => handleSectionChange('crawler')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentSection === 'crawler'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4" />
                <span>Scanner de Site</span>
              </div>
              {isPlanGated ? (
                <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-extrabold flex items-center gap-1 border ${
                  currentSection === 'crawler' ? 'bg-white/20 text-white border-white/30' : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}>
                  <Lock className="w-2.5 h-2.5 text-amber-600" />
                  <span>PRO</span>
                </span>
              ) : (
                websiteUrl && <Check className={`w-3.5 h-3.5 ${currentSection === 'crawler' ? 'text-white' : 'text-emerald-500'}`} />
              )}
            </button>

            <button
              type="button"
              id="nav-step-knowledge"
              onClick={() => handleSectionChange('knowledge')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentSection === 'knowledge'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Database className="w-4 h-4" />
                <span>Base de Connaissances</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                currentSection === 'knowledge' ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-700'
              }`}>
                {knowledgeNotes.filter(n => n.enabled).length}
              </span>
            </button>

            <button
              type="button"
              id="nav-step-widget"
              onClick={() => handleSectionChange('widget')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentSection === 'widget'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Palette className="w-4 h-4" />
                <span>Apparence & Widget</span>
              </div>
              <div 
                className="w-3 h-3 rounded-full border border-slate-300 shadow-inner" 
                style={{ backgroundColor: widgetConfig.primaryColor }}
              />
            </button>

            <button
              type="button"
              id="nav-step-simulator"
              onClick={() => handleSectionChange('simulator')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentSection === 'simulator'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Bot className="w-4 h-4" />
                <span>Testeur & Simulateur</span>
              </div>
              {isPlanGated ? (
                <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-extrabold flex items-center gap-1 border ${
                  currentSection === 'simulator' ? 'bg-white/20 text-white border-white/30' : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}>
                  <Lock className="w-2.5 h-2.5 text-amber-600" />
                  <span>PRO</span>
                </span>
              ) : (
                <ChevronRight className="w-3.5 h-3.5 opacity-50" />
              )}
            </button>

            <button
              type="button"
              id="nav-step-integration"
              onClick={() => handleSectionChange('integration')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentSection === 'integration'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Code2 className="w-4 h-4" />
                <span>Widget Web & Script</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>

            <button
              type="button"
              id="nav-step-instagram"
              onClick={() => handleSectionChange('instagram')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentSection === 'instagram'
                  ? 'bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 text-white shadow-sm shadow-purple-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Instagram className="w-4 h-4 text-pink-500" />
                <span>Instagram DMs & Pages</span>
              </div>
              {isPlanGated ? (
                <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-extrabold flex items-center gap-1 border ${
                  currentSection === 'instagram' ? 'bg-white/20 text-white border-white/30' : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}>
                  <Lock className="w-2.5 h-2.5 text-amber-600" />
                  <span>PRO</span>
                </span>
              ) : (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  currentSection === 'instagram' ? 'bg-white/20 text-white' : 'bg-pink-50 text-pink-700 border border-pink-200'
                }`}>
                  Nouveau
                </span>
              )}
            </button>

            <div className="pt-3 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Abonnement & Compte
            </div>

            <button
              type="button"
              id="nav-step-billing"
              onClick={() => handleSectionChange('billing')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentSection === 'billing'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4" />
                <span>Plan & Facturation</span>
              </div>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                currentSection === 'billing' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              }`}>
                {activePlan.toUpperCase()}
              </span>
            </button>

            <button
              type="button"
              id="nav-settings-profile"
              onClick={() => handleSectionChange('settings')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentSection === 'settings'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <User className="w-4 h-4" />
                <span>Mon Compte & Équipe</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>
          </nav>
        </div>

        {/* User Footer Profile */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-purple-100 border border-purple-300 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
              {profile?.photoURL || user?.photoURL ? (
                <img src={profile?.photoURL || user?.photoURL || ''} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                (profile?.displayName || user?.displayName || user?.email || 'U')[0].toUpperCase()
              )}
            </div>
            <div className="truncate">
              <span className="block text-xs font-bold text-slate-800 truncate">
                {profile?.displayName || user?.displayName || 'Mon Compte'}
              </span>
              <span className="block text-[10px] text-slate-500 truncate">
                {user?.email || 'Connecté'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            title="Déconnexion"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Backdrop overlay for mobile drawer */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-25 md:hidden"
        />
      )}

      {/* 
        =======================================================================
        MAIN CONTENT WORKSPACE (Clean, Responsive, High Contrast)
        =======================================================================
      */}
      <div className="flex-1 md:ml-64 min-h-screen bg-slate-50 flex flex-col">
        
        {/* Sticky Top Header Bar */}
        <header className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-slate-200 z-20 px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Espace Assistant</span>
                <span className="text-xs text-slate-300">/</span>
                <span className="text-xs font-bold text-purple-700 capitalize">
                  {currentSection === 'overview' && 'Vue d\'ensemble'}
                  {currentSection === 'crawler' && 'Scanner le Site'}
                  {currentSection === 'knowledge' && 'Base de Connaissances'}
                  {currentSection === 'widget' && 'Apparence & Bulle'}
                  {currentSection === 'simulator' && 'Testeur & Simulateur'}
                  {currentSection === 'integration' && 'Code d\'Intégration'}
                  {currentSection === 'leads' && 'Insights & CRM'}
                  {currentSection === 'billing' && 'Mon Plan & Facturation'}
                  {currentSection === 'settings' && 'Mon Compte & Équipe'}
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900">
                {businessName || 'Assistant IA Entreprise'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Assistant ID quick copy pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs">
              <span className="text-slate-400 text-[11px]">ID :</span>
              <span className="font-mono font-bold text-slate-800 text-[11px]">{currentWidgetId}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(currentWidgetId);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="ml-1 text-slate-400 hover:text-purple-600 transition-colors"
                title="Copier l'ID de l'assistant"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>

            {/* Quick Save Database Button */}
            <button
              type="button"
              onClick={handleSaveToDatabase}
              disabled={isSavingDb}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm ${
                savedDbSuccess
                  ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                  : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20'
              }`}
            >
              {isSavingDb ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : savedDbSuccess ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {isSavingDb ? 'Sauvegarde...' : savedDbSuccess ? 'Enregistré !' : 'Enregistrer'}
              </span>
            </button>
          </div>
        </header>

        {/* Workspace Body */}
        <main className="p-4 sm:p-8 flex-1 max-w-6xl w-full mx-auto">
          
          {/* =================================================================
              SECTION: OVERVIEW (DASHBOARD GLOBAL)
              ================================================================= */}
          {currentSection === 'overview' && (
            <div className="space-y-8 animate-in fade-in duration-200">
              {/* Hero Status Card */}
              <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="relative z-10 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isPlanGated ? 'Compte Découverte (Gratuit)' : 'Cockpit Opérationnel'}</span>
                    </div>
                    {isPlanGated && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                        <Lock className="w-3 h-3 text-amber-600" />
                        <span>Fonctionnalités IA & CRM verrouillées</span>
                      </span>
                    )}
                  </div>

                  <div className="max-w-2xl space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                      {isPlanGated
                        ? `Préparez l'intégration de ${businessName || 'votre Assistant'}`
                        : `Bienvenue sur le cockpit de ${businessName || 'votre Assistant'}`
                      }
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                      {isPlanGated
                        ? "Configurez manuellement votre base de connaissances, personnalisez l'apparence de la bulle et intégrez le widget sur votre site avec test webhook. Débloquez un plan pour activer le scan IA, le simulateur interactif et le CRM."
                        : "Votre assistant IA est prêt à qualifier vos visiteurs, répondre à leurs questions 24h/24 et enregistrer vos prospects."
                      }
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    {isPlanGated ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSectionChange('knowledge')}
                          className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center gap-2 shadow-sm shadow-purple-600/20 cursor-pointer transition-all"
                        >
                          <Database className="w-4 h-4" />
                          <span>Remplir la Base de Connaissances</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSectionChange('widget')}
                          className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center gap-2 border border-slate-300 cursor-pointer transition-colors"
                        >
                          <Palette className="w-4 h-4 text-purple-600" />
                          <span>Personnaliser l'Apparence</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSectionChange('billing')}
                          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs flex items-center gap-2 shadow-sm cursor-pointer transition-all"
                        >
                          <Crown className="w-4 h-4" />
                          <span>Débloquer l'IA & CRM</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSectionChange('simulator')}
                          className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center gap-2 shadow-sm shadow-purple-600/20 cursor-pointer transition-all"
                        >
                          <Bot className="w-4 h-4" />
                          <span>Tester l'Assistant en direct</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSectionChange('integration')}
                          className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center gap-2 border border-slate-300 cursor-pointer transition-colors"
                        >
                          <Code2 className="w-4 h-4 text-purple-600" />
                          <span>Obtenir le code d'intégration</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Step Flow Bento Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {/* Step 1: Knowledge Base (Free) */}
                <div 
                  onClick={() => handleSectionChange('knowledge')}
                  className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                      <Database className="w-5 h-5" />
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Inclus (Gratuit)
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">1. Base de Connaissances</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Créez manuellement vos fiches de tarifs, services, horaires et FAQ pour alimenter l'assistant.
                    </p>
                  </div>
                </div>

                {/* Step 2: Widget Appearance (Free) */}
                <div 
                  onClick={() => handleSectionChange('widget')}
                  className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                      <Palette className="w-5 h-5" />
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Inclus (Gratuit)
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">2. Apparence & Widget</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Personnalisez les couleurs, le logo, le titre d'en-tête et les messages d'accueil.
                    </p>
                  </div>
                </div>

                {/* Step 3: Script & Webhook (Free) */}
                <div 
                  onClick={() => handleSectionChange('integration')}
                  className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                      <Code2 className="w-5 h-5" />
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Inclus (Gratuit)
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">3. Widget Web & Webhook</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Copiez le code d'intégration HTML/React et testez la connectivité webhook vers votre serveur.
                    </p>
                  </div>
                </div>

                {/* Card 1: Crawler */}
                <div 
                  onClick={() => handleSectionChange('crawler')}
                  className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                      <Globe className="w-5 h-5" />
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Scanner IA Actif
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Scanner de Site par IA</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Scraping automatique complet de vos pages pour générer vos fiches de connaissances sans saisie manuelle.
                    </p>
                  </div>
                </div>

                {/* Card 2: Simulator */}
                <div 
                  onClick={() => handleSectionChange('simulator')}
                  className={`p-6 rounded-2xl border transition-all cursor-pointer group space-y-4 ${
                    isPlanGated
                      ? 'bg-gradient-to-b from-slate-50 to-amber-50/20 border-amber-200/80 hover:border-amber-400 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-purple-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                      <Bot className="w-5 h-5" />
                    </div>
                    {isPlanGated ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-700" /> Verrouillé
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Débloqué
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Simulateur & Réponses IA</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Test interactif de dialogues en direct en français, darija et anglais avant déploiement.
                    </p>
                  </div>
                </div>

                {/* Card 3: Leads CRM & Instagram */}
                <div 
                  onClick={() => handleSectionChange('leads')}
                  className={`p-6 rounded-2xl border transition-all cursor-pointer group space-y-4 ${
                    isPlanGated
                      ? 'bg-gradient-to-b from-slate-50 to-amber-50/20 border-amber-200/80 hover:border-amber-400 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-purple-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                      <Users className="w-5 h-5" />
                    </div>
                    {isPlanGated ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-700" /> Verrouillé
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Débloqué
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Insights CRM & Contacts</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Collecte et export des prospects (téléphone, email), analytics et gestion des opportunités.
                    </p>
                  </div>
                </div>
              </div>
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
                      <p className="text-[11px] text-emerald-700">Votre assistant IA répond désormais avec ces nouvelles informations réelles.</p>
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
                      Tester l'IA
                    </button>
                  </div>
                </div>
              )}

              {/* Main Scanner Card */}
              <div className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-200/80 text-purple-700 text-xs font-semibold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Scraping & Synthèse IA Multi-Pages</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    Scanner votre Site Web
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
                    Entrez l'adresse de votre site internet ou boutique. Notre crawler explore automatiquement vos pages clés (Services, Tarifs, FAQ, Livraison, Contact) et notre IA génère des fiches de connaissances prêtes à alimenter votre assistant conversationnel.
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
                    Adresse URL du site web à explorer
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="crawler-url-input"
                        type="url"
                        value={crawlerUrl}
                        onChange={(e) => setCrawlerUrl(e.target.value)}
                        placeholder="https://votresite.com ou entreprise.dz..."
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 focus:bg-white focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20 transition-all"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isScanning || (!crawlerUrl.trim() && !websiteUrl.trim())}
                      className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-[0.99] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm shadow-purple-600/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                    >
                      {isScanning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Scan profond en cours...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Lancer le Scan Complet</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Scraping sécurisé conforme robots.txt · Détection automatique des wilayas et moyens de paiement</span>
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
                        <p className="font-semibold text-slate-900 truncate">{detectedBusinessMeta.phone || "Déduit des formulaires"}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-400">Livraison & Couverture</span>
                        <p className="font-semibold text-slate-900 truncate">{detectedBusinessMeta.deliveryInfo || "Algérie (58 Wilayas)"}</p>
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
                          livraison: { label: "Livraison 58 Wilayas", color: "bg-amber-50 text-amber-700 border-amber-200" },
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
                              <span className="text-[10px] text-slate-400">Scrapé par IA</span>
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
              <KnowledgeNotesManager
                notes={knowledgeNotes}
                onUpdateNotes={(updated) => {
                  setKnowledgeNotes(updated);
                  handleSaveToDatabase();
                }}
                onScanClick={() => handleSectionChange('crawler')}
                isScanning={isScanning}
              />
            </div>
          )}

          {/* =================================================================
              SECTION 3: WIDGET CUSTOMIZER & BUBBLE APPEARANCE
              ================================================================= */}
          {currentSection === 'widget' && (
            <div className="animate-in fade-in duration-200">
              <WidgetCustomizer
                businessName={businessName}
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
            isPlanGated ? (
              <LockedFeatureGate
                title="Testeur & Simulateur en Temps Réel"
                subtitle="Testez l'intelligence conversationnelle de votre assistant en direct, en français, darija ou anglais, avant de le déployer sur votre site public."
                icon={Bot}
                featureName="Simulateur IA"
                benefits={[
                  "Dialogue interactif en direct avec calcul de pertinence des réponses",
                  "Vérification de la détection de besoin et de capture de leads",
                  "Quota de tokens et de messages IA inclus pour tester vos scénarios",
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
                    <span>Simulateur en Temps Réel</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    Tester le Comportement de l'Assistant
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
                    Posez des questions sur vos tarifs, livraisons, services ou écrivez en darija pour vérifier que l'IA exploite parfaitement vos notes de connaissances.
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
                      <span className="block font-bold text-sm">{widgetConfig.headerTitle || businessName || 'Assistant IA'}</span>
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
            )
          )}

          {/* =================================================================
              SECTION 5: INTEGRATION CODE (REACT, NEXT.JS, HTML, WORDPRESS)
              ================================================================= */}
          {currentSection === 'integration' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold">
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Installation Rapide</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                      Intégrer l'Assistant sur votre Site Web
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
                      Copiez le code prêt à l'emploi personnalisé avec l'identifiant de votre compte (<span className="font-mono font-bold text-purple-700">{currentWidgetId}</span>) et vos styles configurés.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center gap-2 shadow-sm shadow-purple-600/20 transition-all cursor-pointer shrink-0"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Code Copié !' : 'Copier le Code'}</span>
                  </button>
                </div>

                {/* Framework Tabs */}
                <div className="flex items-center gap-2 border-b border-slate-200 pt-2 overflow-x-auto">
                  {[
                    { id: 'react', label: 'React / Vite (JSX Component)' },
                    { id: 'nextjs', label: 'Next.js (App Router)' },
                    { id: 'html', label: 'HTML Standard / Script' },
                    { id: 'wordpress', label: 'WordPress / Shopify' },
                    { id: 'php', label: 'PHP / cURL Backend API' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setIntegrationTab(tab.id as any)}
                      className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                        integrationTab === tab.id
                          ? 'border-purple-600 text-purple-700'
                          : 'border-transparent text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Code Block Window */}
                <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-md">
                  <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
                      <span className="text-[11px] font-mono text-slate-400 ml-2">
                        {integrationTab === 'react' && 'App.tsx'}
                        {integrationTab === 'nextjs' && 'app/layout.tsx'}
                        {integrationTab === 'html' && 'index.html'}
                        {integrationTab === 'wordpress' && 'header.php / Theme Customizer'}
                        {integrationTab === 'php' && 'api_chat.php'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copié' : 'Copier'}</span>
                    </button>
                  </div>

                  <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
                    <code>{getActiveIntegrationCode()}</code>
                  </pre>
                </div>
              </div>

              {/* Webhook Connection Testing & Verification Utility */}
              <WebhookTestingUtility
                initialWebhookUrl={webhookUrl}
                assistantId={assistantId || currentWidgetId}
                businessName={businessName}
                onSaveWebhookUrl={handleSaveWebhookSetting}
                isSavingGlobal={isSavingDb}
              />

              {/* Instagram Quick Connect Banner */}
              <div className="p-6 rounded-2xl bg-gradient-to-r from-pink-50 via-purple-50 to-indigo-50 border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 text-white flex items-center justify-center shadow-md">
                    <Instagram className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">Vous souhaitez aussi connecter votre compte Instagram ?</h4>
                    <p className="text-xs text-slate-600">Connectez vos messages privés (DMs) et pages officielles avec l'OAuth Firebase.</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSectionChange('instagram')}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm shrink-0 cursor-pointer"
                >
                  <span>Configurer Instagram</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* =================================================================
              SECTION: INSTAGRAM INTEGRATION (FIREBASE OAUTH & DM MANAGEMENT)
              ================================================================= */}
          {currentSection === 'instagram' && (
            isPlanGated ? (
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
                assistantId={assistantId || currentWidgetId}
                businessName={businessName}
                websiteUrl={websiteUrl || crawlerUrl}
                knowledgeNotes={knowledgeNotes}
                onGoToSimulator={() => handleSectionChange('simulator')}
              />
            )
          )}

          {/* =================================================================
              SECTION 6: LEADS & PROSPECTS CRM
              ================================================================= */}
          {currentSection === 'leads' && (
            isPlanGated ? (
              <LockedFeatureGate
                title="Insights & CRM des Prospects"
                subtitle="Accédez à la liste complète des coordonnées capturées par votre assistant (téléphone, email), filtres de qualification et tags silencieux."
                icon={Users}
                featureName="Insights & CRM"
                benefits={[
                  "Registre CRM complet avec filtres par statut et recherche instantanée",
                  "Détection technique des visiteurs (appareil, OS, navigateur, langue)",
                  "Export CSV complet et format publicitaire Google & Facebook Ads",
                  "Analytics en direct sur l'engagement et les taux de conversion"
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
              if (withTime.length === 0) return '15s';
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
                {/* Insights vs CRM Tabs */}
                <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-max">
                  <button
                    onClick={() => setInsightsTab('analytics')}
                    className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-xs font-bold transition-all ${
                      insightsTab === 'analytics' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    📈 Aperçu & Insights
                  </button>
                  <button
                    onClick={() => setInsightsTab('prospects')}
                    className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-xs font-bold transition-all ${
                      insightsTab === 'prospects' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    👥 Base CRM Prospects
                  </button>
                </div>

                {insightsTab === 'analytics' ? (
                  <InsightsDashboard user={user} />
                ) : (
                  <>
                    {/* Top Export Banner with Quick Download and Expandable Details */}
                <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl border border-slate-800 shadow-md flex flex-col gap-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold uppercase tracking-wider">
                          Exportation de Données
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span className="text-[10px] text-slate-400">{totalTracked} Prospects enregistrés</span>
                      </div>
                      <h3 className="text-base font-bold tracking-tight">Téléchargement & Exploitation des Prospects</h3>
                      <p className="text-xs text-indigo-200/90 leading-relaxed max-w-xl">
                        Téléchargez instantanément vos leads au format CSV pour votre CRM, ou utilisez l'export optimisé pour vos audiences publicitaires Facebook & Google.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2.5 items-center">
                      <button
                        type="button"
                        onClick={handleExportCSV}
                        disabled={leadsList.length === 0}
                        className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-purple-600/10"
                      >
                        <FileText className="w-4 h-4 text-purple-200" />
                        <span>Exporter CSV CRM Complet</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportAdsCSV}
                        disabled={leadsList.length === 0}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer border border-slate-700 hover:border-slate-600"
                      >
                        <Target className="w-4 h-4 text-purple-400" />
                        <span>CSV Google & Facebook Ads</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowExportDetails(!showExportDetails)}
                        className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-purple-300 hover:text-purple-200 text-xs font-bold transition-all cursor-pointer border border-slate-800 flex items-center gap-1.5"
                      >
                        <span>{showExportDetails ? "Masquer les détails" : "En savoir plus"}</span>
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showExportDetails ? "rotate-90" : ""}`} />
                      </button>
                    </div>
                  </div>

                  {showExportDetails && (
                    <div className="pt-3 border-t border-slate-800 text-xs text-indigo-200/80 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200 leading-relaxed max-w-3xl">
                      <p>
                        <strong>Format CRM Complet :</strong> Contient toutes les colonnes détaillées collectées (ID unique, nom, email, téléphone, besoin client détecté, date d'enregistrement, referer d'acquisition, navigateur et langue). Idéal pour Excel, Google Sheets ou CRM (HubSpot, Salesforce, etc.).
                      </p>
                      <p>
                        <strong>Format Publicitaire Ads :</strong> Format optimisé (sans en-têtes complexes) pour Meta Business Manager & Google Customer Match. Permet la synchronisation d'Audiences Personnalisées (Custom Audiences) et d'Audiences Similaires (Lookalike) pour maximiser le retour sur investissement de vos campagnes de remarketing.
                      </p>
                    </div>
                  )}
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
                        <h3 className="font-bold text-slate-900 text-lg">Registre des Prospects</h3>
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
                            <th className="p-3.5">Dernière Activité</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {filteredLeads.length > 0 ? (
                            filteredLeads.map((lead) => {
                              const hasContact = (lead.email && lead.email !== 'Non fourni') || (lead.phone && lead.phone !== 'Non fourni');
                              const utmSource = (lead as any).utm_source;
                              const utmCampaign = (lead as any).utm_campaign;

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

                                  <td className="p-3.5 text-slate-400 text-[10px] whitespace-nowrap">{lead.date}</td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-slate-400 font-medium">
                                Aucun prospect ne correspond à vos critères de recherche.
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

                        {/* Bento Grid: Profil Technique du Navigateur */}
                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Monitor className="w-3.5 h-3.5 text-slate-400" />
                            <span>Visitor Tags & Profil Technique</span>
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
                            <span>Données publicitaires & Tags</span>
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

                        {/* Bento Grid: Session & Engagement Details */}
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

                        {/* Detailed Chat Logs */}
                        <div className="flex-1 flex flex-col min-h-[200px] max-h-[300px] space-y-2">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Journal de Discussion</h4>
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
          })())}

          {/* =================================================================
              SECTION: BILLING & PLAN (Professional SaaS Billing Dashboard)
              ================================================================= */}
          {currentSection === 'billing' && (
            <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-200">
              
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
              {false && (
                /* IN-DASHBOARD CHECKOUT VIEW (Direct Payment & Activation inside Client Interface) */
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Clean Dashboard Sub-Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setBillingViewMode('overview')}
                        className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer flex items-center justify-center"
                        title="Retour à l'aperçu de facturation"
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200">
                            Guichet Client Officiel
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">Cryptage SSL 256-Bit</span>
                        </div>
                        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">
                          Paiement & Activation Abonnement JawebFlow
                        </h1>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => setBillingViewMode('overview')}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer self-start sm:self-auto"
                    >
                      ← Annuler / Mes Factures
                    </button>
                  </div>

                  {/* Certified Partners Banner - UNIFIED PROFESSIONAL SLATE SYSTEM */}
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Passerelles de Paiement Certifiées (Algérie & International)
                      </span>
                      <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Activation Immédiate en Direct
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-bold text-xs flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-purple-400" /> SLICKPAY (DZD)
                      </div>
                      <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-medium text-xs flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400" /> Edahabia (Algérie Poste)
                      </div>
                      <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-medium text-xs flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400" /> Carte Interbancaire (CIB)
                      </div>
                      <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-medium text-xs flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-slate-400" /> BaridiMob
                      </div>
                      <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-medium text-xs flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" /> CCP Algérie
                      </div>
                      <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-medium text-xs flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-slate-400" /> VISA / Mastercard
                      </div>
                    </div>
                  </div>

                  {/* Main Grid: Order Summary & Checkout Form */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Left Column: Plan Selector & Summary */}
                    <div className="lg:col-span-5 space-y-4">
                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-purple-600" /> 1. Sélectionner votre formule
                          </h3>
                          <span className="text-[10px] font-extrabold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 uppercase">
                            {billingCycle === 'yearly' ? '-20% Appliqué' : 'Sans engagement'}
                          </span>
                        </div>

                        {/* Plan Toggle Chips */}
                        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200">
                          <button
                            type="button"
                            onClick={() => setSelectedCheckoutPlan('basic')}
                            className={`py-2 px-1.5 rounded-lg text-center transition-all cursor-pointer ${
                              selectedCheckoutPlan === 'basic'
                                ? 'bg-slate-900 text-white font-bold shadow-sm'
                                : 'text-slate-700 hover:text-slate-900 text-xs font-semibold'
                            }`}
                          >
                            <div className="text-xs font-bold">Basic</div>
                            <div className="text-[10px] opacity-80">{billingCycle === 'monthly' ? '$29/m' : '$23/m'}</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedCheckoutPlan('pro')}
                            className={`py-2 px-1.5 rounded-lg text-center transition-all cursor-pointer ${
                              selectedCheckoutPlan === 'pro'
                                ? 'bg-purple-600 text-white font-bold shadow-sm'
                                : 'text-slate-700 hover:text-slate-900 text-xs font-semibold'
                            }`}
                          >
                            <div className="text-xs font-bold">Pro / Business</div>
                            <div className="text-[10px] opacity-80">{billingCycle === 'monthly' ? '$79/m' : '$63/m'}</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedCheckoutPlan('enterprise')}
                            className={`py-2 px-1.5 rounded-lg text-center transition-all cursor-pointer ${
                              selectedCheckoutPlan === 'enterprise'
                                ? 'bg-slate-900 text-white font-bold shadow-sm'
                                : 'text-slate-700 hover:text-slate-900 text-xs font-semibold'
                            }`}
                          >
                            <div className="text-xs font-bold">Enterprise</div>
                            <div className="text-[10px] opacity-80">{billingCycle === 'monthly' ? '$199/m' : '$159/m'}</div>
                          </button>
                        </div>

                        {/* Cycle Switch */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <div>
                            <p className="text-xs font-bold text-slate-800">Facturation Annuelle (-20%)</p>
                            <p className="text-[11px] text-slate-500">Économisez 2 mois par an</p>
                          </div>
                          <div className="inline-flex rounded-lg bg-slate-200 p-0.5">
                            <button
                              type="button"
                              onClick={() => setBillingCycle('monthly')}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                                billingCycle === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                              }`}
                            >
                              Mensuel
                            </button>
                            <button
                              type="button"
                              onClick={() => setBillingCycle('yearly')}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                                billingCycle === 'yearly' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600'
                              }`}
                            >
                              Annuel
                            </button>
                          </div>
                        </div>

                        {/* Price Total Card */}
                        <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-slate-400">Total à régler :</span>
                            <div className="text-right">
                              <span className="text-2xl font-black">
                                ${selectedCheckoutPlan === 'basic' ? (billingCycle === 'monthly' ? 29 : 276) : selectedCheckoutPlan === 'pro' ? (billingCycle === 'monthly' ? 79 : 756) : (billingCycle === 'monthly' ? 199 : 1908)}
                              </span>
                              <span className="text-xs text-slate-400 font-normal"> {billingCycle === 'monthly' ? '/mois' : '/an'}</span>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                            <span className="text-slate-400">Équivalent DZD :</span>
                            <span className="font-bold text-purple-300 font-mono">
                              ~{selectedCheckoutPlan === 'basic' ? (billingCycle === 'monthly' ? '6 850' : '65 760') : selectedCheckoutPlan === 'pro' ? (billingCycle === 'monthly' ? '18 700' : '179 500') : (billingCycle === 'monthly' ? '47 100' : '452 160')} DZD
                            </span>
                          </div>
                        </div>

                        {/* Included Features list */}
                        <div className="space-y-2 text-xs text-slate-600">
                          <span className="font-bold text-slate-800 block mb-1">Services & Quotas inclus :</span>
                          {selectedCheckoutPlan === 'basic' && (
                            <>
                              <div className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Widget Web Universel (1 site)</div>
                              <div className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Jusqu'à 1 000 conversations / mois</div>
                              <div className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Base de connaissances personnalisée</div>
                            </>
                          )}
                          {selectedCheckoutPlan === 'pro' && (
                            <>
                              <div className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Widget Web illimité & multi-sites</div>
                              <div className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Jusqu'à 5 000 conversations / mois</div>
                              <div className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Détection de leads & synchro CRM</div>
                              <div className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Support prioritaire et IA haute vitesse</div>
                            </>
                          )}
                          {selectedCheckoutPlan === 'enterprise' && (
                            <>
                              <div className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Widget Web + Tous les canaux d'entreprises</div>
                              <div className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Volume de conversations illimité</div>
                              <div className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Intégrations API & serveurs dédiés</div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Billing Information & Payment Options */}
                    <div className="lg:col-span-7 space-y-4">
                      
                      {/* Billing Information Section */}
                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
                          <User className="w-4 h-4 text-purple-600" /> 2. Coordonnées de Facturation
                        </h3>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Nom complet / Responsable</label>
                            <input
                              type="text"
                              value={checkoutName}
                              onChange={(e) => setCheckoutName(e.target.value)}
                              placeholder="Ex: Yacine Benali"
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Adresse Email</label>
                            <input
                              type="email"
                              value={checkoutEmail}
                              onChange={(e) => setCheckoutEmail(e.target.value)}
                              placeholder="votre-email@domaine.dz"
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Entreprise / Commerce</label>
                            <input
                              type="text"
                              value={checkoutCompany}
                              onChange={(e) => setCheckoutCompany(e.target.value)}
                              placeholder="Ex: E-commerce Algérie"
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Téléphone Mobile</label>
                            <input
                              type="text"
                              value={checkoutPhone}
                              onChange={(e) => setCheckoutPhone(e.target.value)}
                              placeholder="05 XX XX XX XX / 07 XX XX XX XX"
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Payment Method Selector */}
                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
                          <CreditCard className="w-4 h-4 text-purple-600" /> 3. Mode de Règlement Sécurisé
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <button
                            type="button"
                            onClick={() => setCheckoutPaymentMethod('slickpay_dzd')}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              checkoutPaymentMethod === 'slickpay_dzd'
                                ? 'border-purple-600 bg-purple-50/50 text-slate-900 ring-2 ring-purple-600/20'
                                : 'border-slate-200 hover:border-slate-300 bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-900">SlickPay (DZD)</span>
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            </div>
                            <p className="text-[11px] text-slate-500">Edahabia, CIB & BaridiMob</p>
                          </button>

                          <button
                            type="button"
                            onClick={() => setCheckoutPaymentMethod('stripe_card')}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              checkoutPaymentMethod === 'stripe_card'
                                ? 'border-purple-600 bg-purple-50/50 text-slate-900 ring-2 ring-purple-600/20'
                                : 'border-slate-200 hover:border-slate-300 bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-900">Carte Visa / MC</span>
                              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            </div>
                            <p className="text-[11px] text-slate-500">Paiement International</p>
                          </button>

                          <button
                            type="button"
                            onClick={() => setCheckoutPaymentMethod('baridimob_ccp')}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              checkoutPaymentMethod === 'baridimob_ccp'
                                ? 'border-purple-600 bg-purple-50/50 text-slate-900 ring-2 ring-purple-600/20'
                                : 'border-slate-200 hover:border-slate-300 bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-900">Virement Direct</span>
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            </div>
                            <p className="text-[11px] text-slate-500">CCP & Rip BaridiMob</p>
                          </button>
                        </div>

                        {/* Payment Method Inner Forms */}
                        {checkoutPaymentMethod === 'slickpay_dzd' && (
                          <div className="p-4 rounded-xl bg-slate-900 text-slate-100 space-y-3">
                            <span className="text-xs font-bold text-slate-300 block">Support de carte bancaire Algérie :</span>
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                type="button"
                                onClick={() => setCheckoutSlickpayType('edahabia')}
                                className={`py-2 px-2 rounded-lg text-xs font-bold text-center border transition-all cursor-pointer ${
                                  checkoutSlickpayType === 'edahabia'
                                    ? 'bg-purple-600 border-purple-500 text-white'
                                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}
                              >
                                Carte Edahabia
                              </button>
                              <button
                                type="button"
                                onClick={() => setCheckoutSlickpayType('cib')}
                                className={`py-2 px-2 rounded-lg text-xs font-bold text-center border transition-all cursor-pointer ${
                                  checkoutSlickpayType === 'cib'
                                    ? 'bg-purple-600 border-purple-500 text-white'
                                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}
                              >
                                Carte CIB
                              </button>
                              <button
                                type="button"
                                onClick={() => setCheckoutSlickpayType('baridimob')}
                                className={`py-2 px-2 rounded-lg text-xs font-bold text-center border transition-all cursor-pointer ${
                                  checkoutSlickpayType === 'baridimob'
                                    ? 'bg-purple-600 border-purple-500 text-white'
                                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}
                              >
                                BaridiMob OTP
                              </button>
                            </div>
                            <p className="text-[11px] text-slate-400">
                              Redirection sécurisée via la passerelle nationale SlickPay avec validation OTP SMS.
                            </p>
                          </div>
                        )}

                        {checkoutPaymentMethod === 'stripe_card' && (
                          <div className="p-4 rounded-xl bg-slate-900 text-slate-100 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                              <div className="sm:col-span-2">
                                <label className="block text-slate-400 mb-1 font-semibold">Numéro de carte Visa / Mastercard</label>
                                <input
                                  type="text"
                                  value={checkoutCardNumber}
                                  onChange={(e) => setCheckoutCardNumber(e.target.value)}
                                  placeholder="4500 •••• •••• 1234"
                                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500 font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-slate-400 mb-1 font-semibold">Date d'expiration</label>
                                <input
                                  type="text"
                                  value={checkoutCardExp}
                                  onChange={(e) => setCheckoutCardExp(e.target.value)}
                                  placeholder="MM/YY"
                                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500 font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-slate-400 mb-1 font-semibold">Code CVC</label>
                                <input
                                  type="text"
                                  value={checkoutCardCvc}
                                  onChange={(e) => setCheckoutCardCvc(e.target.value)}
                                  placeholder="123"
                                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500 font-mono"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {checkoutPaymentMethod === 'baridimob_ccp' && (
                          <div className="p-4 rounded-xl bg-slate-900 text-slate-100 space-y-2 text-xs">
                            <p className="font-bold text-slate-200">Coordonnées de virement Algérie :</p>
                            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono space-y-1 text-slate-300">
                              <p>RIP BaridiMob : <span className="text-purple-300 font-bold">007 99999 0023412984 45</span></p>
                              <p>N° CCP : <span className="text-purple-300 font-bold">0023412984 Clé 45</span></p>
                              <p>Titulaire : <span className="text-slate-200">JawebFlow Algérie SARL</span></p>
                            </div>
                            <div className="pt-2">
                              <label className="block text-slate-400 mb-1 font-semibold">N° Reçu / Référence de virement</label>
                              <input
                                type="text"
                                value={checkoutRipRef}
                                onChange={(e) => setCheckoutRipRef(e.target.value)}
                                placeholder="Ex: Ref 98421002"
                                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500 font-mono"
                              />
                            </div>
                          </div>
                        )}

                        {/* Submit CTA */}
                        <button
                          type="button"
                          disabled={isProcessingPayment}
                          onClick={handleConfirmPayment}
                          className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm font-extrabold transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
                        >
                          {isProcessingPayment ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              <span>Traitement et validation sécurisée de la transaction...</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-4.5 h-4.5" />
                              <span>Confirmer et Activer l'Abonnement JawebFlow</span>
                            </>
                          )}
                        </button>
                      </div>

                    </div>
                  </div>
                </div>
              )}
              {billingViewMode === 'overview' && (
                /* NORMAL BILLING OVERVIEW VIEW */
                <>
                  {/* Page Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                      Abonnement Actif
                    </span>
                    <span className="text-xs text-slate-400">· Renouvellement le 28/09/2026</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                    Mon Plan & Facturation
                  </h1>
                  <p className="text-sm text-slate-500 mt-1">
                    Gérez vos crédits de conversation, votre abonnement et accédez à vos factures.
                  </p>
                </div>

                {/* Billing Cycle Toggle */}
                <div className="inline-flex items-center p-1 rounded-xl bg-slate-200/70 border border-slate-300 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      billingCycle === 'monthly'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Facturation Mensuelle
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle('yearly')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      billingCycle === 'yearly'
                        ? 'bg-purple-600 text-white shadow-sm'
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
                <div className="lg:col-span-1 bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-between border border-purple-900/40">
                  <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-purple-500/10 rounded-full blur-2xl pointer-events-none"></div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-purple-500/20 text-purple-200 border border-purple-400/30 uppercase tracking-wider">
                        <Crown className="w-3.5 h-3.5 text-amber-300" />
                        Plan Actuel : {activePlan === 'free' ? 'PLAN GRATUIT' : activePlan === 'basic' ? 'PLAN BASIC' : activePlan === 'pro' ? 'PLAN PRO / BUSINESS' : 'PLAN ENTERPRISE'}
                      </span>
                      <span className="text-xs text-purple-300 font-medium">Actif</span>
                    </div>

                    <div className="mb-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black tracking-tight">
                          {activePlan === 'free' ? '$0' : ''}
                          {activePlan === 'basic' ? (billingCycle === 'monthly' ? '$29' : '$23') : ''}
                          {activePlan === 'pro' ? (billingCycle === 'monthly' ? '$79' : '$63') : ''}
                          {activePlan === 'enterprise' ? (billingCycle === 'monthly' ? '$199' : '$159') : ''}
                        </span>
                        <span className="text-sm text-purple-200">/ mois</span>
                      </div>
                      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-purple-500/20 text-purple-200 text-xs font-bold border border-purple-400/30">
                        ~{activePlan === 'free' 
                          ? '0 DZD'
                          : activePlan === 'basic' 
                          ? (billingCycle === 'monthly' ? '6 850 DZD' : '5 480 DZD') 
                          : activePlan === 'pro' 
                            ? (billingCycle === 'monthly' ? '18 700 DZD' : '14 960 DZD') 
                            : (billingCycle === 'monthly' ? '47 100 DZD' : '37 680 DZD')} / mois
                      </div>
                      <p className="text-xs text-purple-300/80 mt-2">
                        {billingCycle === 'yearly' ? 'Facturé annuellement (Remise de -20% appliquée)' : 'Facturé mensuellement (Sans engagement)'}
                      </p>
                    </div>

                    {/* Quick Specs */}
                    <div className="space-y-2.5 pt-4 border-t border-white/10 text-xs text-purple-100">
                      <div className="flex items-center justify-between">
                        <span className="text-purple-300">Prochain prélèvement</span>
                        <span className="font-semibold">28 Sept. 2026</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-purple-300">Statut du compte</span>
                        <span className="font-semibold text-emerald-300 flex items-center gap-1">
                          ● Actif & Vérifié
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setBillingNotification("Un e-mail de confirmation vous a été envoyé pour ajuster les options de votre abonnement.");
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-white text-slate-900 hover:bg-purple-50 text-xs font-bold transition-colors text-center cursor-pointer shadow-sm"
                    >
                      Gérer l'Abonnement
                    </button>
                  </div>
                </div>

                {/* Real-time Usage Gauges Card */}
                <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">Consommation & Quotas</h2>
                        <p className="text-xs text-slate-500">Mises à jour en temps réel selon les spécifications exactes de votre forfait.</p>
                      </div>
                      <span className="text-xs font-mono font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-100">
                        Période : Août 2026
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
                      {/* Metric 1: Conversations */}
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700 flex items-center gap-1.5">
                            <MessageSquare className="w-4 h-4 text-purple-600" />
                            Conversations / Mois
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {leadsList.length} / {activePlan === 'free' ? '0 (Désactivé)' : activePlan === 'basic' ? '1 000' : activePlan === 'pro' ? '5 000' : 'Illimité'}
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full" 
                            style={{ 
                              width: `${activePlan === 'free' ? 100 : activePlan === 'basic' ? Math.min(100, Math.round((leadsList.length / 1000) * 100)) : activePlan === 'pro' ? Math.min(100, Math.round((leadsList.length / 5000) * 100)) : 1}%` 
                            }} 
                          />
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {leadsList.length} prospect(s) capturé(s) · Synchro Firestore
                        </p>
                      </div>

                      {/* Metric 2: Base de Connaissances */}
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700 flex items-center gap-1.5">
                            <Database className="w-4 h-4 text-indigo-600" />
                            Base de Connaissances
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {knowledgeNotes.filter(n => n.enabled).length} / {activePlan === 'free' ? '3' : activePlan === 'basic' ? '10' : activePlan === 'pro' ? '50' : 'Illimitée'}
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full" style={{ width: `${Math.min(100, (knowledgeNotes.filter(n => n.enabled).length / (activePlan === 'free' ? 3 : activePlan === 'basic' ? 10 : 50)) * 100)}%` }}></div>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {knowledgeNotes.filter(n => n.enabled).length} note(s) active(s) (FAQ, catalogue, consignes)
                        </p>
                      </div>

                      {/* Metric 3: Canaux & Widgets */}
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700 flex items-center gap-1.5">
                            <Bot className="w-4 h-4 text-purple-600" />
                            Canaux & Intégrations
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {activePlan === 'free' ? 'Test Intégration' : activePlan === 'basic' ? '1 Site Web' : activePlan === 'pro' ? 'Multi-Sites Web' : 'Tous Canaux'}
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-600 rounded-full" style={{ width: activePlan === 'free' ? '10%' : activePlan === 'basic' ? '33%' : activePlan === 'pro' ? '66%' : '100%' }}></div>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {activePlan === 'free' ? 'Widget Web intégré (Mode Découverte)' : activePlan === 'basic' ? 'Widget Web universel actif' : activePlan === 'pro' ? 'Widget Web illimité & multi-domaines' : 'Canaux illimités + API sur mesure'}
                        </p>
                      </div>

                      {/* Metric 4: Marque & Branding */}
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700 flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                            Marque Blanche & Branding
                          </span>
                          <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">
                            {activePlan === 'free' || activePlan === 'basic' ? 'Branding Inclus' : 'Marque Blanche'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 pt-1">
                          {activePlan === 'free' || activePlan === 'basic' 
                            ? 'Mention "Propulsé par JawebFlow" affichée sur le widget.' 
                            : 'Widget à l’image exclusive de votre marque (sans logo JawebFlow).'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Plans Comparison Section */}
              <div className="space-y-6 pt-4">
                <div className="text-center max-w-xl mx-auto">
                  <h2 className="text-xl font-extrabold text-slate-900">Choisissez le Forfait Adapté à Votre Croissance</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Tarification rigoureusement identique aux formules officielles JawebFlow. Basculez en un clic.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

                  {/* Plan 0: Plan Gratuit */}
                  <div className={`bg-white rounded-3xl p-6 border transition-all flex flex-col justify-between ${
                    activePlan === 'free'
                      ? 'border-purple-600 shadow-md ring-2 ring-purple-600/20'
                      : 'border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold text-slate-900">Plan Gratuit</h3>
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
                        <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 mt-1 inline-block">
                          0 DZD / mois
                        </span>
                      </div>

                      <ul className="space-y-2.5 text-xs text-slate-600 mb-6">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Accès complet au tableau de bord et à la configuration</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Intégration du code widget sur votre site web</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Connexion à Instagram & canaux externes</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                          <span className="text-slate-400">Zéro crédit IA inclus (Pas de réponses automatiques)</span>
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
                        <h3 className="text-lg font-bold text-slate-900">Plan Basic</h3>
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
                        <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 mt-1 inline-block">
                          ~{billingCycle === 'monthly' ? '6 850' : '5 480'} DZD / mois
                        </span>
                      </div>

                      <ul className="space-y-2.5 text-xs text-slate-600 mb-6">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Widget Web universel (Shopify, WordPress, Webflow, custom...)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Jusqu’à <strong>1 000</strong> conversations par mois</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Support de la base de connaissances (FAQ, catalogue, consignes)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>Compréhension naturelle multilingue (Français, Darija, Anglais)</span>
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
                        <h3 className="text-lg font-bold text-slate-900">Plan Pro / Business</h3>
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
                        <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 mt-1 inline-block">
                          ~{billingCycle === 'monthly' ? '18 700' : '14 960'} DZD / mois
                        </span>
                      </div>

                      <ul className="space-y-2.5 text-xs text-slate-600 mb-6">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                          <span>Widget Web illimité pour tout site web</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                          <span>Accès anticipé WhatsApp & Réseaux sociaux (Prochainement)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                          <span>Jusqu’à <strong>5 000</strong> conversations par mois</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                          <span>Détection automatique des leads & coordonnées clients</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                          <span>Support prioritaire et IA optimisée pour la conversion</span>
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
                        <h3 className="text-lg font-bold text-slate-900">Plan Enterprise</h3>
                        {activePlan === 'enterprise' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-700">
                            Plan Actuel
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            Sur-mesure & API
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mb-4 min-h-[32px]">Pour grandes structures, réseaux & architectures sur-mesure</p>
                      
                      <div className="mb-5 pb-4 border-b border-slate-100">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-slate-900">{billingCycle === 'monthly' ? '$199' : '$159'}</span>
                          <span className="text-xs text-slate-500"> / mois</span>
                        </div>
                        <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 mt-1 inline-block">
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
                          <span>Intégrations sur mesure (CRM, outils de gestion et Google Sheets)</span>
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
                    <h3 className="text-base font-bold text-slate-900">Moyen de Paiement</h3>
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
                      <h3 className="text-base font-bold text-slate-900">Historique des Factures</h3>
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
                          <th className="py-2 px-3 text-right">Facture</th>
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
              <AccountProfileView />
            </div>
          )}

        </main>
      </div>

    </div>
  );
};

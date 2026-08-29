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
  TrendingUp
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { saveAssistantToDatabase, getUserAssistants, WidgetCustomization, db } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { WidgetCustomizer } from './WidgetCustomizer';
import { KnowledgeNotesManager } from './KnowledgeNotesManager';
import { AccountProfileView } from './AccountProfileView';
import { KnowledgeNote } from '../types';

export type DashboardSectionId = 'overview' | 'crawler' | 'knowledge' | 'widget' | 'simulator' | 'leads' | 'integration' | 'settings' | 'billing';

interface DashboardPlatformProps {
  initialSection?: string;
  onNavigate?: (page: string, subSection?: string) => void;
}

const DEFAULT_INITIAL_NOTES = (bizName: string): KnowledgeNote[] => [
  {
    id: 'note_presentation',
    title: `Présentation & Activité de ${bizName || 'l\'Entreprise'}`,
    category: 'general',
    enabled: true,
    source: 'manual',
    content: `${bizName || 'Notre entreprise'} est spécialisée dans les services professionnels d'accompagnement client, offrant des solutions sur-mesure de haute qualité adaptées aux besoins spécifiques de chaque client.`,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'note_services',
    title: 'Catalogue des Services & Prestations Clés',
    category: 'services',
    enabled: true,
    source: 'manual',
    content: `Nous proposons 3 formules principales :\n1. Pack Essentiel : Accompagnement de base et réponse sous 48h.\n2. Pack Pro & Entreprise : Solution complète, support prioritaire 24/7 et suivi dédié.\n3. Formule Sur-Mesure : Élaboration personnalisée selon le cahier des charges du client.`,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'note_tarifs',
    title: 'Grille Tarifaire, Devis Rapides & Modalités',
    category: 'tarifs',
    enabled: true,
    source: 'manual',
    content: `Nos tarifs démarrent à partir de 199 DH pour les prestations standards. Nous établissons des devis gratuits et transparents sous 24h. Moyens de paiement acceptés : Virement bancaire, Paiement à la livraison (Cash on Delivery), Carte bancaire sécurisée.`,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'note_livraison',
    title: 'Zones d\'Intervention, Expédition & Délais',
    category: 'livraison',
    enabled: true,
    source: 'manual',
    content: `Nous couvrons toutes les villes du Maroc (Casablanca, Rabat, Marrakech, Tanger, Fès, Agadir...) et l'international. Délais moyens : 24h à 48h ouvrées. Suivi de commande en temps réel fourni à chaque étape.`,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'note_garanties',
    title: 'Garanties, Retours & Service Après-Vente (SAV)',
    category: 'politiques',
    enabled: true,
    source: 'manual',
    content: `Garantie 100% satisfaction : si une prestation ou un produit ne convient pas, échange gratuit sous 7 jours ouvrés ou remboursement après vérification de notre support SAV.`,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'note_horaires',
    title: 'Horaires d\'Ouverture & Assistance WhatsApp Directe',
    category: 'contact',
    enabled: true,
    source: 'manual',
    content: `Nos bureaux et conseillers sont disponibles du Lundi au Samedi de 09h00 à 19h00. Notre assistant IA répond 24h/24 et 7j/7. En cas d'urgence, un conseiller humain prend le relais via notre ligne WhatsApp.`,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'note_faq',
    title: 'Questions Fréquentes Clients (FAQ)',
    category: 'faq',
    enabled: true,
    source: 'manual',
    content: `Q: Comment passer commande ou demander un devis ?\nR: Il suffit de nous transmettre votre besoin sur ce chat ou via WhatsApp.\n\nQ: Quels sont vos délais de réponse ?\nR: L'IA répond immédiatement et notre équipe humaine prend le relais en moins de 15 minutes pendant les heures ouvrées.`,
    updatedAt: new Date().toISOString()
  }
];

export const DashboardPlatform: React.FC<DashboardPlatformProps> = ({ initialSection = 'overview', onNavigate }) => {
  const { user, profile, logout } = useAuth();

  // Navigation sections
  const [currentSection, setCurrentSection] = useState<DashboardSectionId>(
    (initialSection as DashboardSectionId) || 'overview'
  );

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
  const [integrationTab, setIntegrationTab] = useState<'react' | 'nextjs' | 'html' | 'wordpress'>('react');
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
  const [scannedPages, setScannedPages] = useState<Array<{ url: string; title: string; status: 'done' | 'pending' }>>([]);
  const [scanResultNotes, setScanResultNotes] = useState<KnowledgeNote[] | null>(null);

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
  }>>([
    {
      id: 'lead_1',
      name: 'Youssef El Alami',
      phone: '+212 6 61 23 45 67',
      email: 'youssef.alami@gmail.com',
      need: 'Demande de devis pour un accompagnement mensuel et tarifs de livraison',
      status: 'nouveau',
      date: 'Aujourd\'hui 10:24'
    },
    {
      id: 'lead_2',
      name: 'Imane Berrada',
      phone: '+212 6 55 98 76 54',
      email: 'imane.berrada@agency.ma',
      need: 'Renseignement sur les délais d\'intervention à Casablanca et conditions SAV',
      status: 'qualifie',
      date: 'Hier 16:45'
    }
  ]);

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
            if (current.businessName) setBusinessName(current.businessName);
            if (current.websiteUrl) {
              setWebsiteUrl(current.websiteUrl);
              setCrawlerUrl(current.websiteUrl);
            }
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

      if (prospects.length > 0) {
        setLeadsList(prospects);
      }
    }, (error) => {
      console.warn('Error listening to prospects:', error);
    });

    return () => unsubscribe();
  }, [assistantId]);

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

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) return;
    setIsTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const samplePayload = {
        event: 'prospect_captured_test',
        assistantId: assistantId || 'test_assistant_id',
        businessName: businessName || 'Test Business',
        timestamp: new Date().toISOString(),
        prospect: {
          id: 'test_prospect_999',
          name: 'Ahmed Benmansour',
          email: 'ahmed.benmansour@gmail.com',
          phone: '+213 555 12 34 56',
          need: 'Ceci est un message de validation du Webhook. Votre plateforme JawebFlow communique parfaitement !',
          status: 'qualifie',
          referer: 'https://jawebflow.com/demo',
          language: 'fr'
        }
      };

      const response = await fetch(webhookUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(samplePayload)
      });

      if (response.ok) {
        let respText = '';
        try {
          respText = await response.text();
        } catch (_) {}
        setWebhookTestResult({
          success: true,
          message: 'Webhook validé avec succès !',
          details: `Statut HTTP: ${response.status} ${response.statusText}\nRéponse du serveur: ${respText || 'Vide'}`
        });
      } else {
        setWebhookTestResult({
          success: false,
          message: `Le serveur a répondu avec une erreur (Code ${response.status})`,
          details: `Statut: ${response.status} ${response.statusText}`
        });
      }
    } catch (error: any) {
      console.error('Error executing webhook test:', error);
      setWebhookTestResult({
        success: false,
        message: 'Impossible de joindre l\'URL du Webhook.',
        details: `Une erreur réseau est survenue ou la requête a été bloquée par une politique CORS.\nCeci est attendu si votre site refuse les requêtes d'autres origines.\nDétail technique: ${error?.message || error}`
      });
    } finally {
      setIsTestingWebhook(false);
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

  // Website scanner simulator that creates structured knowledge notes
  const handleRunWebsiteScan = () => {
    const url = crawlerUrl.trim() || websiteUrl.trim();
    if (!url) return;

    setIsScanning(true);
    setScanProgress(15);
    setScanStage('Connexion au domaine et analyse de l\'arborescence...');
    setScannedPages([
      { url: `${url}`, title: 'Page d\'accueil (Hero & Proposition de valeur)', status: 'pending' },
      { url: `${url}/services`, title: 'Catalogue & Prestations de services', status: 'pending' },
      { url: `${url}/tarifs`, title: 'Grille tarifaire, packs & devis', status: 'pending' },
      { url: `${url}/livraison`, title: 'Zones de livraison & Délais', status: 'pending' },
      { url: `${url}/faq`, title: 'Foire aux questions & Support', status: 'pending' },
      { url: `${url}/contact`, title: 'Coordonnées & Horaires WhatsApp', status: 'pending' },
    ]);

    setTimeout(() => {
      setScanProgress(45);
      setScanStage('Extraction sémantique du texte et structuration par fiches...');
      setScannedPages(prev => prev.map((p, idx) => idx <= 1 ? { ...p, status: 'done' } : p));
    }, 1000);

    setTimeout(() => {
      setScanProgress(80);
      setScanStage('Génération automatique des notes de connaissances IA...');
      setScannedPages(prev => prev.map((p, idx) => idx <= 3 ? { ...p, status: 'done' } : p));
    }, 2000);

    setTimeout(() => {
      setScanProgress(100);
      setScanStage('Analyse terminée ! 6 fiches structurées prêtes à être appliquées.');
      setScannedPages(prev => prev.map(p => ({ ...p, status: 'done' })));
      setIsScanning(false);

      const domainName = url.replace(/^https?:\/\//, '').split('/')[0];
      const targetBiz = businessName || domainName;

      const generatedNotes: KnowledgeNote[] = [
        {
          id: 'scanned_' + Math.random().toString(36).substring(2, 9),
          title: `Mission & Positionnement de ${targetBiz}`,
          category: 'general',
          enabled: true,
          source: 'scanned',
          content: `${targetBiz} (${url}) propose une gamme complète de solutions professionnelles avec un engagement de qualité supérieure, un accompagnement personnalisé et une réactivité immédiate pour chaque client.`,
          updatedAt: new Date().toISOString()
        },
        {
          id: 'scanned_' + Math.random().toString(36).substring(2, 9),
          title: 'Offres, Prestations & Services Détectés',
          category: 'services',
          enabled: true,
          source: 'scanned',
          content: `Prestations identifiées sur ${url} :\n- Conseil expert et accompagnement sur-mesure\n- Interventions rapides sous 24/48h\n- Assistance et suivi régulier après livraison.`,
          updatedAt: new Date().toISOString()
        },
        {
          id: 'scanned_' + Math.random().toString(36).substring(2, 9),
          title: 'Conditions Tarifaires & Demande de Devis',
          category: 'tarifs',
          enabled: true,
          source: 'scanned',
          content: `Tarification claire avec devis sans engagement sous 24h. Facilités de paiement acceptées selon la commande. Les devis sont personnalisés selon le volume et la demande.`,
          updatedAt: new Date().toISOString()
        },
        {
          id: 'scanned_' + Math.random().toString(36).substring(2, 9),
          title: 'Zones d\'Expédition & Délais de Livraison',
          category: 'livraison',
          enabled: true,
          source: 'scanned',
          content: `Livraison sécurisée et expédition express dans les principales villes avec numéro de suivi. Délais standards de 24h à 48h ouvrées.`,
          updatedAt: new Date().toISOString()
        },
        {
          id: 'scanned_' + Math.random().toString(36).substring(2, 9),
          title: 'Support Client, Contact Direct & WhatsApp',
          category: 'contact',
          enabled: true,
          source: 'scanned',
          content: `Service client joignable par chat en direct 24/7, par email ou via la ligne WhatsApp officielle pour une prise en charge prioritaire.`,
          updatedAt: new Date().toISOString()
        },
        {
          id: 'scanned_' + Math.random().toString(36).substring(2, 9),
          title: 'FAQ Clés Déduites du Site',
          category: 'faq',
          enabled: true,
          source: 'scanned',
          content: `Q: Comment joindre l'équipe ?\nR: Directement sur ce chat interactif ou sur WhatsApp.\n\nQ: Quel est le délai d'obtention d'un devis ?\nR: Notre équipe vous répond en moins de 24h ouvrées.`,
          updatedAt: new Date().toISOString()
        }
      ];

      setScanResultNotes(generatedNotes);
    }, 2800);
  };

  const handleApplyScannedNotes = () => {
    if (!scanResultNotes) return;
    setKnowledgeNotes(prev => [...scanResultNotes, ...prev]);
    setWebsiteUrl(crawlerUrl);
    setScanResultNotes(null);
    handleSaveToDatabase();
    handleSectionChange('knowledge');
  };

  // AI response in simulator leveraging active knowledge notes
  const handleSendMessage = () => {
    if (!inputMessage.trim() || isBotTyping) return;
    const userText = inputMessage.trim();
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMessages(prev => [...prev, { sender: 'user', text: userText, time }]);
    setInputMessage('');
    setIsBotTyping(true);

    setTimeout(() => {
      let botReply = '';
      const lower = userText.toLowerCase();
      const activeNotes = knowledgeNotes.filter(n => n.enabled);

      // Search relevant notes
      const matchedTarif = activeNotes.find(n => n.category === 'tarifs' || n.title.toLowerCase().includes('tarif') || n.title.toLowerCase().includes('prix'));
      const matchedLivraison = activeNotes.find(n => n.category === 'livraison' || n.title.toLowerCase().includes('livraison') || n.title.toLowerCase().includes('délai'));
      const matchedService = activeNotes.find(n => n.category === 'services' || n.title.toLowerCase().includes('service') || n.title.toLowerCase().includes('offre'));
      const matchedContact = activeNotes.find(n => n.category === 'contact' || n.title.toLowerCase().includes('contact') || n.title.toLowerCase().includes('whatsapp'));

      if (lower.includes('prix') || lower.includes('tarif') || lower.includes('combien') || lower.includes('coût') || lower.includes('devis')) {
        if (matchedTarif) {
          botReply = `Voici les informations concernant nos tarifs :\n\n${matchedTarif.content}\n\nSouhaitez-vous que nous vous préparions un devis personnalisé ?`;
        } else {
          botReply = `Nos tarifs dépendent de votre projet spécifique. Souhaitez-vous nous laisser votre numéro ou email afin qu'un conseiller vous prépare une estimation ?`;
        }
      } else if (lower.includes('livraison') || lower.includes('délai') || lower.includes('delai') || lower.includes('ville') || lower.includes('casablanca') || lower.includes('maroc')) {
        if (matchedLivraison) {
          botReply = `Concernant la livraison et les délais :\n\n${matchedLivraison.content}`;
        } else {
          botReply = `Nous livrons rapidement partout au Maroc sous 24h à 48h. Avez-vous une ville spécifique en tête ?`;
        }
      } else if (lower.includes('whatsapp') || lower.includes('humain') || lower.includes('téléphone') || lower.includes('conseiller') || lower.includes('parler') || lower.includes('urgence')) {
        botReply = whatsappEscalation 
          ? `Vous pouvez contacter directement notre conseiller sur WhatsApp au ${whatsappEscalation} ou nous laisser vos coordonnées ici pour être rappelé.`
          : (matchedContact ? `${matchedContact.content}\n\nLaissez-nous vos coordonnées et nous vous recontacterons sans attendre.` : `Vous pouvez nous laisser votre numéro de téléphone ou email afin qu'un conseiller vous rappelle rapidement.`);
      } else if (lower.includes('service') || lower.includes('offre') || lower.includes('que faites') || lower.includes('produit')) {
        if (matchedService) {
          botReply = `Voici un aperçu de nos prestations chez ${businessName || 'notre entreprise'} :\n\n${matchedService.content}`;
        } else {
          botReply = `Nous proposons des solutions professionnelles sur-mesure adaptées à votre activité. Quel type de prestation recherchez-vous ?`;
        }
      } else if (lower.includes('salam') || lower.includes('labas') || lower.includes('wach') || lower.includes('merhba') || lower.includes('choukran')) {
        botReply = `Marhaban bik ! Labas alhamdoulillah. Kifech ne9der n3awnek lyoum concernant ${businessName || 'nos services'} ? 🇲🇦`;
      } else {
        const firstActive = activeNotes[0];
        botReply = `Merci pour votre question ! ${firstActive ? `D'après nos données (${firstActive.title}) : ${firstActive.content.slice(0, 140)}... ` : ''}N'hésitez pas à préciser votre demande ou à nous laisser votre numéro pour un suivi personnalisé.`;
      }

      setMessages(prev => [...prev, {
        sender: 'bot',
        text: botReply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
      setIsBotTyping(false);
    }, 500);
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

  const getActiveIntegrationCode = () => {
    switch (integrationTab) {
      case 'react': return widgetReactComponentCode;
      case 'nextjs': return widgetNextJsCode;
      case 'wordpress': return widgetScriptHtml;
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
          <nav className="p-3 space-y-1">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Menu Principal
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
                <span>Dashboard Global</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>

            <div className="pt-3 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Configuration de l'IA
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
                <span>1. Scanner le Site</span>
              </div>
              {websiteUrl && <Check className="w-3.5 h-3.5 text-emerald-500" />}
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
                <span>2. Base de Connaissances</span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700">
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
                <span>3. Apparence & Bulle</span>
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
                <span>4. Tester l'Assistant</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
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
                <span>5. Code d'Intégration</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>

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
                <DollarSign className="w-4 h-4" />
                <span>Mon Plan & Facturation</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>

            <div className="pt-3 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Gestion & Compte
            </div>

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
                <span>CRM & Prospects</span>
              </div>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">
                {leadsList.length}
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
                  {currentSection === 'crawler' && '1. Scanner le Site'}
                  {currentSection === 'knowledge' && '2. Base de Connaissances'}
                  {currentSection === 'widget' && '3. Apparence & Bulle'}
                  {currentSection === 'simulator' && '4. Tester l\'Assistant'}
                  {currentSection === 'integration' && '5. Code d\'Intégration'}
                  {currentSection === 'leads' && 'CRM & Prospects'}
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
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Cockpit Opérationnel</span>
                  </div>

                  <div className="max-w-2xl space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                      Bienvenue sur le cockpit de {businessName || 'votre Assistant'}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                      Votre assistant IA est prêt à qualifier vos visiteurs, répondre à leurs questions 24h/24 et transférer les opportunités directement sur WhatsApp.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
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
                  </div>
                </div>
              </div>

              {/* Step Flow Bento Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {/* Step 1 */}
                <div 
                  onClick={() => handleSectionChange('crawler')}
                  className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                      <Globe className="w-5 h-5" />
                    </div>
                    {websiteUrl ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Scanné
                      </span>
                    ) : (
                      <span className="text-xs text-purple-600 font-bold group-hover:translate-x-1 transition-transform">
                        Étape 1 →
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Scanner votre Site Web</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      L'IA analyse vos pages et génère automatiquement vos fiches de connaissances.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div 
                  onClick={() => handleSectionChange('knowledge')}
                  className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                      <Database className="w-5 h-5" />
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                      {knowledgeNotes.filter(n => n.enabled).length} fiches actives
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Base de Connaissances IA</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Gérez les fiches structurées avec titre et contenu pour vos tarifs, services et FAQ.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div 
                  onClick={() => handleSectionChange('widget')}
                  className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                      <Palette className="w-5 h-5" />
                    </div>
                    <div className="w-3.5 h-3.5 rounded-full border border-slate-300" style={{ backgroundColor: widgetConfig.primaryColor }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Apparence & Bulle</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Personnalisez les couleurs, la forme, votre logo et les messages d'accueil.
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div 
                  onClick={() => handleSectionChange('simulator')}
                  className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                      <Bot className="w-5 h-5" />
                    </div>
                    <span className="text-xs text-purple-600 font-bold group-hover:translate-x-1 transition-transform">
                      Tester →
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Simulateur & Test</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Discutez avec votre assistant pour vérifier la précision de ses réponses.
                    </p>
                  </div>
                </div>

                {/* Step 5 */}
                <div 
                  onClick={() => handleSectionChange('integration')}
                  className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                      <Code2 className="w-5 h-5" />
                    </div>
                    <span className="text-xs text-purple-600 font-bold group-hover:translate-x-1 transition-transform">
                      Intégrer →
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Code d'Intégration</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Copiez le code prêt à l'emploi pour React, Next.js, HTML, WordPress ou Shopify.
                    </p>
                  </div>
                </div>

                {/* Step 6: Account */}
                <div 
                  onClick={() => handleSectionChange('settings')}
                  className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                      <User className="w-5 h-5" />
                    </div>
                    <span className="text-xs text-purple-600 font-bold group-hover:translate-x-1 transition-transform">
                      Gérer →
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Mon Compte & Équipe</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Modifiez votre nom, profil entreprise, numéro WhatsApp et sécurité.
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
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Extraction Automatique</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    Scanner votre Site Web
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
                    Indiquez l'adresse de votre site web ou boutique en ligne. L'IA de JawebFlow va analyser vos services, tarifs, FAQ et générer automatiquement des notes de connaissances structurées.
                  </p>
                </div>

                {/* URL Input Form */}
                <div className="pt-2">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="url"
                        value={crawlerUrl}
                        onChange={(e) => setCrawlerUrl(e.target.value)}
                        placeholder="https://votresite.com ou monsite.ma..."
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs sm:text-sm focus:bg-white focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleRunWebsiteScan}
                      disabled={isScanning || !crawlerUrl.trim()}
                      className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm shadow-purple-600/20 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isScanning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Scan en cours...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Lancer l'Analyse IA</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Scanning Progress */}
                {isScanning && (
                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span>{scanStage}</span>
                      <span className="font-mono text-purple-600">{scanProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 transition-all duration-300 rounded-full"
                        style={{ width: `${scanProgress}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                      {scannedPages.map((page, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200 text-xs">
                          {page.status === 'done' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <Loader2 className="w-3.5 h-3.5 text-purple-600 animate-spin shrink-0" />
                          )}
                          <span className="truncate font-medium text-slate-700">{page.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Scanned Notes Preview Result */}
                {scanResultNotes && !isScanning && (
                  <div className="p-6 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-4 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <h3 className="font-bold text-sm text-purple-950">
                          {scanResultNotes.length} fiches de connaissances générées avec succès
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={handleApplyScannedNotes}
                        className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center gap-2 shadow-sm cursor-pointer transition-all"
                      >
                        <Check className="w-4 h-4" />
                        <span>Appliquer à ma Base de Connaissances</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      {scanResultNotes.map((n, i) => (
                        <div key={i} className="p-4 rounded-xl bg-white border border-purple-100 space-y-1.5 shadow-xs">
                          <span className="text-[10px] font-bold text-purple-700 uppercase">{n.category}</span>
                          <h4 className="font-bold text-xs text-slate-900">{n.title}</h4>
                          <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{n.content}</p>
                        </div>
                      ))}
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

              {/* Webhook Configuration and Verification Card */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Automatisation Webhook</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                    Webhook de Notification en Temps Réel
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
                    Envoyez instantanément les données des prospects capturés (nom, email, téléphone, besoin) à votre propre CRM, site internet, ou un outil d'automatisation comme Make, Zapier ou Webhook.site.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-xs font-bold text-slate-700">URL du Webhook de destination</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://votre-site.com/api/webhooks/prospects ou Make/Zapier URL..."
                      className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
                    />
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleSaveToDatabase}
                        className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Save className="w-4 h-4" />
                        <span>Enregistrer l'URL</span>
                      </button>
                      
                      <button
                        type="button"
                        onClick={handleTestWebhook}
                        disabled={!webhookUrl.trim() || isTestingWebhook}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-sm shadow-emerald-600/10"
                      >
                        {isTestingWebhook ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Zap className="w-4 h-4" />
                        )}
                        <span>Valider le Webhook</span>
                      </button>
                    </div>
                  </div>
                  
                  {webhookTestResult && (
                    <div className={`p-4 rounded-xl text-xs font-mono space-y-1.5 border ${
                      webhookTestResult.success 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}>
                      <div className="font-bold flex items-center gap-1.5">
                        {webhookTestResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <span>{webhookTestResult.message}</span>
                      </div>
                      {webhookTestResult.details && (
                        <div className="opacity-90 whitespace-pre-wrap max-h-32 overflow-y-auto text-[10px]">
                          {webhookTestResult.details}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              SECTION 6: LEADS & PROSPECTS CRM
              ================================================================= */}
          {currentSection === 'leads' && (() => {
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

                        {/* Bento Grid: Origine & Campagnes UTM Publicitaires */}
                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 text-slate-400" />
                            <span>Données publicitaires (Pixels & UTMs)</span>
                          </h4>

                          <div className="space-y-2 text-xs">
                            <div className="flex flex-col gap-0.5 p-2 rounded bg-white border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Provenance Initiale (Referer)</span>
                              <span className="font-semibold text-slate-700 truncate">{lead.referer || 'Accès Direct'}</span>
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
              </div>
            );
          })()}

          {/* =================================================================
              SECTION: BILLING & PLAN
              ================================================================= */}
          {currentSection === 'billing' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-8 max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold mb-6">Mon Plan & Facturation</h1>
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                  <h2 className="text-2xl font-bold mb-6">Plan actuel : <span className="text-purple-600">Basic</span></h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-50 p-6 rounded-xl">
                      <p className="text-sm text-slate-500 mb-1">Prix</p>
                      <p className="text-2xl font-bold">29 $ <span className="text-sm font-normal text-slate-500">/ mois</span></p>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-xl">
                      <p className="text-sm text-slate-500 mb-1">Conversations</p>
                      <p className="text-2xl font-bold">1 000</p>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-xl">
                      <p className="text-sm text-slate-500 mb-1">Marque JawebFlow</p>
                      <p className="text-xl font-bold">Activée</p>
                    </div>
                  </div>
                </div>
              </div>
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

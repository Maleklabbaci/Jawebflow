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
  Phone
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { saveAssistantToDatabase, getUserAssistants, WidgetCustomization } from '../lib/firebase';
import { WidgetCustomizer } from './WidgetCustomizer';
import { KnowledgeNotesManager } from './KnowledgeNotesManager';
import { AccountProfileView } from './AccountProfileView';
import { KnowledgeNote } from '../types';

export type DashboardSectionId = 'overview' | 'crawler' | 'knowledge' | 'widget' | 'simulator' | 'leads' | 'integration' | 'settings';

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

  // Persistence status
  const [isSavingDb, setIsSavingDb] = useState<boolean>(false);
  const [savedDbSuccess, setSavedDbSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

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

  // Real leads captured by the assistant
  const [leadsList, setLeadsList] = useState<Array<{
    id: string;
    name: string;
    phone: string;
    email: string;
    need: string;
    status: 'nouveau' | 'qualifie' | 'converti';
    date: string;
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
            </div>
          )}

          {/* =================================================================
              SECTION 6: LEADS & PROSPECTS CRM
              ================================================================= */}
          {currentSection === 'leads' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold">
                      <Users className="w-3.5 h-3.5" />
                      <span>CRM & Pipeline</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                      Prospects Qualifiés par l'Assistant
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
                      Retrouvez ici tous les contacts capturés automatiquement lors des discussions avec vos visiteurs.
                    </p>
                  </div>
                </div>

                {/* Leads Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                      <tr>
                        <th className="p-3.5">Prospect</th>
                        <th className="p-3.5">Téléphone / WhatsApp</th>
                        <th className="p-3.5">Besoin Détecté</th>
                        <th className="p-3.5">Statut</th>
                        <th className="p-3.5">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {leadsList.map((lead) => (
                        <tr key={lead.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 font-bold text-slate-900">
                            <div>{lead.name}</div>
                            <div className="text-[10px] text-slate-400 font-normal">{lead.email}</div>
                          </td>
                          <td className="p-3.5 font-mono text-purple-700 font-semibold">{lead.phone}</td>
                          <td className="p-3.5 max-w-xs">{lead.need}</td>
                          <td className="p-3.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              lead.status === 'nouveau' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            }`}>
                              {lead.status}
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-400 text-[11px]">{lead.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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

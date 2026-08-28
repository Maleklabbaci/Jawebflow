import React, { useState } from 'react';
import { 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  ShieldCheck, 
  Briefcase, 
  Store, 
  GraduationCap, 
  Building2, 
  ArrowRight,
  Database,
  CheckCircle2,
  RefreshCw,
  Home,
  Utensils,
  Wrench,
  Layers
} from 'lucide-react';

interface DemoPageProps {
  onOpenAssistantModal: () => void;
  onNavigate: (page: string) => void;
}

type SectorId = 'services' | 'ecommerce' | 'formation' | 'cabinet' | 'immo' | 'resto';

interface Message {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: string;
  verifiedSource?: string;
}

export const DemoPage: React.FC<DemoPageProps> = ({ onOpenAssistantModal }) => {
  const [activeSector, setActiveSector] = useState<SectorId>('services');
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const sectorConfigs = {
    services: {
      name: 'Nexus Digital (Agence Web & Conseil)',
      badge: 'B2B & Prestations',
      description: 'Testez la qualification de leads, la remise de devis proforma et la prise de rendez-vous.',
      icon: Briefcase,
      initialMessages: [
        {
          id: '1',
          sender: 'bot' as const,
          text: 'Bonjour ! Bienvenue chez Nexus Digital. Je peux vous renseigner sur nos forfaits de création web, nos audits SEO, ou vous préparer un devis proforma.',
          timestamp: '10:42',
        },
        {
          id: '2',
          sender: 'user' as const,
          text: 'Wach kayen devis proforma pour création d\'un site web d\'entreprise ?',
          timestamp: '10:43',
        },
        {
          id: '3',
          sender: 'bot' as const,
          text: 'Absolument ! Nous établissons des factures proforma certifiées sous 2 heures avec toutes les coordonnées fiscales (NIF, NIS, RC, RIB). Nos forfaits démarrent à partir de 45 000 DA. Souhaitez-vous que je prenne vos coordonnées ?',
          timestamp: '10:43',
          verifiedSource: 'Base de données : Grille Tarifaire B2B & Documents Administratifs',
        }
      ],
      quickQuestions: [
        'Combien coûte un audit SEO ?',
        'Wach takhadmou sur site w à distance ?',
        'Kifech nchoufou un créneau pour une réunion visio ?',
        'Quels sont les délais de livraison d\'un projet ?'
      ]
    },
    ecommerce: {
      name: 'Maison Lila (Cosmétiques Bio & Soins)',
      badge: 'E-commerce & Retail',
      description: 'Testez la vérification des stocks, les tarifs de livraison et les offres multi-packs.',
      icon: Store,
      initialMessages: [
        {
          id: '1',
          sender: 'bot' as const,
          text: 'Marhba bik chez Maison Lila ! 🌿 Je suis là pour vous conseiller sur nos soins naturels, vérifier les stocks et calculer la livraison chez vous.',
          timestamp: '14:15',
        },
        {
          id: '2',
          sender: 'user' as const,
          text: 'Chhal la livraison w chhal lwaqt bach talhaq la commande ?',
          timestamp: '14:16',
        },
        {
          id: '3',
          sender: 'bot' as const,
          text: 'La livraison à domicile ou en point relais s\'effectue sous 24h à 48h selon votre région. Le paiement peut se faire à la réception du colis ! 📦',
          timestamp: '14:16',
          verifiedSource: 'Base de données : Grille tarifaire & Délais d\'expédition 2026',
        }
      ],
      quickQuestions: [
        'Wach kayen remise si naddi 2 packs ?',
        'Est-ce que l\'huile de figue de barbarie est en stock ?',
        'Kifech nbadal si le produit ma 3ajabnich ?',
        'Je veux commander par WhatsApp direct.'
      ]
    },
    immo: {
      name: 'Immo Prestige (Agence & Promotion)',
      badge: 'Immobilier & Architecture',
      description: 'Testez la recherche de biens, les superficies, prix au m² et visites guidées.',
      icon: Home,
      initialMessages: [
        {
          id: '1',
          sender: 'bot' as const,
          text: 'Bonjour ! Bienvenue chez Immo Prestige. Je vous oriente parmi nos programmes neufs et nos biens en vente ou location.',
          timestamp: '16:05',
        },
        {
          id: '2',
          sender: 'user' as const,
          text: 'Wach 3andkom des appartements F4 avec acte notarié et livret foncier ?',
          timestamp: '16:06',
        },
        {
          id: '3',
          sender: 'bot' as const,
          text: 'Oui ! Tous nos biens en résidence disposent de l\'acte notarié individuel et du livret foncier. Nous avons 3 appartements F4 disponibles de 125m² à 145m². Souhaitez-vous planifier une visite ?',
          timestamp: '16:06',
          verifiedSource: 'Base de données : Inventaire Résidences & Documents Juridiques',
        }
      ],
      quickQuestions: [
        'Quel est le prix au m² des logements ?',
        'Y a-t-il des facilités de paiement par tranches ?',
        'Quels sont les délais de remise des clés ?',
        'Je veux réserver une visite pour ce samedi.'
      ]
    },
    resto: {
      name: 'Le Jardin Gourmand (Restaurant & Réceptions)',
      badge: 'Restauration & Hôtellerie',
      description: 'Testez la réservation de table, les plats du jour, les allergènes et les événements.',
      icon: Utensils,
      initialMessages: [
        {
          id: '1',
          sender: 'bot' as const,
          text: 'Bienvenue au Jardin Gourmand ! 🍽️ Je peux réserver votre table, vous présenter notre menu du jour ou élaborer un menu groupe.',
          timestamp: '12:20',
        },
        {
          id: '2',
          sender: 'user' as const,
          text: 'Kayen table pour 6 personnes ce soir à 20h30 en terrasse ?',
          timestamp: '12:21',
        },
        {
          id: '3',
          sender: 'bot' as const,
          text: 'Oui, nous avons une agréable table disponible en terrasse pour 6 personnes ce soir à 20h30. Quel nom et numéro de téléphone dois-je enregistrer ?',
          timestamp: '12:21',
          verifiedSource: 'Base de données : Cahier de Réservation & Carte Restaurant',
        }
      ],
      quickQuestions: [
        'Avez-vous des plats végétariens / sans gluten ?',
        'Quel est le menu dégustation du chef ?',
        'Est-il possible de privatiser la salle haute ?',
        'Avez-vous un espace enfants / parking ?'
      ]
    },
    formation: {
      name: 'Horizon Pro Academy (Institut)',
      badge: 'Formations & Certifications',
      description: 'Testez les dates de sessions, programmes certifiants et facilités de paiement.',
      icon: GraduationCap,
      initialMessages: [
        {
          id: '1',
          sender: 'bot' as const,
          text: 'Bonjour et bienvenue à Horizon Pro Academy. Je suis à votre disposition pour vous orienter vers nos cycles certifiants en présentiel ou en direct en ligne.',
          timestamp: '09:10',
        },
        {
          id: '2',
          sender: 'user' as const,
          text: 'Waqtach la prochaine session w wach kayen certificat à la fin ?',
          timestamp: '09:11',
        },
        {
          id: '3',
          sender: 'bot' as const,
          text: 'La prochaine session débute le samedi 15 du mois prochain. Une attestation et un certificat de réussite reconnu sont délivrés après validation de l\'examen pratique. Tarif : 28 000 DA avec paiement en 2 fois possible.',
          timestamp: '09:11',
          verifiedSource: 'Base de données : Planning Pédagogique & Certifications 2026',
        }
      ],
      quickQuestions: [
        'Wach kayen cours du soir en ligne ?',
        'Kifech ndir l\'inscription ?',
        'Quels sont les prérequis pour ce cursus ?',
        'Puis-je avoir le programme détaillé par email ?'
      ]
    },
    cabinet: {
      name: 'Cabinet Médical Al-Amel',
      badge: 'Clinique & Consultations',
      description: 'Testez l\'accueil patient, les spécialités, les horaires et la prise de rendez-vous préalable.',
      icon: Building2,
      initialMessages: [
        {
          id: '1',
          sender: 'bot' as const,
          text: 'Bonjour, bienvenue au secrétariat du Cabinet Médical Al-Amel. Comment puis-je vous aider aujourd\'hui ?',
          timestamp: '11:00',
        },
        {
          id: '2',
          sender: 'user' as const,
          text: 'Wach lazam rendez-vous à l\'avance w chhal les horaires ?',
          timestamp: '11:01',
        },
        {
          id: '3',
          sender: 'bot' as const,
          text: 'Oui, les consultations se font sur rendez-vous du samedi au jeudi de 08h30 à 16h30. Pour réserver votre créneau sans attente, je peux enregistrer votre nom et numéro dès maintenant.',
          timestamp: '11:01',
          verifiedSource: 'Base de données : Planning Consultations & Protocole Accueil',
        }
      ],
      quickQuestions: [
        'Où se trouve exactement le cabinet ?',
        'Wach kayen parking disponible ?',
        'Quels sont les documents à ramener ?',
        'Je souhaite prendre un rendez-vous pour demain.'
      ]
    }
  };

  const [messages, setMessages] = useState<Message[]>(sectorConfigs[activeSector].initialMessages);

  const handleSelectSector = (sec: SectorId) => {
    setActiveSector(sec);
    setMessages(sectorConfigs[sec].initialMessages);
  };

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend || inputValue;
    if (!text.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: text,
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      let replyText = "Parfait ! Cette information est bien validée dans notre base de données d'entreprise. Souhaitez-vous que nous passions à l'étape suivante ?";
      let source = "Base de données d'entreprise : Données certifiées";

      if (text.toLowerCase().includes('prix') || text.toLowerCase().includes('chhal') || text.toLowerCase().includes('tarif') || text.toLowerCase().includes('coûte')) {
        replyText = "Nos tarifs sont strictement encadrés et transparents. Vous recevez un récapitulatif détaillé avant toute validation.";
        source = "Base de données : Catalogue & Grille Officielle 2026";
      } else if (text.toLowerCase().includes('zone') || text.toLowerCase().includes('région') || text.toLowerCase().includes('ville') || text.toLowerCase().includes('livraison') || text.toLowerCase().includes('déplacement')) {
        replyText = "Nous assurons la couverture de l'ensemble des zones et régions, avec des délais moyens de traitement de 24h à 48h.";
        source = "Base de données : Réseau logistique & Délais d'intervention";
      } else if (text.toLowerCase().includes('rdv') || text.toLowerCase().includes('rendez-vous') || text.toLowerCase().includes('devis') || text.toLowerCase().includes('contact')) {
        replyText = "Je peux transmettre votre demande en priorité à notre équipe administrative. Veuillez nous laisser votre numéro ou valider directement sur WhatsApp.";
        source = "Base de données : Module de Prise de Contact";
      }

      const botReply: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: replyText,
        timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        verifiedSource: source
      };

      setMessages(prev => [...prev, botReply]);
      setIsTyping(false);
    }, 650);
  };

  return (
    <div className="pt-28 pb-20 px-4 sm:px-6 max-w-6xl mx-auto space-y-12">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold backdrop-blur-xl">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Simulateur interactif multi-métiers</span>
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-display tracking-tight text-neutral-100">
          Testez l'assistant en conditions réelles <br />
          <span className="bg-gradient-to-r from-purple-300 via-fuchsia-200 to-indigo-300 bg-clip-text text-transparent">
            sur différents profils d'entreprise.
          </span>
        </h1>
        <p className="text-neutral-300 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
          Ces scénarios démontrent la flexibilité de l'IA : elle s'adapte instantanément à votre vocabulaire, vos tarifs et vos règles de gestion.
        </p>
      </div>

      {/* Sector Switcher Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 max-w-5xl mx-auto">
        {(Object.keys(sectorConfigs) as SectorId[]).map((key) => {
          const cfg = sectorConfigs[key];
          const Icon = cfg.icon;
          const isSelected = activeSector === key;
          return (
            <button
              key={key}
              onClick={() => handleSelectSector(key)}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between backdrop-blur-xl ${
                isSelected
                  ? 'bg-purple-600/30 border-purple-500 text-white shadow-lg shadow-purple-950/50 scale-[1.02]'
                  : 'bg-neutral-950/40 border-white/10 text-neutral-300 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-xl ${isSelected ? 'bg-purple-500 text-white' : 'bg-neutral-900 text-neutral-400'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-400"></span>}
              </div>
              <div className="min-w-0">
                <span className="font-semibold text-xs block truncate text-neutral-100">{cfg.badge}</span>
                <span className="text-[10px] text-neutral-400 block truncate mt-0.5">Exemple configuré</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Interactive Chat Playground Card */}
      <div className="max-w-4xl mx-auto rounded-3xl bg-neutral-950/50 border border-white/10 backdrop-blur-2xl shadow-2xl shadow-purple-950/40 overflow-hidden">
        {/* Chat Top Bar */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-neutral-900/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-600/30">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-neutral-100">{sectorConfigs[activeSector].name}</h3>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              </div>
              <p className="text-[11px] text-neutral-400">{sectorConfigs[activeSector].description}</p>
            </div>
          </div>

          <button
            onClick={() => setMessages(sectorConfigs[activeSector].initialMessages)}
            className="p-2 rounded-xl bg-neutral-900/60 border border-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title="Réinitialiser la conversation"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Messages Stream */}
        <div className="p-4 sm:p-6 space-y-4 min-h-[380px] max-h-[460px] overflow-y-auto">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'} space-y-1`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[75%] p-4 rounded-2xl text-xs sm:text-sm leading-relaxed backdrop-blur-md ${
                  m.sender === 'user'
                    ? 'bg-purple-600 text-white rounded-br-none shadow-lg shadow-purple-600/30'
                    : 'bg-neutral-900/70 border border-white/10 text-neutral-200 rounded-bl-none'
                }`}
              >
                <p>{m.text}</p>
                {m.verifiedSource && (
                  <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center gap-1.5 text-[11px] text-purple-300 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                    <span className="truncate">{m.verifiedSource}</span>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-neutral-500 px-1">{m.timestamp}</span>
            </div>
          ))}

          {isTyping && (
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-neutral-900/60 border border-white/10 text-neutral-400 text-xs w-fit animate-pulse">
              <Bot className="w-3.5 h-3.5 text-purple-400" />
              <span>L'assistant consulte vos données...</span>
            </div>
          )}
        </div>

        {/* Suggested Quick Questions */}
        <div className="px-4 sm:px-6 py-3 border-t border-white/10 bg-neutral-900/30 flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] text-neutral-400 flex-shrink-0 font-medium">Exemples :</span>
          {sectorConfigs[activeSector].quickQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(q)}
              className="text-[11px] px-3 py-1.5 rounded-full bg-neutral-900/60 hover:bg-purple-500/20 text-neutral-300 hover:text-purple-200 border border-white/10 hover:border-purple-500/40 transition-colors whitespace-nowrap cursor-pointer flex-shrink-0"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-white/10 bg-neutral-900/60 flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Posez une question en Français ou en Darija..."
            className="flex-grow bg-neutral-950/60 border border-white/10 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-all"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim()}
            className="p-2.5 sm:px-4 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-purple-600/30"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Envoyer</span>
          </button>
        </div>
      </div>

      {/* Universal Banner */}
      <div className="p-6 rounded-2xl bg-neutral-950/40 border border-white/10 max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-neutral-100">Votre activité est unique ?</h4>
            <p className="text-[11px] sm:text-xs text-neutral-400">L'assistant s'adapte à n'importe quel domaine sans restriction.</p>
          </div>
        </div>

        <button
          onClick={onOpenAssistantModal}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-purple-600/30 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <span>Créer pour mon business</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

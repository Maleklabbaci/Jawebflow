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

export const DemoPage: React.FC<DemoPageProps> = ({ onOpenAssistantModal, onNavigate }) => {
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
          verifiedSource: 'Base de connaissances : Grille Tarifaire B2B & Documents Administratifs',
        }
      ],
      quickQuestions: [
        'Combien coûte un audit SEO ?',
        'Wach takhadmou sur site w à distance ?',
        'Kifech nchoufou un créneau pour une réunion visio ?',
        'Quels sont les délais de livraison d\'un projet ?'
      ],
      quickAnswers: [
        'Notre audit SEO complet (technique, contenu, concurrence) est livré sous 48h avec un rapport détaillé : 45 000 DA pour un site vitrine, 75 000 DA pour une boutique en ligne. Je vous prépare un devis proforma avec vos mentions fiscales si vous le souhaitez.',
        'Nous travaillons partout en Algérie : 100% à distance depuis Alger, et en présentiel pour le cadrage et les ateliers à Alger, Oran et Constantine. Souhaitez-vous une réunion visio de 30 minutes ?',
        'Voici les créneaux libres cette semaine : demain 10h00, jeudi 14h30 ou dimanche 09h30. Laissez-moi votre nom et votre numéro, je réserve le créneau et je vous envoie l\'invitation.',
        'Un site vitrine demande 10 à 15 jours, une boutique en ligne 3 à 4 semaines et un audit SEO 48h. Dites-moi votre besoin, je vous confirme le planning exact avant toute commande.'
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
          verifiedSource: 'Base de connaissances : Grille tarifaire & Délais d\'expédition 2026',
        }
      ],
      quickQuestions: [
        'Wach kayen remise si naddi 2 packs ?',
        'Est-ce que l\'huile de figue de barbarie est en stock ?',
        'Kifech nbadal si le produit ma 3ajabnich ?',
        'Je veux commander par WhatsApp direct.'
      ],
      quickAnswers: [
        'Oui : -10% dès 2 produits et -15% dès 3 produits, et la livraison est offerte à partir de 7 000 DA d\'achat. Souhaitez-vous que je prépare votre panier ?',
        'Oui, il reste 12 flacons d\'huile de figue de barbarie à 2 900 DA. Je vous en réserve un ? Donnez-moi votre nom, votre ville et votre numéro.',
        'Vous avez 7 jours après réception pour demander un échange, si le produit n\'a pas été ouvert. Donnez-moi votre numéro de commande et je lance la procédure tout de suite.',
        'Avec plaisir ! Laissez-moi votre numéro et le produit souhaité : notre équipe vous envoie le lien de paiement, ou le montant à régler à la livraison.'
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
          verifiedSource: 'Base de connaissances : Inventaire Résidences & Documents Juridiques',
        }
      ],
      quickQuestions: [
        'Quel est le prix au m² des logements ?',
        'Y a-t-il des facilités de paiement par tranches ?',
        'Quels sont les délais de remise des clés ?',
        'Je veux réserver une visite pour ce samedi.'
      ],
      quickAnswers: [
        'Sur nos résidences neuves, le prix au m² démarre à 165 000 DA, et à 210 000 DA pour les biens avec vue dégagée. Je vous envoie la grille détaillée par typologie (F2 à F5) ?',
        'Oui : apport de 30%, puis le solde échelonné jusqu\'à 36 mois avec notre partenaire bancaire. Le livret foncier et l\'acte notarié individuel sont remis à la livraison.',
        'Pour la résidence Les Jardins, la livraison est prévue au 2e trimestre 2027, avec un suivi de chantier envoyé chaque trimestre.',
        'Samedi 10h00 ou 15h30 ? Notre conseiller vous confirme par téléphone. Donnez-moi votre nom et votre numéro, je bloque le créneau.'
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
          verifiedSource: 'Base de connaissances : Cahier de Réservation & Carte Restaurant',
        }
      ],
      quickQuestions: [
        'Avez-vous des plats végétariens / sans gluten ?',
        'Quel est le menu dégustation du chef ?',
        'Est-il possible de privatiser la salle haute ?',
        'Avez-vous un espace enfants / parking ?'
      ],
      quickAnswers: [
        'Oui : 4 plats certifiés sans gluten et 5 plats végétariens, préparés à la commande. Si vous avez une autre allergie, dites-le-moi, je le note sur votre réservation.',
        'Le menu dégustation se compose de 5 services à 4 500 DA par personne (entrée, poisson, viande, fromage, dessert), du jeudi au samedi sur réservation.',
        'Oui, la salle haute accueille jusqu\'à 40 personnes, à partir de 60 000 DA. Je vous prépare le devis et je bloque la date dès votre accord.',
        'Oui : un espace enfants avec animateur le week-end, et un parking gratuit de 25 places pour les tables réservées.'
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
          verifiedSource: 'Base de connaissances : Planning Pédagogique & Certifications 2026',
        }
      ],
      quickQuestions: [
        'Wach kayen cours du soir en ligne ?',
        'Kifech ndir l\'inscription ?',
        'Quels sont les prérequis pour ce cursus ?',
        'Puis-je avoir le programme détaillé par email ?'
      ],
      quickAnswers: [
        'Oui, nos cours du soir ont lieu de 18h30 à 21h00 en direct en ligne, et chaque séance est disponible en replay pendant 12 mois.',
        'L\'inscription prend 2 minutes : une pièce d\'identité et le premier versement d\'acompte. Je peux vous envoyer le dossier prérempli dès maintenant.',
        'Pour ce cursus, il faut un niveau bac ou une expérience professionnelle équivalente, ainsi qu\'un ordinateur pour les exercices pratiques.',
        'Bien sûr. Laissez-moi votre adresse email : vous recevez le programme détaillé, le planning des sessions et les tarifs en PDF.'
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
          verifiedSource: 'Base de connaissances : Planning Consultations & Protocole Accueil',
        }
      ],
      quickQuestions: [
        'Où se trouve exactement le cabinet ?',
        'Wach kayen parking disponible ?',
        'Quels sont les documents à ramener ?',
        'Je souhaite prendre un rendez-vous pour demain.'
      ],
      quickAnswers: [
        'Le cabinet se trouve au 12 rue Didouche Mourad, Alger Centre, au 3e étage (ascenseur), à 5 minutes de la station de métro Tafourah.',
        'Oui, un parking gratuit est disponible derrière l\'immeuble, avec 10 places pour les patients.',
        'Pour la première consultation : votre carte d\'identité ou Chifa, votre carte de mutuelle si vous en avez une, et vos analyses ou ordonnances précédentes.',
        'Demain il reste deux créneaux : 09h30 et 15h00. Donnez-moi votre nom et votre numéro, le secrétariat vous confirme par SMS.'
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

    const sector = sectorConfigs[activeSector];
    const presetIndex = sector.quickQuestions.findIndex((q) => q === text.trim());

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
      // 1) Une question d'exemple reçoit LA réponse du secteur concerné.
      if (presetIndex >= 0) {
        const presetReply: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'bot',
          text: sector.quickAnswers[presetIndex],
          timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          verifiedSource: `Base de connaissances : ${sector.badge} (données du commerçant)`
        };
        setMessages(prev => [...prev, presetReply]);
        setIsTyping(false);
        return;
      }

      let replyText = "Parfait ! Cette information est bien validée dans notre base de connaissances d'entreprise. Souhaitez-vous que nous passions à l'étape suivante ?";
      let source = "Base de connaissances d'entreprise : Données certifiées";

      if (text.toLowerCase().includes('prix') || text.toLowerCase().includes('chhal') || text.toLowerCase().includes('tarif') || text.toLowerCase().includes('coûte')) {
        replyText = "Nos tarifs sont strictement encadrés et transparents. Vous recevez un récapitulatif détaillé avant toute validation.";
        source = "Base de connaissances : Catalogue & Grille Officielle 2026";
      } else if (text.toLowerCase().includes('zone') || text.toLowerCase().includes('région') || text.toLowerCase().includes('ville') || text.toLowerCase().includes('livraison') || text.toLowerCase().includes('déplacement')) {
        replyText = "Nous assurons la couverture de l'ensemble des zones et régions, avec des délais moyens de traitement de 24h à 48h.";
        source = "Base de connaissances : Réseau logistique & Délais d'intervention";
      } else if (text.toLowerCase().includes('rdv') || text.toLowerCase().includes('rendez-vous') || text.toLowerCase().includes('devis') || text.toLowerCase().includes('contact')) {
        replyText = "Je peux transmettre votre demande en priorité à notre équipe administrative. Veuillez nous laisser votre numéro ou valider directement sur WhatsApp.";
        source = "Base de connaissances : Module de Prise de Contact";
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
    <div className="pt-28 pb-20 px-6 sm:px-10 lg:px-16 max-w-[1440px] mx-auto space-y-12">
      {/* Header */}
      <div className="mx-auto max-w-3xl space-y-5 text-center">
        <span className="lux-eyebrow">
          <Sparkles className="h-3.5 w-3.5 text-purple-300" />
          Démo en direct · sans inscription
        </span>
        <h1 className="lux-h1">
          Posez la question comme un client. <br />
          <span className="lux-accent">Voyez la réponse qu’il recevrait.</span>
        </h1>
        <p className="lux-lead mx-auto max-w-2xl">
          Six entreprises types, un seul assistant. Il s’adapte instantanément à votre vocabulaire,
          vos tarifs et vos règles — en français et en darija.
        </p>
        <p className="lux-note text-[0.82rem]">
          Cliquez sur un secteur, puis sur une question d’exemple : la réponse s’affiche avec sa source, comme dans votre espace client.
        </p>
      </div>

      {/* Sector Switcher Tabs */}
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(Object.keys(sectorConfigs) as SectorId[]).map((key) => {
          const cfg = sectorConfigs[key];
          const Icon = cfg.icon;
          const isSelected = activeSector === key;
          return (
            <button
              key={key}
              onClick={() => handleSelectSector(key)}
              aria-pressed={isSelected}
              className={`lux-card flex cursor-pointer flex-col justify-between p-3.5 text-left transition-colors ${
                isSelected
                  ? 'border-purple-400/40 bg-purple-500/[0.09] text-white'
                  : 'hover:border-white/20'
              }`}
            >
              <div className="mb-2.5 flex items-center justify-between">
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${isSelected ? 'bg-purple-600 text-white' : 'bg-white/[0.05] text-neutral-400'}`}>
                  <Icon className="h-4 w-4" />
                </div>
                {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>}
              </div>
              <div className="min-w-0">
                <span className="block truncate text-[0.76rem] font-semibold text-neutral-100">{cfg.badge}</span>
                <span className="mt-0.5 block truncate text-[0.65rem] font-light text-neutral-500">Exemple configuré</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Interactive Chat Playground Card */}
      <div className="lux-card mx-auto max-w-4xl overflow-hidden">
        {/* Chat Top Bar */}
        <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-b from-purple-500 to-purple-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[0.85rem] font-semibold text-neutral-100">{sectorConfigs[activeSector].name}</h3>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"></span>
              </div>
              <p className="lux-sub text-[0.72rem]">{sectorConfigs[activeSector].description}</p>
            </div>
          </div>

          <button
            onClick={() => setMessages(sectorConfigs[activeSector].initialMessages)}
            className="btn btn-sm btn-glass"
            title="Réinitialiser la conversation"
            aria-label="Réinitialiser la conversation"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Messages Stream */}
        <div className="min-h-[380px] max-h-[460px] space-y-4 overflow-y-auto p-4 sm:p-6">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'} space-y-1`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-4 text-[0.82rem] font-light leading-relaxed sm:max-w-[75%] ${
                  m.sender === 'user'
                    ? 'rounded-br-none bg-purple-600 font-normal text-white'
                    : 'rounded-bl-none border border-white/[0.08] bg-white/[0.035] text-neutral-200'
                }`}
              >
                <p>{m.text}</p>
                {m.verifiedSource && (
                  <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/[0.08] pt-2 text-[0.68rem] font-medium text-purple-200">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-purple-300" />
                    <span className="truncate">{m.verifiedSource}</span>
                  </div>
                )}
              </div>
              <span className="px-1 text-[0.62rem] text-neutral-500">{m.timestamp}</span>
            </div>
          ))}

          {isTyping && (
            <div className="flex w-fit animate-pulse items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3 text-[0.75rem] text-neutral-400">
              <Bot className="h-3.5 w-3.5 text-purple-300" />
              <span>L’assistant consulte vos informations…</span>
            </div>
          )}
        </div>

        {/* Suggested Quick Questions */}
        <div className="flex items-center gap-2 overflow-x-auto border-t border-white/[0.07] bg-white/[0.02] px-4 py-3 sm:px-6">
          <span className="flex-shrink-0 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-neutral-500">Essayez</span>
          {sectorConfigs[activeSector].quickQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(q)}
              className="lux-chip shrink-0"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="flex items-center gap-2 border-t border-white/[0.07] bg-white/[0.02] p-4">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Écrivez votre question, en français ou en darija…"
            aria-label="Votre question pour la démo"
            className="lux-input flex-grow"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim()}
            className="btn btn-primary shrink-0 px-4 py-2.5 text-[0.8rem]"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Envoyer</span>
          </button>
        </div>
      </div>

      {/* Universal Banner — moment de décision : on transforme l’essai en action */}
      <div className="lux-card mx-auto flex max-w-4xl flex-col items-center gap-6 p-7 text-center sm:p-9">
        <div className="space-y-3">
          <span className="lux-eyebrow">
            <Layers className="h-3.5 w-3.5 text-purple-300" />
            Votre activité est unique
          </span>
          <h2 className="lux-h3 text-[1.2rem] sm:text-[1.5rem]">
            Ce que vous venez de lire, votre assistant le dira avec vos mots.
          </h2>
          <p className="lux-sub mx-auto max-w-xl text-[0.86rem]">
            Vos tarifs, votre ton, vos conditions. Il ne reste qu’à déposer vos informations —
            et votre assistant répond dès aujourd’hui, même quand vous dormez.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <button onClick={onOpenAssistantModal} className="btn btn-primary">
            <span>Créer mon assistant</span>
            <ArrowRight className="h-4 w-4" />
          </button>
          <button onClick={() => onNavigate('pricing')} className="btn btn-glass">
            <span>Voir les tarifs</span>
          </button>
        </div>
      </div>
    </div>
  );
};

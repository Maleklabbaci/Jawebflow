import React from 'react';
import { ShieldCheck, ArrowLeft, Mail, Lock, Database, Trash2 } from 'lucide-react';
import { PageId } from '../components/Navbar';

interface PrivacyPageProps {
  onNavigate: (page: PageId) => void;
  type?: 'privacy' | 'terms' | 'deletion';
}

export const PrivacyPage: React.FC<PrivacyPageProps> = ({ onNavigate, type = 'privacy' }) => {
  return (
    <div className="min-h-screen pt-28 pb-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
      <button 
        onClick={() => onNavigate('home')}
        className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors mb-8 bg-neutral-900/60 border border-neutral-800 px-4 py-2 rounded-xl backdrop-blur-md"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour à l'accueil
      </button>

      <div className="bg-[#111420]/90 border border-neutral-800/80 rounded-2xl p-6 sm:p-10 shadow-2xl backdrop-blur-xl space-y-8 text-neutral-300">
        
        {/* Header */}
        <div className="border-b border-neutral-800 pb-6 flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              Conformité Meta & RGPD
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {type === 'privacy' && 'Politique de Confidentialité (Privacy Policy)'}
              {type === 'terms' && "Conditions Générales d'Utilisation (Terms of Service)"}
              {type === 'deletion' && 'Suppression des Données (Data Deletion)'}
            </h1>
            <p className="text-xs text-neutral-500 mt-2">Dernière mise à jour : 30 Août 2026 • JawebFlow SaaS AI</p>
          </div>
        </div>

        {/* Content */}
        {type === 'privacy' && (
          <div className="space-y-6 text-sm sm:text-base leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-400" />
                1. Introduction et Périmètre
              </h2>
              <p>
                La plateforme <strong>JawebFlow</strong> (accessible sur nos domaines officiels) est éditée pour fournir des services d'automatisation du support client et de vente par intelligence artificielle sur le web, WhatsApp et Instagram Direct (via l'API Meta Graph). Nous accordons une importance primordiale à la protection des données de nos utilisateurs et de leurs clients.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-400" />
                2. Données collectées via l'API Instagram & Meta
              </h2>
              <p>
                Lorsque vous connectez un compte professionnel Instagram à JawebFlow, notre système accède uniquement aux données nécessaires pour exécuter les réponses automatiques :
              </p>
              <ul className="list-disc pl-5 space-y-2 text-neutral-400">
                <li><strong className="text-neutral-200">Messages entrants :</strong> Le texte des messages directs (DMs) envoyés par les clients pour que l'IA puisse formuler une réponse commerciale adéquate.</li>
                <li><strong className="text-neutral-200">Identifiant d'expéditeur Instagram (Scoped ID) :</strong> Un identifiant anonymisé fourni par Meta pour acheminer la réponse au bon destinataire.</li>
                <li><strong className="text-neutral-200">Nom ou pseudo public :</strong> Utilisé pour personnaliser la salutation dans les réponses de l'IA.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                3. Finalité et Sécurité des Données
              </h2>
              <p>
                Les données sont stockées de façon sécurisée et chiffrée. Elles ne sont <strong>jamais vendues, louées ou transmises à des régies publicitaires tierces</strong>. Elles servent exclusivement à :
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-neutral-400">
                <li>Fournir les réponses automatisées de support et de prise de commande.</li>
                <li>Alimenter l'historique de conversation consultable par le commerçant dans son tableau de bord.</li>
                <li>Adapter le ton et la mémoire contextuelle de l'assistant IA (Darija, Français, Arabe).</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-400" />
                4. Droit à l'oubli et Suppression des Données
              </h2>
              <p>
                Conformément aux exigences de la plateforme Meta Developers, vous pouvez à tout moment dissocier votre compte et demander l'effacement immédiat de toutes les données associées en nous contactant à <span className="text-blue-400 font-medium">marcolabbaci@gmail.com</span>.
              </p>
            </section>
          </div>
        )}

        {type === 'terms' && (
          <div className="space-y-6 text-sm sm:text-base leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">1. Acceptation des Conditions</h2>
              <p>
                L'utilisation des services de JawebFlow implique l'acceptation pleine et entière des présentes conditions d'utilisation ainsi que des politiques développeurs de Meta Platforms Inc.
              </p>
            </section>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">2. Utilisation conforme</h2>
              <p>
                L'utilisateur s'engage à ne pas utiliser les agents IA pour diffuser du contenu illégal, du spam ou des messages non sollicités non conformes aux politiques d'utilisation d'Instagram.
              </p>
            </section>
          </div>
        )}

        {type === 'deletion' && (
          <div className="space-y-6 text-sm sm:text-base leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">Instructions de Suppression des Données</h2>
              <p>
                Pour supprimer l'accès de l'application JawebFlow et purger toutes vos données :
              </p>
              <ol className="list-decimal pl-5 space-y-2 text-neutral-400">
                <li>Ouvrez votre compte Instagram / Facebook &gt; Paramètres &gt; Applications et sites web.</li>
                <li>Recherchez <strong>JawebFlow</strong> et cliquez sur <strong>Supprimer</strong>.</li>
                <li>Pour une suppression immédiate de l'ensemble des historiques de conversation sur nos serveurs, envoyez un email à <span className="text-blue-400">marcolabbaci@gmail.com</span>. Les données seront définitivement effacées sous 48 heures.</li>
              </ol>
            </section>
          </div>
        )}

        {/* Contact Footer Box */}
        <div className="mt-8 pt-6 border-t border-neutral-800/80 bg-neutral-950/40 p-5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-neutral-400">Délégué à la Protection des Données :</p>
              <p className="text-sm font-medium text-white">marcolabbaci@gmail.com</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => onNavigate('contact')}
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Nous Contacter
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

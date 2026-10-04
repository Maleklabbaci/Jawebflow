import React from 'react';
import { ShieldCheck, ArrowLeft, Mail, Lock, Database, Trash2, ArrowRight } from 'lucide-react';
import { PageId } from '../components/Navbar';

interface PrivacyPageProps {
  onNavigate: (page: PageId) => void;
  type?: 'privacy' | 'terms' | 'deletion';
}

export const PrivacyPage: React.FC<PrivacyPageProps> = ({ onNavigate, type = 'privacy' }) => {
  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 pb-20 pt-28 sm:px-6 lg:px-8">
      <button
        onClick={() => onNavigate('home')}
        className="btn btn-sm btn-glass mb-8"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour à l'accueil
      </button>

      <div className="lux-card lux-card-beam space-y-8 p-6 text-neutral-300 sm:p-10">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-6">
          <div>
            <span className="lux-eyebrow mb-4">
              <ShieldCheck className="h-3.5 w-3.5 text-purple-300" />
              Conformité Meta & RGPD
            </span>
            <h1 className="lux-h3 mt-4 text-[1.4rem] sm:text-[1.8rem] leading-tight">
              {type === 'privacy' && 'Politique de Confidentialité (Privacy Policy)'}
              {type === 'terms' && "Conditions Générales d'Utilisation (Terms of Service)"}
              {type === 'deletion' && 'Suppression des Données (Data Deletion)'}
            </h1>
            <p className="lux-note mt-2 text-[0.76rem]">Dernière mise à jour : 30 août 2026 · JawebFlow</p>
          </div>
        </div>

        {/* Content */}
        {type === 'privacy' && (
          <div className="space-y-7 text-[0.88rem] font-light leading-relaxed sm:text-[0.92rem]">
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-[1rem] font-semibold text-white">
                <Lock className="h-4 w-4 text-purple-300" />
                1. Introduction et Périmètre
              </h2>
              <p>
                La plateforme <strong>JawebFlow</strong> (accessible sur nos domaines officiels) est éditée pour fournir des services d'automatisation du support client et de vente par intelligence artificielle sur le web, WhatsApp et Instagram Direct (via l'API Meta Graph). Nous accordons une importance primordiale à la protection des données de nos utilisateurs et de leurs clients.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-[1rem] font-semibold text-white">
                <Database className="h-4 w-4 text-purple-300" />
                2. Données collectées via l'API Instagram & Meta
              </h2>
              <p>
                Lorsque vous connectez un compte professionnel Instagram à JawebFlow, notre système accède uniquement aux données nécessaires pour exécuter les réponses automatiques :
              </p>
              <ul className="list-disc space-y-2 pl-5 text-neutral-400">
                <li><strong className="text-neutral-200">Messages entrants :</strong> Le texte des messages directs (DMs) envoyés par les clients pour que l'IA puisse formuler une réponse commerciale adéquate.</li>
                <li><strong className="text-neutral-200">Identifiant d'expéditeur Instagram (Scoped ID) :</strong> Un identifiant anonymisé fourni par Meta pour acheminer la réponse au bon destinataire.</li>
                <li><strong className="text-neutral-200">Nom ou pseudo public :</strong> Utilisé pour personnaliser la salutation dans les réponses de l'IA.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-[1rem] font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-purple-300" />
                3. Finalité et Sécurité des Données
              </h2>
              <p>
                Les données sont stockées de façon sécurisée et chiffrée. Elles ne sont <strong>jamais vendues, louées ou transmises à des régies publicitaires tierces</strong>. Elles servent exclusivement à :
              </p>
              <ul className="list-disc space-y-1.5 pl-5 text-neutral-400">
                <li>Fournir les réponses automatisées de support et de prise de commande.</li>
                <li>Alimenter l'historique de conversation consultable par le commerçant dans son tableau de bord.</li>
                <li>Adapter le ton et la mémoire contextuelle de l'assistant IA (Darija, Français, Arabe).</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-[1rem] font-semibold text-white">
                <Trash2 className="h-4 w-4 text-rose-300" />
                4. Droit à l'oubli et Suppression des Données
              </h2>
              <p>
                Conformément aux exigences de la plateforme Meta Developers, vous pouvez à tout moment dissocier votre compte et demander l'effacement immédiat de toutes les données associées en nous contactant à <span className="font-medium text-purple-200">contact@jawebflow.dz</span>.
              </p>
            </section>
          </div>
        )}

        {type === 'terms' && (
          <div className="space-y-7 text-[0.88rem] font-light leading-relaxed sm:text-[0.92rem]">
            <section className="space-y-3">
              <h2 className="text-[1rem] font-semibold text-white">1. Acceptation des conditions</h2>
              <p>
                L'utilisation des services de JawebFlow implique l'acceptation pleine et entière des présentes conditions d'utilisation ainsi que des politiques développeurs de Meta Platforms Inc.
              </p>
            </section>
            <section className="space-y-3">
              <h2 className="text-[1rem] font-semibold text-white">2. Utilisation conforme</h2>
              <p>
                L'utilisateur s'engage à ne pas utiliser les agents IA pour diffuser du contenu illégal, du spam ou des messages non sollicités non conformes aux politiques d'utilisation d'Instagram.
              </p>
            </section>
          </div>
        )}

        {type === 'deletion' && (
          <div className="space-y-7 text-[0.88rem] font-light leading-relaxed sm:text-[0.92rem]">
            <section className="space-y-3">
              <h2 className="text-[1rem] font-semibold text-white">Instructions de suppression des données</h2>
              <p>
                Pour supprimer l'accès de l'application JawebFlow et purger toutes vos données :
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-neutral-400">
                <li>Ouvrez votre compte Instagram / Facebook &gt; Paramètres &gt; Applications et sites web.</li>
                <li>Recherchez <strong>JawebFlow</strong> et cliquez sur <strong>Supprimer</strong>.</li>
                <li>Pour une suppression immédiate de l'ensemble des historiques de conversation sur nos serveurs, envoyez un email à <span className="font-medium text-purple-200">contact@jawebflow.dz</span>. Les données seront définitivement effacées sous 48 heures.</li>
              </ol>
            </section>
          </div>
        )}

        {/* Contact Footer Box */}
        <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/12 text-purple-200">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[0.7rem] font-light uppercase tracking-[0.12em] text-neutral-500">Protection des données</p>
              <p className="text-[0.86rem] font-medium text-white">contact@jawebflow.dz</p>
            </div>
          </div>
          <button onClick={() => onNavigate('contact')} className="btn btn-sm btn-primary">
            <span>Nous contacter</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
};

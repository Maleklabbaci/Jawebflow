import React from 'react';
import {
  ShieldCheck,
  ArrowLeft,
  Mail,
  Lock,
  Database,
  Trash2,
  ArrowRight,
  Bot,
  Phone,
  FileText,
  Server,
  Clock,
  Cookie,
  Scale,
  RefreshCw,
  CheckCircle2,
  MessageSquare,
  Users,
} from 'lucide-react';
import { PageId } from '../components/Navbar';

interface PrivacyPageProps {
  onNavigate: (page: PageId) => void;
  type?: 'privacy' | 'terms' | 'deletion';
}

/** 🗓️ Toute modification de ce document doit faire bouger cette date. */
const VERSION = {
  numero: '3.0',
  date: '15 octobre 2026',
  contact: 'contact@jawebflow.dz',
};

const TITRES: Record<NonNullable<PrivacyPageProps['type']>, string> = {
  privacy: 'Politique de Confidentialité',
  terms: "Conditions Générales d'Utilisation",
  deletion: 'Suppression des Données',
};

const SOUS_TITRES: Record<NonNullable<PrivacyPageProps['type']>, string> = {
  privacy:
    'Quelles données nous traitons, pourquoi, combien de temps, qui les voit — et comment tout faire supprimer. Écrit pour être lu, pas pour être caché.',
  terms:
    'Les règles simples du service : ce que vous payez, comment les conversations sont comptées, ce que vous nous devez et ce que nous vous devons.',
  deletion:
    'Comment retirer notre accès et faire effacer vos données, étape par étape, sans passer par le support.',
};

/** 📚 Le sommaire : on clique, ça descend. */
const SOMMAIRE: Record<NonNullable<PrivacyPageProps['type']>, Array<{ id: string; label: string }>> = {
  privacy: [
    { id: 'qui', label: '1. Qui nous sommes' },
    { id: 'essentiel', label: '2. L’essentiel en 30 secondes' },
    { id: 'conversations', label: '3. Ce qu’est une « conversation »' },
    { id: 'donnees', label: '4. Les données que nous traitons' },
    { id: 'finalites', label: '5. Pourquoi et sur quelle base légale' },
    { id: 'jamais', label: '6. Ce que nous ne faisons jamais' },
    { id: 'qui-voit', label: '7. Qui peut voir vos données' },
    { id: 'sous-traitants', label: '8. Nos partenaires techniques' },
    { id: 'ia', label: '9. Intelligence artificielle' },
    { id: 'widget', label: '10. Le widget sur votre site' },
    { id: 'conservation', label: '11. Combien de temps nous gardons' },
    { id: 'securite', label: '12. Sécurité' },
    { id: 'cookies', label: '13. Cookies et stockage local' },
    { id: 'droits', label: '14. Vos droits' },
    { id: 'suppression', label: '15. Tout supprimer' },
    { id: 'transferts', label: '16. Données hors d’Algérie' },
    { id: 'mineurs', label: '17. Mineurs' },
    { id: 'modifications', label: '18. Modifications' },
    { id: 'reclamations', label: '19. Réclamations' },
  ],
  terms: [
    { id: 'objet', label: '1. Objet du service' },
    { id: 'compte', label: '2. Votre compte' },
    { id: 'assistant', label: '3. L’assistant et sa base de connaissance' },
    { id: 'comptage', label: '4. Forfaits et comptage des conversations' },
    { id: 'paiement', label: '5. Prix, paiement et annulation' },
    { id: 'loyaute', label: '6. Usage loyal' },
    { id: 'canaux', label: '7. Canaux et réseaux sociaux' },
    { id: 'disponibilite', label: '8. Disponibilité et support' },
    { id: 'responsabilite', label: '9. Responsabilité' },
    { id: 'fin', label: '10. Fin du service' },
    { id: 'droit', label: '11. Droit applicable' },
  ],
  deletion: [
    { id: 'etapes', label: '1. Supprimer notre accès' },
    { id: 'efface', label: '2. Ce que nous effaçons' },
    { id: 'garde', label: '3. Ce que nous devons garder' },
    { id: 'delai', label: '4. Délais et confirmation' },
  ],
};

const Section: React.FC<{
  id: string;
  titre: string;
  icone?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, titre, icone, children }) => (
  <section id={id} className="scroll-mt-28 space-y-3">
    <h2 className="flex items-center gap-2 text-[1.02rem] font-semibold text-white">
      {icone}
      {titre}
    </h2>
    <div className="space-y-3 text-neutral-300">{children}</div>
  </section>
);

const Tableau: React.FC<{ entetes: string[]; lignes: React.ReactNode[][] }> = ({ entetes, lignes }) => (
  <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
    <table className="w-full min-w-[520px] border-collapse text-left text-[0.8rem]">
      <thead>
        <tr className="bg-white/[0.03] text-[0.7rem] uppercase tracking-[0.1em] text-neutral-400">
          {entetes.map((e) => (
            <th key={e} className="px-4 py-3 font-medium">
              {e}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lignes.map((ligne, i) => (
          <tr key={i} className="border-t border-white/[0.06] align-top">
            {ligne.map((cellule, j) => (
              <td key={j} className="px-4 py-3 text-neutral-300">
                {cellule}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Puce: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex gap-2.5">
    <CheckCircle2 className="mt-[3px] h-3.5 w-3.5 shrink-0 text-emerald-300/80" />
    <span>{children}</span>
  </li>
);

/** 🧾 Le tableau qui explique à tout le monde ce qu'est une « conversation ». */
const COMPTAGE = [
  ['1 message du client + la réponse de l’assistant', '1 conversation', 'La réponse est INCLUSE : vous ne payez jamais deux fois le même échange.'],
  ['« Salam », « merci », « bonjour »', '0 conversation', 'Les messages de politesse sont offerts.'],
  ['Client qui envoie une photo', '4 conversations', 'Une photo demande 4 analyses (vision, produits, prix, réponse).'],
  ['Recherche d’un produit sur votre site', '+2 conversations', 'La recherche dans votre catalogue déclenche des appels supplémentaires.'],
  ['1 minute d’appel vocal', '10 conversations', 'L’appel utilise le même compteur que l’écrit.'],
  ['Appel de 15 minutes (le maximum)', '150 conversations', 'Aucun appel ne dépasse 15 minutes : c’est votre protection.'],
];

const ForfaitsTable: React.FC = () => (
  <Tableau
    entetes={['Formule', 'Conversations / mois', 'En messages', 'En appels']}
    lignes={[
      ['Basic — 2 700 DA (10 $)', '500', 'jusqu’à 1 000 messages', 'jusqu’à 50 minutes'],
      ['Pro — 5 400 DA (20 $)', '1 500', 'jusqu’à 3 000 messages', 'jusqu’à 150 minutes'],
      ['Entreprise — sur devis', 'négocié', 'négocié', 'négocié'],
    ]}
  />
);

export const PrivacyPage: React.FC<PrivacyPageProps> = ({ onNavigate, type = 'privacy' }) => {
  const sommaire = SOMMAIRE[type];

  const allerA = (id: string) => {
    const cible = document.getElementById(id);
    if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 pb-20 pt-28 sm:px-6 lg:px-8">
      <button onClick={() => onNavigate('home')} className="btn btn-sm btn-glass mb-8">
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour à l'accueil
      </button>

      <div className="lux-card lux-card-beam space-y-8 p-6 text-neutral-300 sm:p-10">
        {/* ── En-tête ─────────────────────────────────────────────── */}
        <header className="space-y-5 border-b border-white/[0.07] pb-7">
          <span className="lux-eyebrow">
            <ShieldCheck className="h-3.5 w-3.5 text-purple-300" />
            Conformité Meta · RGPD · Loi algérienne 18-07
          </span>
          <h1 className="lux-h3 mt-4 text-[1.45rem] leading-tight sm:text-[1.9rem]">{TITRES[type]}</h1>
          <p className="lux-sub max-w-3xl text-[0.86rem]">{SOUS_TITRES[type]}</p>
          <p className="lux-note text-[0.74rem]">
            Version {VERSION.numero} · En vigueur depuis le {VERSION.date} · JawebFlow — Algérie ·
            Contact protection des données : <span className="text-purple-200">{VERSION.contact}</span>
          </p>
        </header>

        {/* ── L'essentiel ─────────────────────────────────────────── */}
        {type === 'privacy' && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icone: <Database className="h-4 w-4" />, titre: 'Ce que nous gardons', texte: 'Vos conversations, votre base de connaissance, votre compte.' },
              { icone: <Lock className="h-4 w-4" />, titre: 'Nous ne vendons rien', texte: 'Aucune donnée revendue, jamais, à personne.' },
              { icone: <Users className="h-4 w-4" />, titre: 'Chaque compte est isolé', texte: 'Vous ne voyez que vos données, et nous non plus par défaut.' },
              { icone: <Trash2 className="h-4 w-4" />, titre: 'Suppression en 48 h', texte: 'Un email suffit : tout est effacé sous 48 heures.' },
            ].map((carte) => (
              <div key={carte.titre} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/12 text-purple-200">
                  {carte.icone}
                </div>
                <p className="text-[0.8rem] font-semibold text-white">{carte.titre}</p>
                <p className="mt-1 text-[0.74rem] text-neutral-400">{carte.texte}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Comment compter : la règle, partout ─────────────────── */}
        <div className="rounded-2xl border border-purple-400/20 bg-purple-500/[0.07] p-5">
          <p className="flex items-center gap-2 text-[0.86rem] font-semibold text-white">
            <MessageSquare className="h-4 w-4 text-purple-200" />
            1 conversation = 1 message du client + sa réponse
          </p>
          <p className="mt-2 text-[0.8rem] text-neutral-300">
            C’est la définition qui sert partout chez JawebFlow : sur la page des tarifs, dans le
            tableau de bord, dans la facture et dans cette page. Un échange écrit compte donc pour
            <strong className="text-white"> une seule conversation</strong>, pas deux — la réponse de
            l’assistant est incluse. Un appel vocal consomme le même compteur, au rythme de
            <strong className="text-white"> 10 conversations par minute</strong>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => onNavigate('pricing')} className="btn btn-sm btn-glass">
              Voir les forfaits
            </button>
            {type !== 'privacy' && (
              <button onClick={() => onNavigate('privacy')} className="btn btn-sm btn-glass">
                Lire la politique de confidentialité
              </button>
            )}
          </div>
        </div>

        {/* ── Sommaire ────────────────────────────────────────────── */}
        <nav className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <p className="mb-3 text-[0.72rem] font-light uppercase tracking-[0.14em] text-neutral-500">
            Sommaire
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {sommaire.map((entree) => (
              <button
                key={entree.id}
                onClick={() => allerA(entree.id)}
                className="rounded-lg px-2.5 py-1.5 text-left text-[0.78rem] text-neutral-300 transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                {entree.label}
              </button>
            ))}
          </div>
        </nav>

        {/* ══════════════════ POLITIQUE DE CONFIDENTIALITÉ ══════════ */}
        {type === 'privacy' && (
          <div className="space-y-8 text-[0.88rem] font-light leading-relaxed sm:text-[0.92rem]">
            <Section id="qui" titre="1. Qui nous sommes" icone={<ShieldCheck className="h-4 w-4 text-purple-300" />}>
              <p>
                JawebFlow est un service algérien qui installe un assistant commercial intelligent
                (chat sur le site, réponses sur les réseaux, appels vocaux) pour les commerces, les
                boutiques en ligne et les cabinets. Nous traitons deux types de personnes :
              </p>
              <ul className="space-y-2 pl-1">
                <Puce><strong className="text-neutral-100">Vous, le marchand</strong> — le titulaire du compte, qui configure son assistant et son abonnement.</Puce>
                <Puce><strong className="text-neutral-100">Vos clients</strong> — les visiteurs et clients qui discutent avec l’assistant sur votre site ou sur vos réseaux.</Puce>
              </ul>
              <p>
                Toute question, demande d’accès ou plainte passe par <span className="font-medium text-purple-200">{VERSION.contact}</span>,
                avec une réponse sous 30 jours au maximum (souvent en moins de 48 heures).
              </p>
            </Section>

            <Section id="essentiel" titre="2. L’essentiel en 30 secondes" icone={<CheckCircle2 className="h-4 w-4 text-emerald-300" />}>
              <ul className="space-y-2 pl-1">
                <Puce>Nous utilisons vos données pour <strong className="text-neutral-100">faire fonctionner votre assistant</strong>, rien d’autre.</Puce>
                <Puce>Nous ne vendons, ne louons et ne partageons <strong className="text-neutral-100">jamais</strong> vos données avec des annonceurs.</Puce>
                <Puce>Chaque compte est isolé techniquement : un marchand ne peut pas voir les données d’un autre.</Puce>
                <Puce>Vous pouvez faire effacer vos données <strong className="text-neutral-100">à tout moment, sous 48 heures</strong>, sans justification.</Puce>
                <Puce>Le comptage est public : <strong className="text-neutral-100">1 conversation = 1 message du client + sa réponse</strong>.</Puce>
              </ul>
            </Section>

            <Section id="conversations" titre="3. Ce qu’est une « conversation »" icone={<MessageSquare className="h-4 w-4 text-purple-300" />}>
              <p>
                « 1 conversation = 1 message du client + sa réponse » : quand un client écrit, il
                consomme <strong className="text-white">une conversation</strong> ; la réponse de
                l’assistant est comprise dans la même conversation. Deux messages, une seule unité
                décomptée.
              </p>
              <Tableau entetes={['Ce que fait le client', 'Ce que ça compte', 'Pourquoi']} lignes={COMPTAGE} />
              <p className="text-[0.82rem] text-neutral-400">
                Votre forfait du mois additionne tout : écrit <em>et</em> appels. Une fois les
                conversations du mois utilisées, les réponses s’arrêtent jusqu’au mois suivant — vous
                ne recevez donc jamais de facture surprise liée à un dépassement.
              </p>
              <ForfaitsTable />
            </Section>

            <Section id="donnees" titre="4. Les données que nous traitons" icone={<Database className="h-4 w-4 text-purple-300" />}>
              <Tableau
                entetes={['Catégorie', 'Exemples', 'Pourquoi']}
                lignes={[
                  ['Compte du marchand', 'Nom, email, mot de passe (chiffré), téléphone, entreprise, NIF/NIS/RC si vous demandez une facture', 'Créer le compte, facturer, vous contacter'],
                  ['Base de connaissance', 'Horaires, adresse, prix, produits, livraison, FAQ, pages de votre site', 'C’est la seule chose que votre assistant est autorisé à savoir'],
                  ['Conversations', 'Texte des messages, réponses de l’assistant, résumé, date, canal (site, Instagram, Messenger, WhatsApp, Telegram, TikTok)', 'Répondre, vous montrer l’historique, compter le forfait'],
                  ['Appels vocaux', 'Durée, nombre de minutes, transcription si activée', 'Compter le forfait, vous montrer l’activité'],
                  ['Prospects', 'Nom, téléphone ou email quand un client les laisse', 'Vous permettre de le rappeler — c’est votre client'],
                  ['Technique', 'Adresse IP (uniquement pour limiter les abus), type d’appareil, journaux d’erreurs', 'Sécurité, anti-spam, correction des pannes'],
                ]}
              />
              <p>
                Nous <strong className="text-neutral-100">ne demandons jamais</strong> de données de
                santé, d’opinions politiques, de religion, d’origine ou de données bancaires
                complètes. Le paiement se fait chez notre prestataire : nous ne voyons que le
                résultat (payé ou non) et la référence de la transaction.
              </p>
            </Section>

            <Section id="finalites" titre="5. Pourquoi et sur quelle base légale" icone={<Scale className="h-4 w-4 text-purple-300" />}>
              <Tableau
                entetes={['Finalité', 'Base légale']}
                lignes={[
                  ['Fournir le service (répondre à vos clients, compter le forfait, vous facturer)', 'Exécution du contrat'],
                  ['Sécurité, anti-fraude, anti-spam, journaux techniques', 'Intérêt légitime'],
                  ['Vous envoyer les messages liés au service (panne, quota, échéance)', 'Exécution du contrat'],
                  ['Vous envoyer des informations commerciales', 'Consentement — désinscription en un clic'],
                  ['Conservation des factures', 'Obligation légale (comptabilité algérienne)'],
                ]}
              />
            </Section>

            <Section id="jamais" titre="6. Ce que nous ne faisons jamais" icone={<Lock className="h-4 w-4 text-rose-300" />}>
              <ul className="space-y-2 pl-1">
                <Puce>Vendre, louer ou « monnayer » vos conversations ou votre liste de clients.</Puce>
                <Puce>Utiliser vos conversations pour entraîner les modèles d’IA grand public.</Puce>
                <Puce>Laisser un marchand lire les conversations d’un autre marchand.</Puce>
                <Puce>Envoyer des messages publicitaires à vos clients à votre place.</Puce>
                <Puce>Vous faire payer un dépassement : au-delà du forfait, l’assistant s’arrête simplement.</Puce>
              </ul>
            </Section>

            <Section id="qui-voit" titre="7. Qui peut voir vos données" icone={<Users className="h-4 w-4 text-purple-300" />}>
              <ul className="space-y-2 pl-1">
                <Puce><strong className="text-neutral-100">Vous</strong> — tout ce qui concerne votre compte, dans votre tableau de bord.</Puce>
                <Puce><strong className="text-neutral-100">Notre support technique</strong> — uniquement si vous nous demandez de l’aide, et il vous le dit à chaque fois.</Puce>
                <Puce><strong className="text-neutral-100">Personne d’autre</strong> — les accès sont cloisonnés au niveau de la base de données (chaque ligne appartient à un compte), pas seulement dans l’interface.</Puce>
              </ul>
            </Section>

            <Section id="sous-traitants" titre="8. Nos partenaires techniques" icone={<Server className="h-4 w-4 text-purple-300" />}>
              <p>
                Nous nous appuyons sur des prestataires solides — ce sont eux qui rendent le service
                possible. Chacun ne reçoit que le strict nécessaire :
              </p>
              <Tableau
                entetes={['Prestataire', 'Rôle', 'Ce qu’il voit']}
                lignes={[
                  ['Cloudflare', 'Hébergement du site et des réponses automatiques', 'Trafic technique, requêtes'],
                  ['Supabase', 'Base de données et connexion au compte', 'Vos données, chiffrées au repos'],
                  ['Google (Gemini API)', 'Le modèle d’IA qui rédige les réponses et parle au téléphone', 'Le message du client + la base de connaissance (selon les conditions de l’API payante, non utilisés pour entraîner les modèles grand public)'],
                  ['slick-pay', 'Paiement de l’abonnement', 'Vos coordonnées de facturation et de paiement'],
                  ['Meta (Instagram, Messenger, WhatsApp), Telegram, TikTok', 'Acheminement des messages sur vos réseaux', 'Les messages concernés, selon leurs propres politiques'],
                ]}
              />
              <p className="text-[0.82rem] text-neutral-400">
                Cette liste est stable : si un prestataire s’y ajoute, cette page est mise à jour
                <em> avant</em> le changement.
              </p>
            </Section>

            <Section id="ia" titre="9. Intelligence artificielle : où vont les messages" icone={<Bot className="h-4 w-4 text-purple-300" />}>
              <p>
                Pour rédiger une réponse, le message du client et les informations de votre base de
                connaissance sont envoyés à l’API Gemini de Google. Rien d’autre ne part : ni votre
                email, ni vos factures, ni les données d’autres marchands.
              </p>
              <p>
                Nous n’utilisons pas vos conversations pour entraîner des modèles. Votre assistant
                n’apprend que par <strong className="text-neutral-100">vous</strong> : quand une
                question reste sans réponse, elle apparaît dans « Apprentissage » et c’est votre
                réponse qui enrichit la base — jamais une supposition de l’IA.
              </p>
              <p>
                <strong className="text-neutral-100">Au téléphone, la règle est encore plus stricte.</strong>{' '}
                L’agent vocal reçoit un prompt minuscule : quelques consignes de conversation et
                <em> votre base de connaissance</em>, rien de plus. Il n’a ni culture générale, ni accès
                à Internet, et il n’invente jamais : si l’information n’est pas dans vos fiches, il
                répond qu’il ne sait pas et propose de prendre le numéro du client. Tant que votre base
                est vide, il ne sait rien — et il le dit honnêtement à chaque question.
              </p>
              <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 text-[0.82rem] text-neutral-400">
                Important : le modèle peut se tromper. L’assistant est conçu pour répondre
                <strong className="text-neutral-200"> uniquement à partir de votre base de connaissance</strong> et
                pour dire qu’il ne sait pas quand l’information n’y est pas. Vous restez la source de
                vérité de vos prix, stocks et engagements.
              </p>
            </Section>

            <Section id="widget" titre="10. Le widget sur votre site" icone={<Phone className="h-4 w-4 text-purple-300" />}>
              <p>
                Quand vous installez le widget, vous restez responsable des données de vos visiteurs ;
                JawebFlow agit pour votre compte (sous-traitant). Concrètement :
              </p>
              <ul className="space-y-2 pl-1">
                <Puce>Le widget crée un identifiant de session aléatoire pour suivre une conversation en cours. Il n’identifie pas la personne.</Puce>
                <Puce>Le widget n’écrit aucun cookie publicitaire et ne dépose aucun traceur pour des tiers.</Puce>
                <Puce>L’adresse IP n’est utilisée que quelques minutes, pour empêcher les abus (spam d’appels, messages en boucle).</Puce>
                <Puce>Ce que les visiteurs écrivent reste dans votre historique et dans le compteur du forfait ; la suppression est décrite à la section 15.</Puce>
              </ul>
            </Section>

            <Section id="conservation" titre="11. Combien de temps nous gardons" icone={<Clock className="h-4 w-4 text-purple-300" />}>
              <Tableau
                entetes={['Donnée', 'Durée', 'Pourquoi']}
                lignes={[
                  ['Conversations et appels', '12 mois, puis effacés', 'Vous permettre de suivre votre activité sur l’année'],
                  ['Prospects (clients intéressés)', 'Tant que vous les gardez dans votre tableau de bord', 'C’est votre fichier client'],
                  ['Base de connaissance', 'Tant que votre compte est actif', 'Elle fait fonctionner l’assistant'],
                  ['Compte et abonnement', 'Durée de l’abonnement + 12 mois', 'Réactivation facile, preuve du contrat'],
                  ['Factures et paiements', '10 ans', 'Obligation comptable'],
                  ['Journaux techniques', '30 jours', 'Sécurité et dépannage'],
                ]}
              />
            </Section>

            <Section id="securite" titre="12. Sécurité" icone={<Lock className="h-4 w-4 text-emerald-300" />}>
              <ul className="space-y-2 pl-1">
                <Puce>Tout circule en HTTPS/TLS : vos visiteurs, votre tableau de bord et nos serveurs.</Puce>
                <Puce>Les mots de passe sont chiffrés par notre fournisseur d’authentification : personne ne peut les lire, pas même nous.</Puce>
                <Puce>Les clés d’accès aux modèles d’IA restent sur nos serveurs : elles ne sont jamais envoyées au navigateur du visiteur.</Puce>
                <Puce>Chaque ligne de la base est rattachée à un compte : une erreur d’interface ne peut pas exposer les données d’un autre marchand.</Puce>
                <Puce>Les appels vocaux sont limités (durée, nombre d’appels par adresse) pour éviter toute utilisation abusive à vos frais.</Puce>
              </ul>
              <p className="text-[0.82rem] text-neutral-400">
                En cas d’incident de sécurité touchant vos données, nous vous informons sans délai et
                nous publions ce que nous avons corrigé.
              </p>
            </Section>

            <Section id="cookies" titre="13. Cookies et stockage local" icone={<Cookie className="h-4 w-4 text-purple-300" />}>
              <Tableau
                entetes={['Élément', 'Type', 'Utilité']}
                lignes={[
                  ['Jeton de session', 'Cookie strictement nécessaire', 'Vous garder connecté à votre tableau de bord'],
                  ['Langue d’affichage', 'Stockage local du navigateur', 'Se souvenir de votre langue'],
                  ['Identifiant de conversation du widget', 'Stockage local', 'Suivre la conversation en cours sur votre site'],
                  ['Mesure d’audience de notre site', 'Interne, sans revente', 'Savoir quelles pages sont utiles — aucune donnée revendue'],
                ]}
              />
              <p>
                Pas de cookies publicitaires, pas de pistage entre sites, pas de revente de profils :
                nous n’avons rien à monétiser chez nos visiteurs.
              </p>
            </Section>

            <Section id="droits" titre="14. Vos droits" icone={<Scale className="h-4 w-4 text-purple-300" />}>
              <p>
                Conformément à la loi algérienne 18-07 relative à la protection des personnes
                physiques dans le traitement des données à caractère personnel, et au RGPD pour les
                personnes situées dans l’Union européenne, vous disposez des droits suivants :
              </p>
              <Tableau
                entetes={['Droit', 'Ce que ça veut dire chez nous']}
                lignes={[
                  ['Accès', 'Obtenir une copie de tout ce que nous avons sur vous et vos conversations'],
                  ['Rectification', 'Corriger une information fausse'],
                  ['Effacement', 'Faire supprimer vos données — sous 48 heures, sans justification'],
                  ['Opposition', 'Refuser un traitement (nous arrêtons alors le service concerné)'],
                  ['Portabilité', 'Recevoir vos données dans un fichier lisible (CSV/JSON)'],
                  ['Limitation', 'Nous demander de geler le traitement pendant un désaccord'],
                  ['Retrait du consentement', 'Vous désinscrire d’un message commercial en un clic'],
                ]}
              />
              <p>
                Pour exercer un droit : un email à <span className="font-medium text-purple-200">{VERSION.contact}</span> depuis
                l’adresse du compte suffit. Réponse sous 30 jours maximum, gratuitement.
              </p>
            </Section>

            <Section id="suppression" titre="15. Tout supprimer" icone={<Trash2 className="h-4 w-4 text-rose-300" />}>
              <p>
                Vous pouvez partir en trois minutes. Voici exactement ce qui se passe, sur chaque
                canal, et ce qu’il faut nous demander :
              </p>
              <Tableau
                entetes={['Ce que vous voulez supprimer', 'Comment']}
                lignes={[
                  ['Toute votre compte et son historique', `Un email à ${VERSION.contact} : effacement complet sous 48 heures, confirmation envoyée`],
                  ['L’accès de JawebFlow à votre Instagram / Messenger / WhatsApp', 'Paramètres du compte → « Applications et sites web » → JawebFlow → Supprimer'],
                  ['L’accès de JawebFlow à votre Telegram', '@BotFather → supprimer le bot, puis nous prévenir'],
                  ['L’accès de JawebFlow à votre TikTok', 'TikTok → Paramètres → Sécurité et autorisations → gérer les apps autorisées'],
                  ['Seulement l’historique des conversations', 'Tableau de bord → Conversations, ou une demande par email'],
                  ['Un client en particulier (droit à l’oubli)', `Un email à ${VERSION.contact} avec le nom ou le téléphone : sa conversation est effacée`],
                ]}
              />
              <p className="text-[0.82rem] text-neutral-400">
                Il n’existe pas de « suppression profonde » cachée : après effacement, il ne reste
                rien à retrouver dans nos bases, à part les factures que la loi nous oblige à
                conserver (section 11).
              </p>
            </Section>

            <Section id="transferts" titre="16. Données hors d’Algérie" icone={<Server className="h-4 w-4 text-purple-300" />}>
              <p>
                Nos serveurs d’hébergement et nos modèles d’IA sont opérés depuis l’Union européenne
                et les États-Unis. Cela signifie que vos données peuvent être traitées hors
                d’Algérie. Nous choisissons des prestataires qui offrent des garanties contractuelles
                de protection (clauses de protection des données, chiffrement) et nous vous en
                informons ici, en toute transparence, avant la souscription.
              </p>
            </Section>

            <Section id="mineurs" titre="17. Mineurs" icone={<Users className="h-4 w-4 text-purple-300" />}>
              <p>
                JawebFlow est un outil professionnel destiné aux entreprises : il n’est pas conçu
                pour les personnes de moins de 16 ans, et nous ne créons pas de comptes pour elles.
                Si un compte nous est signalé comme appartenant à un mineur, il est fermé et les
                données effacées.
              </p>
            </Section>

            <Section id="modifications" titre="18. Modifications de cette politique" icone={<RefreshCw className="h-4 w-4 text-purple-300" />}>
              <p>
                La version publiée ici est la seule en vigueur. En cas de changement important
                (nouveau prestataire, nouvelle finalité), vous recevez un email sur l’adresse de
                votre compte avant l’entrée en vigueur, et un bandeau vous prévient dans le tableau
                de bord.
              </p>
              <Tableau
                entetes={['Version', 'Date', 'Ce qui a changé']}
                lignes={[
                  ['3.0', VERSION.date, 'Ajout du comptage « 1 conversation = 1 message + sa réponse », du détail des appels vocaux et de la liste des partenaires techniques'],
                  ['2.0', '30 août 2026', 'Mise en conformité Meta (Instagram, Messenger, WhatsApp) et droit à l’oubli'],
                  ['1.0', 'Juin 2026', 'Première publication'],
                ]}
              />
            </Section>

            <Section id="reclamations" titre="19. Réclamations" icone={<FileText className="h-4 w-4 text-purple-300" />}>
              <p>
                Une question, un doute, un désaccord ? Écrivez-nous d’abord : <span className="font-medium text-purple-200">{VERSION.contact}</span> —
                nous répondons en moins de 48 heures et nous corrigeons si nous avons tort. Si la
                réponse ne vous satisfait pas, vous pouvez saisir :
              </p>
              <ul className="space-y-2 pl-1">
                <Puce>En Algérie : l’Autorité Nationale de la Protection des Données à caractère Personnel (ANPDP).</Puce>
                <Puce>Dans l’Union européenne : l’autorité de protection des données de votre pays de résidence.</Puce>
              </ul>
            </Section>
          </div>
        )}

        {/* ══════════════════ CONDITIONS GÉNÉRALES ══════════════════ */}
        {type === 'terms' && (
          <div className="space-y-8 text-[0.88rem] font-light leading-relaxed sm:text-[0.92rem]">
            <Section id="objet" titre="1. Objet du service" icone={<FileText className="h-4 w-4 text-purple-300" />}>
              <p>
                JawebFlow met à votre disposition un assistant commercial intelligent : il répond aux
                messages de vos clients sur votre site (widget) et sur vos réseaux, il peut les
                appeler, et il vous montre ce qui s’est passé dans votre tableau de bord. Vous restez
                une entreprise indépendante : votre assistant parle en votre nom, pas au nom de
                JawebFlow.
              </p>
            </Section>

            <Section id="compte" titre="2. Votre compte" icone={<Users className="h-4 w-4 text-purple-300" />}>
              <ul className="space-y-2 pl-1">
                <Puce>Un compte par entreprise. Vous êtes responsable de son accès et de la confidentialité de votre mot de passe.</Puce>
                <Puce>Les informations que vous nous donnez (NIF, NIS, RC, adresse) doivent être exactes : elles servent à votre facturation.</Puce>
                <Puce>Vous pouvez fermer votre compte à tout moment depuis le tableau de bord ou par email — sans frais et sans justification.</Puce>
              </ul>
            </Section>

            <Section id="assistant" titre="3. L’assistant et sa base de connaissance" icone={<Bot className="h-4 w-4 text-purple-300" />}>
              <p>
                Votre assistant travaille à partir de <strong className="text-neutral-100">votre base de connaissance</strong> :
                horaires, coordonnées, tarifs, produits, livraison, FAQ, pages de votre site, et les
                réponses que vous validez dans « Apprentissage ».
              </p>
              <p>
                <strong className="text-neutral-100">L’agent vocal est strict</strong> : son prompt est
                minuscule et ne contient que ces quelques consignes + votre base. Il n’a aucune culture
                générale et aucune recherche sur Internet. Si l’information n’est pas dans vos fiches, il
                dit qu’il ne sait pas et propose de prendre le numéro du client — il n’invente jamais un
                prix, un stock ou un délai. Tant que votre base est vide, il ne sait rien : il le dit
                honnêtement à vos clients à chaque question. Le chat écrit suit la même règle de vérité :
                les faits viennent de votre base, et en cas de doute il propose de vérifier.
              </p>
              <p>
                Conséquence directe : <strong className="text-neutral-100">ce qui n’est pas dans votre base n’existe pas pour lui</strong>.
                Tenez vos prix, vos stocks et vos délais à jour — c’est ce qui fait la qualité de
                votre assistant. Les réponses de l’IA peuvent comporter des erreurs ; vous vérifiez
                les informations sensibles (devis, disponibilité, engagements) avant de les confirmer
                à votre client.
              </p>
            </Section>

            <Section id="comptage" titre="4. Forfaits et comptage des conversations" icone={<MessageSquare className="h-4 w-4 text-purple-300" />}>
              <p>
                <strong className="text-white">1 conversation = 1 message du client + la réponse de l’assistant</strong>.
                Un appel vocal consomme 10 conversations par minute. Le forfait du mois additionne
                l’écrit et les appels ; une fois atteint, l’assistant s’arrête jusqu’au mois suivant
                (aucun dépassement facturé).
              </p>
              <ForfaitsTable />
              <p className="text-[0.82rem] text-neutral-400">
                Les cas particuliers de comptage sont publics et détaillés dans la politique de
                confidentialité : politesse offerte, photo = 4 conversations, recherche produit = +2,
                appel = 10 par minute, 15 minutes maximum par appel.
              </p>
              <button onClick={() => onNavigate('privacy')} className="btn btn-sm btn-glass">
                Voir le détail du comptage
              </button>
            </Section>

            <Section id="paiement" titre="5. Prix, paiement et annulation" icone={<Scale className="h-4 w-4 text-purple-300" />}>
              <ul className="space-y-2 pl-1">
                <Puce>Basic : 2 700 DA (10 $) par mois · Annuel : 27 000 DA (100 $), soit <strong className="text-neutral-100">2 mois offerts</strong> (10 mois payés sur 12).</Puce>
                <Puce>Pro : 5 400 DA (20 $) par mois · Annuel : 54 000 DA (200 $), soit <strong className="text-neutral-100">2 mois offerts</strong>.</Puce>
                <Puce>Formule Entreprise : sur devis, négociée avec vous, activée manuellement.</Puce>
                <Puce>Le paiement se fait par carte bancaire ou virement, via notre prestataire sécurisé. Les factures mentionnent NIF, NIS et RC si vous les avez renseignés.</Puce>
                <Puce>Vous changez de formule quand vous voulez ; l’annulation prend effet à la fin de la période payée, et vous gardez l’accès jusqu’à cette date. Aucun engagement de durée, aucun frais de résiliation.</Puce>
                <Puce>Les formules Basic et Pro n’ont <strong className="text-neutral-100">aucun plafond en dollars</strong> : le forfait de conversations est le seul plafond, et il vous protège de toute facture surprise.</Puce>
              </ul>
            </Section>

            <Section id="loyaute" titre="6. Usage loyal" icone={<ShieldCheck className="h-4 w-4 text-emerald-300" />}>
              <p>Le service est dimensionné pour un usage commercial normal. Sont interdits :</p>
              <ul className="space-y-2 pl-1">
                <Puce>Envoyer du spam ou des messages non sollicités (nous respectons les règles de Meta et des autres plateformes).</Puce>
                <Puce>Utiliser l’assistant pour un contenu illégal, trompeur, haineux, ou contraire à la réglementation algérienne.</Puce>
                <Puce>Contourner le compteur de conversations, partager un compte, automatiser des inscriptions multiples, ou revendre l’accès.</Puce>
                <Puce>Attaquer, surcharger ou tenter d’extraire les données d’autres comptes.</Puce>
                <Puce>Utiliser le canal WhatsApp sans respecter les règles de Meta (fenêtre de 24 heures, modèles de messages).</Puce>
              </ul>
              <p>
                En cas d’abus manifeste, nous suspendons le compte et vous le disons, avec les faits.
                Un quota atteint n’est <em>pas</em> un abus : c’est simplement la fin du forfait du mois.
              </p>
            </Section>

            <Section id="canaux" titre="7. Canaux et réseaux sociaux" icone={<Server className="h-4 w-4 text-purple-300" />}>
              <ul className="space-y-2 pl-1">
                <Puce>Le widget du site, Instagram, Messenger, Telegram et TikTok sont inclus dans les formules payantes ; WhatsApp est inclus à partir de Pro (1 000 réponses par mois).</Puce>
                <Puce>Vous connectez vos canaux vous-même, en collant les informations demandées. Nous ne vous demandons jamais vos mots de passe.</Puce>
                <Puce>Le module Réseaux sociaux est en <strong className="text-neutral-100">déploiement progressif</strong> : la page affiche « Prochainement », vous demandez l’activation depuis votre tableau de bord, et nous l’ouvrons compte par compte.</Puce>
                <Puce>Si une plateforme refuse une connexion, la responsabilité lui incombe : nous vous aidons à corriger, sans pouvoir garantir son accord.</Puce>
              </ul>
            </Section>

            <Section id="disponibilite" titre="8. Disponibilité et support" icone={<Clock className="h-4 w-4 text-purple-300" />}>
              <p>
                Nous visons une disponibilité de 99 % hors maintenance planifiée et pannes d’un
                prestataire (Google, Cloudflare, Supabase, opérateurs). Le support répond par email
                et WhatsApp, du dimanche au jeudi, en moins de 24 heures ouvrées. Les incidents
                majeurs sont annoncés dans votre tableau de bord.
              </p>
            </Section>

            <Section id="responsabilite" titre="9. Responsabilité" icone={<Scale className="h-4 w-4 text-purple-300" />}>
              <p>
                JawebFlow fournit un <strong className="text-neutral-100">outil</strong> : il ne
                garantit pas un chiffre d’affaires, un nombre de clients ou un résultat commercial.
                L’assistant peut se tromper ou ne pas savoir — il est conçu pour dire « je ne sais
                pas » plutôt que d’inventer, mais vous restez responsable des informations publiées
                sur votre site et des engagements pris avec vos clients.
              </p>
              <p>
                Notre responsabilité est limitée, en tant que de besoin, au montant payé au cours des
                douze derniers mois. Cette limite ne s’applique pas en cas de faute lourde ou de
                dommage causé volontairement.
              </p>
            </Section>

            <Section id="fin" titre="10. Fin du service" icone={<Trash2 className="h-4 w-4 text-rose-300" />}>
              <p>
                Vous arrêtez quand vous voulez ; nous pouvons suspendre un compte en cas de non-paiement
                (après relance) ou d’abus caractérisé. À la fermeture, vos données suivent la procédure
                décrite dans la politique de confidentialité : effacement complet sous 48 heures sur
                simple demande, seules les factures obligatoires sont conservées.
              </p>
            </Section>

            <Section id="droit" titre="11. Droit applicable" icone={<Scale className="h-4 w-4 text-purple-300" />}>
              <p>
                Les présentes conditions sont soumises au droit algérien. En cas de litige, nous
                cherchons d’abord une solution amiable ; à défaut, les tribunaux compétents d’Alger
                sont saisis. La version française de ce document fait foi.
              </p>
            </Section>
          </div>
        )}

        {/* ══════════════════ SUPPRESSION DES DONNÉES ══════════════ */}
        {type === 'deletion' && (
          <div className="space-y-8 text-[0.88rem] font-light leading-relaxed sm:text-[0.92rem]">
            <Section id="etapes" titre="1. Supprimer notre accès" icone={<Trash2 className="h-4 w-4 text-rose-300" />}>
              <p>
                Vous pouvez retirer l’accès de JawebFlow à chacune de vos plateformes, puis faire
                effacer toutes vos données. Étape par étape :
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-neutral-400">
                <li>
                  <strong className="text-neutral-200">Instagram / Facebook :</strong> Paramètres → « Applications et sites web »
                  → recherchez <strong>JawebFlow</strong> → <strong>Supprimer</strong>.
                </li>
                <li>
                  <strong className="text-neutral-200">WhatsApp Business :</strong> désactivez l’accès de l’application dans
                  Gestionnaire commercial Meta → Comptes → Applications.
                </li>
                <li>
                  <strong className="text-neutral-200">Telegram :</strong> @BotFather → supprimez le bot créé pour JawebFlow.
                </li>
                <li>
                  <strong className="text-neutral-200">TikTok :</strong> Paramètres → Sécurité et autorisations → applications
                  autorisées → retirer JawebFlow.
                </li>
                <li>
                  <strong className="text-neutral-200">Widget du site :</strong> retirez la ligne de code du widget de vos pages
                  (nous pouvons le faire avec vous en un appel).
                </li>
              </ol>
            </Section>

            <Section id="efface" titre="2. Ce que nous effaçons" icone={<FileText className="h-4 w-4 text-purple-300" />}>
              <p>
                Pour demander l’effacement complet, écrivez à{' '}
                <span className="font-medium text-purple-200">{VERSION.contact}</span> depuis l’adresse de votre compte :
              </p>
              <Tableau
                entetes={['Élément', 'Effacé ?']}
                lignes={[
                  ['Conversations et appels (textes, transcriptions)', 'Oui — définitivement'],
                  ['Prospects et clients enregistrés', 'Oui — exportables avant suppression si vous le demandez'],
                  ['Base de connaissance', 'Oui'],
                  ['Compte, identifiants et réglages', 'Oui'],
                  ['Jetons d’accès aux réseaux sociaux', 'Oui, révoqués immédiatement'],
                  ['Factures et preuves de paiement', 'Conservées 10 ans (obligation comptable)'],
                  ['Journaux techniques (dont l’adresse IP, 30 jours)', 'Effacés avec le reste'],
                ]}
              />
            </Section>

            <Section id="garde" titre="3. Ce que nous devons garder" icone={<Scale className="h-4 w-4 text-purple-300" />}>
              <p>
                Nous ne conservons <strong className="text-neutral-100">que</strong> ce que la loi
                impose : les factures et les pièces comptables, pendant 10 ans. Rien de commercial,
                rien de conversationnel.
              </p>
            </Section>

            <Section id="delai" titre="4. Délais et confirmation" icone={<Clock className="h-4 w-4 text-purple-300" />}>
              <ul className="space-y-2 pl-1">
                <Puce>Votre demande est prise en compte le jour même (accusé de réception par email).</Puce>
                <Puce>Les données sont supprimées sous <strong className="text-neutral-100">48 heures</strong>.</Puce>
                <Puce>Vous recevez une confirmation écrite une fois la suppression terminée.</Puce>
                <Puce>La suppression est gratuite, sans justification à fournir.</Puce>
              </ul>
              <p className="text-[0.82rem] text-neutral-400">
                Vous pouvez aussi utiliser le bouton de suppression d’accès fourni par la plateforme
                (Meta, TikTok) : la demande nous parvient automatiquement et suit le même délai.
              </p>
            </Section>
          </div>
        )}

        {/* ── Contact ─────────────────────────────────────────────── */}
        <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/12 text-purple-200">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[0.7rem] font-light uppercase tracking-[0.12em] text-neutral-500">
                Protection des données · réponse en 48 h
              </p>
              <p className="text-[0.86rem] font-medium text-white">{VERSION.contact}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {type !== 'terms' && (
              <button onClick={() => onNavigate('terms')} className="btn btn-sm btn-glass">
                Conditions d'utilisation
              </button>
            )}
            {type !== 'privacy' && (
              <button onClick={() => onNavigate('privacy')} className="btn btn-sm btn-glass">
                Confidentialité
              </button>
            )}
            <button onClick={() => onNavigate('contact')} className="btn btn-sm btn-primary">
              <span>Nous contacter</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

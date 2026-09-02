import React from 'react';
import { ExternalLink, Globe, Sparkles } from 'lucide-react';

interface LinkPreviewCardProps {
  url: string;
  themeMode?: 'dark' | 'light';
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ url, themeMode = 'dark' }) => {
  let hostname = url;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    hostname = parsed.hostname.replace('www.', '');
  } catch (e) {
    hostname = url;
  }

  // Predefined smart titles for known sites or default
  let siteTitle = `Visiter ${hostname}`;
  let siteDescription = `Accéder au site web officiel et découvrir nos services en ligne.`;
  let badgeText = 'Lien externe';

  if (hostname.includes('jawebflow') || hostname.includes('dz')) {
    siteTitle = 'JawebFlow - Assistant IA & Chatbot';
    siteDescription = 'Plateforme n°1 en Algérie pour ajouter un chatbot intelligent et capturer des prospects.';
    badgeText = 'Site Officiel';
  } else if (hostname.includes('whatsapp') || hostname.includes('wa.me')) {
    siteTitle = 'Discussion WhatsApp Directe';
    siteDescription = 'Contactez-nous instantanément sur WhatsApp pour toute question.';
    badgeText = 'WhatsApp';
  } else if (hostname.includes('github')) {
    siteTitle = 'Dépôt Source & Documentation';
    siteDescription = 'Consulter le code source et les guides d’intégration technique.';
    badgeText = 'Documentation';
  }

  const isDark = themeMode === 'dark';

  const fullUrl = url.startsWith('http') ? url : `https://${url}`;

  return (
    <a
      href={fullUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-2.5 p-3 rounded-xl border flex items-center gap-3 transition-all group block ${
        isDark
          ? 'bg-neutral-955/80 hover:bg-neutral-900 border-white/10 hover:border-purple-500/50 text-neutral-100 shadow-md'
          : 'bg-white hover:bg-neutral-50 border-neutral-200 hover:border-purple-400 text-neutral-900 shadow-sm'
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
        isDark ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 'bg-purple-50 text-purple-600 border border-purple-200'
      }`}>
        {hostname.includes('whatsapp') ? (
          <Sparkles className="w-5 h-5 text-emerald-400" />
        ) : (
          <Globe className="w-5 h-5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
            {badgeText}
          </span>
          <span className="text-[11px] text-neutral-400 font-mono truncate">{hostname}</span>
        </div>
        <h5 className="font-semibold text-xs tracking-tight truncate group-hover:text-purple-400 transition-colors">
          {siteTitle}
        </h5>
        <p className={`text-[11px] truncate mt-0.5 ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
          {siteDescription}
        </p>
      </div>

      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
        isDark ? 'bg-white/5 group-hover:bg-purple-600 text-neutral-300 group-hover:text-white' : 'bg-neutral-100 group-hover:bg-purple-600 text-neutral-600 group-hover:text-white'
      }`}>
        <ExternalLink className="w-3.5 h-3.5" />
      </div>
    </a>
  );
};

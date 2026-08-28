import React, { useState } from 'react';
import {
  Sparkles,
  Bot,
  MessageSquare,
  Zap,
  Headphones,
  Brain,
  Shield,
  Image as ImageIcon,
  Palette,
  Eye,
  Check,
  Copy,
  ArrowRight,
  Sun,
  Moon,
  CheckCircle2,
  HelpCircle,
  Upload,
  Layers,
  Send,
  X
} from 'lucide-react';
import { WidgetCustomization } from '../lib/firebase';

interface WidgetCustomizerProps {
  businessName: string;
  widgetId: string;
  config: WidgetCustomization;
  onChange: (updated: Partial<WidgetCustomization>) => void;
  onSave?: () => void;
  onGoToIntegration?: () => void;
  isSaving?: boolean;
}

// Icon choices with icons and labels
const ICON_OPTIONS = [
  { id: 'sparkles', label: 'IA Sparkles', icon: Sparkles },
  { id: 'bot', label: 'Robot IA', icon: Bot },
  { id: 'message', label: 'Bulle Message', icon: MessageSquare },
  { id: 'zap', label: 'Éclair Rapide', icon: Zap },
  { id: 'headphone', label: 'Support Client', icon: Headphones },
  { id: 'brain', label: 'Cerveau IA', icon: Brain },
  { id: 'shield', label: 'Sécurité & Pro', icon: Shield },
  { id: 'custom_logo', label: 'Logo / Image Personnalisé', icon: ImageIcon },
] as const;

// Color presets
const COLOR_PRESETS = [
  { name: 'Violet IA', primary: '#9333ea', secondary: '#6366f1' },
  { name: 'Émeraude Pro', primary: '#059669', secondary: '#10b981' },
  { name: 'Bleu Océan', primary: '#2563eb', secondary: '#06b6d4' },
  { name: 'Sunset Rose', primary: '#e11d48', secondary: '#f97316' },
  { name: 'Noir Obsidienne', primary: '#0f172a', secondary: '#334155' },
  { name: 'Doré Ambre', primary: '#d97706', secondary: '#fbbf24' },
];

export const WidgetCustomizer: React.FC<WidgetCustomizerProps> = ({
  businessName,
  widgetId,
  config,
  onChange,
  onSave,
  onGoToIntegration,
  isSaving = false
}) => {
  const [activeTab, setActiveTab] = useState<'icon' | 'colors' | 'layout' | 'content'>('icon');
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [previewTestMessage, setPreviewTestMessage] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [previewMessages, setPreviewMessages] = useState<Array<{ sender: 'bot' | 'user'; text: string }>>([
    { sender: 'bot', text: config.welcomeMessage || `Bonjour ! 👋 Comment puis-je vous aider aujourd'hui ?` }
  ]);

  // Handle preview chat send
  const handleSendPreviewMsg = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!previewTestMessage.trim()) return;
    const text = previewTestMessage.trim();
    setPreviewMessages(prev => [...prev, { sender: 'user', text }]);
    setPreviewTestMessage('');
    setTimeout(() => {
      setPreviewMessages(prev => [
        ...prev,
        { sender: 'bot', text: `Merci pour votre message ! Je suis l'assistant configuré pour ${businessName || 'votre entreprise'}.` }
      ]);
    }, 500);
  };

  // Render selected Icon Component
  const renderIcon = (type: string, className = "w-6 h-6") => {
    switch (type) {
      case 'bot':
        return <Bot className={className} />;
      case 'message':
        return <MessageSquare className={className} />;
      case 'zap':
        return <Zap className={className} />;
      case 'headphone':
        return <Headphones className={className} />;
      case 'brain':
        return <Brain className={className} />;
      case 'shield':
        return <Shield className={className} />;
      case 'sparkles':
      default:
        return <Sparkles className={className} />;
    }
  };

  // Dynamic bubble styling
  const bubbleBackgroundStyle = config.useGradient
    ? { backgroundImage: `linear-gradient(135deg, ${config.primaryColor}, ${config.gradientSecondary || config.primaryColor})` }
    : { backgroundColor: config.primaryColor };

  const sizeClasses = {
    compact: 'w-12 h-12',
    standard: 'w-14 h-14',
    large: 'w-16 h-16'
  }[config.size || 'standard'];

  const shapeClasses = {
    circle: 'rounded-full',
    squircle: 'rounded-2xl',
    compact: 'rounded-xl'
  }[config.shape || 'circle'];

  const scriptPreview = `<!-- Widget Bulle IA JawebFlow pour ${businessName || 'votre site'} -->
<script 
  src="https://cdn.jawebflow.com/widget.js" 
  data-assistant-id="${widgetId || 'asst_live'}" 
  data-position="${config.position}" 
  data-theme="${config.themeMode}" 
  data-primary-color="${config.primaryColor}"
  data-shape="${config.shape}"
  data-icon="${config.iconType}"
  ${config.iconType === 'custom_logo' && config.customLogoUrl ? `data-avatar-url="${config.customLogoUrl}"\n  ` : ''}data-teaser="${config.showTeaser ? config.teaserText : ''}"
  defer>
</script>`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(scriptPreview);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold">
            <Palette className="w-3.5 h-3.5" />
            <span>Studio de Personnalisation Visuelle</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Personnalisez la Bulle de votre Assistant
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
            Adaptez l'apparence de la bulle à votre charte graphique : choisissez votre logo, vos couleurs, l'icône IA, les messages d'accueil et prévisualisez le rendu en temps réel.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-sm shadow-purple-600/20 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
            >
              {isSaving ? <CheckCircle2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Enregistrer le style</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Controls on Left, Live Mockup on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ===================================================================
            LEFT COLUMN: CUSTOMIZER OPTIONS (TABS & CONTROLS)
            =================================================================== */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Sub-tabs for customization categories */}
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('icon')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'icon'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>1. Logo & Icône</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('colors')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'colors'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>2. Couleurs & Thème</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('layout')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'layout'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>3. Forme & Position</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('content')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'content'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>4. Textes & Accroche</span>
            </button>
          </div>

          {/* TAB 1: ICON & LOGO */}
          {activeTab === 'icon' && (
            <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5 animate-in fade-in">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-purple-600" />
                  <span>Icône ou Logo de la bulle</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Choisissez une icône moderne ou utilisez le logo officiel de votre entreprise.
                </p>
              </div>

              {/* Options Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {ICON_OPTIONS.map((item) => {
                  const IconComp = item.icon;
                  const isSelected = config.iconType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onChange({ iconType: item.id as any })}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-50 border-purple-500 text-purple-900 shadow-sm ring-1 ring-purple-500/30'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${isSelected ? 'bg-purple-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
                        <IconComp className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-semibold tracking-tight">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Logo URL input if custom_logo selected */}
              {config.iconType === 'custom_logo' && (
                <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200 space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2 text-xs font-semibold text-purple-900">
                    <ImageIcon className="w-4 h-4 text-purple-600" />
                    <span>URL du Logo / Image de l'avatar</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      value={config.customLogoUrl || ''}
                      onChange={(e) => onChange({ customLogoUrl: e.target.value })}
                      placeholder="https://votresite.com/logo.png ou lien image..."
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
                    />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span>💡 Astuce : Formats carrés PNG transparent ou JPG recommandés.</span>
                  </div>
                  {config.customLogoUrl && (
                    <div className="flex items-center gap-3 pt-2 border-t border-purple-200/60">
                      <span className="text-[10px] text-slate-600">Aperçu avatar :</span>
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-white border border-slate-300 flex items-center justify-center">
                        <img 
                          src={config.customLogoUrl} 
                          alt="Logo avatar" 
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }} 
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COLORS & THEME */}
          {activeTab === 'colors' && (
            <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5 animate-in fade-in">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-purple-600" />
                  <span>Couleur Principale & Dégradé</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Sélectionnez l'une de nos palettes prédéfinies ou saisissez votre code couleur hexadécimal exact.
                </p>
              </div>

              {/* Presets Grid */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">Palettes Recommandées</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {COLOR_PRESETS.map((preset) => {
                    const isCurrent = config.primaryColor.toLowerCase() === preset.primary.toLowerCase();
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => onChange({ 
                          primaryColor: preset.primary, 
                          gradientSecondary: preset.secondary,
                          useGradient: true
                        })}
                        className={`p-3 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                          isCurrent
                            ? 'bg-purple-50 border-purple-500 shadow-sm ring-1 ring-purple-500/30'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <div 
                          className="w-6 h-6 rounded-full shadow-inner shrink-0" 
                          style={{ backgroundImage: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})` }}
                        />
                        <div className="text-left truncate">
                          <span className="block text-xs font-bold text-slate-900 truncate">{preset.name}</span>
                          <span className="block text-[10px] text-slate-500 font-mono">{preset.primary}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Hex Pickers */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="block text-xs font-bold text-slate-900">Couleur Principale (#HEX)</span>
                    <span className="block text-[10px] text-slate-500">Teinte principale du bouton et de l'en-tête</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={config.primaryColor}
                      onChange={(e) => onChange({ primaryColor: e.target.value })}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={config.primaryColor}
                      onChange={(e) => onChange({ primaryColor: e.target.value })}
                      className="w-24 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-purple-600"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="block text-xs font-bold text-slate-900">Effet Dégradé Moderne</span>
                    <span className="block text-[10px] text-slate-500">Fond subtil en dégradé deux tons</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.useGradient}
                    onChange={(e) => onChange({ useGradient: e.target.checked })}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Chat Theme Mode (Dark / Light) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">Thème de la Fenêtre de Discussion</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onChange({ themeMode: 'dark' })}
                    className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                      config.themeMode === 'dark'
                        ? 'bg-purple-50 border-purple-500 text-purple-900 ring-1 ring-purple-500/30'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Moon className="w-4 h-4 text-purple-600" />
                    <div className="text-left">
                      <span className="block text-xs font-bold">Mode Sombre (Dark)</span>
                      <span className="block text-[10px] text-slate-500">Fond nocturne élégant</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onChange({ themeMode: 'light' })}
                    className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                      config.themeMode === 'light'
                        ? 'bg-purple-50 border-purple-500 text-purple-900 ring-1 ring-purple-500/30'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Sun className="w-4 h-4 text-amber-500" />
                    <div className="text-left">
                      <span className="block text-xs font-bold">Mode Clair (Light)</span>
                      <span className="block text-[10px] text-slate-500">Fond blanc épuré</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LAYOUT, SHAPE & POSITION */}
          {activeTab === 'layout' && (
            <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5 animate-in fade-in">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-600" />
                  <span>Position & Silhouette du Bouton</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Configurez l'ancrage sur votre écran et la géométrie de la bulle flottante.
                </p>
              </div>

              {/* Position Choice */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">Position sur l'écran</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onChange({ position: 'bottom-right' })}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      config.position === 'bottom-right'
                        ? 'bg-purple-50 border-purple-500 text-purple-900 ring-1 ring-purple-500/30'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span className="block text-xs font-bold">Bas Droite (Recommandé)</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">Emplacement standard habituel</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onChange({ position: 'bottom-left' })}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      config.position === 'bottom-left'
                        ? 'bg-purple-50 border-purple-500 text-purple-900 ring-1 ring-purple-500/30'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span className="block text-xs font-bold">Bas Gauche</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">Si vous avez d'autres boutons à droite</span>
                  </button>
                </div>
              </div>

              {/* Shape Choice */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">Forme de la Bulle</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'circle', title: 'Cercle Rond', desc: 'Classique & Doux' },
                    { id: 'squircle', title: 'Squircle', desc: 'Coins arrondis 16px' },
                    { id: 'compact', title: 'Compact', desc: 'Carré doux 12px' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onChange({ shape: s.id as any })}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                        config.shape === s.id
                          ? 'bg-purple-50 border-purple-500 text-purple-900 ring-1 ring-purple-500/30'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <span className="block text-xs font-bold">{s.title}</span>
                      <span className="block text-[10px] text-slate-500 mt-0.5">{s.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Size Choice */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">Taille du Bouton Flottant</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'compact', title: 'Discret (48px)' },
                    { id: 'standard', title: 'Standard (56px)' },
                    { id: 'large', title: 'Confort (64px)' },
                  ].map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => onChange({ size: sz.id as any })}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        config.size === sz.id
                          ? 'bg-purple-50 border-purple-500 text-purple-900 ring-1 ring-purple-500/30'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <span className="block text-xs font-bold">{sz.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Online indicator badge */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="block text-xs font-bold text-slate-900">Pastille verte "En ligne"</span>
                  <span className="block text-[10px] text-slate-500">Indique aux visiteurs que le bot répond 24h/24</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.onlineBadge}
                  onChange={(e) => onChange({ onlineBadge: e.target.checked })}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                />
              </div>
            </div>
          )}

          {/* TAB 4: TEXTS & CONTENT */}
          {activeTab === 'content' && (
            <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5 animate-in fade-in">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-purple-600" />
                  <span>Textes d'Accroche & Messages</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Configurez le texte qui invite le visiteur à cliquer et l'en-tête de la discussion.
                </p>
              </div>

              {/* Teaser Bubble (Bulle d'accroche) */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="block text-xs font-bold text-slate-900">Bulle d'Accroche Flottante (Teaser)</span>
                    <span className="block text-[10px] text-slate-500">Mini bulle affichée à côté du bouton pour attirer l'attention</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.showTeaser}
                    onChange={(e) => onChange({ showTeaser: e.target.checked })}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                  />
                </div>

                {config.showTeaser && (
                  <div className="pt-2 border-t border-slate-200 space-y-1.5 animate-in fade-in">
                    <label className="text-[11px] font-semibold text-slate-700">Texte d'accroche</label>
                    <input
                      type="text"
                      value={config.teaserText}
                      onChange={(e) => onChange({ teaserText: e.target.value })}
                      placeholder="Une question ? Discutons en direct 👋"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
                    />
                  </div>
                )}
              </div>

              {/* Header Title & Subtitle */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Titre dans l'en-tête de discussion
                  </label>
                  <input
                    type="text"
                    value={config.headerTitle}
                    onChange={(e) => onChange({ headerTitle: e.target.value })}
                    placeholder={businessName || "Assistant IA"}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sous-titre / Statut
                  </label>
                  <input
                    type="text"
                    value={config.headerSubtitle}
                    onChange={(e) => onChange({ headerSubtitle: e.target.value })}
                    placeholder="En ligne · Répond instantanément"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Message de bienvenue automatique
                  </label>
                  <textarea
                    rows={3}
                    value={config.welcomeMessage}
                    onChange={(e) => onChange({ welcomeMessage: e.target.value })}
                    placeholder="Bonjour ! 👋 Comment puis-je vous renseigner aujourd'hui ?"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20 leading-relaxed"
                  />
                </div>
              </div>

              {/* Branding Footer Toggle */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="block text-xs font-bold text-slate-900">Mention de marque JawebFlow</span>
                  <span className="block text-[10px] text-slate-500">Afficher "⚡ Propulsé par JawebFlow" au bas du chat</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.showBranding}
                  onChange={(e) => onChange({ showBranding: e.target.checked })}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                />
              </div>
            </div>
          )}

          {/* Quick Script integration link */}
          {onGoToIntegration && (
            <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-purple-950">Prêt à intégrer votre bulle personnalisée ?</span>
                <span className="text-[11px] text-purple-700 block">Le code script se met à jour instantanément avec votre style.</span>
              </div>
              <button
                type="button"
                onClick={onGoToIntegration}
                className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-all shrink-0 shadow-sm"
              >
                <span>Voir le Script</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ===================================================================
            RIGHT COLUMN: LIVE INTERACTIVE PREVIEW CANVAS
            =================================================================== */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-purple-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Aperçu Réel en Direct</h3>
              </div>
              <span className="text-[10px] text-slate-500">Cliquez sur la bulle pour tester</span>
            </div>

            {/* Mock Website Canvas */}
            <div className="relative w-full h-[480px] rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl flex flex-col justify-between select-none">
              
              {/* Mock Browser Topbar */}
              <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500/80"></span>
                  <span className="w-2 h-2 rounded-full bg-amber-500/80"></span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500/80"></span>
                </div>
                <div className="flex-1 max-w-[200px] text-center bg-slate-900 py-0.5 px-2 rounded-md border border-slate-800 text-[9px] text-slate-400 truncate">
                  https://{businessName ? businessName.toLowerCase().replace(/\s+/g, '') : 'votresite'}.com
                </div>
                <div className="w-8"></div>
              </div>

              {/* Mock Page Content Body */}
              <div className="p-5 space-y-3 opacity-60 pointer-events-none">
                <div className="w-24 h-3 rounded bg-white/20"></div>
                <div className="w-48 h-5 rounded bg-white/30"></div>
                <div className="w-full max-w-xs h-2.5 rounded bg-white/10"></div>
                <div className="w-40 h-2.5 rounded bg-white/10"></div>
                
                <div className="grid grid-cols-2 gap-2 pt-4">
                  <div className="h-16 rounded-lg bg-white/5 border border-white/5 p-2">
                    <div className="w-12 h-2 rounded bg-white/20 mb-1"></div>
                    <div className="w-20 h-1.5 rounded bg-white/10"></div>
                  </div>
                  <div className="h-16 rounded-lg bg-white/5 border border-white/5 p-2">
                    <div className="w-12 h-2 rounded bg-white/20 mb-1"></div>
                    <div className="w-20 h-1.5 rounded bg-white/10"></div>
                  </div>
                </div>
              </div>

              {/* Floating Chat Window (If preview opened) */}
              {isPreviewOpen && (
                <div 
                  className={`absolute bottom-20 ${config.position === 'bottom-left' ? 'left-4' : 'right-4'} w-[280px] sm:w-[320px] rounded-2xl shadow-2xl border flex flex-col overflow-hidden z-20 animate-in slide-in-from-bottom-3 duration-200 ${
                    config.themeMode === 'light'
                      ? 'bg-white text-slate-800 border-slate-200'
                      : 'bg-slate-900 text-slate-100 border-slate-700'
                  }`}
                  style={{ maxHeight: '360px' }}
                >
                  {/* Chat Header */}
                  <div 
                    className="p-3.5 flex items-center justify-between text-white shadow-sm"
                    style={bubbleBackgroundStyle}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                        {config.iconType === 'custom_logo' && config.customLogoUrl ? (
                          <img src={config.customLogoUrl} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                          renderIcon(config.iconType, "w-4 h-4")
                        )}
                      </div>
                      <div className="truncate">
                        <span className="block text-xs font-bold truncate">
                          {config.headerTitle || businessName || 'Assistant IA'}
                        </span>
                        <span className="block text-[9px] text-white/80 truncate">
                          {config.headerSubtitle || 'En ligne · Réponse immédiate'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPreviewOpen(false)}
                      className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Messages container */}
                  <div className={`p-3 space-y-2.5 overflow-y-auto flex-1 text-xs ${
                    config.themeMode === 'light' ? 'bg-slate-50' : 'bg-slate-950'
                  }`} style={{ height: '180px' }}>
                    {previewMessages.map((msg, i) => (
                      <div 
                        key={i} 
                        className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <div 
                          className={`max-w-[85%] px-3 py-2 rounded-xl text-[11px] leading-relaxed shadow-sm ${
                            msg.sender === 'user'
                              ? 'text-white rounded-br-none'
                              : config.themeMode === 'light'
                                ? 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                                : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                          }`}
                          style={msg.sender === 'user' ? bubbleBackgroundStyle : undefined}
                        >
                          {msg.text}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Chat input */}
                  <form onSubmit={handleSendPreviewMsg} className={`p-2 border-t flex items-center gap-1.5 ${
                    config.themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                  }`}>
                    <input
                      type="text"
                      value={previewTestMessage}
                      onChange={(e) => setPreviewTestMessage(e.target.value)}
                      placeholder="Écrivez un message..."
                      className={`flex-1 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none ${
                        config.themeMode === 'light'
                          ? 'bg-slate-100 text-slate-800 placeholder-slate-400'
                          : 'bg-slate-950 text-white placeholder-slate-500'
                      }`}
                    />
                    <button
                      type="submit"
                      className="p-1.5 rounded-lg text-white font-bold cursor-pointer"
                      style={bubbleBackgroundStyle}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>

                  {/* Branding footer */}
                  {config.showBranding && (
                    <div className="py-1 text-center bg-black/20 text-[9px] text-slate-400 border-t border-white/5 font-mono">
                      ⚡ Propulsé par JawebFlow
                    </div>
                  )}
                </div>
              )}

              {/* Floating Action Button & Teaser Bubble */}
              <div 
                className={`absolute bottom-4 ${config.position === 'bottom-left' ? 'left-4' : 'right-4'} flex flex-col ${
                  config.position === 'bottom-left' ? 'items-start' : 'items-end'
                } gap-2 z-10`}
              >
                {/* Teaser Bubble */}
                {config.showTeaser && !isPreviewOpen && (
                  <div 
                    onClick={() => setIsPreviewOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-white text-slate-900 text-[11px] font-medium shadow-xl border border-slate-200 flex items-center gap-1.5 cursor-pointer hover:scale-105 transition-all animate-bounce"
                  >
                    <span>{config.teaserText || "Une question ? Discutons en direct 👋"}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  </div>
                )}

                {/* The Floating Bubble Button */}
                <button
                  type="button"
                  id="preview-floating-bubble"
                  onClick={() => setIsPreviewOpen(!isPreviewOpen)}
                  style={bubbleBackgroundStyle}
                  className={`relative flex items-center justify-center text-white shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer ${sizeClasses} ${shapeClasses}`}
                  title="Ouvrir le chat"
                >
                  {config.iconType === 'custom_logo' && config.customLogoUrl ? (
                    <img 
                      src={config.customLogoUrl} 
                      alt="Logo Avatar" 
                      className="w-full h-full object-cover rounded-inherit"
                    />
                  ) : (
                    renderIcon(config.iconType, config.size === 'large' ? 'w-7 h-7' : config.size === 'compact' ? 'w-5 h-5' : 'w-6 h-6')
                  )}

                  {/* Online Indicator Green Dot */}
                  {config.onlineBadge && (
                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-900 shadow-sm animate-pulse"></span>
                  )}
                </button>
              </div>

            </div>

            {/* Script Snippet Card */}
            <div className="pt-2">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-slate-500 truncate">
                  data-theme="{config.themeMode}" · {config.position} · {config.iconType}
                </span>
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-700 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-all shrink-0"
                >
                  {copiedCode ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCode ? 'Copié' : 'Copier Script'}</span>
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

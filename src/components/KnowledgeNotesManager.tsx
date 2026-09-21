import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Copy, 
  Sparkles, 
  Check, 
  FileText, 
  Globe, 
  HelpCircle, 
  Truck, 
  DollarSign, 
  ShieldCheck, 
  Phone, 
  Layers,
  ChevronDown,
  ChevronUp,
  Upload,
  X,
  AlertCircle
} from 'lucide-react';
import { KnowledgeNote } from '../types';

interface KnowledgeNotesManagerProps {
  notes: KnowledgeNote[];
  onUpdateNotes: (notes: KnowledgeNote[]) => void;
  onScanClick: () => void;
  isScanning?: boolean;
  assistantId?: string;
  geminiApiKey?: string;
}

const CATEGORY_CONFIG: Record<KnowledgeNote['category'], { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
  general: { 
    label: 'Présentation & À Propos', 
    bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200',
    icon: <Globe className="w-3.5 h-3.5 text-blue-600" />
  },
  services: { 
    label: 'Services & Produits', 
    bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200',
    icon: <Layers className="w-3.5 h-3.5 text-purple-600" />
  },
  tarifs: { 
    label: 'Tarifs & Devis', 
    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200',
    icon: <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
  },
  livraison: { 
    label: 'Livraison & Délais', 
    bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200',
    icon: <Truck className="w-3.5 h-3.5 text-amber-600" />
  },
  faq: { 
    label: 'Questions Fréquentes (FAQ)', 
    bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200',
    icon: <HelpCircle className="w-3.5 h-3.5 text-indigo-600" />
  },
  politiques: { 
    label: 'Garanties & Retours', 
    bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200',
    icon: <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
  },
  contact: { 
    label: 'Contact & Support', 
    bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200',
    icon: <Phone className="w-3.5 h-3.5 text-teal-600" />
  },
  learned: { 
    label: '🧠 Apprentissage Autonome', 
    bg: 'bg-gradient-to-r from-purple-50 to-indigo-50', 
    text: 'text-purple-700 font-bold', border: 'border-purple-300',
    icon: <Sparkles className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
  },
  custom: { 
    label: 'Note Personnalisée', 
    bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300',
    icon: <FileText className="w-3.5 h-3.5 text-slate-600" />
  }
};

const ALLOWED_CATEGORIES = ['services', 'tarifs', 'livraison', 'garanties', 'contact', 'faq', 'general'];

// ---------------------------------------------------------------------------
// Modal Importer
// ---------------------------------------------------------------------------

interface ImportModalProps {
  onClose: () => void;
  onImport: (notes: KnowledgeNote[]) => void;
  assistantId?: string;
}

const ImportModal: React.FC<ImportModalProps> = ({ onClose, onImport, assistantId }) => {
  const [rawText, setRawText] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAnalyze = async () => {
    if (!rawText.trim() && !siteUrl.trim()) {
      setError('Collez du texte ou entrez une URL.');
      return;
    }
    if (rawText.trim().length < 10) {
      setError('Le texte est trop court.');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setSuccess('');

    try {
      const user = (window as any).__jawebflow_user;
      const token = user ? await user.getIdToken() : null;

      // Tente de parser comme JSON (données bookmarklet)
      let pages: any[] = [];
      let text = rawText.trim();

      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
          pages = Array.isArray(parsed) ? parsed : [parsed];
          text = '';
        }
      } catch {
        // Pas du JSON → texte brut
      }

      const res = await fetch('/api/extract/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          pages: pages.length > 0 ? pages : undefined,
          rawText: text || undefined,
          siteUrl: siteUrl || 'https://monsite.com',
          assistantId,
          mode: 'merge',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erreur lors de l\'analyse.');
        return;
      }

      // Convertit les knowledgeNotes en format local
      const newNotes: KnowledgeNote[] = (data.knowledgeNotes || []).map((n: any) => ({
        id: `imported_${Math.random().toString(36).slice(2, 9)}`,
        title: n.title || 'Information importée',
        content: n.content || '',
        category: ALLOWED_CATEGORIES.includes(n.category) ? n.category : 'general',
        enabled: true,
        source: 'extracted',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      setSuccess(`✅ ${newNotes.length} fiches créées avec succès !`);
      onImport(newNotes);

      setTimeout(() => onClose(), 1500);
    } catch (e: any) {
      setError(e?.message || 'Erreur réseau.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
              <Upload className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Importer ma base de connaissances</h3>
              <p className="text-xs text-slate-500">Collez n'importe quoi — Gemini organise tout</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          
          {/* URL optionnelle */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              URL de votre site <span className="text-slate-400 font-normal">(optionnel)</span>
            </label>
            <input
              type="url"
              value={siteUrl}
              onChange={e => setSiteUrl(e.target.value)}
              placeholder="https://monsite.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            />
          </div>

          {/* Zone de texte principale */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Collez vos informations ici *
            </label>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              rows={10}
              placeholder={`Collez n'importe quoi :

• Texte de votre page Facebook ou Instagram
• Description de votre boutique (services, prix, livraison)
• Vos conditions de vente, FAQ, horaires
• Un catalogue produits copié depuis votre site
• Le JSON du bookmarklet d'extraction
• N'importe quel texte décrivant votre activité

Gemini va tout analyser et créer les fiches automatiquement.`}
              className="w-full px-3.5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 leading-relaxed resize-none"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
              <span>{rawText.length} caractères</span>
              <span>Minimum 10 caractères</span>
            </div>
          </div>

          {/* Ce que Gemini va créer */}
          <div className="rounded-xl bg-purple-50 border border-purple-100 p-3.5 space-y-2">
            <p className="text-xs font-semibold text-purple-800 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              Gemini va automatiquement créer :
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                '📋 Fiche Services & Produits',
                '💰 Fiche Tarifs & Prix',
                '🚚 Fiche Livraison & Délais',
                '📞 Fiche Contact & Réseaux',
                '❓ Fiche FAQ',
                '🛡️ Fiche Garanties & Retours',
              ].map(item => (
                <div key={item} className="flex items-center gap-1.5 text-[11px] text-purple-700">
                  <Check className="w-3 h-3 text-purple-500 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Erreur / Succès */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
              <Check className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-slate-100 bg-slate-50/50">
          <p className="text-[11px] text-slate-400">
            Les fiches existantes ne seront pas supprimées
          </p>
          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || rawText.trim().length < 10}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-2 shadow-sm shadow-purple-600/20 transition-all"
            >
              {isAnalyzing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Gemini analyse...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Analyser et importer</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export const KnowledgeNotesManager: React.FC<KnowledgeNotesManagerProps> = ({
  notes,
  onUpdateNotes,
  onScanClick,
  isScanning = false,
  assistantId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<KnowledgeNote['category']>('services');
  const [collapsedNotes, setCollapsedNotes] = useState<Record<string, boolean>>({});

  const handleToggleNote = (id: string) => {
    onUpdateNotes(notes.map(n => n.id === id ? { ...n, enabled: !n.enabled } : n));
  };

  const handleUpdateNoteField = (id: string, field: 'title' | 'content' | 'category', value: any) => {
    onUpdateNotes(notes.map(n => n.id === id ? { ...n, [field]: value, updatedAt: new Date().toISOString() } : n));
  };

  const handleDeleteNote = (id: string) => {
    onUpdateNotes(notes.filter(n => n.id !== id));
  };

  const handleDuplicateNote = (note: KnowledgeNote) => {
    const dup: KnowledgeNote = {
      ...note,
      id: 'note_' + Math.random().toString(36).slice(2, 9),
      title: `${note.title} (Copie)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onUpdateNotes([dup, ...notes]);
  };

  const handleCreateNewNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    const newNote: KnowledgeNote = {
      id: 'note_' + Math.random().toString(36).slice(2, 9),
      title: newTitle.trim(),
      content: newContent.trim(),
      category: newCategory,
      enabled: true,
      source: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onUpdateNotes([newNote, ...notes]);
    setNewTitle(''); setNewContent(''); setNewCategory('services');
    setIsAddingNote(false);
  };

  // Import handler — fusionne les nouvelles notes avec les existantes
  const handleImport = (newNotes: KnowledgeNote[]) => {
    const existingIds = new Set(notes.map(n => n.id));
    const toAdd = newNotes.filter(n => !existingIds.has(n.id));
    onUpdateNotes([...toAdd, ...notes]);
  };

  const toggleCollapse = (id: string) => {
    setCollapsedNotes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredNotes = notes.filter(n => {
    const matchesSearch =
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || n.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const activeCount = notes.filter(n => n.enabled).length;

  return (
    <div className="space-y-6">

      {/* Modal Importer */}
      {isImporting && (
        <ImportModal
          onClose={() => setIsImporting(false)}
          onImport={handleImport}
          assistantId={assistantId}
        />
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-slate-900">Mes informations</h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
              {activeCount} / {notes.length} notes actives
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-600 animate-pulse" />
              Contexte évolutif Firestore & Apprentissage actif
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Ces informations sont celles que votre assistant utilise pour répondre : prix, horaires, livraison, garanties, questions fréquentes.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Scanner */}
          <button
            type="button"
            onClick={onScanClick}
            disabled={isScanning}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-300 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>{isScanning ? 'Scan en cours...' : 'Scanner mon site web'}</span>
          </button>

          {/* NOUVEAU : Importer */}
          <button
            type="button"
            onClick={() => setIsImporting(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-emerald-600/20"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Importer</span>
          </button>

          {/* Ajouter une note */}
          <button
            type="button"
            onClick={() => setIsAddingNote(true)}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-purple-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter une Note</span>
          </button>
        </div>
      </div>

      {/* New Note Form */}
      {isAddingNote && (
        <form
          onSubmit={handleCreateNewNote}
          className="bg-white p-5 rounded-2xl border-2 border-purple-500/40 shadow-md space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">+</div>
              <span className="font-bold text-sm text-slate-900">Nouvelle Fiche de Connaissance</span>
            </div>
            <button type="button" onClick={() => setIsAddingNote(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded">
              Annuler
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Titre *</label>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Ex: Tarifs abonnements, Délais livraison..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-purple-600 focus:outline-none"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Catégorie</label>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-purple-600 focus:outline-none"
              >
                <option value="services">Services & Produits</option>
                <option value="tarifs">Tarifs & Devis</option>
                <option value="livraison">Livraison & Délais</option>
                <option value="faq">FAQ & Questions</option>
                <option value="politiques">Garanties & Retours</option>
                <option value="contact">Contact & Horaires</option>
                <option value="general">Présentation générale</option>
                <option value="custom">Autre</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">Contenu *</label>
            <textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              rows={4}
              placeholder="Écrivez les informations exactes : prix, délais, conditions..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-purple-600 focus:outline-none leading-relaxed"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsAddingNote(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer">
              Annuler
            </button>
            <button type="submit" className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <Check className="w-3.5 h-3.5" />
              <span>Enregistrer</span>
            </button>
          </div>
        </form>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans les notes de connaissances..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs shadow-sm focus:border-purple-600 focus:outline-none"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">✕</button>
          )}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${selectedCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            Toutes ({notes.length})
          </button>
          {Object.entries(CATEGORY_CONFIG).map(([catKey, catVal]) => {
            const count = notes.filter(n => n.category === catKey).length;
            if (count === 0 && selectedCategory !== catKey) return null;
            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setSelectedCategory(catKey)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${selectedCategory === catKey ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
              >
                {catVal.icon}
                <span>{catVal.label.split(' ')[0]}</span>
                <span className="opacity-70 text-[10px]">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes List */}
      {filteredNotes.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6 text-purple-600" />
          </div>
          <h4 className="font-bold text-slate-800 text-sm">Aucune note trouvée</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchQuery ? 'Aucun résultat.' : 'Importez vos informations ou créez une note manuellement.'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setIsImporting(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Importer</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAddingNote(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter une note</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNotes.map(note => {
            const cat = CATEGORY_CONFIG[note.category] || CATEGORY_CONFIG.custom;
            const isCollapsed = Boolean(collapsedNotes[note.id]);
            return (
              <div
                key={note.id}
                className={`bg-white rounded-2xl border transition-all shadow-sm ${note.enabled ? 'border-slate-200 hover:border-slate-300' : 'border-slate-200/60 opacity-60 bg-slate-50/50'}`}
              >
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleToggleNote(note.id)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${note.enabled ? 'bg-purple-600' : 'bg-slate-300'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${note.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <div className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 ${cat.bg} ${cat.text} ${cat.border} border shrink-0`}>
                      {cat.icon}
                      <span>{cat.label}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={note.title}
                        onChange={e => handleUpdateNoteField(note.id, 'title', e.target.value)}
                        className="w-full font-bold text-sm text-slate-900 bg-transparent hover:bg-slate-50 focus:bg-white focus:border focus:border-purple-600 px-2 py-1 rounded-lg outline-none transition-colors"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {note.source === 'learned_conversation' && (
                      <span className="text-[10px] font-bold text-purple-700 bg-purple-100 border border-purple-200 px-2 py-1 rounded-md flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Appris en discussion
                      </span>
                    )}
                    {note.source === 'scanned' && (
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded-md hidden sm:inline-block">
                        Scanné
                      </span>
                    )}
                    {note.source === 'extracted' && (
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md hidden sm:inline-block">
                        Importé
                      </span>
                    )}
                    <button type="button" onClick={() => handleDuplicateNote(note)} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => handleDeleteNote(note.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => toggleCollapse(note.id)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
                      {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {!isCollapsed && (
                  <div className="p-4 sm:p-5 space-y-2">
                    <textarea
                      value={note.content}
                      onChange={e => handleUpdateNoteField(note.id, 'content', e.target.value)}
                      rows={Math.min(8, Math.max(3, note.content.split('\n').length + 1))}
                      placeholder="Détail de l'information..."
                      className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-800 focus:bg-white focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20 leading-relaxed"
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                      <span>{note.content.length} caractères</span>
                      <span>Modifié automatiquement</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

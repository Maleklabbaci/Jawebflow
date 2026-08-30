import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Copy, 
  Sparkles, 
  Check, 
  Filter, 
  Edit3, 
  FileText, 
  CheckCircle2, 
  Globe, 
  HelpCircle, 
  Truck, 
  DollarSign, 
  ShieldCheck, 
  Phone, 
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { KnowledgeNote } from '../types';

interface KnowledgeNotesManagerProps {
  notes: KnowledgeNote[];
  onUpdateNotes: (notes: KnowledgeNote[]) => void;
  onScanClick: () => void;
  isScanning?: boolean;
}

const CATEGORY_CONFIG: Record<KnowledgeNote['category'], { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
  general: { 
    label: 'Présentation & À Propos', 
    bg: 'bg-blue-50', 
    text: 'text-blue-700', 
    border: 'border-blue-200',
    icon: <Globe className="w-3.5 h-3.5 text-blue-600" />
  },
  services: { 
    label: 'Services & Produits', 
    bg: 'bg-purple-50', 
    text: 'text-purple-700', 
    border: 'border-purple-200',
    icon: <Layers className="w-3.5 h-3.5 text-purple-600" />
  },
  tarifs: { 
    label: 'Tarifs & Devis', 
    bg: 'bg-emerald-50', 
    text: 'text-emerald-700', 
    border: 'border-emerald-200',
    icon: <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
  },
  livraison: { 
    label: 'Livraison & Délais', 
    bg: 'bg-amber-50', 
    text: 'text-amber-700', 
    border: 'border-amber-200',
    icon: <Truck className="w-3.5 h-3.5 text-amber-600" />
  },
  faq: { 
    label: 'Questions Fréquentes (FAQ)', 
    bg: 'bg-indigo-50', 
    text: 'text-indigo-700', 
    border: 'border-indigo-200',
    icon: <HelpCircle className="w-3.5 h-3.5 text-indigo-600" />
  },
  politiques: { 
    label: 'Garanties & Retours', 
    bg: 'bg-rose-50', 
    text: 'text-rose-700', 
    border: 'border-rose-200',
    icon: <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
  },
  contact: { 
    label: 'Contact & Support', 
    bg: 'bg-teal-50', 
    text: 'text-teal-700', 
    border: 'border-teal-200',
    icon: <Phone className="w-3.5 h-3.5 text-teal-600" />
  },
  learned: { 
    label: '🧠 Apprentissage Autonome', 
    bg: 'bg-gradient-to-r from-purple-50 to-indigo-50', 
    text: 'text-purple-700 font-bold', 
    border: 'border-purple-300',
    icon: <Sparkles className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
  },
  custom: { 
    label: 'Note Personnalisée', 
    bg: 'bg-slate-100', 
    text: 'text-slate-700', 
    border: 'border-slate-300',
    icon: <FileText className="w-3.5 h-3.5 text-slate-600" />
  }
};

export const KnowledgeNotesManager: React.FC<KnowledgeNotesManagerProps> = ({
  notes,
  onUpdateNotes,
  onScanClick,
  isScanning = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAddingNote, setIsAddingNote] = useState(false);
  
  // New note form state
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<KnowledgeNote['category']>('services');

  // Expanded notes toggle
  const [collapsedNotes, setCollapsedNotes] = useState<Record<string, boolean>>({});

  const handleToggleNote = (id: string) => {
    const updated = notes.map(n => n.id === id ? { ...n, enabled: !n.enabled } : n);
    onUpdateNotes(updated);
  };

  const handleUpdateNoteField = (id: string, field: 'title' | 'content' | 'category', value: any) => {
    const updated = notes.map(n => n.id === id ? { ...n, [field]: value, updatedAt: new Date().toISOString() } : n);
    onUpdateNotes(updated);
  };

  const handleDeleteNote = (id: string) => {
    const updated = notes.filter(n => n.id !== id);
    onUpdateNotes(updated);
  };

  const handleDuplicateNote = (note: KnowledgeNote) => {
    const duplicated: KnowledgeNote = {
      ...note,
      id: 'note_' + Math.random().toString(36).substring(2, 9),
      title: `${note.title} (Copie)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    onUpdateNotes([duplicated, ...notes]);
  };

  const handleCreateNewNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    const newNote: KnowledgeNote = {
      id: 'note_' + Math.random().toString(36).substring(2, 9),
      title: newTitle.trim(),
      content: newContent.trim(),
      category: newCategory,
      enabled: true,
      source: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onUpdateNotes([newNote, ...notes]);
    setNewTitle('');
    setNewContent('');
    setNewCategory('services');
    setIsAddingNote(false);
  };

  const toggleCollapse = (id: string) => {
    setCollapsedNotes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filtering
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
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-slate-900">Base de Connaissances IA</h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
              {activeCount} / {notes.length} notes actives
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-600 animate-pulse" />
              Contexte évolutif Firestore & Apprentissage actif
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            L'IA consulte l'historique et le profil de mémoire évolutif avant chaque réponse pour affiner son ton et son expertise.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onScanClick}
            disabled={isScanning}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-300 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>{isScanning ? 'Scan en cours...' : 'Scanner mon site web'}</span>
          </button>

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

      {/* New Note Creation Modal / Inline Box */}
      {isAddingNote && (
        <form 
          onSubmit={handleCreateNewNote}
          className="bg-white p-5 rounded-2xl border-2 border-purple-500/40 shadow-md space-y-4 animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                +
              </div>
              <span className="font-bold text-sm text-slate-900">Nouvelle Fiche de Connaissance</span>
            </div>
            <button
              type="button"
              onClick={() => setIsAddingNote(false)}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded"
            >
              Annuler
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Titre de la fiche *</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Tarifs des abonnements, Délais de livraison à Casablanca..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Catégorie</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-purple-600 focus:outline-none"
              >
                <option value="services">Services & Produits</option>
                <option value="tarifs">Tarifs & Devis</option>
                <option value="livraison">Livraison & Délais</option>
                <option value="faq">FAQ & Questions clients</option>
                <option value="politiques">Garanties & Retours</option>
                <option value="contact">Contact & Horaires</option>
                <option value="general">Présentation générale</option>
                <option value="custom">Autre / Personnalisé</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">Contenu & Détails pour l'IA *</label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={4}
              placeholder="Détaillez ici les faits réels : prix, étapes, conditions, délais, instructions que l'IA doit répéter fidèlement aux visiteurs..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20 leading-relaxed"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingNote(false)}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Enregistrer la note</span>
            </button>
          </div>
        </form>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans les notes de connaissances..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs shadow-sm placeholder:text-slate-400 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
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
                className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                  selectedCategory === catKey
                    ? 'bg-purple-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
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
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-slate-800 text-sm">Aucune note de connaissance trouvée</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchQuery 
              ? 'Aucun résultat ne correspond à votre recherche.' 
              : 'Commencez par scanner votre site web ou créez votre première note manuellement.'}
          </p>
          <button
            type="button"
            onClick={() => setIsAddingNote(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ajouter une première note</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNotes.map((note) => {
            const cat = CATEGORY_CONFIG[note.category] || CATEGORY_CONFIG.custom;
            const isCollapsed = Boolean(collapsedNotes[note.id]);

            return (
              <div
                key={note.id}
                className={`bg-white rounded-2xl border transition-all shadow-sm ${
                  note.enabled
                    ? 'border-slate-200 hover:border-slate-300'
                    : 'border-slate-200/60 opacity-60 bg-slate-50/50'
                }`}
              >
                {/* Note Top Bar */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Active Toggle Switch */}
                    <button
                      type="button"
                      onClick={() => handleToggleNote(note.id)}
                      title={note.enabled ? 'Désactiver cette note' : 'Activer cette note'}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        note.enabled ? 'bg-purple-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          note.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>

                    {/* Category badge */}
                    <div className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 ${cat.bg} ${cat.text} ${cat.border} border shrink-0`}>
                      {cat.icon}
                      <span>{cat.label}</span>
                    </div>

                    {/* Editable Title */}
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={note.title}
                        onChange={(e) => handleUpdateNoteField(note.id, 'title', e.target.value)}
                        className="w-full font-bold text-sm text-slate-900 bg-transparent hover:bg-slate-50 focus:bg-white focus:border focus:border-purple-600 px-2 py-1 rounded-lg outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {/* Actions Right */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {note.source === 'learned_conversation' && (
                      <span className="text-[10px] font-bold text-purple-700 bg-purple-100/90 border border-purple-200 px-2 py-1 rounded-md flex items-center gap-1 shadow-xs animate-in fade-in">
                        <Sparkles className="w-3 h-3 text-purple-600" /> Appris en discussion
                      </span>
                    )}
                    {note.source === 'scanned' && (
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-md hidden sm:inline-block">
                        🤖 Scan IA
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDuplicateNote(note)}
                      className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
                      title="Dupliquer la note"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Supprimer la note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleCollapse(note.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title={isCollapsed ? 'Déplier' : 'Replier'}
                    >
                      {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Note Content Area */}
                {!isCollapsed && (
                  <div className="p-4 sm:p-5 space-y-2">
                    <textarea
                      value={note.content}
                      onChange={(e) => handleUpdateNoteField(note.id, 'content', e.target.value)}
                      rows={Math.min(8, Math.max(3, note.content.split('\n').length + 1))}
                      placeholder="Contenu de la fiche pour l'IA..."
                      className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-800 focus:bg-white focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20 leading-relaxed font-sans"
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

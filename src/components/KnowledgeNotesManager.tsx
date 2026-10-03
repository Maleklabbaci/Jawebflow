import React, { useState, useRef, useEffect } from 'react';
import {
  Plus, Search, Trash2, Copy, Sparkles, Check,
  FileText, Globe, HelpCircle, Truck, DollarSign,
  ShieldCheck, Phone, Layers, ChevronDown, ChevronUp,
  Upload, X, AlertCircle, FileUp, Image, File, Mic, Send, Link2, Zap
} from 'lucide-react';
import { KnowledgeNote } from '../types';
import { supabase } from '../lib/supabase';
import { knowledgeGroupId, isKnowledgePending, knowledgeSourceLabel, normalizeKnowledgeCategory } from '../lib/knowledge';

interface KnowledgeNotesManagerProps {
  notes: KnowledgeNote[];
  onUpdateNotes: (notes: KnowledgeNote[]) => void;
  onScanClick: () => void;
  isScanning?: boolean;
  /** Identifiant de l'assistant : indispensable à l'« Ajout éclair » (le serveur refuse sans). */
  assistantId?: string;
  /**
   * Identifiant transmis à l'IMPORT de documents (le serveur compte alors l'import dans le quota de scans
   * et enregistre lui-même les fiches). Le tableau de bord ne le renseigne pas : l'import garde son
   * comportement actuel (le navigateur fusionne puis enregistre).
   */
  importAssistantId?: string;
  /** Ouvre le chat « Parler à mon IA » (plus complet que l'ajout éclair). */
  onOpenCopilot?: () => void;
}

// Catégories lisibles et communes à tous les métiers : les catégories
// historiques sont normalisées vers ces cinq groupes à l'affichage.
const GROUPS: { key: string; label: string; rep: string; icon: React.ReactNode }[] = [
  { key: 'products', label: 'Produits & services', rep: 'services', icon: <Layers className="w-3.5 h-3.5" /> },
  { key: 'pricing', label: 'Prix & promos', rep: 'tarifs', icon: <DollarSign className="w-3.5 h-3.5" /> },
  { key: 'delivery', label: 'Livraison & paiement', rep: 'livraison', icon: <Truck className="w-3.5 h-3.5" /> },
  { key: 'practical', label: 'Infos pratiques', rep: 'contact', icon: <Phone className="w-3.5 h-3.5" /> },
  { key: 'faq', label: 'Questions fréquentes & garanties', rep: 'faq', icon: <HelpCircle className="w-3.5 h-3.5" /> },
];
const groupOf = (category: string, context = '') => {
  const key = knowledgeGroupId(category, context);
  return GROUPS.find(group => group.key === key) || GROUPS[0];
};

interface SiteDoc { id: string; title: string; excerpt: string; sourceUrl: string; category?: string; type?: string; }

// ---------------------------------------------------------------------------
// Modal Import Universel
// ---------------------------------------------------------------------------

interface ImportModalProps {
  onClose: () => void;
  onImport: (notes: KnowledgeNote[]) => void;
  assistantId?: string;
}

const ImportModal: React.FC<ImportModalProps> = ({ onClose, onImport, assistantId }) => {
  const [rawText, setRawText] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming);
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...arr.filter(f => !names.has(f.name))];
    });
  };

  const removeFile = (name: string) => setFiles(prev => prev.filter(f => f.name !== name));

  const getFileIcon = (file: File) => {
    if (file.type === 'application/pdf') return <File className="w-4 h-4 text-red-500" />;
    if (file.type.startsWith('image/')) return <Image className="w-4 h-4 text-blue-500" />;
    return <FileText className="w-4 h-4 text-slate-500" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  };

  const handleAnalyze = async () => {
    if (!rawText.trim() && files.length === 0) {
      setError('Ajoutez du texte ou des fichiers.');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setSuccess('');

    try {
      // Jeton Supabase Auth (l'ancien `__jawebflow_user` Firebase n'était
      // jamais défini -> 401 silencieux sur l'import de documents).
      const token = (await supabase.auth.getSession()).data.session?.access_token || null;

      const formData = new FormData();
      formData.append('rawText', rawText);
      formData.append('siteUrl', siteUrl || 'https://monsite.com');
      if (assistantId) formData.append('assistantId', assistantId);
      formData.append('mode', 'merge');
      files.forEach(f => formData.append('files', f));

      const res = await fetch('/api/crawler/analyze', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de l'analyse.");
        return;
      }

      const newNotes: KnowledgeNote[] = (data.knowledgeNotes || []).map((n: any, i: number) => ({
        id: `imported_${Date.now()}_${i}`,
        title: n.title || 'Information importée',
        content: n.content || '',
        category: normalizeKnowledgeCategory(n.category, `${n.title || ''} ${n.content || ''}`),
        enabled: true,
        source: 'imported',
        approvalStatus: 'approved',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      setSuccess(`✅ ${newNotes.length} fiches créées !`);
      onImport(newNotes);
      setTimeout(onClose, 1500);
    } catch (e: any) {
      setError(e?.message || 'Erreur réseau.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const hasContent = rawText.trim().length > 0 || files.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Upload className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Importer des informations</h3>
              <p className="text-[11px] text-slate-500">Texte, PDF, catalogue ou document : vos informations sont organisées automatiquement</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">

          {/* Drop Zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.csv,.md,.json,.xlsx,.docx"
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
            <FileUp className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-slate-700">
              Glissez vos fichiers ici ou <span className="text-emerald-600">cliquez pour choisir</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">PDF, TXT, CSV, JSON, Excel... (le texte de tes images se colle dans la zone en dessous)</p>
          </div>

          {/* Fichiers sélectionnés */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map(file => (
                <div key={file.name} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  {getFileIcon(file)}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{file.name}</p>
                    <p className="text-[10px] text-slate-400">{formatSize(file.size)}</p>
                  </div>
                  <button onClick={() => removeFile(file.name)} className="p-1 hover:bg-slate-200 rounded-md transition-colors">
                    <X className="w-3 h-3 text-slate-400" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Séparateur */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[11px] text-slate-400 font-medium">OU collez du texte</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Texte */}
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            rows={6}
            placeholder={`Collez n'importe quoi :
• Texte copié de votre site, Facebook, Instagram
• Vos services et prix
• Catalogue produits
• FAQ, conditions de vente
• Horaires, adresse, contacts
• N'importe quel texte décrivant votre activité`}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed resize-none"
          />

          {/* URL optionnelle */}
          <input
            type="url"
            value={siteUrl}
            onChange={e => setSiteUrl(e.target.value)}
            placeholder="URL de votre site (optionnel) — ex: https://monsite.com"
            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-none"
          />

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
        <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <p className="text-[11px] text-slate-400">Les notes existantes ne seront pas supprimées</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">
              Annuler
            </button>
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !hasContent}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
            >
              {isAnalyzing ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Analyse en cours...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Ajouter ces informations</span>
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
  importAssistantId,
  onOpenCopilot,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [siteDocs, setSiteDocs] = useState<SiteDoc[]>([]);
  const [serverNotes, setServerNotes] = useState<KnowledgeNote[] | null>(null);
  const currentNotes = serverNotes ?? notes;
  const authHeaders = async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token || null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  const loadSiteDocs = async () => {
    if (!assistantId) { setSiteDocs([]); return; }
    try {
      const res = await fetch(`/api/knowledge/documents?assistantId=${encodeURIComponent(assistantId)}`, { headers: await authHeaders() });
      const data = await res.json().catch(() => ({}));
      setSiteDocs(Array.isArray(data.documents) ? data.documents : []);
    } catch { /* les fiches manuelles restent accessibles */ }
  };
  const loadNotes = async () => {
    if (!assistantId) { setServerNotes(null); return; }
    try {
      const res = await fetch(`/api/knowledge/entries?assistantId=${encodeURIComponent(assistantId)}`, { headers: await authHeaders() });
      if (!res.ok) { setServerNotes(null); return; }
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.entries)) {
        setServerNotes(data.entries.map((entry: any) => ({
          ...entry,
          id: String(entry.id || `kb_${Math.random().toString(36).slice(2, 9)}`),
          title: String(entry.title || 'Information'),
          content: String(entry.content || ''),
          category: normalizeKnowledgeCategory(entry.category, `${entry.title || ''} ${entry.content || ''}`),
          enabled: entry.enabled !== false,
          source: entry.source || 'manual',
          approvalStatus: entry.approvalStatus || entry.status,
        })));
      } else setServerNotes(null);
    } catch { setServerNotes(null); }
  };
  useEffect(() => { void loadSiteDocs(); void loadNotes(); /* eslint-disable-next-line */ }, [assistantId, isScanning]);
  const deleteSiteDoc = async (id: string) => {
    try {
      const res = await fetch(`/api/knowledge/documents?assistantId=${encodeURIComponent(assistantId || '')}&id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: await authHeaders() });
      if (!res.ok) throw new Error('Suppression refusée');
      setSiteDocs(d => d.filter(x => x.id !== id));
    } catch { await loadSiteDocs(); }
  };
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<KnowledgeNote['category']>('services');
  // Toutes les notes repliées par défaut
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  // 💬 AJOUT ÉCLAIR : on parle au bot comme à un commercial (« j'ai ajouté le
  // produit spiderman case iphone 13-16 ») -> fiche enregistrée direct (0,07 DA).
  const [quickMsg, setQuickMsg] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickLog, setQuickLog] = useState<{ role: 'user' | 'bot'; text: string }[]>([]);
  const [listening, setListening] = useState(false);
  const quickLogRef = useRef<HTMLDivElement | null>(null);
  const commitNotes = (updated: KnowledgeNote[]) => {
    setServerNotes(updated);
    onUpdateNotes(updated);
  };

  const sendQuickAdd = async () => {
    const msg = quickMsg.trim();
    if (!msg || quickBusy) return;
    setQuickLog((l) => [...l, { role: 'user', text: msg }]);
    setQuickMsg('');
    setQuickBusy(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || null;
      const res = await fetch('/api/knowledge/quick-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ assistantId, message: msg }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQuickLog((l) => [...l, { role: 'bot', text: '❌ ' + (data.error || 'Échec — réessaie.') }]);
      } else {
        if (Array.isArray(data.notes)) {
          commitNotes(data.notes.map((n: any) => ({
            ...n,
            id: n.id || 'qa_' + Math.random().toString(36).slice(2, 9),
            category: normalizeKnowledgeCategory(n.category, `${n.title || ''} ${n.content || ''}`),
            updatedAt: n.updatedAt || new Date().toISOString(),
          })));
        }
        const icon = data.action === 'delete' ? '🗑️ Supprimé' : data.action === 'update' ? '🔄 Mis à jour' : '✅ Enregistré';
        setQuickLog((l) => [...l, { role: 'bot', text: `${icon} : ${data.note?.title || ''}` }]);
      }
    } catch {
      setQuickLog((l) => [...l, { role: 'bot', text: '❌ Réseau indisponible.' }]);
    }
    setQuickBusy(false);
    setTimeout(() => quickLogRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }), 80);
  };

  const toggleMic = () => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setQuickLog((l) => [...l, { role: 'bot', text: '🎙️ La voix n\'est pas supportée par ce navigateur — tape le texte.' }]);
      return;
    }
    if (listening) { (toggleMic as any)._rec?.stop(); setListening(false); return; }
    const rec = new SR();
    (toggleMic as any)._rec = rec;
    rec.lang = 'fr-FR';
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const t = e.results?.[0]?.[0]?.transcript;
      if (t) setQuickMsg((m) => (m ? m + ' ' : '') + t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  };

  const handleToggleNote = (id: string) => {
    commitNotes(currentNotes.map(n => n.id === id ? { ...n, enabled: !n.enabled, updatedAt: new Date().toISOString() } : n));
  };

  const handleUpdateNoteField = (id: string, field: 'title' | 'content' | 'category', value: any) => {
    commitNotes(currentNotes.map(n => n.id === id ? {
      ...n,
      [field]: field === 'category' ? normalizeKnowledgeCategory(value, `${n.title} ${n.content}`) : value,
      updatedAt: new Date().toISOString(),
    } : n));
  };

  const handleDeleteNote = (id: string) => {
    commitNotes(currentNotes.filter(n => n.id !== id));
  };

  const handleApproveNote = (id: string) => {
    commitNotes(currentNotes.map(n => n.id === id ? {
      ...n,
      enabled: true,
      approvalStatus: 'approved',
      status: 'active',
      updatedAt: new Date().toISOString(),
    } : n));
  };

  const handleRejectNote = (id: string) => handleDeleteNote(id);

  const handleDuplicateNote = (note: KnowledgeNote) => {
    const dup: KnowledgeNote = {
      ...note,
      id: 'note_' + Math.random().toString(36).slice(2, 9),
      title: `${note.title} (Copie)`,
      source: 'manual',
      approvalStatus: 'approved',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    commitNotes([dup, ...currentNotes]);
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
      approvalStatus: 'approved',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    commitNotes([newNote, ...currentNotes]);
    setNewTitle(''); setNewContent(''); setNewCategory('services');
    setIsAddingNote(false);
  };

  const handleImport = (newNotes: KnowledgeNote[]) => {
    const newExpanded: Record<string, boolean> = {};
    newNotes.forEach(n => { if (n.id) newExpanded[n.id] = true; });
    setExpandedNotes(prev => ({ ...prev, ...newExpanded }));
    commitNotes([...newNotes, ...currentNotes]);
  };

  const toggleExpand = (id: string) => {
    setExpandedNotes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredNotes = currentNotes.filter(n => {
    const q = searchQuery.toLowerCase();
    const matchSearch = n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
    const matchCat = selectedCategory === 'all' || groupOf(n.category, `${n.title} ${n.content}`).key === selectedCategory;
    return matchSearch && matchCat;
  });

  const activeCount = currentNotes.filter(n => n.enabled && !isKnowledgePending(n)).length + siteDocs.length;
  const pendingCount = currentNotes.filter(n => isKnowledgePending(n)).length;
  const totalCount = currentNotes.length + siteDocs.length;
  const q = searchQuery.toLowerCase();
  const visibleDocs = siteDocs.filter(d => {
    const context = `${d.type || ''} ${d.title} ${d.excerpt}`;
    const matchCategory = selectedCategory === 'all' || groupOf(d.category || d.type || '', context).key === selectedCategory;
    return matchCategory && (d.title.toLowerCase().includes(q) || d.excerpt.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4">

      {isImporting && (
        <ImportModal
          onClose={() => setIsImporting(false)}
          onImport={handleImport}
          assistantId={importAssistantId}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-900">Mes informations</h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
              {activeCount} / {totalCount} actives
            </span>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />{pendingCount} fiche{pendingCount > 1 ? 's' : ''} à valider
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Source du bot synchronisée
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Fiches et contenus scannés, regroupés par thème et attribués à leur source, pour tout type d’activité.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={onScanClick}
            disabled={isScanning}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1.5 border border-slate-200 disabled:opacity-50 transition-colors"
          >
            <Sparkles className="w-3 h-3 text-purple-600" />
            {isScanning ? 'Scan...' : 'Scanner mon site'}
          </button>

          <button
            type="button"
            onClick={() => setIsImporting(true)}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Upload className="w-3 h-3" />
            Importer
          </button>

          <button
            type="button"
            onClick={() => setIsAddingNote(true)}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Plus className="w-3 h-3" />
            Ajouter
          </button>
        </div>
      </div>

      {/* 💬 AJOUT ÉCLAIR — discussion qui enregistre directement */}
      <div className="bg-white p-4 rounded-xl border-2 border-emerald-400/40 shadow-sm space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-emerald-600" />
          <span className="font-bold text-sm text-slate-900">Ajout éclair — dites-le, c'est enregistré</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Enregistrement direct</span>
        </div>
        {quickLog.length > 0 && (
          <div ref={quickLogRef} className="max-h-44 overflow-y-auto space-y-1.5 p-1">
            {quickLog.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <span className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-xs ${m.role === 'user' ? 'bg-purple-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md border border-slate-200'}`}>
                  {m.text}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={quickMsg}
            onChange={(e) => setQuickMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendQuickAdd(); } }}
            placeholder="Ex : ajout d'une prestation à 90 €, d'un lot grossiste ou d'un séjour de 5 nuits"
            className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            disabled={quickBusy}
          />
          <button
            type="button"
            onClick={toggleMic}
            title="Dicter"
            className={`p-2 rounded-lg border transition-colors ${listening ? 'bg-rose-100 border-rose-300 animate-pulse' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
          >
            <Mic className={`w-3.5 h-3.5 ${listening ? 'text-rose-600' : 'text-slate-600'}`} />
          </button>
          <button
            type="button"
            onClick={sendQuickAdd}
            disabled={quickBusy || !quickMsg.trim()}
            className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Send className="w-3 h-3" />
            {quickBusy ? '...' : 'Enregistrer'}
          </button>
        </div>
        <p className="text-[10px] text-slate-400">
          Produits, prestations, biens, séjours, tarifs, conditions ou coordonnées : une phrase suffit pour enrichir la base. Pour supprimer : « supprime la fiche … ».
          {onOpenCopilot && (
            <>
              {' '}Besoin de plus (modifier, régler le comportement, répondre aux commentaires…) ?{' '}
              <button type="button" onClick={onOpenCopilot} className="font-semibold text-purple-600 hover:underline cursor-pointer">
                Parle à ton IA
              </button>
              .
            </>
          )}
        </p>
      </div>

      {/* New Note Form */}
      {isAddingNote && (
        <form onSubmit={handleCreateNewNote} className="bg-white p-4 rounded-xl border-2 border-purple-400/30 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-slate-900">Nouvelle note</span>
            <button type="button" onClick={() => setIsAddingNote(false)} className="text-[11px] text-slate-400 hover:text-slate-600">Annuler</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Titre de la note..."
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-purple-500 focus:outline-none"
                required
              />
            </div>
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-purple-500 focus:outline-none"
            >
              <option value="services">Produits &amp; services</option><option value="tarifs">Prix &amp; promos</option><option value="livraison">Livraison &amp; paiement</option><option value="contact">Infos pratiques</option><option value="faq">Questions &amp; garanties</option>
            </select>
          </div>
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            rows={3}
            placeholder="Contenu de la note..."
            className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:border-purple-500 focus:outline-none leading-relaxed"
            required
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsAddingNote(false)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">Annuler</button>
            <button type="submit" className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5">
              <Check className="w-3 h-3" />
              Enregistrer
            </button>
          </div>
        </form>
      )}

      {/* Recherche + filtres communs à tous les secteurs */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans les fiches et documents..."
            className="w-full pl-8 pr-4 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 focus:border-purple-500 focus:outline-none shadow-sm"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap ${selectedCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            Tout ({totalCount})
          </button>
          {GROUPS.map(g => {
            const noteCount = currentNotes.filter(n => groupOf(n.category, `${n.title} ${n.content}`).key === g.key).length;
            const docCount = siteDocs.filter(d => groupOf(d.category || d.type || '', `${d.type || ''} ${d.title} ${d.excerpt}`).key === g.key).length;
            const count = noteCount + docCount;
            return (
              <button
                key={g.key}
                onClick={() => setSelectedCategory(g.key)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap flex items-center gap-1 ${selectedCategory === g.key ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
              >
                {g.icon}
                {g.label} ({count})
              </button>
            );
          })}
          {pendingCount > 0 && (
            <span className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap bg-amber-50 text-amber-800 border border-amber-200">
              {pendingCount} à valider
            </span>
          )}
        </div>
      </div>

      {/* Les fiches et les éléments du scan partagent les cinq groupes. */}
      {filteredNotes.length === 0 && visibleDocs.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mx-auto">
            <FileText className="w-5 h-5 text-purple-600" />
          </div>
          <h4 className="font-bold text-slate-800 text-sm">Aucune information ici</h4>
          <p className="text-xs text-slate-500">Ajoutez une fiche, importez un document ou scannez un site pour alimenter votre assistant.</p>
          <div className="flex items-center justify-center gap-2">
            <button type="button" onClick={() => setIsImporting(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold">
              <Upload className="w-3 h-3" />Importer
            </button>
            <button type="button" onClick={() => setIsAddingNote(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold">
              <Plus className="w-3 h-3" />Ajouter
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {GROUPS.map(g => {
            const items = filteredNotes.filter(n => groupOf(n.category, `${n.title} ${n.content}`).key === g.key);
            const docs = visibleDocs.filter(d => groupOf(d.category || d.type || '', `${d.type || ''} ${d.title} ${d.excerpt}`).key === g.key);
            const count = items.length + docs.length;
            if (!count) return null;
            const open = openGroups[g.key] ?? (searchQuery !== '' || count <= 5);
            return (
              <section key={g.key} aria-label={`Groupe ${g.label}`} className="bg-slate-50/60 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setOpenGroups(o => ({ ...o, [g.key]: !open }))}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                >
                  <span className="text-purple-600">{g.icon}</span>
                  <span className="flex-1 text-xs font-bold text-slate-800">{g.label}</span>
                  <span className="text-[11px] font-semibold text-slate-500">{count} élément{count > 1 ? 's' : ''}</span>
                  {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                </button>
                {open && <div className="space-y-2 px-2 pb-2">
                  {items.map(note => {
                    const pending = isKnowledgePending(note);
                    const enabled = note.enabled !== false && !pending;
                    const isExpanded = Boolean(expandedNotes[note.id]);
                    return (
                      <article
                        key={note.id}
                        className={`bg-white rounded-xl border transition-all ${pending ? 'border-amber-300 bg-amber-50/30' : enabled ? 'border-slate-200' : 'border-slate-200/60 opacity-70'}`}
                      >
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          {pending ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold shrink-0" title="Cette fiche ne sera pas utilisée par l'assistant avant validation.">
                              <Sparkles className="w-3 h-3" />À valider
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleNote(note.id)}
                              aria-pressed={enabled}
                              aria-label={`${enabled ? 'Désactiver' : 'Activer'} la fiche ${note.title}`}
                              title={enabled ? 'Utilisée par l’assistant — cliquer pour la mettre de côté' : 'Mise de côté — cliquer pour la réactiver'}
                              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${enabled ? 'bg-purple-600' : 'bg-slate-300'}`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                          )}
                          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border border-slate-200 bg-slate-50 text-slate-600 shrink-0">
                            {g.label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{note.title}</p>
                            {!isExpanded && <p className="text-[11px] text-slate-400 truncate">{note.content.slice(0, 100)}</p>}
                          </div>
                          <span className={`hidden md:inline text-[10px] px-1.5 py-0.5 rounded shrink-0 ${pending ? 'text-amber-800 bg-amber-100' : 'text-slate-500 bg-slate-100'}`}>
                            {knowledgeSourceLabel(note)}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {pending && <>
                              <button type="button" onClick={() => handleApproveNote(note.id)} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md" title="Valider et rendre cette fiche disponible au bot">
                                <Check className="w-3 h-3" />Valider
                              </button>
                              <button type="button" onClick={() => handleRejectNote(note.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded" title="Refuser cette fiche">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>}
                            {!pending && <button type="button" onClick={() => handleDuplicateNote(note)} className="p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors" title="Dupliquer cette fiche"><Copy className="w-3 h-3" /></button>}
                            <button type="button" onClick={() => handleDeleteNote(note.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors" title={pending ? 'Refuser cette fiche' : 'Supprimer cette fiche'}><Trash2 className="w-3 h-3" /></button>
                            <button type="button" onClick={() => toggleExpand(note.id)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors" aria-label={isExpanded ? 'Réduire' : 'Modifier la fiche'}>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="px-3 pb-3 space-y-2 border-t border-slate-100 pt-2">
                            <input
                              type="text"
                              value={note.title}
                              onChange={e => handleUpdateNoteField(note.id, 'title', e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:border-purple-500 focus:outline-none"
                            />
                            <textarea
                              value={note.content}
                              onChange={e => handleUpdateNoteField(note.id, 'content', e.target.value)}
                              rows={Math.min(6, Math.max(2, note.content.split('\n').length + 1))}
                              className="w-full px-2.5 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:border-purple-500 focus:outline-none leading-relaxed"
                            />
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span>{note.content.length} caractères · {knowledgeSourceLabel(note)}</span>
                              <select
                                value={groupOf(note.category, `${note.title} ${note.content}`).rep}
                                onChange={e => handleUpdateNoteField(note.id, 'category', e.target.value)}
                                className="text-[10px] bg-slate-100 border-0 rounded px-1.5 py-1 text-slate-600 focus:outline-none"
                                aria-label="Groupe de la fiche"
                              >
                                <option value="services">Produits &amp; services</option>
                                <option value="tarifs">Prix &amp; promos</option>
                                <option value="livraison">Livraison &amp; paiement</option>
                                <option value="contact">Infos pratiques</option>
                                <option value="faq">Questions &amp; garanties</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {docs.map(doc => (
                    <article key={doc.id} className="bg-white rounded-xl border border-slate-200 flex items-center gap-2 px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-50 border border-cyan-100 text-cyan-800 text-[10px] font-semibold shrink-0">
                        <Globe className="w-3 h-3" />Site scanné
                      </span>
                      <span className="hidden sm:inline text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{g.label}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{doc.title}</p>
                        <p className="text-[11px] text-slate-400 truncate">{doc.excerpt.slice(0, 120)}</p>
                      </div>
                      {doc.sourceUrl && <a href={doc.sourceUrl} target="_blank" rel="noreferrer" aria-label="Ouvrir la page source" className="p-1 text-slate-400 hover:text-purple-600"><Link2 className="w-3 h-3" /></a>}
                      <button type="button" onClick={() => deleteSiteDoc(doc.id)} aria-label="Supprimer ce document scanné" className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3 h-3" /></button>
                    </article>
                  ))}
                </div>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

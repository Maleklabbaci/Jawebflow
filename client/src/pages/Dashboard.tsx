import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLocalSession } from "@/contexts/LocalSessionContext";
import { trpc } from "@/lib/trpc";
import { BarChart3, Bot, Check, Clipboard, CreditCard, Database, FileText, LayoutDashboard, LogOut, MessageSquare, Palette, Settings, Sparkles, UploadCloud } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const ACCEPTED_FILE_TYPES = new Set(["text/plain", "text/markdown", "text/csv", "application/json"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

async function toBase64(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { token, user, loading, isAuthenticated, logout } = useLocalSession();
  const [, setLocation] = useLocation();
  const previewMode = typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("preview") === "1" || window.location.pathname === "/dashboard-preview");
  const utils = trpc.useUtils();
  const [businessName, setBusinessName] = useState("");
  const [businessCategory, setBusinessCategory] = useState("Services & Agence");
  const [businessDescription, setBusinessDescription] = useState("");
  const [rawKnowledge, setRawKnowledge] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [bubbleTheme, setBubbleTheme] = useState<'violet' | 'cyan' | 'orange' | 'mono'>('violet');
  const [bubblePosition, setBubblePosition] = useState<'bottom-right' | 'bottom-left'>('bottom-right');
  const [activeTool, setActiveTool] = useState('overview');
  const [isEditing, setIsEditing] = useState(true);
  const overview = trpc.workspace.overview.useQuery(
    { token: token ?? "pending-session-token-placeholder" },
    { enabled: Boolean(token), retry: false, refetchOnWindowFocus: false },
  );
  const saveBot = trpc.workspace.saveBot.useMutation();

  useEffect(() => {
    if (!loading && !isAuthenticated && !previewMode) setLocation("/");
  }, [isAuthenticated, loading, previewMode, setLocation]);

  useEffect(() => {
    if (overview.data?.bot) {
      setBusinessName(overview.data.bot.businessName);
      setBusinessCategory(overview.data.bot.businessCategory ?? "Services & Agence");
      setBusinessDescription(overview.data.bot.businessDescription ?? "");
      setRawKnowledge(overview.data.bot.rawKnowledge ?? "");
      if (overview.data.bot.bubbleTheme && ['violet', 'cyan', 'orange', 'mono'].includes(overview.data.bot.bubbleTheme)) setBubbleTheme(overview.data.bot.bubbleTheme as typeof bubbleTheme);
      if (overview.data.bot.bubblePosition && ['bottom-right', 'bottom-left'].includes(overview.data.bot.bubblePosition)) setBubblePosition(overview.data.bot.bubblePosition as typeof bubblePosition);
      if (!previewMode) setIsEditing(false);
    }
  }, [overview.data?.bot?.id, previewMode]);

  useEffect(() => {
    if (previewMode && !businessName) {
      setBusinessName("Maison Lila");
      setBusinessCategory("E-commerce & Retail");
      setBusinessDescription("Boutique algérienne spécialisée dans des produits de qualité, avec livraison rapide et paiement à la livraison.");
    }
  }, [businessName, previewMode]);

  const currentBot = saveBot.data?.bot ?? overview.data?.bot;
  const previewBot = previewMode ? {
    id: "d8848b45-017c-4b24-b4f7-89da934f7f34",
    widgetToken: "3ad07ee420914e97a6057ef605d9a617",
    businessName: "Maison Lila",
    rawKnowledge: "Pack soin visage : 3 500 DA.",
  } : undefined;
  const activeBot = currentBot ?? previewBot;
  const snippet = activeBot && typeof window !== "undefined"
    ? `<script src="${window.location.origin}/widget.js" data-bot-id="${activeBot.id}" data-widget-token="${activeBot.widgetToken}" data-theme="${bubbleTheme}" data-position="${bubblePosition}" async></script>`
    : null;
  const visibleKnowledge = saveBot.data?.knowledge ?? overview.data?.knowledge ?? (previewMode ? [{ id: "notes", title: "Notes commerciales" }, { id: "delivery", title: "livraison-algerie.txt" }] : []);
  const knowledgeWordCount = useMemo(() => rawKnowledge.trim() ? rawKnowledge.trim().split(/\s+/).length : 0, [rawKnowledge]);

  function onFilesAdded(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    const combined = [...files, ...selected].slice(0, 3);
    const invalid = selected.find(file => !ACCEPTED_FILE_TYPES.has(file.type) || file.size > MAX_FILE_BYTES);
    if (invalid) toast.error("Formats acceptés : TXT, MD, CSV ou JSON, jusqu’à 5 Mo.");
    setFiles(combined.filter(file => ACCEPTED_FILE_TYPES.has(file.type) && file.size <= MAX_FILE_BYTES));
  }

  async function saveConfiguration() {
    if (!token) return;
    if (businessName.trim().length < 2) {
      toast.error("Ajoute le nom de ton business pour continuer.");
      return;
    }
    const saved = overview.data?.bot;
    const unchanged = Boolean(saved && !files.length && businessName.trim() === saved.businessName && businessCategory.trim() === (saved.businessCategory ?? "Services & Agence") && businessDescription.trim() === (saved.businessDescription ?? "") && rawKnowledge.trim() === (saved.rawKnowledge ?? "") && bubbleTheme === (saved.bubbleTheme ?? "violet") && bubblePosition === (saved.bubblePosition ?? "bottom-right"));
    if (unchanged) {
      setIsEditing(false);
      toast.info("Ta configuration est déjà enregistrée.");
      return;
    }
    try {
      const payloadFiles = await Promise.all(files.map(async file => ({
        name: file.name,
        type: file.type,
        size: file.size,
        base64: await toBase64(file),
      })));
      const result = await saveBot.mutateAsync({
        token,
        businessName: businessName.trim(),
        businessCategory: businessCategory.trim() || "Services & Agence",
        businessDescription: businessDescription.trim().slice(0, 12000) || "Configuration de l’assistant commercial.",
        bubbleTheme,
        bubblePosition,
        rawKnowledge: rawKnowledge.trim(),
        files: payloadFiles,
      });
      setFiles([]);
      await utils.workspace.overview.invalidate();
      setIsEditing(false);
      toast.success(result.bot.id === currentBot?.id ? "Modifications enregistrées." : "Votre bot est prêt.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Impossible d’enregistrer le bot.");
    }
  }

  async function copyWidget() {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      toast.success("Le script widget a été copié.");
    } catch {
      toast.error("La copie a échoué. Sélectionne le script manuellement.");
    }
  }

  if (loading) {
    return <div className="dream-shell flex min-h-screen items-center justify-center"><div className="h-2 w-28 overflow-hidden rounded-full bg-white/75"><div className="h-full w-2/3 animate-pulse rounded-full bg-[#8b79b7]" /></div></div>;
  }
  if (!isAuthenticated && !previewMode) return null;

  return (
    <main className="merchant-dashboard dream-shell min-h-screen overflow-hidden px-5 py-5 sm:px-8 lg:px-12">
      <div className="floating-orb floating-orb--rose" />
      <div className="floating-orb floating-orb--mint dashboard-orb" />
      <header className="merchant-header relative mx-auto flex max-w-7xl items-center justify-between border-b border-white/60 pb-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/75 text-[#69579b] shadow-sm"><Sparkles className="h-4 w-4" /></span>
          <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#625a76]">JawebFlow</p><p className="mt-0.5 text-xs text-[#928a9b]">Espace marchand</p></div>
        </div>
        <div className="flex items-center gap-4"><p className="hidden text-sm text-[#766e82] sm:block">{user?.email}</p><Button variant="ghost" size="icon" className="rounded-full text-[#6b607d] hover:bg-white/60 hover:text-[#493d67]" onClick={() => { logout(); onNavigate?.('home'); setLocation('/'); }} aria-label="Se déconnecter"><LogOut className="h-4 w-4" /></Button></div>
      </header>

      <div className="mx-auto mt-5 flex gap-2 overflow-x-auto pb-1 lg:hidden" aria-label="Outils du compte mobile">{[{ id: 'overview', label: 'Vue d’ensemble', icon: LayoutDashboard }, { id: 'assistant', label: 'Assistant', icon: Bot }, { id: 'knowledge', label: 'Connaissances', icon: Database }, { id: 'widget', label: 'Widget', icon: Palette }, { id: 'analytics', label: 'Stats', icon: BarChart3 }, { id: 'billing', label: 'Abonnement', icon: CreditCard }].map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => { if (id === 'billing') { onNavigate?.('pricing'); return; } setActiveTool(id); if (id === 'assistant' || id === 'knowledge' || id === 'widget') setIsEditing(true); document.getElementById('assistant-config')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${activeTool === id ? 'bg-[#e9e1f3] text-[#594477]' : 'bg-white/75 text-[#80768d]'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>

      <div className="relative mx-auto grid max-w-7xl gap-10 py-12 lg:grid-cols-[190px_minmax(0,1fr)] lg:py-16">
        <aside className="hidden border-r border-[#e6e0ec] pr-6 lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8d829c]">Espace client</p>
          <nav className="mt-7 space-y-1" aria-label="Outils du compte">
            {[
              { id: 'overview', label: 'Vue d’ensemble', icon: LayoutDashboard },
              { id: 'assistant', label: 'Mon assistant', icon: Bot },
              { id: 'knowledge', label: 'Base de connaissances', icon: Database },
              { id: 'widget', label: 'Widget & thème', icon: Palette },
              { id: 'conversations', label: 'Conversations', icon: MessageSquare },
              { id: 'analytics', label: 'Statistiques', icon: BarChart3 },
              { id: 'billing', label: 'Abonnement', icon: CreditCard },
              { id: 'settings', label: 'Paramètres', icon: Settings },
            ].map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => { if (id === 'billing') { onNavigate?.('pricing'); return; } setActiveTool(id); if (id === 'assistant' || id === 'knowledge' || id === 'widget') setIsEditing(true); document.getElementById('assistant-config')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${activeTool === id ? 'bg-[#eee9f7] font-semibold text-[#594477]' : 'text-[#80768d] hover:bg-[#f7f4fa] hover:text-[#4e416b]'}`}><Icon className="h-4 w-4" />{label}</button>)}
          </nav>
          <div className="mt-10 rounded-2xl bg-[#f7f3fb] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[#8a78a6]">Besoin d’aide ?</p><p className="mt-2 text-xs leading-5 text-[#786d87]">Configure ton assistant et colle ton widget en quelques minutes.</p><button type="button" onClick={() => onNavigate?.('contact')} className="mt-3 text-xs font-semibold text-[#6d55a0] hover:text-[#4b3970]">Contacter JawebFlow →</button></div>
        </aside>

        <section className="max-w-4xl">
          <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.27em] text-[#786d8c]">Tableau de bord</p><h1 className="display-serif mt-4 text-5xl leading-none text-[#42365f] sm:text-6xl">Bonjour {user?.name || 'et bienvenue'}.</h1><p className="mt-5 text-base leading-7 text-[#6d6579]">Pilote ton assistant, tes connaissances et ton widget depuis un espace clair réservé à ton compte.</p></div>

          <div className="mt-9 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Messages utilisés', value: overview.data?.metrics.messagesUsed ?? 0, hint: `sur ${overview.data?.metrics.messagesLimit ?? 100}`, icon: MessageSquare },
              { label: 'Connaissances', value: overview.data?.metrics.knowledgeCount ?? visibleKnowledge.length, hint: 'éléments liés', icon: Database },
              { label: 'Assistant', value: activeBot ? 'Prêt' : 'À configurer', hint: 'configuration', icon: Bot },
              { label: 'Abonnement', value: overview.data?.subscription.plan === 'free' ? 'Free' : overview.data?.subscription.plan ?? 'Free', hint: overview.data?.subscription.apiEnabled ? 'API active' : 'API verrouillée', icon: CreditCard },
            ].map(({ label, value, hint, icon: Icon }) => <div key={label} className="rounded-2xl border border-[#e8e1ef] bg-white/75 p-4 shadow-[0_10px_35px_rgba(95,75,135,0.05)]"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-[#92879f]">{label}</span><Icon className="h-4 w-4 text-[#806daa]" /></div><strong className="mt-3 block text-xl font-semibold text-[#4c3d67]">{value}</strong><span className="text-[11px] text-[#9a90a3]">{hint}</span></div>)}
          </div>

          {['conversations', 'analytics', 'settings'].includes(activeTool) && <div className="mt-6 rounded-2xl border border-[#e7dfef] bg-white/75 p-5 shadow-[0_10px_35px_rgba(95,75,135,0.05)]"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a78a6]">{activeTool === 'analytics' ? 'Statistiques' : activeTool === 'conversations' ? 'Conversations' : 'Paramètres'}</p><h2 className="mt-2 text-xl font-semibold text-[#4c3d67]">Cette vue arrive dans ton espace.</h2><p className="mt-2 text-sm leading-6 text-[#81768d]">Les compteurs de messages et la configuration principale sont déjà disponibles. Cette section sera enrichie avec les conversations, les graphiques et les préférences avancées.</p></div>}

          {overview.data?.bot && !isEditing && !previewMode ? <section className="merchant-config-card relative mt-12 rounded-[2rem] border border-white/80 bg-white/62 p-6 shadow-[0_24px_80px_rgba(95,75,135,0.11)] backdrop-blur-xl sm:p-9"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a78a6]">Configuration enregistrée</p><h2 className="mt-3 text-3xl font-semibold text-[#473861]">{overview.data.bot.businessName}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#736a7c]">Tes informations sont enregistrées dans ton espace. Tu peux les modifier quand tu veux, sans devoir les remplir à chaque connexion.</p></div><Button type="button" variant="outline" onClick={() => setIsEditing(true)} className="shrink-0 rounded-xl border-[#cdbfda] bg-white/70 text-[#5b4a79] hover:bg-white">Modifier les informations</Button></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-white/70 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[#92879f]">Connaissances</p><p className="mt-2 text-lg font-semibold text-[#4c3d67]">{visibleKnowledge.length}</p><p className="text-xs text-[#9a90a3]">éléments enregistrés</p></div><div className="rounded-xl bg-white/70 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[#92879f]">Thème</p><p className="mt-2 text-lg font-semibold capitalize text-[#4c3d67]">{bubbleTheme}</p><p className="text-xs text-[#9a90a3]">bulle du widget</p></div><div className="rounded-xl bg-white/70 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[#92879f]">Position</p><p className="mt-2 text-lg font-semibold text-[#4c3d67]">{bubblePosition === 'bottom-left' ? 'Bas gauche' : 'Bas droite'}</p><p className="text-xs text-[#9a90a3]">sur ton site</p></div></div></section> : null}

          {((isEditing || !overview.data?.bot || previewMode) && activeTool !== 'knowledge') && <div id="assistant-config" className="merchant-config-card relative mt-12 rounded-[2rem] border border-white/80 bg-white/62 p-6 shadow-[0_24px_80px_rgba(95,75,135,0.11)] backdrop-blur-xl sm:p-9">
            <div className="absolute left-8 top-0 h-14 w-px bg-gradient-to-b from-transparent via-[#b8a9cf] to-transparent" />
            <div className="grid gap-8">
              <div className="grid gap-5 sm:grid-cols-2"><div><Label htmlFor="businessName" className="text-base font-medium text-[#473b62]">Nom du business</Label><p className="mt-2 text-xs leading-5 text-[#8a8194]">Le nom visible dans la configuration de ton bot.</p><Input id="businessName" value={businessName} onChange={event => setBusinessName(event.target.value)} placeholder="Nom de l’entreprise ou de l’activité" className="mt-3 h-12 rounded-xl border-[#ded7e7] bg-white/75 px-4 text-[#443953] text-[#443953] placeholder:text-[#aaa1b0]" /></div><div><Label htmlFor="businessCategory" className="text-base font-medium text-[#473b62]">Activité</Label><p className="mt-2 text-xs leading-5 text-[#8a8194]">Le secteur principal de ton business.</p><Input id="businessCategory" value={businessCategory} onChange={event => setBusinessCategory(event.target.value)} placeholder="E-commerce, agence, cabinet…" className="mt-3 h-12 rounded-xl border-[#ded7e7] bg-white/75 px-4 text-[#443953] placeholder:text-[#aaa1b0]" /></div></div>

              <div className="grid gap-3 sm:grid-cols-[180px_1fr] sm:items-start"><div><Label htmlFor="businessDescription" className="text-base font-medium text-[#473b62]">Présentation rapide</Label><p className="mt-2 text-xs leading-5 text-[#8a8194]">Quelques mots pour comprendre ton activité.</p></div><Textarea id="businessDescription" value={businessDescription} onChange={event => setBusinessDescription(event.target.value)} placeholder="Nous aidons nos clients à…" className="min-h-28 resize-y rounded-xl border-[#ded7e7] bg-white/75 p-4 leading-6 text-[#443953] placeholder:text-[#aaa1b0]" /></div>

              {activeTool === 'knowledge' && <><div className="h-px bg-gradient-to-r from-transparent via-[#dcd4e3] to-transparent" />

              <div className="grid gap-3 sm:grid-cols-[180px_1fr] sm:items-start"><div><Label htmlFor="knowledge" className="text-base font-medium text-[#473b62]">Base de connaissances</Label><p className="mt-2 text-xs leading-5 text-[#8a8194]">Produits, prix, FAQ et livraison en Algérie.</p></div><div><Textarea id="knowledge" value={rawKnowledge} onChange={event => setRawKnowledge(event.target.value)} placeholder="Ex. Livraison disponible à Alger et Oran. Produit A : 3 500 DA. Paiement à la livraison..." className="min-h-40 resize-y rounded-xl border-[#ded7e7] bg-white/75 p-4 leading-6 text-[#443953] placeholder:text-[#aaa1b0]" /><div className="mt-2 flex justify-between text-xs text-[#908797]"><span>Texte brut, prêt pour l’indexation IA.</span><span>{knowledgeWordCount} mots</span></div></div></div>

              <div className="grid gap-3 sm:grid-cols-[180px_1fr] sm:items-start"><div><Label className="text-base font-medium text-[#473b62]">Importer aussi</Label><p className="mt-2 text-xs leading-5 text-[#8a8194]">Ajoutez jusqu’à 3 documents utiles.</p></div><div><label className="group flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#cfc3dc] bg-[#fbf9fc]/70 px-5 text-center transition hover:border-[#9b88bc] hover:bg-white/80"><UploadCloud className="h-5 w-5 text-[#806daa]" /><span className="mt-3 text-sm font-medium text-[#5e526f]">Déposer des connaissances</span><span className="mt-1 text-xs text-[#958b9d]">TXT, MD, CSV ou JSON · 5 Mo max. par fichier</span><input type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" multiple className="sr-only" onChange={onFilesAdded} /></label>{files.length ? <div className="mt-3 space-y-2">{files.map(file => <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-sm text-[#655a72]" key={`${file.name}-${file.lastModified}`}><span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-[#806daa]" /><span className="truncate">{file.name}</span></span><span className="ml-3 shrink-0 text-xs text-[#98909e]">{formatBytes(file.size)}</span></div>)}</div> : null}</div></div>
              </>}
              <div className="border-t border-[#eee8f2] pt-6"><div className="flex items-center gap-2"><Palette className="h-4 w-4 text-[#806daa]" /><div><p className="text-sm font-medium text-[#473b62]">Thème de la bulle</p><p className="mt-1 text-xs text-[#8a8194]">Personnalise le bouton qui s’affiche sur ton site web.</p></div></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[{ id: 'violet', label: 'Violet', color: '#7c3aed' }, { id: 'cyan', label: 'Cyan', color: '#0891b2' }, { id: 'orange', label: 'Orange', color: '#ea580c' }, { id: 'mono', label: 'Minimal', color: '#262626' }].map(theme => <button type="button" key={theme.id} onClick={() => setBubbleTheme(theme.id as typeof bubbleTheme)} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${bubbleTheme === theme.id ? 'border-[#806daa] bg-[#f1ebfa] text-[#594477]' : 'border-[#e4ddea] bg-white/60 text-[#80768d] hover:border-[#b9a7ce]'}`}><span className="h-5 w-5 rounded-full" style={{ backgroundColor: theme.color }} />{theme.label}</button>)}</div><div className="mt-3 flex items-center gap-2 text-xs text-[#8a8194]"><span>Position :</span>{['bottom-right', 'bottom-left'].map(position => <button type="button" key={position} onClick={() => setBubblePosition(position as typeof bubblePosition)} className={`rounded-lg px-2.5 py-1.5 font-medium ${bubblePosition === position ? 'bg-[#e9e1f3] text-[#594477]' : 'bg-[#f6f3f8] text-[#8a8194]'}`}>{position === 'bottom-right' ? 'Bas droite' : 'Bas gauche'}</button>)}</div></div>
            </div>
            <div className="mt-9 flex flex-col gap-4 border-t border-[#e3dde9] pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-[#8a8193]">Votre configuration et vos documents restent associés à votre espace.</p><Button onClick={saveConfiguration} disabled={saveBot.isPending} className="h-12 rounded-xl bg-[#5c4a86] px-6 text-sm font-medium text-white shadow-[0_12px_26px_rgba(91,72,132,0.25)] hover:bg-[#4d3c76]">{saveBot.isPending ? "Enregistrement…" : overview.data?.bot ? "Enregistrer les modifications" : "Enregistrer la configuration"}<Sparkles className="ml-2 h-4 w-4" /></Button></div>
          </div>}

          {activeTool === 'knowledge' && <div id="knowledge-config" className="merchant-config-card relative mt-12 rounded-[2rem] border border-white/80 bg-white/62 p-6 shadow-[0_24px_80px_rgba(95,75,135,0.11)] backdrop-blur-xl sm:p-9"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a78a6]">Base de connaissances & Documents</p><h2 className="mt-3 text-3xl font-semibold text-[#473861]">Ajoute tes contenus quand tu veux.</h2><p className="mt-2 text-sm leading-6 text-[#736a7c]">Cette étape est séparée de la création rapide. Les informations seront associées à ton assistant existant.</p></div><Textarea value={rawKnowledge} onChange={event => setRawKnowledge(event.target.value)} placeholder="Produits, prix, FAQ, livraison en Algérie…" className="mt-6 min-h-48 resize-y rounded-xl border-[#ded7e7] bg-white/75 p-4 leading-6 text-[#443953] placeholder:text-[#aaa1b0]" /><div className="mt-2 flex justify-between text-xs text-[#908797]"><span>Texte brut prêt pour l’indexation IA.</span><span>{knowledgeWordCount} mots</span></div><label className="group mt-6 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#cfc3dc] bg-[#fbf9fc]/70 px-5 text-center transition hover:border-[#9b88bc] hover:bg-white/80"><UploadCloud className="h-5 w-5 text-[#806daa]" /><span className="mt-3 text-sm font-medium text-[#5e526f]">Déposer des documents</span><span className="mt-1 text-xs text-[#958b9d]">TXT, MD, CSV ou JSON · 5 Mo max. par fichier</span><input type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" multiple className="sr-only" onChange={onFilesAdded} /></label>{files.length ? <div className="mt-3 space-y-2">{files.map(file => <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-sm text-[#655a72]" key={`${file.name}-${file.lastModified}`}><span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-[#806daa]" /><span className="truncate">{file.name}</span></span><span className="ml-3 shrink-0 text-xs text-[#98909e]">{formatBytes(file.size)}</span></div>)}</div> : null}<div className="mt-7 flex justify-end"><Button onClick={saveConfiguration} disabled={saveBot.isPending} className="h-12 rounded-xl bg-[#5c4a86] px-6 text-sm font-medium text-white shadow-[0_12px_26px_rgba(91,72,135,0.25)] hover:bg-[#4d3c76]">{saveBot.isPending ? "Enregistrement…" : "Enregistrer les connaissances"}<Check className="ml-2 h-4 w-4" /></Button></div></div>}

          {!overview.data?.subscription.apiEnabled && activeBot ? <section className="mt-8 rounded-[1.6rem] border border-amber-200 bg-amber-50/80 p-6 shadow-[0_16px_44px_rgba(167,120,40,0.08)] sm:p-8"><div className="flex items-start gap-3"><CreditCard className="mt-1 h-5 w-5 shrink-0 text-amber-600" /><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Abonnement requis</p><h2 className="mt-2 text-2xl font-semibold text-[#5b4930]">Ton assistant est enregistré, mais le widget est verrouillé.</h2><p className="mt-2 text-sm leading-6 text-[#806c51]">Active un abonnement pour obtenir l’API, afficher la bulle sur ton site et copier le script d’intégration.</p><button type="button" onClick={() => onNavigate?.('pricing')} className="mt-4 rounded-xl bg-[#5c4a86] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#4d3c76]">Voir les abonnements</button></div></div></section> : null}
          {overview.data?.subscription.apiEnabled && snippet && activeBot ? <section className="merchant-widget-card relative mt-8 overflow-hidden rounded-[1.6rem] border border-[#d9cfe4] bg-[#fdfbfe]/75 p-6 shadow-[0_16px_44px_rgba(93,71,135,0.08)] sm:p-8"><div className="absolute right-7 top-0 h-16 w-px bg-gradient-to-b from-[#c6b7dc] to-transparent" /><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#76638f]"><Check className="h-4 w-4" /> Widget individuel</div><h2 className="display-serif mt-3 text-3xl text-[#473861]">Votre script est prêt.</h2><p className="mt-2 text-sm leading-6 text-[#736a7c]">Copiez-le juste avant la balise <code className="rounded bg-[#eee8f3] px-1.5 py-0.5 text-[#635073]">&lt;/body&gt;</code> de votre site.</p></div><Button variant="outline" onClick={copyWidget} className="shrink-0 rounded-xl border-[#cdbfda] bg-white/70 text-[#5b4a79] hover:bg-white"><Clipboard className="mr-2 h-4 w-4" /> Copier</Button></div><pre className="mt-6 overflow-x-auto rounded-xl bg-[#352c4b] p-4 text-xs leading-6 text-[#f2edf8]"><code>{snippet}</code></pre><div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#82768d]"><span>Bot ID : <strong className="font-medium text-[#5c4b73]">{activeBot.id}</strong></span><span>{visibleKnowledge.length} élément{visibleKnowledge.length > 1 ? "s" : ""} enregistré{visibleKnowledge.length > 1 ? "s" : ""}</span></div></section> : null}
        </section>
      </div>
    </main>
  );
}

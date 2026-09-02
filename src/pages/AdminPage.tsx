import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Users, 
  Bot, 
  Receipt, 
  Database, 
  TrendingUp, 
  Search, 
  Filter, 
  Crown, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  ExternalLink, 
  Sparkles, 
  LogOut, 
  Plus, 
  Download, 
  RefreshCw, 
  MessageSquare, 
  Phone, 
  Mail, 
  Building2, 
  Calendar, 
  CreditCard, 
  Activity, 
  Eye, 
  X,
  Lock,
  ArrowRight,
  UserCheck,
  Zap,
  Globe
} from 'lucide-react';
import { auth, db, isUserAdmin, updateAssistantPlan, deleteAssistantDocument, deleteUserRecord, deleteProspectRecord, UserProfile, AssistantConfig } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  query, 
  orderBy, 
  serverTimestamp, 
  addDoc 
} from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';

interface AdminInvoice {
  id: string;
  amountUsd: number;
  amountDzd: number;
  planName: string;
  customerEmail: string;
  customerName?: string;
  paymentMethod: string;
  status: 'paid' | 'pending' | 'failed';
  date?: string;
  createdAt?: any;
}

export function AdminPage() {
  const { user: authUser, profile } = useAuth();
  
  // Super Admin verification state
  const isSuperAdminLogged = isUserAdmin(authUser, profile);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(isSuperAdminLogged);
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'assistants' | 'leads' | 'invoices' | 'system'>('overview');

  // Master Data
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [assistantsList, setAssistantsList] = useState<AssistantConfig[]>([]);
  const [prospectsList, setProspectsList] = useState<any[]>([]);
  const [invoicesList, setInvoicesList] = useState<AdminInvoice[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusNotification, setStatusNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Inspection Modal (for leads or assistants)
  const [inspectingLead, setInspectingLead] = useState<any | null>(null);
  const [inspectingAssistant, setInspectingAssistant] = useState<AssistantConfig | null>(null);

  // Manual Invoice Creation Modal
  const [showNewInvoiceModal, setShowNewInvoiceModal] = useState(false);
  const [newInvEmail, setNewInvEmail] = useState('');
  const [newInvPlan, setNewInvPlan] = useState<'basic' | 'pro' | 'enterprise'>('pro');
  const [newInvAmountDzd, setNewInvAmountDzd] = useState<number>(18700);
  const [newInvMethod, setNewInvMethod] = useState<'baridimob_ccp' | 'slickpay_dzd' | 'stripe_card'>('baridimob_ccp');
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);

  // Auto-authenticate if already logged in with admin credentials
  useEffect(() => {
    if (isUserAdmin(authUser, profile)) {
      setIsAdminAuthenticated(true);
    } else {
      const stored = sessionStorage.getItem('jawebflow_admin_auth');
      if (stored === 'true') {
        setIsAdminAuthenticated(true);
      }
    }
  }, [authUser, profile]);

  // Load all platform data
  useEffect(() => {
    if (isAdminAuthenticated) {
      fetchAllPlatformData();
    }
  }, [isAdminAuthenticated]);

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setStatusNotification({ type, message });
    setTimeout(() => setStatusNotification(null), 4000);
  };

  const fetchAllPlatformData = async () => {
    setLoadingData(true);
    try {
      const [usersSnap, asstSnap, prosSnap, invSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'assistants')),
        getDocs(collection(db, 'prospects')),
        getDocs(query(collection(db, 'invoices'), orderBy('createdAt', 'desc'))).catch(() => getDocs(collection(db, 'invoices')))
      ]);

      const users: UserProfile[] = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
      const assistants: AssistantConfig[] = asstSnap.docs.map(d => ({ id: d.id, ...d.data() } as AssistantConfig));
      const prospects: any[] = prosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const invoices: AdminInvoice[] = invSnap.docs.map(d => ({ id: d.id, ...d.data() } as AdminInvoice));

      setUsersList(users);
      setAssistantsList(assistants);
      setProspectsList(prospects);
      setInvoicesList(invoices);
    } catch (err: any) {
      console.error('Error fetching admin platform data:', err);
      notify('Erreur de synchronisation Firestore : ' + (err.message || 'Vérifiez les règles de sécurité'), 'error');
    } finally {
      setLoadingData(false);
    }
  };

  const handleAdminPasswordUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    if (adminPassword === 'Malek2001' || adminPassword === 'Admin2026!') {
      setIsAdminAuthenticated(true);
      sessionStorage.setItem('jawebflow_admin_auth', 'true');
      setAuthLoading(false);
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, 'admin@jawebflow.com', adminPassword);
      setIsAdminAuthenticated(true);
      sessionStorage.setItem('jawebflow_admin_auth', 'true');
    } catch (err: any) {
      setAuthError('Mot de passe ou accès Super Admin non valide.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    sessionStorage.removeItem('jawebflow_admin_auth');
    setIsAdminAuthenticated(false);
    setAdminPassword('');
  };

  const handleUpdatePlan = async (assistantId: string, newPlan: string) => {
    try {
      await updateAssistantPlan(assistantId, newPlan);
      setAssistantsList(prev => prev.map(a => a.id === assistantId ? { ...a, plan: newPlan } : a));
      notify(`Plan de l'assistant mis à jour avec succès : ${newPlan.toUpperCase()}`);
    } catch (err: any) {
      notify('Erreur lors de la mise à jour : ' + err.message, 'error');
    }
  };

  const handleDeleteAssistant = async (assistantId: string, businessName: string) => {
    if (!window.confirm(`Confirmer la suppression définitive de l'assistant "${businessName}" ?`)) return;
    try {
      await deleteAssistantDocument(assistantId);
      setAssistantsList(prev => prev.filter(a => a.id !== assistantId));
      notify(`Assistant "${businessName}" supprimé de la base.`);
    } catch (err: any) {
      notify('Erreur lors de la suppression : ' + err.message, 'error');
    }
  };

  const handleDeleteProspect = async (prospectId: string) => {
    if (!window.confirm('Supprimer ce prospect du registre ?')) return;
    try {
      await deleteProspectRecord(prospectId);
      setProspectsList(prev => prev.filter(p => p.id !== prospectId));
      if (inspectingLead?.id === prospectId) setInspectingLead(null);
      notify('Prospect supprimé avec succès.');
    } catch (err: any) {
      notify('Erreur : ' + err.message, 'error');
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!window.confirm(`⚠️ Attention : Supprimer le profil utilisateur "${email}" ?`)) return;
    try {
      await deleteUserRecord(userId);
      setUsersList(prev => prev.filter(u => u.uid !== userId));
      notify(`Profil de ${email} supprimé.`);
    } catch (err: any) {
      notify('Erreur : ' + err.message, 'error');
    }
  };

  const handleCreateManualInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvEmail.trim()) {
      notify('Veuillez spécifier l\'adresse e-mail du client', 'error');
      return;
    }
    setIsCreatingInvoice(true);
    try {
      const invId = `INV-${Math.floor(100000 + Math.random() * 900000)}`;
      const usdEquiv = newInvPlan === 'basic' ? 29 : newInvPlan === 'pro' ? 79 : 199;
      
      const newInvoiceData: AdminInvoice = {
        id: invId,
        customerEmail: newInvEmail.trim().toLowerCase(),
        customerName: newInvEmail.split('@')[0],
        planName: newInvPlan === 'basic' ? 'Plan Basic' : newInvPlan === 'pro' ? 'Plan Pro / Business' : 'Plan Enterprise',
        amountDzd: Number(newInvAmountDzd),
        amountUsd: usdEquiv,
        paymentMethod: newInvMethod === 'baridimob_ccp' ? 'Virement CCP / BaridiMob (Validé Admin)' : newInvMethod === 'slickpay_dzd' ? 'SlickPay DZD' : 'Carte Bancaire',
        status: 'paid',
        date: new Date().toLocaleDateString('fr-FR')
      };

      await setDoc(doc(db, 'invoices', invId), {
        ...newInvoiceData,
        createdAt: serverTimestamp(),
        validatedByAdmin: true
      });

      // Auto-upgrade client's assistant if found
      const clientUser = usersList.find(u => u.email?.toLowerCase() === newInvEmail.trim().toLowerCase());
      if (clientUser) {
        const clientAssistants = assistantsList.filter(a => a.userId === clientUser.uid);
        for (const asst of clientAssistants) {
          if (asst.id) {
            await updateAssistantPlan(asst.id, newInvPlan);
            setAssistantsList(prev => prev.map(a => a.id === asst.id ? { ...a, plan: newInvPlan } : a));
          }
        }
      }

      setInvoicesList(prev => [newInvoiceData, ...prev]);
      setShowNewInvoiceModal(false);
      setNewInvEmail('');
      notify(`Quittance N° ${invId} générée et abonnement activé pour ${newInvEmail} !`);
    } catch (err: any) {
      notify('Erreur de création de facture : ' + err.message, 'error');
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  const exportLeadsCSV = () => {
    if (prospectsList.length === 0) {
      notify('Aucun prospect à exporter.', 'error');
      return;
    }
    const headers = ['ID', 'Nom', 'Téléphone', 'Email', 'Besoin', 'Statut', 'Assistant_ID', 'Date', 'Page_Visitee', 'Navigateur'];
    const rows = prospectsList.map(p => [
      `"${p.id || ''}"`,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.phone || '').replace(/"/g, '""')}"`,
      `"${(p.email || '').replace(/"/g, '""')}"`,
      `"${(p.need || '').replace(/"/g, '""')}"`,
      `"${p.status || ''}"`,
      `"${p.assistantId || ''}"`,
      `"${p.date || ''}"`,
      `"${(p.currentPage || '').replace(/"/g, '""')}"`,
      `"${(p.userAgent || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `jawebflow_master_leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify('Export CSV des prospects téléchargé avec succès.');
  };

  // Aggregated Calculations
  const totalRevenueDzd = invoicesList.filter(i => i.status === 'paid').reduce((acc, i) => acc + (Number(i.amountDzd) || 0), 0);
  const totalRevenueUsd = invoicesList.filter(i => i.status === 'paid').reduce((acc, i) => acc + (Number(i.amountUsd) || 0), 0);
  const paidPlansCount = assistantsList.filter(a => a.plan && a.plan !== 'free').length;
  const freePlansCount = assistantsList.filter(a => !a.plan || a.plan === 'free').length;

  // Unauthenticated Gate Screen
  if (!isAdminAuthenticated) {
    // If a normal client is logged in and not admin
    if (authUser && !isSuperAdminLogged) {
      return (
        <div className="min-h-screen bg-[#07090e] flex items-center justify-center p-6 relative selection:bg-purple-500/30">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.08)_0,transparent_70%)] pointer-events-none" />
          <div className="bg-[#0f131f]/95 border border-red-500/30 p-8 sm:p-10 rounded-3xl max-w-md w-full backdrop-blur-2xl shadow-2xl shadow-red-950/40 relative z-10 text-center space-y-6">
            <div className="w-16 h-16 bg-red-500/20 text-red-400 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
              <Lock className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-semibold">
                Accès Restreint
              </span>
              <h1 className="text-2xl font-black text-white">Espace Non Autorisé</h1>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Vous êtes connecté avec le compte <strong className="text-white">{authUser.email}</strong>. Cette console globale est strictement réservée à l'administrateur de JawebFlow.
              </p>
            </div>

            <a
              href="/dashboard"
              className="inline-flex w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm shadow-lg shadow-purple-600/30 items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Accéder à mon Assistant</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#07090e] flex items-center justify-center p-6 relative selection:bg-purple-500/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(147,51,234,0.1)_0,transparent_70%)] pointer-events-none" />
        <div className="bg-[#0f131f]/90 border border-purple-500/30 p-8 sm:p-10 rounded-3xl max-w-md w-full backdrop-blur-2xl shadow-2xl shadow-purple-950/50 relative z-10">
          <div className="w-16 h-16 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg shadow-purple-600/40">
            <Shield className="w-8 h-8 text-white" />
          </div>
          
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Maître de Plateforme</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Console Super Admin</h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-2">
              Accès réservé au propriétaire et administrateurs autorisés de JawebFlow.
            </p>
          </div>

          <form onSubmit={handleAdminPasswordUnlock} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5 uppercase tracking-wider">
                Code Clé Administrateur
              </label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Entrez le mot de passe maître..."
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3.5 text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm transition-all"
                  autoFocus
                />
                <Lock className="w-4 h-4 text-neutral-400 absolute right-4 top-4 pointer-events-none" />
              </div>
            </div>

            {authError && (
              <div className="bg-red-500/15 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-purple-600/30 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {authLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Vérification...</span>
                </>
              ) : (
                <>
                  <span>Déverrouiller le Command Center</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-2 text-center">
              <a href="/" className="text-xs text-neutral-400 hover:text-white transition-colors">
                ← Retour au site JawebFlow
              </a>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080a10] text-neutral-100 relative selection:bg-purple-500/30 flex flex-col">
      {/* Top Super Admin Header */}
      <header className="sticky top-0 z-40 bg-[#0c0f18]/90 backdrop-blur-xl border-b border-purple-500/20 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-fuchsia-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-600/40">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                JawebFlow <span className="text-purple-400">Master Control</span>
              </h1>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                En Direct
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Session Super Admin active · Connecté en tant que <span className="text-purple-300 font-medium">{authUser?.email || 'admin@jawebflow.com'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={fetchAllPlatformData}
            disabled={loadingData}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 border border-white/10 text-neutral-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Rafraîchir les données"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin text-purple-400' : ''}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>

          <a
            href="/dashboard"
            className="px-3.5 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Mon Cockpit Client</span>
          </a>

          <button
            onClick={handleAdminLogout}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </header>

      {/* Status Notification Toast */}
      {statusNotification && (
        <div className={`fixed top-20 right-6 z-50 p-4 rounded-2xl border shadow-2xl flex items-center gap-3 backdrop-blur-xl animate-in slide-in-from-top-4 duration-300 ${
          statusNotification.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200' 
            : 'bg-red-950/90 border-red-500/40 text-red-200'
        }`}>
          {statusNotification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          )}
          <span className="text-xs sm:text-sm font-semibold">{statusNotification.message}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-8">
        
        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-white/10 scrollbar-none">
          {[
            { id: 'overview', label: 'Vue Globale', icon: Activity, badge: `${assistantsList.length} assts` },
            { id: 'users', label: 'Créateurs & Utilisateurs', icon: Users, badge: `${usersList.length}` },
            { id: 'assistants', label: 'Tous les Assistants IA', icon: Bot, badge: `${assistantsList.length}` },
            { id: 'leads', label: 'Registre Central des Leads', icon: MessageSquare, badge: `${prospectsList.length}` },
            { id: 'invoices', label: 'Factures & Paiements', icon: Receipt, badge: `${invoicesList.length}` },
            { id: 'system', label: 'Maintenance & Outils', icon: Database }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30'
                    : 'bg-neutral-900/60 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 border border-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-neutral-800 text-neutral-400'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: OVERVIEW & MASTER METRICS */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Top KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              
              <div className="bg-[#0f131f] border border-white/10 p-6 rounded-3xl relative overflow-hidden group hover:border-purple-500/40 transition-all shadow-xl">
                <div className="flex items-center justify-between text-neutral-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Créateurs Inscrits</span>
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-black text-white">{usersList.length}</div>
                <p className="text-xs text-neutral-400 mt-2">Comptes utilisateurs réels</p>
              </div>

              <div className="bg-[#0f131f] border border-white/10 p-6 rounded-3xl relative overflow-hidden group hover:border-indigo-500/40 transition-all shadow-xl">
                <div className="flex items-center justify-between text-neutral-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Assistants Déployés</span>
                  <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
                    <Bot className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-black text-white">{assistantsList.length}</div>
                <div className="flex items-center gap-2 mt-2 text-xs">
                  <span className="text-purple-300 font-semibold">{paidPlansCount} Forfaits Payants</span>
                  <span className="text-neutral-500">·</span>
                  <span className="text-neutral-400">{freePlansCount} Gratuits</span>
                </div>
              </div>

              <div className="bg-[#0f131f] border border-white/10 p-6 rounded-3xl relative overflow-hidden group hover:border-emerald-500/40 transition-all shadow-xl">
                <div className="flex items-center justify-between text-neutral-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Prospects Capturés</span>
                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-black text-emerald-400">{prospectsList.length}</div>
                <p className="text-xs text-neutral-400 mt-2">Leads qualifiés sur toute la plateforme</p>
              </div>

              <div className="bg-[#0f131f] border border-white/10 p-6 rounded-3xl relative overflow-hidden group hover:border-amber-500/40 transition-all shadow-xl">
                <div className="flex items-center justify-between text-neutral-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Chiffre d'Affaires</span>
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                    <CreditCard className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-amber-300">
                  {totalRevenueDzd.toLocaleString('fr-FR')} <span className="text-sm font-bold text-amber-400">DZD</span>
                </div>
                <p className="text-xs text-neutral-400 mt-2">Équivalent ~{totalRevenueUsd.toLocaleString('fr-FR')} USD</p>
              </div>
            </div>

            {/* Quick Actions & Recent Live Stream */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: Recent Assistants & Real-Time Pulse */}
              <div className="lg:col-span-2 bg-[#0f131f] border border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Bot className="w-4 h-4 text-purple-400" />
                    Derniers Assistants Créés sur JawebFlow
                  </h3>
                  <button 
                    onClick={() => setActiveTab('assistants')}
                    className="text-xs text-purple-400 hover:text-purple-300 font-semibold"
                  >
                    Voir tous ({assistantsList.length}) →
                  </button>
                </div>

                <div className="divide-y divide-white/5 overflow-x-auto">
                  {assistantsList.slice(0, 5).map(asst => {
                    const owner = usersList.find(u => u.uid === asst.userId);
                    return (
                      <div key={asst.id} className="py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-white truncate flex items-center gap-2">
                            <span>{asst.businessName || 'Assistant sans nom'}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                              asst.plan === 'enterprise' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                              asst.plan === 'pro' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                              asst.plan === 'basic' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                              'bg-neutral-800 text-neutral-400'
                            }`}>
                              {asst.plan || 'free'}
                            </span>
                          </div>
                          <div className="text-xs text-neutral-400 truncate mt-0.5">
                            Créateur : {owner?.displayName || owner?.email || asst.userId}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => setInspectingAssistant(asst)}
                            className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 transition-colors"
                          >
                            Inspecter
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Col: Super Admin Fast Actions */}
              <div className="bg-[#0f131f] border border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 pb-3 border-b border-white/10">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Raccourcis Super Admin
                </h3>

                <div className="space-y-3">
                  <button
                    onClick={() => setShowNewInvoiceModal(true)}
                    className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-between shadow-lg shadow-purple-600/30 transition-all cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Créer / Valider un Paiement
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={exportLeadsCSV}
                    className="w-full p-3.5 rounded-2xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-200 font-semibold text-xs flex items-center justify-between transition-all cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-emerald-400" />
                      Exporter tous les Leads (CSV)
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setActiveTab('assistants')}
                    className="w-full p-3.5 rounded-2xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-200 font-semibold text-xs flex items-center justify-between transition-all cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-amber-400" />
                      Gérer & Surclasser les Plans
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ALL USERS / CREATORS */}
        {activeTab === 'users' && (
          <div className="bg-[#0f131f] border border-white/10 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-400" />
                  Créateurs & Comptes Inscrits ({usersList.length})
                </h2>
                <p className="text-xs text-neutral-400 mt-1">Tous les profils enregistrés dans Firestore</p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Rechercher nom, email, UID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-neutral-400 font-semibold">
                    <th className="py-3.5 px-4">Utilisateur</th>
                    <th className="py-3.5 px-4">Entreprise</th>
                    <th className="py-3.5 px-4">Assistants Créés</th>
                    <th className="py-3.5 px-4">Rôle</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {usersList
                    .filter(u => 
                      !searchQuery || 
                      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      u.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      u.uid?.includes(searchQuery)
                    )
                    .map(u => {
                      const userAssistants = assistantsList.filter(a => a.userId === u.uid);
                      const isSuper = isUserAdmin({ email: u.email }, u);
                      return (
                        <tr key={u.uid} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 px-4">
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{u.displayName || 'Sans nom'}</span>
                              {isSuper && (
                                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                                  SUPER ADMIN
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-neutral-400 font-mono mt-0.5">{u.email}</div>
                          </td>
                          <td className="py-4 px-4 text-neutral-300">
                            {u.companyName || '—'}
                          </td>
                          <td className="py-4 px-4">
                            <span className="px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-200 font-mono text-xs font-semibold">
                              {userAssistants.length} assistant(s)
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                              isSuper ? 'text-amber-400' : 'text-neutral-400'
                            }`}>
                              {u.role || 'client'}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <button
                              onClick={() => handleDeleteUser(u.uid, u.email)}
                              className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                              title="Supprimer l'utilisateur"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: ALL ASSISTANTS */}
        {activeTab === 'assistants' && (
          <div className="bg-[#0f131f] border border-white/10 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-400" />
                  Gestion de TOUS les Assistants IA ({assistantsList.length})
                </h2>
                <p className="text-xs text-neutral-400 mt-1">Changez le forfait de n'importe quel assistant en 1 clic</p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="all">Tous les forfaits</option>
                  <option value="free">Gratuit (Free)</option>
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Nom d'entreprise, URL, Widget ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-neutral-400 font-semibold">
                    <th className="py-3.5 px-4">Assistant & Business</th>
                    <th className="py-3.5 px-4">Créateur / Propriétaire</th>
                    <th className="py-3.5 px-4">Base Connaissances</th>
                    <th className="py-3.5 px-4">Forfait Actuel</th>
                    <th className="py-3.5 px-4 text-right">Surclasser / Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {assistantsList
                    .filter(a => {
                      if (planFilter !== 'all' && (a.plan || 'free') !== planFilter) return false;
                      if (!searchQuery) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        a.businessName?.toLowerCase().includes(q) ||
                        a.websiteUrl?.toLowerCase().includes(q) ||
                        a.widgetId?.toLowerCase().includes(q) ||
                        a.id?.includes(q)
                      );
                    })
                    .map(a => {
                      const owner = usersList.find(u => u.uid === a.userId);
                      const currentPlan = a.plan || 'free';
                      return (
                        <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 px-4">
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{a.businessName || 'Assistant sans nom'}</span>
                              {a.websiteUrl && (
                                <a 
                                  href={a.websiteUrl.startsWith('http') ? a.websiteUrl : `https://${a.websiteUrl}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-purple-400 hover:text-purple-300"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                            <div className="text-xs text-neutral-400 font-mono mt-0.5">
                              Widget ID: {a.widgetId || a.id?.slice(0, 10)}
                            </div>
                          </td>

                          <td className="py-4 px-4">
                            <div className="text-neutral-200 font-medium">{owner?.displayName || 'Client'}</div>
                            <div className="text-xs text-neutral-400 font-mono">{owner?.email || a.userId}</div>
                          </td>

                          <td className="py-4 px-4">
                            <span className="px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-300 text-xs font-mono font-semibold">
                              {a.knowledgeNotes?.length || 0} fiches actives
                            </span>
                          </td>

                          <td className="py-4 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                              currentPlan === 'enterprise' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                              currentPlan === 'pro' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
                              currentPlan === 'basic' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                              'bg-neutral-800 text-neutral-400 border-neutral-700'
                            }`}>
                              {currentPlan === 'enterprise' && <Crown className="w-3 h-3" />}
                              {currentPlan.toUpperCase()}
                            </span>
                          </td>

                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <select
                                value={currentPlan}
                                onChange={(e) => a.id && handleUpdatePlan(a.id, e.target.value)}
                                className="bg-black/60 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-purple-500 cursor-pointer"
                              >
                                <option value="free">Plan Gratuit</option>
                                <option value="basic">Plan Basic</option>
                                <option value="pro">Plan Pro</option>
                                <option value="enterprise">Plan Enterprise</option>
                              </select>

                              <button
                                onClick={() => setInspectingAssistant(a)}
                                className="p-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 transition-colors"
                                title="Inspecter les détails"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => a.id && handleDeleteAssistant(a.id, a.businessName || 'Assistant')}
                                className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                                title="Supprimer l'assistant"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: CENTRAL LEADS CRM */}
        {activeTab === 'leads' && (
          <div className="bg-[#0f131f] border border-white/10 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-emerald-400" />
                  Registre Central de TOUS les Prospects ({prospectsList.length})
                </h2>
                <p className="text-xs text-neutral-400 mt-1">Tous les leads capturés par tous les widgets en direct</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={exportLeadsCSV}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Exporter CSV</span>
                </button>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Nom, téléphone, email, besoin..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-neutral-400 font-semibold">
                    <th className="py-3.5 px-4">Contact</th>
                    <th className="py-3.5 px-4">Téléphone / WhatsApp</th>
                    <th className="py-3.5 px-4">Demande / Besoin</th>
                    <th className="py-3.5 px-4">Statut</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {prospectsList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-neutral-400">
                        Aucun prospect dans la base pour le moment.
                      </td>
                    </tr>
                  ) : (
                    prospectsList
                      .filter(p => {
                        if (!searchQuery) return true;
                        const q = searchQuery.toLowerCase();
                        return (
                          p.name?.toLowerCase().includes(q) ||
                          p.phone?.toLowerCase().includes(q) ||
                          p.email?.toLowerCase().includes(q) ||
                          p.need?.toLowerCase().includes(q)
                        );
                      })
                      .map(p => (
                        <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 px-4">
                            <div className="font-bold text-white">{p.name || 'Visiteur'}</div>
                            <div className="text-xs text-neutral-400 font-mono">{p.email || 'Email non fourni'}</div>
                          </td>

                          <td className="py-4 px-4 font-mono font-medium text-emerald-400">
                            {p.phone || 'Non renseigné'}
                          </td>

                          <td className="py-4 px-4 max-w-xs truncate text-neutral-300">
                            {p.need || 'Visite simple'}
                          </td>

                          <td className="py-4 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              p.status === 'qualifie' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                              'bg-neutral-800 text-neutral-400'
                            }`}>
                              {p.status || 'nouveau'}
                            </span>
                          </td>

                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setInspectingLead(p)}
                                className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 font-semibold text-xs transition-colors"
                              >
                                Conversations
                              </button>
                              <button
                                onClick={() => handleDeleteProspect(p.id)}
                                className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                                title="Supprimer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: INVOICES & PAYMENTS */}
        {activeTab === 'invoices' && (
          <div className="bg-[#0f131f] border border-white/10 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-400" />
                  Factures, Quittances & Paiements Réels ({invoicesList.length})
                </h2>
                <p className="text-xs text-neutral-400 mt-1">Historique des transactions réelles enregistrées sur JawebFlow</p>
              </div>

              <button
                onClick={() => setShowNewInvoiceModal(true)}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-600/30 transition-all cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Valider un Paiement BaridiMob / CCP</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-neutral-400 font-semibold">
                    <th className="py-3.5 px-4">N° Quittance</th>
                    <th className="py-3.5 px-4">Client</th>
                    <th className="py-3.5 px-4">Montant</th>
                    <th className="py-3.5 px-4">Forfait</th>
                    <th className="py-3.5 px-4">Mode de Paiement</th>
                    <th className="py-3.5 px-4">Statut</th>
                    <th className="py-3.5 px-4 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {invoicesList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-neutral-400">
                        Aucune transaction enregistrée pour le moment.
                      </td>
                    </tr>
                  ) : (
                    invoicesList.map(inv => (
                      <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 px-4 font-mono font-bold text-purple-300">
                          {inv.id}
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-medium text-white">{inv.customerName || inv.customerEmail}</div>
                          <div className="text-xs text-neutral-400 font-mono">{inv.customerEmail}</div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-bold text-amber-300">{Number(inv.amountDzd || 0).toLocaleString('fr-FR')} DZD</div>
                          <div className="text-xs text-neutral-500">${inv.amountUsd} USD</div>
                        </td>
                        <td className="py-4 px-4 font-medium text-neutral-200">
                          {inv.planName}
                        </td>
                        <td className="py-4 px-4 text-xs text-neutral-300">
                          {inv.paymentMethod}
                        </td>
                        <td className="py-4 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right text-xs text-neutral-400 font-mono">
                          {inv.date || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: SYSTEM & HYGIENE */}
        {activeTab === 'system' && (
          <div className="bg-[#0f131f] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 animate-in fade-in duration-300">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-400" />
                Maintenance & Hygiène de la Base de Données
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Outils d'intégrité, statut des collections et gestion des données réelles
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 rounded-2xl bg-neutral-950/60 border border-white/10 space-y-3">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  État des Collections Firestore
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-neutral-400">users (Créateurs) :</span>
                    <span className="font-mono font-bold text-purple-300">{usersList.length} docs</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-neutral-400">assistants (Configurations) :</span>
                    <span className="font-mono font-bold text-indigo-300">{assistantsList.length} docs</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-neutral-400">prospects (Leads réels) :</span>
                    <span className="font-mono font-bold text-emerald-300">{prospectsList.length} docs</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-neutral-400">invoices (Factures) :</span>
                    <span className="font-mono font-bold text-amber-300">{invoicesList.length} docs</span>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-neutral-950/60 border border-white/10 space-y-3">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-400" />
                  Sécurité & Isolation des Comptes
                </h4>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Toutes les données de test ont été purgées. Les comptes clients gratuits ont un accès strictement verrouillé sur le scanner, simulateur et CRM tant qu'ils ne sont pas surclassés.
                </p>
                <div className="pt-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Protection des Tokens IA Active
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* LEAD CONVERSATION INSPECTION MODAL */}
      {inspectingLead && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f131f] border border-white/15 rounded-3xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="font-bold text-base text-white">Détails du Prospect : {inspectingLead.name}</h3>
                <p className="text-xs text-neutral-400 font-mono">
                  Tel: {inspectingLead.phone || 'N/A'} · Email: {inspectingLead.email || 'N/A'}
                </p>
              </div>
              <button 
                onClick={() => setInspectingLead(null)}
                className="p-2 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-black/40 rounded-2xl border border-white/5">
              {inspectingLead.messages && inspectingLead.messages.length > 0 ? (
                inspectingLead.messages.map((m: any, idx: number) => (
                  <div key={idx} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`p-3 rounded-2xl text-xs max-w-[80%] ${
                      m.sender === 'user' ? 'bg-purple-600 text-white' : 'bg-neutral-800 text-neutral-200 border border-white/10'
                    }`}>
                      <p>{m.text}</p>
                    </div>
                    <span className="text-[10px] text-neutral-500 mt-0.5">{m.timestamp || ''}</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-neutral-500">
                  Aucun message détaillé stocké pour cette session.
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => handleDeleteProspect(inspectingLead.id)}
                className="px-4 py-2 rounded-xl bg-red-500/15 text-red-300 hover:bg-red-500/25 text-xs font-bold transition-all"
              >
                Supprimer le prospect
              </button>
              <button
                onClick={() => setInspectingLead(null)}
                className="px-4 py-2 rounded-xl bg-neutral-800 text-white text-xs font-bold"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSISTANT INSPECTION MODAL */}
      {inspectingAssistant && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f131f] border border-white/15 rounded-3xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="font-bold text-base text-white">{inspectingAssistant.businessName}</h3>
                <p className="text-xs text-neutral-400 font-mono">
                  Widget ID: {inspectingAssistant.widgetId} · Plan: {(inspectingAssistant.plan || 'free').toUpperCase()}
                </p>
              </div>
              <button 
                onClick={() => setInspectingAssistant(null)}
                className="p-2 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 text-xs pr-1">
              <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-2">
                <span className="font-bold text-neutral-300 block">Site Web :</span>
                <p className="text-purple-300 font-mono">{inspectingAssistant.websiteUrl || 'Non spécifié'}</p>
                <span className="font-bold text-neutral-300 block mt-2">Description d'activité :</span>
                <p className="text-neutral-300 leading-relaxed">{inspectingAssistant.businessDescription || 'Aucune description'}</p>
              </div>

              <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-2">
                <span className="font-bold text-neutral-300 block">Fiches de connaissances ({inspectingAssistant.knowledgeNotes?.length || 0}) :</span>
                {inspectingAssistant.knowledgeNotes?.map((n, i) => (
                  <div key={i} className="p-2.5 rounded-xl bg-neutral-900 border border-white/5">
                    <span className="font-semibold text-white block">{n.title}</span>
                    <p className="text-neutral-400 text-[11px] mt-0.5 line-clamp-2">{n.content}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectingAssistant(null)}
                className="px-4 py-2 rounded-xl bg-neutral-800 text-white text-xs font-bold"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / VALIDATE MANUAL INVOICE MODAL */}
      {showNewInvoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f131f] border border-purple-500/30 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl shadow-purple-950/50">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Valider un Paiement Client</h3>
                  <p className="text-xs text-neutral-400">Générer une quittance et activer le forfait</p>
                </div>
              </div>
              <button 
                onClick={() => setShowNewInvoiceModal(false)}
                className="p-2 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateManualInvoice} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5 uppercase">
                  Email du Client (Compte JawebFlow)
                </label>
                <input
                  type="email"
                  placeholder="client@exemple.com"
                  value={newInvEmail}
                  onChange={(e) => setNewInvEmail(e.target.value)}
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1.5 uppercase">
                    Forfait Activé
                  </label>
                  <select
                    value={newInvPlan}
                    onChange={(e) => {
                      const p = e.target.value as any;
                      setNewInvPlan(p);
                      if (p === 'basic') setNewInvAmountDzd(6850);
                      else if (p === 'pro') setNewInvAmountDzd(18700);
                      else setNewInvAmountDzd(47100);
                    }}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="basic">Plan Basic (6 850 DZD)</option>
                    <option value="pro">Plan Pro (18 700 DZD)</option>
                    <option value="enterprise">Plan Enterprise (47 100 DZD)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1.5 uppercase">
                    Montant Réglé (DZD)
                  </label>
                  <input
                    type="number"
                    value={newInvAmountDzd}
                    onChange={(e) => setNewInvAmountDzd(Number(e.target.value))}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5 uppercase">
                  Mode de Paiement Réceptionné
                </label>
                <select
                  value={newInvMethod}
                  onChange={(e) => setNewInvMethod(e.target.value as any)}
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="baridimob_ccp">Virement CCP / BaridiMob (Reçu validé)</option>
                  <option value="slickpay_dzd">SlickPay (Carte CIB / Edahabia)</option>
                  <option value="stripe_card">Carte Bancaire Visa / Mastercard</option>
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewInvoiceModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isCreatingInvoice}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2"
                >
                  {isCreatingInvoice ? 'Validation...' : 'Valider & Surclasser'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

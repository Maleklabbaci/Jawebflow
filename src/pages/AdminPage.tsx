import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Users, 
  Bot, 
  Receipt, 
  Database, 
  LayoutDashboard,
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
  ArrowLeft,
  UserCheck,
  Zap,
  Globe,
  Check,
  Copy,
  ChevronRight,
  Menu,
  Loader2,
  Target
} from 'lucide-react';
import { 
  auth, 
  db, 
  isUserAdmin, 
  updateAssistantPlan, 
  deleteAssistantDocument, 
  deleteUserRecord, 
  deleteProspectRecord, 
  UserProfile, 
  AssistantConfig 
} from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';

export type AdminSectionId = 'overview' | 'users' | 'assistants' | 'leads' | 'invoices' | 'system';

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
  const { user: authUser, profile, logout } = useAuth();
  
  // Super Admin verification state
  const isSuperAdminLogged = isUserAdmin(authUser, profile);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(isSuperAdminLogged);
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Active Tab / Section
  const [activeTab, setActiveTab] = useState<AdminSectionId>('overview');

  // Master Data from real Firestore collections
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [assistantsList, setAssistantsList] = useState<AssistantConfig[]>([]);
  const [prospectsList, setProspectsList] = useState<any[]>([]);
  const [invoicesList, setInvoicesList] = useState<AdminInvoice[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>('all');
  const [statusNotification, setStatusNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Modals state
  const [inspectingLead, setInspectingLead] = useState<any | null>(null);
  const [inspectingAssistant, setInspectingAssistant] = useState<AssistantConfig | null>(null);
  const [showNewInvoiceModal, setShowNewInvoiceModal] = useState(false);

  // Manual Invoice Form
  const [newInvEmail, setNewInvEmail] = useState('');
  const [newInvPlan, setNewInvPlan] = useState<'basic' | 'pro' | 'enterprise'>('pro');
  const [newInvAmountDzd, setNewInvAmountDzd] = useState<number>(18700);
  const [newInvMethod, setNewInvMethod] = useState<'baridimob_ccp' | 'slickpay_dzd' | 'stripe_card'>('baridimob_ccp');
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);

  // Auto-authenticate if already logged in with super admin credentials
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

  // Load all platform data when authenticated
  useEffect(() => {
    if (isAdminAuthenticated) {
      fetchAllPlatformData();
    }
  }, [isAdminAuthenticated]);

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setStatusNotification({ type, message });
    setTimeout(() => setStatusNotification(null), 4000);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
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
      notify('Erreur de synchronisation Firestore : ' + (err.message || 'Vérifiez la connexion'), 'error');
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
    if (!window.confirm(`Attention : Supprimer le compte et le profil de "${email}" ?`)) return;
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
      notify("Veuillez spécifier l'adresse e-mail du client", 'error');
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
        paymentMethod: newInvMethod === 'baridimob_ccp' ? 'Virement CCP / BaridiMob (Validé Admin)' : newInvMethod === 'slickpay_dzd' ? 'SlickPay DZD (Edahabia/CIB)' : 'Carte Bancaire',
        status: 'paid',
        date: new Date().toLocaleDateString('fr-FR')
      };

      await setDoc(doc(db, 'invoices', invId), {
        ...newInvoiceData,
        createdAt: serverTimestamp(),
        validatedByAdmin: true
      });

      // Auto-upgrade client's assistant if found in Firestore
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

  const exportAdsAudienceCSV = () => {
    if (prospectsList.length === 0) {
      notify('Aucun prospect à exporter.', 'error');
      return;
    }
    const headers = ['email', 'phone', 'first_name', 'last_name', 'country', 'locale', 'value'];
    const rows = prospectsList.map(lead => {
      const nameParts = (lead.name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Visiteur';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      let cleanPhone = (lead.phone || '').replace(/[^0-9+]/g, '');
      if (cleanPhone.startsWith('0') && !cleanPhone.startsWith('00')) {
        cleanPhone = '213' + cleanPhone.substring(1);
      }
      if (cleanPhone.startsWith('+')) {
        cleanPhone = cleanPhone.substring(1);
      }
      
      const hasEmail = lead.email && !lead.email.includes('Non');
      const hasPhone = cleanPhone && cleanPhone.length >= 8;
      let value = '5.00';
      if (hasEmail && hasPhone) value = '20.00';
      if (lead.status === 'qualifie') value = '35.00';

      return [
        hasEmail ? lead.email : '',
        hasPhone ? cleanPhone : '',
        firstName,
        lastName,
        'DZ',
        'fr',
        value
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `jawebflow_ads_audiences_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify('Export Audience Ads (Meta/Google) téléchargé.');
  };

  // Aggregated calculations on real Firestore data
  const totalRevenueDzd = invoicesList.filter(i => i.status === 'paid').reduce((acc, i) => acc + (Number(i.amountDzd) || 0), 0);
  const totalRevenueUsd = invoicesList.filter(i => i.status === 'paid').reduce((acc, i) => acc + (Number(i.amountUsd) || 0), 0);
  const paidPlansCount = assistantsList.filter(a => a.plan && a.plan !== 'free').length;
  const freePlansCount = assistantsList.filter(a => !a.plan || a.plan === 'free').length;

  // Unauthenticated Lock Screen (Clean SaaS Style)
  if (!isAdminAuthenticated) {
    if (authUser && !isSuperAdminLogged) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 antialiased">
          <div className="bg-white border border-slate-200 p-8 sm:p-10 rounded-3xl max-w-md w-full shadow-xl text-center space-y-6">
            <div className="w-16 h-16 bg-red-50 text-red-600 border border-red-100 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <Lock className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                Accès Restreint
              </span>
              <h1 className="text-2xl font-bold text-slate-900">Espace Non Autorisé</h1>
              <p className="text-sm text-slate-500 leading-relaxed">
                Vous êtes connecté avec le compte <strong className="text-slate-800">{authUser.email}</strong>. Cette console globale est strictement réservée à l'administrateur de JawebFlow.
              </p>
            </div>

            <a
              href="/dashboard"
              className="inline-flex w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm shadow-sm shadow-purple-600/30 items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Accéder à mon Cockpit Client</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 antialiased">
        <div className="bg-white border border-slate-200 p-8 sm:p-10 rounded-3xl max-w-md w-full shadow-xl">
          <div className="w-14 h-14 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center mb-6 mx-auto text-white shadow-sm shadow-purple-600/30">
            <Shield className="w-7 h-7" />
          </div>
          
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>Console Super Admin</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Connexion Administrateur</h1>
            <p className="text-xs text-slate-500 mt-1">
              Accès réservé au propriétaire et gestionnaires de la plateforme JawebFlow.
            </p>
          </div>

          <form onSubmit={handleAdminPasswordUnlock} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                Code Clé Administrateur
              </label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Entrez votre mot de passe maître..."
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:bg-white focus:ring-1 focus:ring-purple-600 text-sm transition-all"
                  autoFocus
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-4 top-3.5 pointer-events-none" />
              </div>
            </div>

            {authError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm shadow-sm shadow-purple-600/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {authLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Vérification...</span>
                </>
              ) : (
                <>
                  <span>Déverrouiller la Console</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-2 text-center">
              <a href="/" className="text-xs text-slate-500 hover:text-slate-800 transition-colors">
                ← Retour au site JawebFlow
              </a>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Navigation Items Definition matching client Dashboard design
  const navigationItems = [
    {
      group: 'PILOTAGE & KPI',
      items: [
        { id: 'overview', label: "Vue d'ensemble", icon: LayoutDashboard, badge: null }
      ]
    },
    {
      group: 'GESTION GLOBALE',
      items: [
        { id: 'users', label: 'Créateurs & Clients', icon: Users, badge: `${usersList.length}` },
        { id: 'assistants', label: 'Tous les Assistants', icon: Bot, badge: `${assistantsList.length}` },
        { id: 'leads', label: 'Registre Central Leads', icon: MessageSquare, badge: `${prospectsList.length}` },
        { id: 'invoices', label: 'Factures & Paiements', icon: Receipt, badge: `${invoicesList.length}` }
      ]
    },
    {
      group: 'SYSTÈME',
      items: [
        { id: 'system', label: 'Maintenance & Firestore', icon: Database, badge: null }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex antialiased selection:bg-purple-500/20 selection:text-purple-900">
      
      {/* 
        =======================================================================
        FIXED / LOCKED SIDEBAR NAVIGATION (Pure White, Crisp Borders)
        =======================================================================
      */}
      <aside className={`
        fixed top-0 bottom-0 left-0 w-64 bg-white border-r border-slate-200 shadow-sm z-30 flex flex-col justify-between
        transition-transform duration-200 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="overflow-y-auto flex-1">
          {/* Top Platform Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-sm shadow-purple-600/30">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-sm text-slate-900 tracking-tight block">Console Admin</span>
                <span className="text-[10px] text-purple-600 font-semibold font-mono block">JawebFlow Master</span>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <a
                href="/"
                className="text-xs text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                title="Retour au site public"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="md:hidden text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Admin Info Pill */}
          <div className="p-3 mx-3 my-3 rounded-xl bg-purple-50/70 border border-purple-100 flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full shrink-0 bg-emerald-500 animate-pulse"></div>
            <div className="truncate flex-1">
              <span className="block text-xs font-bold text-slate-900 truncate">
                Super Administrateur
              </span>
              <span className="block text-[10px] font-mono text-purple-700 truncate">
                {authUser?.email || 'admin@jawebflow.com'}
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-4">
            {navigationItems.map(group => (
              <div key={group.group} className="space-y-1">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {group.group}
                </div>
                {group.items.map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id as AdminSectionId);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge ? (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          isActive ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {item.badge}
                        </span>
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/60 space-y-2">
          <a
            href="/dashboard"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-purple-700 hover:bg-purple-50 transition-colors"
          >
            <Bot className="w-4 h-4 text-purple-600" />
            <span>Mon Cockpit Client</span>
          </a>

          <button
            onClick={handleAdminLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Verrouiller / Quitter</span>
          </button>
        </div>
      </aside>

      {/* 
        =======================================================================
        MAIN CONTENT AREA (Offset for fixed sidebar)
        =======================================================================
      */}
      <div className="md:ml-64 flex-1 flex flex-col min-w-0">
        
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl hover:bg-slate-100 text-slate-600"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-slate-900 capitalize">
                  {activeTab === 'overview' && "Vue d'ensemble & Pilotage"}
                  {activeTab === 'users' && "Créateurs & Utilisateurs Inscrits"}
                  {activeTab === 'assistants' && "Tous les Assistants IA"}
                  {activeTab === 'leads' && "Registre Central des Leads"}
                  {activeTab === 'invoices' && "Factures & Encaissements"}
                  {activeTab === 'system' && "Maintenance Système & Firestore"}
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  En direct
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Données réelles synchronisées avec Firestore · {assistantsList.length} assistants actifs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={fetchAllPlatformData}
              disabled={loadingData}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Actualiser les données"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin text-purple-600' : ''}`} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>

            <button
              onClick={() => setShowNewInvoiceModal(true)}
              className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-purple-600/30 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Valider un Paiement</span>
              <span className="sm:hidden">Paiement</span>
            </button>
          </div>
        </header>

        {/* Toast Notification */}
        {statusNotification && (
          <div className={`fixed top-16 right-6 z-50 p-4 rounded-2xl border shadow-lg flex items-center gap-3 backdrop-blur-md animate-in slide-in-from-top-3 duration-200 ${
            statusNotification.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {statusNotification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span className="text-xs sm:text-sm font-semibold">{statusNotification.message}</span>
          </div>
        )}

        {/* Main Content View Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 sm:space-y-8">
          
          {/* =======================================================================
              SECTION 1: OVERVIEW & MASTER METRICS
              ======================================================================= */}
          {activeTab === 'overview' && (
            <div className="space-y-6 sm:space-y-8">
              
              {/* Top 4 KPI Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                
                <div className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs relative overflow-hidden group hover:border-purple-300 transition-all">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Créateurs Inscrits</span>
                    <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-slate-900">{usersList.length}</div>
                  <p className="text-xs text-slate-500 mt-2">Comptes utilisateurs réels enregistrés</p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs relative overflow-hidden group hover:border-indigo-300 transition-all">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Assistants IA Déployés</span>
                    <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                      <Bot className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-slate-900">{assistantsList.length}</div>
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <span className="text-purple-700 font-semibold">{paidPlansCount} Forfaits Payants</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500">{freePlansCount} Gratuits</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs relative overflow-hidden group hover:border-emerald-300 transition-all">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Prospects Capturés</span>
                    <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-emerald-600">{prospectsList.length}</div>
                  <p className="text-xs text-slate-500 mt-2">Leads qualifiés sur toute la plateforme</p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs relative overflow-hidden group hover:border-amber-300 transition-all">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Chiffre d'Affaires</span>
                    <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                      <CreditCard className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                    {totalRevenueDzd.toLocaleString('fr-FR')} <span className="text-xs font-bold text-amber-600 font-mono">DZD</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Équivalent ~{totalRevenueUsd.toLocaleString('fr-FR')} USD encaissé</p>
                </div>

              </div>

              {/* Recent Activity Split View */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left: Recent Assistants */}
                <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-purple-600" />
                      <h3 className="font-bold text-sm text-slate-900">Derniers Assistants Créés sur JawebFlow</h3>
                    </div>
                    <button 
                      onClick={() => setActiveTab('assistants')}
                      className="text-xs font-semibold text-purple-600 hover:text-purple-800 transition-colors"
                    >
                      Voir tous ({assistantsList.length}) →
                    </button>
                  </div>

                  {assistantsList.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Aucun assistant créé pour le moment.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {assistantsList.slice(0, 5).map(asst => {
                        const owner = usersList.find(u => u.uid === asst.userId);
                        return (
                          <div key={asst.id} className="py-3 flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <div className="font-bold text-sm text-slate-900 truncate flex items-center gap-2">
                                <span>{asst.businessName || 'Assistant sans nom'}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                                  asst.plan === 'enterprise' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                  asst.plan === 'pro' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                                  asst.plan === 'basic' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                  'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}>
                                  {asst.plan || 'free'}
                                </span>
                              </div>
                              <div className="text-xs text-slate-500 truncate mt-0.5">
                                Propriétaire : {owner?.displayName || owner?.email || asst.userId}
                              </div>
                            </div>

                            <button
                              onClick={() => setInspectingAssistant(asst)}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors shrink-0 cursor-pointer"
                            >
                              Inspecter
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right: Quick Action Shortcuts */}
                <div className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-6 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <h3 className="font-bold text-sm text-slate-900">Raccourcis Super Admin</h3>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={() => setShowNewInvoiceModal(true)}
                      className="w-full p-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-between shadow-sm shadow-purple-600/30 transition-all cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Valider un Paiement BaridiMob / CCP
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={exportLeadsCSV}
                      className="w-full p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-between transition-all cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Download className="w-4 h-4 text-emerald-600" />
                        Exporter tous les Leads (CSV CRM)
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>

                    <button
                      onClick={exportAdsAudienceCSV}
                      className="w-full p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-between transition-all cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-purple-600" />
                        Exporter Audience Ads (Meta/Google)
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>

                    <button
                      onClick={() => setActiveTab('assistants')}
                      className="w-full p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-between transition-all cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Crown className="w-4 h-4 text-amber-600" />
                        Gérer & Surclasser les Plans
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* =======================================================================
              SECTION 2: USERS & CREATORS DIRECTORY
              ======================================================================= */}
          {activeTab === 'users' && (
            <div className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-600" />
                    Créateurs & Utilisateurs Inscrits ({usersList.length})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Tous les profils réels enregistrés dans la collection Firestore users</p>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Rechercher nom, email, entreprise..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Utilisateur</th>
                      <th className="py-3.5 px-4">Entreprise</th>
                      <th className="py-3.5 px-4">Assistants Créés</th>
                      <th className="py-3.5 px-4">Rôle</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {usersList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          Aucun utilisateur enregistré pour le moment.
                        </td>
                      </tr>
                    ) : (
                      usersList
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
                            <tr key={u.uid} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-4 px-4">
                                <div className="font-bold text-slate-900 flex items-center gap-2">
                                  <span>{u.displayName || 'Utilisateur'}</span>
                                  {isSuper && (
                                    <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
                                      SUPER ADMIN
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 font-mono mt-0.5">{u.email}</div>
                              </td>
                              <td className="py-4 px-4 text-slate-700">
                                {u.companyName || '—'}
                              </td>
                              <td className="py-4 px-4">
                                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 font-mono text-xs font-semibold">
                                  {userAssistants.length} assistant(s)
                                </span>
                              </td>
                              <td className="py-4 px-4">
                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                                  isSuper ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {u.role || 'client'}
                                </span>
                              </td>
                              <td className="py-4 px-4 text-right">
                                <button
                                  onClick={() => handleDeleteUser(u.uid, u.email)}
                                  className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
                                  title="Supprimer l'utilisateur"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =======================================================================
              SECTION 3: ALL AI ASSISTANTS
              ======================================================================= */}
          {activeTab === 'assistants' && (
            <div className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Bot className="w-5 h-5 text-purple-600" />
                    Gestion de Tous les Assistants IA ({assistantsList.length})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Surclassez ou modifiez le forfait de n'importe quel assistant en 1 clic</p>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={planFilter}
                    onChange={(e) => setPlanFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:border-purple-600"
                  >
                    <option value="all">Tous les forfaits</option>
                    <option value="free">Gratuit (Free)</option>
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Nom, site web, widget ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Assistant & Business</th>
                      <th className="py-3.5 px-4">Créateur / Propriétaire</th>
                      <th className="py-3.5 px-4">Base Connaissances</th>
                      <th className="py-3.5 px-4">Forfait Actuel</th>
                      <th className="py-3.5 px-4 text-right">Surclasser / Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assistantsList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          Aucun assistant configuré dans la base.
                        </td>
                      </tr>
                    ) : (
                      assistantsList
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
                            <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-4 px-4">
                                <div className="font-bold text-slate-900 flex items-center gap-2">
                                  <span>{a.businessName || 'Assistant sans nom'}</span>
                                  {a.websiteUrl && (
                                    <a 
                                      href={a.websiteUrl.startsWith('http') ? a.websiteUrl : `https://${a.websiteUrl}`} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-purple-600 hover:text-purple-800"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 font-mono mt-0.5">
                                  Widget ID: {a.widgetId || a.id?.slice(0, 10)}
                                </div>
                              </td>

                              <td className="py-4 px-4">
                                <div className="text-slate-800 font-medium">{owner?.displayName || 'Client'}</div>
                                <div className="text-xs text-slate-500 font-mono">{owner?.email || a.userId}</div>
                              </td>

                              <td className="py-4 px-4">
                                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-semibold">
                                  {a.knowledgeNotes?.length || 0} fiche(s)
                                </span>
                              </td>

                              <td className="py-4 px-4">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                                  currentPlan === 'enterprise' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                  currentPlan === 'pro' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                  currentPlan === 'basic' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                  'bg-slate-100 text-slate-600 border-slate-200'
                                }`}>
                                  {currentPlan === 'enterprise' && <Crown className="w-3 h-3 text-amber-600" />}
                                  {currentPlan.toUpperCase()}
                                </span>
                              </td>

                              <td className="py-4 px-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <select
                                    value={currentPlan}
                                    onChange={(e) => a.id && handleUpdatePlan(a.id, e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:border-purple-600 cursor-pointer"
                                  >
                                    <option value="free">Plan Gratuit</option>
                                    <option value="basic">Plan Basic</option>
                                    <option value="pro">Plan Pro</option>
                                    <option value="enterprise">Plan Enterprise</option>
                                  </select>

                                  <button
                                    onClick={() => setInspectingAssistant(a)}
                                    className="p-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 transition-colors cursor-pointer"
                                    title="Inspecter les détails"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>

                                  <button
                                    onClick={() => a.id && handleDeleteAssistant(a.id, a.businessName || 'Assistant')}
                                    className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
                                    title="Supprimer l'assistant"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =======================================================================
              SECTION 4: CENTRAL MASTER LEADS CRM
              ======================================================================= */}
          {activeTab === 'leads' && (
            <div className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-emerald-600" />
                    Registre Central des Prospects Réels ({prospectsList.length})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Tous les leads capturés par les widgets JawebFlow en direct</p>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <button
                    onClick={exportLeadsCSV}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-600/30 transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV CRM</span>
                  </button>

                  <button
                    onClick={exportAdsAudienceCSV}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-purple-600/30 transition-all cursor-pointer"
                  >
                    <Target className="w-3.5 h-3.5" />
                    <span>Audience Ads</span>
                  </button>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Nom, téléphone, email, besoin..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Contact</th>
                      <th className="py-3.5 px-4">Téléphone / WhatsApp</th>
                      <th className="py-3.5 px-4">Demande / Besoin</th>
                      <th className="py-3.5 px-4">Statut</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {prospectsList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          Aucun prospect dans la base Firestore pour le moment.
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
                        .map(p => {
                          const hasRealPhone = p.phone && !p.phone.includes('Non');
                          const hasRealEmail = p.email && !p.email.includes('Non');
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-4 px-4">
                                <div className="font-bold text-slate-900">{p.name || 'Visiteur Anonyme'}</div>
                                <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                                  <span>{p.email || 'Email non fourni'}</span>
                                  {hasRealEmail && (
                                    <button
                                      onClick={() => handleCopy(p.email, `email_${p.id}`)}
                                      className="text-slate-400 hover:text-slate-700"
                                      title="Copier l'email"
                                    >
                                      {copiedField === `email_${p.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                  )}
                                </div>
                              </td>

                              <td className="py-4 px-4 font-mono font-medium text-slate-800">
                                <div className="flex items-center gap-2">
                                  <span>{p.phone || 'Non renseigné'}</span>
                                  {hasRealPhone && (
                                    <a
                                      href={`https://wa.me/${p.phone.replace(/[^0-9]/g, '')}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                      title="Contacter sur WhatsApp"
                                    >
                                      <Phone className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              </td>

                              <td className="py-4 px-4 max-w-xs truncate text-slate-600">
                                {p.need || 'Visite simple'}
                              </td>

                              <td className="py-4 px-4">
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                  p.status === 'qualifie' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                  'bg-slate-100 text-slate-600 border-slate-200'
                                }`}>
                                  {p.status || 'nouveau'}
                                </span>
                              </td>

                              <td className="py-4 px-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => setInspectingLead(p)}
                                    className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-xs transition-colors cursor-pointer"
                                  >
                                    Conversations
                                  </button>
                                  <button
                                    onClick={() => handleDeleteProspect(p.id)}
                                    className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
                                    title="Supprimer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =======================================================================
              SECTION 5: INVOICES & REVENUE
              ======================================================================= */}
          {activeTab === 'invoices' && (
            <div className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-amber-600" />
                    Factures, Quittances & Paiements Réels ({invoicesList.length})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Historique des transactions réelles enregistrées sur JawebFlow</p>
                </div>

                <button
                  onClick={() => setShowNewInvoiceModal(true)}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm shadow-purple-600/30 transition-all cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Valider un Paiement BaridiMob / CCP</span>
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">N° Quittance</th>
                      <th className="py-3.5 px-4">Client</th>
                      <th className="py-3.5 px-4">Montant (DZD / USD)</th>
                      <th className="py-3.5 px-4">Forfait</th>
                      <th className="py-3.5 px-4">Mode de Paiement</th>
                      <th className="py-3.5 px-4">Statut</th>
                      <th className="py-3.5 px-4 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoicesList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          Aucune facture enregistrée dans Firestore pour le moment.
                        </td>
                      </tr>
                    ) : (
                      invoicesList.map(inv => (
                        <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-4 px-4 font-mono font-bold text-purple-700">
                            {inv.id}
                          </td>
                          <td className="py-4 px-4">
                            <div className="font-medium text-slate-900">{inv.customerName || inv.customerEmail}</div>
                            <div className="text-xs text-slate-500 font-mono">{inv.customerEmail}</div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="font-bold text-slate-900">{Number(inv.amountDzd || 0).toLocaleString('fr-FR')} DZD</div>
                            <div className="text-xs text-slate-500">${inv.amountUsd} USD</div>
                          </td>
                          <td className="py-4 px-4 font-medium text-slate-800">
                            {inv.planName}
                          </td>
                          <td className="py-4 px-4 text-xs text-slate-600">
                            {inv.paymentMethod}
                          </td>
                          <td className="py-4 px-4">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {inv.status}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right text-xs text-slate-500 font-mono">
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

          {/* =======================================================================
              SECTION 6: SYSTEM HEALTH & MAINTENANCE
              ======================================================================= */}
          {activeTab === 'system' && (
            <div className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Database className="w-5 h-5 text-purple-600" />
                  Maintenance & Hygiène de la Base de Données
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  État des collections Firestore, intégrité des enregistrements et sécurité
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    État des Collections Firestore
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-slate-200">
                      <span className="text-slate-500">users (Créateurs enregistrés) :</span>
                      <span className="font-mono font-bold text-purple-700">{usersList.length} documents</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-200">
                      <span className="text-slate-500">assistants (Configurations IA) :</span>
                      <span className="font-mono font-bold text-indigo-700">{assistantsList.length} documents</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-200">
                      <span className="text-slate-500">prospects (Leads réels capturés) :</span>
                      <span className="font-mono font-bold text-emerald-700">{prospectsList.length} documents</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-200">
                      <span className="text-slate-500">invoices (Factures & Quittances) :</span>
                      <span className="font-mono font-bold text-amber-700">{invoicesList.length} documents</span>
                    </div>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-purple-600" />
                    Sécurité & Hygiène des Données
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Toutes les données de démo et faux profils ont été éliminés. Les comptes clients sont alimentés en direct par leurs interactions réelles avec le widget.
                  </p>
                  <div className="pt-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Synchronisation Firestore Active
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* =======================================================================
          MODAL: LEAD CONVERSATION INSPECTION (Clean White SaaS Design)
          ======================================================================= */}
      {inspectingLead && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Détails du Prospect : {inspectingLead.name || 'Visiteur'}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Tél: {inspectingLead.phone || 'Non renseigné'} · Email: {inspectingLead.email || 'Non renseigné'}
                </p>
              </div>
              <button 
                onClick={() => setInspectingLead(null)}
                className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              {inspectingLead.messages && inspectingLead.messages.length > 0 ? (
                inspectingLead.messages.map((m: any, idx: number) => (
                  <div key={idx} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`p-3 rounded-2xl text-xs max-w-[80%] ${
                      m.sender === 'user' ? 'bg-purple-600 text-white' : 'bg-white text-slate-800 border border-slate-200 shadow-2xs'
                    }`}>
                      <p>{m.text}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5">{m.timestamp || ''}</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-slate-400">
                  Aucun message détaillé stocké pour cette session.
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => handleDeleteProspect(inspectingLead.id)}
                className="px-4 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold transition-all cursor-pointer"
              >
                Supprimer le prospect
              </button>
              <button
                onClick={() => setInspectingLead(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL: ASSISTANT DETAILS INSPECTION (Clean White SaaS Design)
          ======================================================================= */}
      {inspectingAssistant && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">{inspectingAssistant.businessName}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Widget ID: {inspectingAssistant.widgetId} · Plan: {(inspectingAssistant.plan || 'free').toUpperCase()}
                </p>
              </div>
              <button 
                onClick={() => setInspectingAssistant(null)}
                className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 text-xs pr-1">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="font-bold text-slate-700 block">Site Web :</span>
                <p className="text-purple-700 font-mono">{inspectingAssistant.websiteUrl || 'Non spécifié'}</p>
                <span className="font-bold text-slate-700 block mt-2">Description d'activité :</span>
                <p className="text-slate-600 leading-relaxed">{inspectingAssistant.businessDescription || 'Aucune description'}</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="font-bold text-slate-700 block">Fiches de connaissances ({inspectingAssistant.knowledgeNotes?.length || 0}) :</span>
                {inspectingAssistant.knowledgeNotes?.map((n, i) => (
                  <div key={i} className="p-2.5 rounded-xl bg-white border border-slate-200">
                    <span className="font-semibold text-slate-900 block">{n.title}</span>
                    <p className="text-slate-500 text-[11px] mt-0.5 line-clamp-2">{n.content}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectingAssistant(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL: CREATE / VALIDATE MANUAL INVOICE (Clean White SaaS Design)
          ======================================================================= */}
      {showNewInvoiceModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Valider un Paiement Client</h3>
                  <p className="text-xs text-slate-500">Générer une quittance et surclasser l'assistant</p>
                </div>
              </div>
              <button 
                onClick={() => setShowNewInvoiceModal(false)}
                className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateManualInvoice} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                  Email du Client (Compte JawebFlow)
                </label>
                <input
                  type="email"
                  placeholder="client@exemple.com"
                  value={newInvEmail}
                  onChange={(e) => setNewInvEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 font-semibold focus:outline-none focus:border-purple-600"
                  >
                    <option value="basic">Plan Basic (6 850 DZD)</option>
                    <option value="pro">Plan Pro (18 700 DZD)</option>
                    <option value="enterprise">Plan Enterprise (47 100 DZD)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                    Montant Réglé (DZD)
                  </label>
                  <input
                    type="number"
                    value={newInvAmountDzd}
                    onChange={(e) => setNewInvAmountDzd(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                  Mode de Paiement Réceptionné
                </label>
                <select
                  value={newInvMethod}
                  onChange={(e) => setNewInvMethod(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 font-semibold focus:outline-none focus:border-purple-600"
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
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isCreatingInvoice}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-sm shadow-purple-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isCreatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Valider & Surclasser'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  Bot,
  Receipt,
  Database,
  LayoutDashboard,
  Search,
  Crown,
  AlertCircle,
  Trash2,
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
  Copy,
  Menu,
  Loader2,
  Target,
  Gauge,
  CheckCircle2,
} from 'lucide-react';
import {
  isUserAdmin,
  updateAssistantPlan,
  deleteAssistantDocument,
  deleteUserRecord,
  deleteProspectRecord,
  supabase,
} from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export type AdminSectionId = 'overview' | 'users' | 'assistants' | 'plans' | 'leads' | 'invoices' | 'system';

// ---------------------------------------------------------------------------
// Quotas des plans (alignés sur la page Tarifs). Éditables dans l'onglet Plans
// (table platform_settings, clé 'global'). null = illimité.
// ---------------------------------------------------------------------------
const DEFAULT_PLAN_LIMITS: Record<string, number | null> = {
  free: 0,
  basic: 1000,
  pro: 5000,
  enterprise: null,
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuit',
  basic: 'Basic',
  pro: 'Pro / Business',
  enterprise: 'Enterprise',
};

const PLAN_CHIPS: Record<string, string> = {
  free: 'bg-slate-100 text-slate-600 border-slate-200',
  basic: 'bg-blue-50 text-blue-700 border-blue-200',
  pro: 'bg-purple-50 text-purple-700 border-purple-200',
  enterprise: 'bg-amber-50 text-amber-700 border-amber-200',
};

const PLAN_PRICES: Record<string, { dzd: number; usd: number }> = {
  basic: { dzd: 6850, usd: 29 },
  pro: { dzd: 18700, usd: 79 },
  enterprise: { dzd: 47100, usd: 199 },
};

// SQL des permissions console (identique à supabase/migration_admin_console.sql).
const CONSOLE_SQL = `-- ============================================================================
-- JAWEBFLOW — CONSOLE ADMIN : PLEINS DROITS (bloc UNIQUE, idempotent)
-- À coller EN ENTIER dans Supabase → SQL Editor → Run. Ré-exécutable sans risque.
-- ============================================================================
do $console$
declare
  pol record;
begin
  execute $fn$
    create or replace function public.is_admin()
    returns boolean language sql stable security definer set search_path = public
    as $$ select exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','superadmin')) $$;
  $fn$;
  execute $fn$
    create or replace function public.is_superadmin()
    returns boolean language sql stable security definer set search_path = public
    as $$ select exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'superadmin') $$;
  $fn$;

  create table if not exists public.invoices (
    id text primary key,
    "customerEmail" text not null,
    "customerName" text,
    "planName" text,
    "amountDzd" numeric,
    "amountUsd" numeric,
    "paymentMethod" text,
    status text not null default 'paid',
    date text,
    "createdAt" timestamptz not null default now(),
    "validatedByAdmin" boolean not null default false
  );
  create index if not exists invoices_created_idx on public.invoices ("createdAt" desc);
  create index if not exists invoices_email_idx on public.invoices (lower("customerEmail"));
  alter table public.invoices enable row level security;

  create table if not exists public.platform_settings (
    id text primary key default 'global',
    settings jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
  );
  insert into public.platform_settings (id) values ('global') on conflict (id) do nothing;
  alter table public.platform_settings enable row level security;

  -- Plan commercial du CLIENT (colonne users.plan) : fixe par l'admin dans la
  -- console, repris par defaut par tous ses assistants (futurs compris).
  alter table public.users add column if not exists plan text;

  execute $fn$
    create or replace function public.protect_user_profile()
    returns trigger language plpgsql security definer set search_path = public
    as $$
    begin
      if current_user in ('service_role','postgres','supabase_admin') then return new; end if;
      if tg_op = 'INSERT' then
        if new.role is distinct from 'user' then
          raise exception 'Role initial interdit : un nouveau compte doit etre "user".';
        end if;
        return new;
      end if;
      if new.id is distinct from old.id then raise exception 'Changement d''identifiant interdit.'; end if;
      if new.email is distinct from old.email then raise exception 'Changement d''email interdit depuis le client.'; end if;
      if new.role is distinct from old.role and not public.is_superadmin() then
        raise exception 'Changement de role reserve au superadmin.';
      end if;
      return new;
    end;
    $$;
  $fn$;
  drop trigger if exists trg_protect_user_profile on public.users;
  create trigger trg_protect_user_profile
    before insert or update on public.users
    for each row execute function public.protect_user_profile();

  for pol in
    select * from (values
      ('users','select','admins read all users',        'for select to authenticated using (public.is_admin())'),
      ('users','update','superadmin update all users',  'for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin())'),
      ('users','delete','superadmin delete users',      'for delete to authenticated using (public.is_superadmin())'),
      ('assistants','select','admins read all assistants','for select to authenticated using (public.is_admin())'),
      ('assistants','update','admins update all assistants','for update to authenticated using (public.is_admin()) with check (public.is_admin())'),
      ('assistants','delete','admins delete all assistants','for delete to authenticated using (public.is_admin())'),
      ('prospects','select','admins read all prospects','for select to authenticated using (public.is_admin())'),
      ('prospects','update','admins update all prospects','for update to authenticated using (public.is_admin()) with check (public.is_admin())'),
      ('prospects','delete','admins delete all prospects','for delete to authenticated using (public.is_admin())'),
      ('conversation_contexts','select','admins read conversation usage','for select to authenticated using (public.is_admin())'),
      ('platform_settings','select','admins read platform settings','for select to authenticated using (public.is_admin())'),
      ('platform_settings','all','admins manage platform settings','for all to authenticated using (public.is_admin()) with check (public.is_admin())'),
      ('invoices','all',   'service role only invoices','for all to service_role using (true) with check (true)'),
      ('invoices','select','clients read own invoices', 'for select to authenticated using (lower("customerEmail") = lower(auth.email()))'),
      ('invoices','select','admins read all invoices',  'for select to authenticated using (public.is_admin())'),
      ('invoices','insert','admins create invoices',    'for insert to authenticated with check (public.is_admin())'),
      ('invoices','update','admins update invoices',    'for update to authenticated using (public.is_admin()) with check (public.is_admin())'),
      ('invoices','delete','superadmin delete invoices','for delete to authenticated using (public.is_superadmin())')
    ) as t(tablename, cmd, policyname, definition)
  loop
    if not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = pol.tablename and p.policyname = pol.policyname
    ) then
      execute format('create policy %I on public.%I %s', pol.policyname, pol.tablename, pol.definition);
    end if;
  end loop;

  raise notice 'CONSOLE ADMIN : toutes les permissions sont en place.';
end $console$;`;

// ---------------------------------------------------------------------------
// Normalisation des lignes Supabase (snake_case + jsonb `data`/`config`).
// ---------------------------------------------------------------------------
interface NormUser {
  uid: string; email: string; displayName: string; companyName?: string;
  phoneNumber?: string; role: string; plan?: string; createdAt?: any; _raw: any;
}
function normUser(d: any): NormUser {
  return {
    uid: d.id || d.uid || '',
    email: d.email || '(sans email)',
    displayName: d.display_name || d.displayName || d.name || d.email?.split('@')[0] || 'Utilisateur',
    companyName: d.company_name || d.companyName || undefined,
    phoneNumber: d.phone_number || d.phoneNumber || undefined,
    role: d.role || 'user',
    plan: d.plan || undefined,
    createdAt: d.created_at || d.createdAt,
    _raw: d,
  };
}

interface NormAssistant {
  id: string; userId?: string; businessName: string; websiteUrl?: string;
  plan: string; tone?: string; languages: { fr: boolean; darija: boolean; en: boolean; ar: boolean };
  whatsappEscalation?: string; siteShopping: boolean; autoLeadCapture: boolean;
  businessDescription?: string; faqText?: string; knowledgeNotes?: any[];
  createdAt?: any; updatedAt?: any; _row: any; _cfg: any;
}
function normAssistant(d: any): NormAssistant {
  const cfg = d.config || d.data || {};
  return {
    id: d.id,
    userId: d.user_id || cfg.userId || undefined,
    businessName: cfg.businessName || d.business_name || '(Sans nom)',
    websiteUrl: cfg.websiteUrl || d.website_url || undefined,
    plan: String(cfg.plan || d.plan || 'basic').toLowerCase(),
    tone: cfg.assistantTone || cfg.tone || undefined,
    languages: cfg.languages || { fr: true, darija: true, en: true, ar: false },
    whatsappEscalation: cfg.whatsappEscalation || cfg.whatsappNumber || undefined,
    siteShopping: cfg.siteShopping === true,
    autoLeadCapture: cfg.autoLeadCapture !== false,
    businessDescription: cfg.businessDescription || undefined,
    faqText: cfg.faqText || undefined,
    knowledgeNotes: cfg.knowledgeNotes || d.knowledge_notes || [],
    createdAt: d.created_at || d.createdAt,
    updatedAt: d.updated_at || d.updatedAt,
    _row: d,
    _cfg: cfg,
  };
}

interface NormLead {
  id: string; assistantId?: string; name?: string; phone?: string; email?: string;
  need?: string; status: string; currentPage?: string; messages: any[];
  createdAt?: any; updatedAt?: any; _row: any;
}
function normLead(d: any): NormLead {
  const data = d.data || d;
  return {
    id: d.id,
    assistantId: d.assistant_id || data.assistantId || undefined,
    name: data.name || undefined,
    phone: data.phone || undefined,
    email: data.email || undefined,
    need: data.need || undefined,
    status: data.status || 'nouveau',
    currentPage: data.currentPage || undefined,
    messages: Array.isArray(data.messages) ? data.messages : [],
    createdAt: d.created_at || d.createdAt,
    updatedAt: d.updated_at || d.updatedAt,
    _row: d,
  };
}

interface AdminInvoice {
  id: string; amountUsd?: number; amountDzd?: number; planName?: string;
  customerEmail: string; customerName?: string; paymentMethod?: string;
  status: string; date?: string; createdAt?: any;
}

// ---------------------------------------------------------------------------
// Petits utilitaires d'affichage
// ---------------------------------------------------------------------------
function fmtDate(v: any): string {
  try {
    const d = v ? new Date(v) : null;
    if (!d || isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}
function fmtTime(v: any): string {
  try {
    const d = v ? new Date(v) : null;
    if (!d || isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}
function monthStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}
function downloadCsv(filename: string, rows: string[][]) {
  const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function AdminPage() {
  const { user: authUser, profile, logout } = useAuth();

  // Déverrouillage console (identique à l'original)
  const isSuperAdminLogged = isUserAdmin(profile);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(isSuperAdminLogged);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminEmail, setAdminEmail] = useState('admin@jawebflow.com');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminSectionId>('overview');

  // Données plateforme
  const [usersList, setUsersList] = useState<NormUser[]>([]);
  const [assistantsList, setAssistantsList] = useState<NormAssistant[]>([]);
  const [prospectsList, setProspectsList] = useState<NormLead[]>([]);
  const [invoicesList, setInvoicesList] = useState<AdminInvoice[]>([]);
  const [usageByAssistant, setUsageByAssistant] = useState<Record<string, number>>({});
  const [planLimits, setPlanLimits] = useState<Record<string, number | null>>({ ...DEFAULT_PLAN_LIMITS });
  const [limitsDraft, setLimitsDraft] = useState<Record<string, string>>({
    free: '0', basic: '1000', pro: '5000', enterprise: '',
  });
  const [loadingData, setLoadingData] = useState(true);
  const [savingLimits, setSavingLimits] = useState(false);
  const [sqlReady, setSqlReady] = useState<boolean | null>(null); // platform_settings lisible ?

  // Recherche / filtres / notifications
  const [searchQuery, setSearchQuery] = useState('');
  const [assistantPlanFilter, setAssistantPlanFilter] = useState('all');
  const [leadStatusFilter, setLeadStatusFilter] = useState('all');
  const [leadAssistantFilter, setLeadAssistantFilter] = useState('all');
  const [statusNotification, setStatusNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Modales
  const [editingUser, setEditingUser] = useState<NormUser | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [editingAssistant, setEditingAssistant] = useState<NormAssistant | null>(null);
  const [inspectAssistant, setInspectAssistant] = useState<NormAssistant | null>(null);
  const [inspectLead, setInspectLead] = useState<NormLead | null>(null);
  const [assistantSaving, setAssistantSaving] = useState(false);

  const [showNewInvoiceModal, setShowNewInvoiceModal] = useState(false);
  const [newInvEmail, setNewInvEmail] = useState('');
  const [newInvName, setNewInvName] = useState('');
  const [newInvPlan, setNewInvPlan] = useState<'basic' | 'pro' | 'enterprise'>('pro');
  const [newInvAmountDzd, setNewInvAmountDzd] = useState<number>(18700);
  const [newInvMethod, setNewInvMethod] = useState('baridimob_ccp');
  const [newInvStatus, setNewInvStatus] = useState('paid');
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);

  // Sécurité : tout changement de plan depuis la console exige le mot de
  // passe admin (anti-erreur, anti-abus si une session reste ouverte).
  const [pendingPlan, setPendingPlan] = useState<{ kind: 'user' | 'assistant'; user?: NormUser; assistant?: NormAssistant; plan: string } | null>(null);
  const [pwPassword, setPwPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  // Campagne email (news / annonces aux clients)
  const [campSubject, setCampSubject] = useState('');
  const [campHtml, setCampHtml] = useState('');
  const [campAudience, setCampAudience] = useState('all');
  const [campBusy, setCampBusy] = useState<'preview' | 'prepareTest' | 'prepareReal' | 'cancel' | null>(null);
  const [campMsg, setCampMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [campCount, setCampCount] = useState<number | null>(null);

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setStatusNotification({ type, message });
    setTimeout(() => setStatusNotification(null), 4500);
  };
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  useEffect(() => {
    if (isUserAdmin(profile)) setIsAdminAuthenticated(true);
    else {
      const stored = sessionStorage.getItem('jawebflow_admin_auth');
      if (stored === 'true') setIsAdminAuthenticated(true);
    }
  }, [authUser, profile]);

  useEffect(() => {
    if (isAdminAuthenticated) fetchAllPlatformData();
  }, [isAdminAuthenticated]);

  const fetchAllPlatformData = async () => {
    setLoadingData(true);
    try {
      const [usersRes, asstRes, prosRes, invRes, convRes, settingsRes] = await Promise.all([
        supabase.from('users').select('*'),
        supabase.from('assistants').select('*'),
        supabase.from('prospects').select('*'),
        supabase.from('invoices').select('*').order('createdAt', { ascending: false }),
        supabase.from('conversation_contexts').select('assistant_id, created_at').gte('created_at', monthStartIso()),
        supabase.from('platform_settings').select('*').eq('id', 'global').maybeSingle(),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (asstRes.error) throw asstRes.error;
      if (prosRes.error) throw prosRes.error;

      let invoicesData: any[] = [];
      if (invRes.error) {
        const fb = await supabase.from('invoices').select('*');
        if (fb.error) throw fb.error;
        invoicesData = fb.data || [];
      } else invoicesData = invRes.data || [];

      // Compteur de conversations du mois (table absente / SQL pas encore
      // exécuté => on dégrade sans casser la console).
      const usage: Record<string, number> = {};
      if (!convRes.error && Array.isArray(convRes.data)) {
        for (const r of convRes.data as any[]) {
          if (r?.assistant_id) usage[r.assistant_id] = (usage[r.assistant_id] || 0) + 1;
        }
        setSqlReady(true);
      } else if (convRes.error) {
        setSqlReady(false);
      }
      setUsageByAssistant(usage);

      const settingsRaw = (settingsRes as any)?.data;
      const merged = { ...DEFAULT_PLAN_LIMITS, ...(settingsRaw?.settings?.planLimits || {}) };
      setPlanLimits(merged);
      setLimitsDraft({
        free: String(merged.free ?? ''),
        basic: String(merged.basic ?? ''),
        pro: String(merged.pro ?? ''),
        enterprise: merged.enterprise === null || merged.enterprise === undefined ? '' : String(merged.enterprise),
      });

      setUsersList((usersRes.data || []).map(normUser));
      setAssistantsList((asstRes.data || []).map(normAssistant));
      setProspectsList((prosRes.data || []).map(normLead));
      setInvoicesList(invoicesData.map(d => ({ ...d } as AdminInvoice)));
    } catch (err: any) {
      console.error('Error fetching admin platform data:', err);
      notify('Erreur de synchronisation Supabase : ' + (err.message || 'Vérifiez la connexion'), 'error');
    } finally {
      setLoadingData(false);
    }
  };

  const handleAdminPasswordUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: adminEmail.trim(),
        password: adminPassword,
      });
      if (signInError) throw signInError;
      if (!authData.user) throw new Error('Utilisateur non retourné par Supabase.');
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('role')
        .eq('id', authData.user.id)
        .single();
      if (profileError || !profileData || !isUserAdmin(profileData)) {
        await supabase.auth.signOut();
        throw new Error("Ce compte n'a pas les droits administrateur.");
      }
      sessionStorage.setItem('jawebflow_admin_auth', 'true');
      setIsAdminAuthenticated(true);
    } catch (err: any) {
      setAuthError(err.message || 'Connexion impossible.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Le compte admin (moi-même + superadmins) n'apparaît JAMAIS dans la liste
  // des utilisateurs gérés : la table reste celle des clients.
  const managedUsers = usersList.filter(
    u =>
      u.role !== 'superadmin' &&
      (authUser?.email ? u.email.toLowerCase() !== String(authUser.email).toLowerCase() : true)
  );

  const assistantsByUser = assistantsList.reduce<Record<string, number>>((acc, a) => {
    if (a.userId) acc[a.userId] = (acc[a.userId] || 0) + 1;
    return acc;
  }, {});
  const leadsByAssistant = prospectsList.reduce<Record<string, number>>((acc, l) => {
    if (l.assistantId) acc[l.assistantId] = (acc[l.assistantId] || 0) + 1;
    return acc;
  }, {});
  const userById = usersList.reduce<Record<string, NormUser>>((acc, u) => { acc[u.uid] = u; return acc; }, {});
  const assistantById = assistantsList.reduce<Record<string, NormAssistant>>((acc, a) => { acc[a.id] = a; return acc; }, {});

  const PLAN_RANK: Record<string, number> = { free: 0, basic: 1, pro: 2, enterprise: 3 };
  // Plan du client : celui fixe par l'admin (colonne users.plan), sinon le plus
  // eleve de ses assistants. S'applique a tous ses assistants ET aux futurs.
  const clientPlanOf = (u: NormUser): string => {
    if (u.plan) return u.plan;
    return assistantsList
      .filter(a => a.userId === u.uid)
      .reduce((best, a) => ((PLAN_RANK[a.plan] ?? 0) > (PLAN_RANK[best] ?? 0) ? a.plan : best), 'free');
  };

  const applyUserPlan = async (u: NormUser, plan: string) => {
    try {
      const { error } = await supabase.from('users').update({ plan, updated_at: new Date().toISOString() }).eq('id', u.uid);
      if (error) throw error;
      const owned = assistantsList.filter(a => a.userId === u.uid);
      for (const a of owned) {
        try { await updateAssistantPlan(a.id, plan); } catch { /* on continue */ }
      }
      notify(`Plan de « ${u.displayName} » : ${PLAN_LABELS[plan] || plan} — ${owned.length} assistant(s) mis à jour + appliqué aux futurs.`);
      await fetchAllPlatformData();
    } catch (err: any) {
      notify('Changement de plan refusé : ' + (err.message || 'erreur — exécute le SQL à jour (onglet Système)'), 'error');
    }
  };

  const handleCampaign = async (action: 'preview' | 'prepareTest' | 'prepareReal' | 'cancel') => {
    setCampBusy(action);
    setCampMsg(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch('/api/email/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(
          action === 'cancel'
            ? { action: 'cancel' }
            : action === 'prepareTest'
              ? { action: 'prepare', subject: campSubject, html: campHtml, audience: 'test' }
              : { action, subject: campSubject, html: campHtml, audience: campAudience },
        ),
      });
      const data = await response.json().catch(() => ({}));
      if (!data?.ok) {
        setCampMsg({ type: 'error', text: data?.error || 'Action impossible.' });
        return;
      }
      if (action === 'preview') {
        setCampCount(data.count);
        setCampMsg({ type: 'success', text: `${data.count} destinataire(s) — exemple : ${(data.sample || []).slice(0, 3).join(', ') || '—'}` });
      } else if (action === 'prepareTest') {
        setCampMsg({ type: 'success', text: '✅ Test armé sur TON email. Ouvre ViaSocket → flux « Campagne » → clique Test : il part de ton Gmail. Vérifie ta boîte (et les spams).' });
      } else if (action === 'prepareReal') {
        setCampMsg({ type: 'success', text: `✅ Campagne armée pour ${data.count} client(s). Lance ton flux ViaSocket « Campagne » : les emails partent de TON Gmail, puis la campagne se désarme (jamais envoyée 2 fois).` });
      } else {
        setCampMsg({ type: 'success', text: 'Campagne armée annulée (désarmée).' });
      }
    } catch {
      setCampMsg({ type: 'error', text: 'Erreur réseau — réessaie.' });
    } finally {
      setCampBusy(null);
    }
  };

  const limitForPlan = (plan: string): number | null =>
    plan in planLimits ? planLimits[plan] : planLimits.free ?? 0;

  const totalConversationsThisMonth = Object.values(usageByAssistant).reduce((s: number, n: any) => s + Number(n || 0), 0);
  const revenuePaidUsd = invoicesList.filter(i => i.status === 'paid')
    .reduce((s, i) => s + (Number(i.amountUsd) || 0), 0);
  const pendingInvoices = invoicesList.filter(i => i.status !== 'paid');

  // Filtres + recherche globale
  const q = searchQuery.trim().toLowerCase();
  const match = (s?: string | null) => !q || String(s || '').toLowerCase().includes(q);

  const filteredUsers = managedUsers.filter(u =>
    (match(u.displayName) || match(u.email) || match(u.companyName) || match(u.phoneNumber))
  );
  const filteredAssistants = assistantsList.filter(a =>
    (assistantPlanFilter === 'all' || a.plan === assistantPlanFilter) &&
    (match(a.businessName) || match(a.websiteUrl) || match(userById[a.userId || '']?.email))
  );
  const filteredLeads = prospectsList.filter(l =>
    (leadStatusFilter === 'all' || l.status === leadStatusFilter) &&
    (leadAssistantFilter === 'all' || l.assistantId === leadAssistantFilter) &&
    (match(l.name) || match(l.phone) || match(l.email) || match(l.need))
  );

  const planDist = assistantsList.reduce<Record<string, number>>((acc, a) => {
    acc[a.plan] = (acc[a.plan] || 0) + 1;
    return acc;
  }, {});

  function last14Days(items: any[]) {
    const days: { label: string; n: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const n = items.filter(x => {
        try { const t = new Date(x); return t >= d && t < next; } catch { return false; }
      }).length;
      days.push({ label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), n });
    }
    return days;
  }
  const signups14 = last14Days(managedUsers.map(u => u.createdAt).filter(Boolean));
  const leads14 = last14Days(prospectsList.map(l => l.createdAt).filter(Boolean));

  // ------------------------------------------------------------------ actions
  const handleSaveUser = async () => {
    if (!editingUser) return;
    setEditSaving(true);
    try {
      const { error } = await supabase.from('users').update({
        display_name: editDisplayName.trim(),
        company_name: editCompanyName.trim() || null,
        phone_number: editPhoneNumber.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', editingUser.uid);
      if (error) throw error;
      notify(`Compte « ${editDisplayName} » mis à jour.`);
      setEditingUser(null);
      await fetchAllPlatformData();
    } catch (err: any) {
      notify('Modification refusée : ' + (err.message || 'erreur'), 'error');
    } finally { setEditSaving(false); }
  };

  const handleDeleteUser = async (u: NormUser) => {
    if (!window.confirm(`Supprimer le compte « ${u.displayName} » (${u.email}) ?\n\nSeule la fiche client est supprimée ici ; ses assistants resteront orphelins.`)) return;
    try {
      await deleteUserRecord(u.uid);
      notify('Compte client supprimé.');
      await fetchAllPlatformData();
    } catch (err: any) {
      notify('Suppression impossible : ' + (err.message || 'erreur'), 'error');
    }
  };

  const applyAssistantPlan = async (a: NormAssistant, plan: string) => {
    try {
      await updateAssistantPlan(a.id, plan);
      notify(`Plan de « ${a.businessName} » : ${PLAN_LABELS[plan] || plan}.`);
      await fetchAllPlatformData();
    } catch (err: any) {
      notify('Changement de plan refusé : ' + (err.message || 'erreur'), 'error');
    }
  };

  // Vérifie le mot de passe admin AVANT d'appliquer le changement de plan.
  const confirmPlanWithPassword = async () => {
    if (!pendingPlan) return;
    setPwBusy(true);
    setPwError('');
    try {
      const email = authUser?.email || adminEmail;
      const { error } = await supabase.auth.signInWithPassword({ email, password: pwPassword });
      if (error) throw new Error('Mot de passe incorrect.');
      if (pendingPlan.kind === 'user' && pendingPlan.user) await applyUserPlan(pendingPlan.user, pendingPlan.plan);
      if (pendingPlan.kind === 'assistant' && pendingPlan.assistant) await applyAssistantPlan(pendingPlan.assistant, pendingPlan.plan);
      setPendingPlan(null);
      setPwPassword('');
    } catch (e: any) {
      setPwError(e.message || 'Vérification impossible.');
    } finally {
      setPwBusy(false);
    }
  };

  const handleDeleteAssistant = async (a: NormAssistant) => {
    if (!window.confirm(`Supprimer définitivement l'assistant « ${a.businessName} » ?`)) return;
    try {
      await deleteAssistantDocument(a.id);
      notify('Assistant supprimé.');
      await fetchAllPlatformData();
    } catch (err: any) {
      notify('Suppression impossible : ' + (err.message || 'erreur'), 'error');
    }
  };

  const handleSaveAssistant = async () => {
    if (!editingAssistant) return;
    setAssistantSaving(true);
    try {
      // Lecture -> fusion -> écriture du jsonb config (jamais d'écrasement global)
      const { data: row, error: readErr } = await supabase
        .from('assistants').select('config').eq('id', editingAssistant.id).single();
      if (readErr) throw readErr;
      const mergedCfg = {
        ...((row as any)?.config || {}),
        businessName: editingAssistant.businessName,
        websiteUrl: editingAssistant.websiteUrl || null,
        plan: editingAssistant.plan,
        assistantTone: editingAssistant.tone || 'professionnel',
        languages: editingAssistant.languages,
        whatsappEscalation: editingAssistant.whatsappEscalation || '',
        siteShopping: editingAssistant.siteShopping,
        autoLeadCapture: editingAssistant.autoLeadCapture,
        businessDescription: editingAssistant.businessDescription || '',
        faqText: editingAssistant.faqText || '',
      };
      const { error } = await supabase.from('assistants').update({
        config: mergedCfg,
        updated_at: new Date().toISOString(),
      }).eq('id', editingAssistant.id);
      if (error) throw error;
      notify(`Assistant « ${editingAssistant.businessName} » mis à jour.`);
      setEditingAssistant(null);
      await fetchAllPlatformData();
    } catch (err: any) {
      notify('Enregistrement refusé : ' + (err.message || 'erreur'), 'error');
    } finally { setAssistantSaving(false); }
  };

  const handleLeadStatus = async (lead: NormLead, status: string) => {
    try {
      const { error } = await supabase.from('prospects').update({
        data: { ...(lead._row?.data || {}), status },
        updated_at: new Date().toISOString(),
      }).eq('id', lead.id);
      if (error) throw error;
      setProspectsList(prev => prev.map(l => (l.id === lead.id ? { ...l, status } : l)));
    } catch (err: any) {
      notify('Statut non enregistré : ' + (err.message || 'erreur'), 'error');
    }
  };

  const handleDeleteLead = async (l: NormLead) => {
    if (!window.confirm('Supprimer ce prospect ?')) return;
    try {
      await deleteProspectRecord(l.id);
      notify('Prospect supprimé.');
      await fetchAllPlatformData();
    } catch (err: any) {
      notify('Suppression impossible : ' + (err.message || 'erreur'), 'error');
    }
  };

  const exportLeadsCsv = (mode: 'full' | 'ads') => {
    if (!filteredLeads.length) { notify('Aucun prospect à exporter.', 'error'); return; }
    if (mode === 'full') {
      downloadCsv('prospects_complet.csv', [
        ['ID', 'Date', 'Statut', 'Nom', 'Telephone', 'Email', 'Besoin', 'Assistant', 'Page', 'Dernier message'],
        ...filteredLeads.map(l => [
          l.id, fmtDate(l.createdAt), l.status, l.name || '', l.phone || '', l.email || '',
          l.need || '', assistantById[l.assistantId || '']?.businessName || l.assistantId || '',
          l.currentPage || '', l.messages.length ? l.messages[l.messages.length - 1]?.text || '' : '',
        ]),
      ]);
    } else {
      downloadCsv('audience_publicite.csv', [
        ['Nom', 'Telephone', 'Email', 'Statut'],
        ...filteredLeads.map(l => [l.name || '', l.phone || '', l.email || '', l.status]),
      ]);
    }
    notify('Export CSV téléchargé.');
  };

  const handleCreateInvoice = async () => {
    setIsCreatingInvoice(true);
    try {
      const id = `INV-${Date.now()}`;
      const { error } = await supabase.from('invoices').insert({
        id,
        customerEmail: newInvEmail.trim(),
        customerName: newInvName.trim() || null,
        planName: PLAN_LABELS[newInvPlan],
        amountDzd: newInvAmountDzd,
        amountUsd: PLAN_PRICES[newInvPlan].usd,
        paymentMethod: newInvMethod,
        status: newInvStatus,
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        validatedByAdmin: true,
      });
      if (error) throw error;
      // Montée de plan automatique de TOUS les assistants du client
      const client = managedUsers.find(u => u.email.toLowerCase() === newInvEmail.trim().toLowerCase());
      if (client) {
        const clientAssistants = assistantsList.filter(a => a.userId === client.uid);
        for (const a of clientAssistants) {
          try { await updateAssistantPlan(a.id, newInvPlan); } catch { /* on continue */ }
        }
        notify(`Facture créée. ${clientAssistants.length} assistant(s) passé(s) en ${PLAN_LABELS[newInvPlan]}.`);
      } else {
        notify('Facture créée (aucun compte client trouvé avec cet email : plan non appliqué).');
      }
      setShowNewInvoiceModal(false);
      await fetchAllPlatformData();
    } catch (err: any) {
      notify('Facture non créée : ' + (err.message || 'erreur'), 'error');
    } finally { setIsCreatingInvoice(false); }
  };

  const handleInvoiceStatus = async (inv: AdminInvoice, status: string) => {
    try {
      const { error } = await supabase.from('invoices').update({ status }).eq('id', inv.id);
      if (error) throw error;
      setInvoicesList(prev => prev.map(i => (i.id === inv.id ? { ...i, status } : i)));
    } catch (err: any) {
      notify('Statut non enregistré : ' + (err.message || 'erreur'), 'error');
    }
  };

  const handleDeleteInvoice = async (inv: AdminInvoice) => {
    if (!window.confirm(`Supprimer la facture ${inv.id} (${inv.customerEmail}) ?`)) return;
    try {
      const { error } = await supabase.from('invoices').delete().eq('id', inv.id);
      if (error) throw error;
      notify('Facture supprimée.');
      await fetchAllPlatformData();
    } catch (err: any) {
      notify('Suppression impossible : ' + (err.message || 'erreur'), 'error');
    }
  };

  const handleSaveLimits = async () => {
    setSavingLimits(true);
    try {
      const parse = (s: string): number | null => (s.trim() === '' ? null : Math.max(0, parseInt(s, 10) || 0));
      const newLimits = {
        free: parse(limitsDraft.free) ?? 0,
        basic: parse(limitsDraft.basic) ?? 1000,
        pro: parse(limitsDraft.pro) ?? 5000,
        enterprise: parse(limitsDraft.enterprise),
      };
      const current = await supabase.from('platform_settings').select('settings').eq('id', 'global').maybeSingle();
      const { error } = await supabase.from('platform_settings').upsert({
        id: 'global',
        settings: { ...((current.data as any)?.settings || {}), planLimits: newLimits },
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setPlanLimits(newLimits);
      notify('Quotas enregistrés : ils sappliquent immédiatement sur le web ET Instagram.');
      await fetchAllPlatformData();
    } catch (err: any) {
      notify('Enregistrement impossible (exécute le SQL de l onglet Système) : ' + (err.message || 'erreur'), 'error');
    } finally { setSavingLimits(false); }
  };

  // ------------------------------------------------------------------ render
  if (!isAdminAuthenticated) {
    const nonAdminBlocked = authUser && profile && !isUserAdmin(profile);
    if (nonAdminBlocked) {
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
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">Email Administrateur</label>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white focus:ring-1 focus:ring-purple-600 text-sm transition-all"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">Mot de passe</label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Entrez votre mot de passe maître..."
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:bg-white focus:ring-1 focus:ring-purple-600 text-sm transition-all"
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
                <><Loader2 className="w-4 h-4 animate-spin" /><span>Vérification...</span></>
              ) : (
                <><span>Déverrouiller la Console</span><ArrowRight className="w-4 h-4" /></>
              )}
            </button>
            <div className="pt-2 text-center">
              <a href="/" className="text-xs text-slate-500 hover:text-slate-800 transition-colors">← Retour au site JawebFlow</a>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const navigationItems = [
    {
      group: 'PILOTAGE & KPI',
      items: [{ id: 'overview', label: "Vue d'ensemble", icon: LayoutDashboard, badge: null as string | null }],
    },
    {
      group: 'GESTION GLOBALE',
      items: [
        { id: 'users', label: 'Clients', icon: Users, badge: `${managedUsers.length}` },
        { id: 'assistants', label: 'Tous les Assistants', icon: Bot, badge: `${assistantsList.length}` },
        { id: 'plans', label: 'Plans & Quotas', icon: Gauge, badge: `${totalConversationsThisMonth}` },
        { id: 'leads', label: 'Registre Central Leads', icon: MessageSquare, badge: `${prospectsList.length}` },
        { id: 'invoices', label: 'Factures & Paiements', icon: Receipt, badge: `${invoicesList.length}` },
      ],
    },
    {
      group: 'SYSTÈME',
      items: [{ id: 'system', label: 'Maintenance & SQL', icon: Database, badge: null as string | null }],
    },
  ];

  // widget.js lit l'attribut data-assistant-id (PAS data-widget-id).
  const widgetSnippet = (a: NormAssistant) =>
    `<script src="${window.location.origin}/cdn/widget.js" data-assistant-id="${a.id}" async></script>`;

  const StatCard = ({ icon: Icon, label, value, sub, color }: any) => (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );

  const MiniBars = ({ data, color }: { data: { label: string; n: number }[]; color: string }) => {
    const max = Math.max(1, ...data.map(d => d.n));
    return (
      <div className="flex items-end gap-1 h-20">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
            <div
              className={`w-full rounded-t ${color} opacity-80 group-hover:opacity-100 transition-all`}
              style={{ height: `${Math.max(4, (d.n / max) * 64)}px` }}
              title={`${d.label} : ${d.n}`}
            />
            {i % 3 === 0 && <span className="text-[9px] text-slate-400">{d.label}</span>}
          </div>
        ))}
      </div>
    );
  };

  const Modal = ({ title, children, onClose, wide }: any) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-white border border-slate-200 rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );

  const UsageBar = ({ plan, assistantId }: { plan: string; assistantId: string }) => {
    const limit = limitForPlan(plan);
    const used = usageByAssistant[assistantId] || 0;
    if (limit === null) return <span className="text-xs text-slate-400">{used} · illimité</span>;
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
    const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-xs font-semibold ${pct >= 100 ? 'text-red-600' : 'text-slate-500'}`}>{used}/{limit}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex antialiased selection:bg-purple-500/20 selection:text-purple-900">
      {/* SIDEBAR (design clair d'origine) */}
      <aside className={`fixed top-0 bottom-0 left-0 w-64 bg-white border-r border-slate-200 shadow-sm z-30 flex flex-col justify-between transition-transform duration-200 ease-in-out ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="overflow-y-auto flex-1">
          <div className="p-5 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-sm shadow-purple-600/30">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm">JawebFlow</div>
                <div className="text-[11px] text-purple-600 font-semibold flex items-center gap-1">
                  <Crown className="w-3 h-3" /> Super Admin
                </div>
              </div>
            </div>
          </div>
          <nav className="p-3 space-y-4">
            {navigationItems.map(group => (
              <div key={group.group}>
                <div className="px-3 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{group.group}</div>
                <div className="space-y-0.5">
                  {group.items.map(item => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { setActiveTab(item.id as AdminSectionId); setMobileMenuOpen(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                          active ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon className={`w-4 h-4 ${active ? 'text-purple-600' : 'text-slate-400'}`} />
                          {item.label}
                        </span>
                        {item.badge && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'}`}>{item.badge}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>
        <div className="p-3 border-t border-slate-200">
          <button
            onClick={() => { sessionStorage.removeItem('jawebflow_admin_auth'); logout(); window.location.href = '/'; }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Quitter la console
          </button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-20 md:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* CONTENU */}
      <div className="flex-1 md:ml-64 min-w-0">
        {/* TOPBAR */}
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200">
          <div className="flex items-center gap-3 px-4 sm:px-6 py-3.5">
            <button className="md:hidden p-2 rounded-lg hover:bg-slate-100 cursor-pointer" onClick={() => setMobileMenuOpen(true)}>
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher (nom, email, assistant, téléphone...)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white focus:ring-1 focus:ring-purple-500 transition-all"
              />
            </div>
            <div className="flex-1" />
            <button
              onClick={fetchAllPlatformData}
              className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
              title="Rafraîchir"
            >
              <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
            </button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                {(profile?.displayName || authUser?.email || 'A').slice(0, 1).toUpperCase()}
              </div>
              <div className="text-xs">
                <div className="font-semibold text-slate-800">{profile?.displayName || 'Admin'}</div>
                <div className="text-slate-400">{authUser?.email}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 space-y-6">
          {sqlReady === false && activeTab !== 'system' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-sm text-amber-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>
                Les compteurs de conversations nécessitent une mise à jour des permissions. Onglet <strong>Système</strong> → copie le SQL → colle-le dans Supabase (SQL Editor) → Run.
              </span>
            </div>
          )}

          {/* ============================================ VUE D'ENSEMBLE */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Vue d'ensemble</h1>
                <p className="text-sm text-slate-500">Toute l'activité de la plateforme, en temps réel.</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                <StatCard icon={Users} label="Clients" value={managedUsers.length} sub="comptes actifs" color="bg-blue-50 text-blue-600" />
                <StatCard icon={Bot} label="Assistants" value={assistantsList.length} sub="tous plans" color="bg-purple-50 text-purple-600" />
                <StatCard icon={MessageSquare} label="Prospects" value={prospectsList.length} sub="leads captés" color="bg-emerald-50 text-emerald-600" />
                <StatCard icon={Activity} label="Conversations" value={totalConversationsThisMonth} sub="ce mois-ci" color="bg-orange-50 text-orange-600" />
                <StatCard icon={CreditCard} label="Revenu" value={`$${revenuePaidUsd}`} sub="factures payées" color="bg-green-50 text-green-600" />
                <StatCard icon={Receipt} label="En attente" value={pendingInvoices.length} sub="impayés" color="bg-red-50 text-red-600" />
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Inscriptions clients — 14 jours</div>
                  <MiniBars data={signups14} color="bg-purple-500" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Prospects captés — 14 jours</div>
                  <MiniBars data={leads14} color="bg-emerald-500" />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Répartition des plans</div>
                <div className="space-y-3">
                  {['free', 'basic', 'pro', 'enterprise'].map(plan => {
                    const n = planDist[plan] || 0;
                    const pct = assistantsList.length ? Math.round((n / assistantsList.length) * 100) : 0;
                    return (
                      <div key={plan} className="flex items-center gap-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border w-28 text-center ${PLAN_CHIPS[plan]}`}>{PLAN_LABELS[plan]}</span>
                        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 w-16 text-right">{n} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Derniers clients</div>
                  <div className="space-y-2.5">
                    {managedUsers.slice(0, 3).map(u => (
                      <div key={u.uid} className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">{u.displayName.slice(0, 1).toUpperCase()}</div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{u.displayName}</div>
                          <div className="text-xs text-slate-400 truncate">{u.email}</div>
                        </div>
                      </div>
                    ))}
                    {!managedUsers.length && <div className="text-xs text-slate-400">Aucun client.</div>}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Derniers assistants</div>
                  <div className="space-y-2.5">
                    {assistantsList.slice(0, 3).map(a => (
                      <div key={a.id} className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center"><Bot className="w-4 h-4" /></div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{a.businessName}</div>
                          <div className="text-xs text-slate-400">{PLAN_LABELS[a.plan] || a.plan}</div>
                        </div>
                      </div>
                    ))}
                    {!assistantsList.length && <div className="text-xs text-slate-400">Aucun assistant.</div>}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Derniers prospects</div>
                  <div className="space-y-2.5">
                    {prospectsList.slice(0, 3).map(l => (
                      <div key={l.id} className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><UserCheck className="w-4 h-4" /></div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{l.name || l.phone || l.email || 'Prospect'}</div>
                          <div className="text-xs text-slate-400 truncate">{l.need || l.status}</div>
                        </div>
                      </div>
                    ))}
                    {!prospectsList.length && <div className="text-xs text-slate-400">Aucun prospect.</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================ CLIENTS */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Clients</h1>
                  <p className="text-sm text-slate-500">Uniquement les clients — le plan choisi s'applique à tous les assistants du client, futurs compris.</p>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3 font-semibold">Client</th>
                      <th className="px-4 py-3 font-semibold">Entreprise</th>
                      <th className="px-4 py-3 font-semibold">Téléphone</th>
                      <th className="px-4 py-3 font-semibold">Plan</th>
                      <th className="px-4 py-3 font-semibold text-center">Assistants</th>
                      <th className="px-4 py-3 font-semibold text-center">Prospects</th>
                      <th className="px-4 py-3 font-semibold">Inscrit le</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingData && (
                      <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>
                    )}
                    {!loadingData && filteredUsers.map(u => (
                      <tr key={u.uid} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-all">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">{u.displayName.slice(0, 1).toUpperCase()}</div>
                            <div>
                              <div className="font-medium text-slate-800">{u.displayName}</div>
                              <div className="text-xs text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" />{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{u.companyName ? <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5 text-slate-400" />{u.companyName}</span> : '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{u.phoneNumber || '—'}</td>
                        <td className="px-4 py-3">
                          <select
                            value={clientPlanOf(u)}
                            onChange={(e) => setPendingPlan({ kind: 'user', user: u, plan: e.target.value })}
                            className={`text-xs font-semibold px-2 py-1.5 rounded-lg border cursor-pointer focus:outline-none ${PLAN_CHIPS[clientPlanOf(u)] || PLAN_CHIPS.free}`}
                          >
                            <option value="free">Gratuit — IA bloquée</option>
                            <option value="basic">Basic — 1 000</option>
                            <option value="pro">Pro — 5 000</option>
                            <option value="enterprise">Enterprise — illimité</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-700 font-semibold">{assistantsByUser[u.uid] || 0}</td>
                        <td className="px-4 py-3 text-center text-slate-700 font-semibold">
                          {assistantsList.filter(a => a.userId === u.uid).reduce((s, a) => s + (leadsByAssistant[a.id] || 0), 0)}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(u.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setEditingUser(u);
                                setEditDisplayName(u.displayName);
                                setEditCompanyName(u.companyName || '');
                                setEditPhoneNumber(u.phoneNumber || '');
                              }}
                              className="p-2 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-all cursor-pointer" title="Modifier"
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteUser(u)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer" title="Supprimer">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!loadingData && !filteredUsers.length && (
                      <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400 text-sm">Aucun client trouvé.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============================================ ASSISTANTS */}
          {activeTab === 'assistants' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Tous les assistants</h1>
                  <p className="text-sm text-slate-500">Bloque ou débloque un assistant via son plan, modifie toute sa configuration.</p>
                </div>
                <select
                  value={assistantPlanFilter}
                  onChange={(e) => setAssistantPlanFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-purple-500 cursor-pointer"
                >
                  <option value="all">Tous les plans</option>
                  <option value="free">Gratuit (bloqué)</option>
                  <option value="basic">Basic</option>
                  <option value="pro">Pro / Business</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3 font-semibold">Assistant</th>
                      <th className="px-4 py-3 font-semibold">Client</th>
                      <th className="px-4 py-3 font-semibold">Plan (verrou IA)</th>
                      <th className="px-4 py-3 font-semibold">Usage du mois</th>
                      <th className="px-4 py-3 font-semibold text-center">Leads</th>
                      <th className="px-4 py-3 font-semibold">Créé le</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingData && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>}
                    {!loadingData && filteredAssistants.map(a => (
                      <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-all">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center"><Bot className="w-4 h-4" /></div>
                            <div>
                              <div className="font-medium text-slate-800">{a.businessName}</div>
                              <div className="text-xs text-slate-400 truncate max-w-[180px]">{a.websiteUrl || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{userById[a.userId || '']?.email || a.userId?.slice(0, 8) || '—'}</td>
                        <td className="px-4 py-3">
                          <select
                            value={a.plan}
                            onChange={(e) => setPendingPlan({ kind: 'assistant', assistant: a, plan: e.target.value })}
                            className={`text-xs font-semibold px-2 py-1.5 rounded-lg border cursor-pointer focus:outline-none ${PLAN_CHIPS[a.plan] || PLAN_CHIPS.free}`}
                          >
                            <option value="free">Gratuit — IA bloquée</option>
                            <option value="basic">Basic — 1 000</option>
                            <option value="pro">Pro — 5 000</option>
                            <option value="enterprise">Enterprise — illimité</option>
                          </select>
                        </td>
                        <td className="px-4 py-3"><UsageBar plan={a.plan} assistantId={a.id} /></td>
                        <td className="px-4 py-3 text-center text-slate-700 font-semibold">{leadsByAssistant[a.id] || 0}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(a.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleCopy(widgetSnippet(a), `snippet-${a.id}`)}
                              className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-pointer" title="Copier le code du widget"
                            >
                              {copiedField === `snippet-${a.id}` ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setInspectAssistant(a)} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer" title="Voir la config JSON">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingAssistant(a);
                              }}
                              className="p-2 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-all cursor-pointer" title="Modifier"
                            >
                              <Sparkles className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteAssistant(a)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer" title="Supprimer">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!loadingData && !filteredAssistants.length && (
                      <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400 text-sm">Aucun assistant trouvé.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============================================ PLANS & QUOTAS */}
          {activeTab === 'plans' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Plans & Quotas</h1>
                <p className="text-sm text-slate-500">
                  Les limites bloquent réellement l'IA (web + Instagram) dès qu'elles sont atteintes.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { id: 'free', name: 'Gratuit', desc: '0 crédit IA — lIA ne répond jamais', color: 'slate' },
                  { id: 'basic', name: 'Basic', desc: 'conversations / mois', color: 'blue' },
                  { id: 'pro', name: 'Pro / Business', desc: 'conversations / mois', color: 'purple' },
                  { id: 'enterprise', name: 'Enterprise', desc: 'laisser VIDE = illimité', color: 'amber' },
                ].map(p => (
                  <div key={p.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${p.color === 'slate' ? 'text-slate-500' : p.color === 'blue' ? 'text-blue-600' : p.color === 'purple' ? 'text-purple-600' : 'text-amber-600'}`}>
                      {p.name}
                    </div>
                    <input
                      type="number"
                      min={0}
                      disabled={p.id === 'free'}
                      value={limitsDraft[p.id]}
                      onChange={(e) => setLimitsDraft(prev => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder={p.id === 'enterprise' ? 'Illimité' : '0'}
                      className="w-full text-2xl font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 focus:bg-white disabled:bg-slate-100 disabled:text-slate-400 transition-all"
                    />
                    <div className="text-xs text-slate-400 mt-2">{p.id === 'free' ? p.desc : `${p.desc} · ${p.id === 'basic' ? '6850 DA' : p.id === 'pro' ? '18 700 DA' : '47 100 DA'}`}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveLimits}
                  disabled={savingLimits}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm shadow-sm shadow-purple-600/30 disabled:opacity-50 flex items-center gap-2 transition-all cursor-pointer"
                >
                  {savingLimits ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Enregistrer les quotas
                </button>
                <span className="text-xs text-slate-400">Application immédiate, sans redémarrage.</span>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-600" />
                  <span className="font-semibold text-slate-800 text-sm">Consommation par assistant — {totalConversationsThisMonth} conversations ce mois</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3 font-semibold">Assistant</th>
                      <th className="px-4 py-3 font-semibold">Plan</th>
                      <th className="px-4 py-3 font-semibold">Consommation</th>
                      <th className="px-4 py-3 font-semibold">État</th>
                    </tr>
                  </thead>
                  <tbody>
                  {assistantsList.map(a => (
                    <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-medium text-slate-800">{a.businessName}</td>
                      <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PLAN_CHIPS[a.plan] || PLAN_CHIPS.free}`}>{PLAN_LABELS[a.plan] || a.plan}</span></td>
                      <td className="px-4 py-3"><UsageBar plan={a.plan} assistantId={a.id} /></td>
                      <td className="px-4 py-3">
                        {(() => {
                          const limit = limitForPlan(a.plan);
                          const used = usageByAssistant[a.id] || 0;
                          if (limit === 0) return <span className="text-xs font-semibold text-slate-500">IA bloquée (Gratuit)</span>;
                          if (limit === null) return <span className="text-xs font-semibold text-emerald-600">Illimité</span>;
                          if (used >= limit) return <span className="text-xs font-semibold text-red-600">Limite atteinte — envois bloqués</span>;
                          if (used >= limit * 0.8) return <span className="text-xs font-semibold text-amber-600">Presque à la limite</span>;
                          return <span className="text-xs font-semibold text-emerald-600">OK</span>;
                        })()}
                      </td>
                    </tr>
                  ))}
                  {!assistantsList.length && (
                    <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-400 text-sm">Aucun assistant.</td></tr>
                  )}
                </tbody>
                </table>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3 text-sm text-blue-800">
                <Zap className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Comment ça marche :</strong> chaque réponse de l'IA compte pour 1 conversation (web + Instagram, comptées séparément pour chaque assistant).
                  Plan Gratuit = l'IA ne répond jamais. Basic = 1 000/mois, Pro = 5 000/mois, Enterprise = illimité.
                  Une fois la limite atteinte, l'IA bloque l'envoi et invite le client à upgrader — et toi, tu peux changer son plan ici ou dans l'onglet Assistants.
                </span>
              </div>
            </div>
          )}

          {/* ============================================ LEADS */}
          {activeTab === 'leads' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Registre central des leads</h1>
                  <p className="text-sm text-slate-500">Tous les prospects captés par tous les assistants.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={leadStatusFilter} onChange={(e) => setLeadStatusFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-purple-500 cursor-pointer">
                    <option value="all">Tous les statuts</option>
                    <option value="nouveau">Nouveau</option>
                    <option value="qualifie">Qualifié</option>
                    <option value="converti">Converti</option>
                  </select>
                  <select value={leadAssistantFilter} onChange={(e) => setLeadAssistantFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm max-w-[200px] focus:outline-none focus:border-purple-500 cursor-pointer">
                    <option value="all">Tous les assistants</option>
                    {assistantsList.map(a => <option key={a.id} value={a.id}>{a.businessName}</option>)}
                  </select>
                  <button onClick={() => exportLeadsCsv('full')} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm hover:bg-slate-50 flex items-center gap-1.5 transition-all cursor-pointer">
                    <Download className="w-4 h-4" /> CSV complet
                  </button>
                  <button onClick={() => exportLeadsCsv('ads')} className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold flex items-center gap-1.5 shadow-sm shadow-purple-600/30 transition-all cursor-pointer">
                    <Download className="w-4 h-4" /> Audience pub
                  </button>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3 font-semibold">Prospect</th>
                      <th className="px-4 py-3 font-semibold">Besoin</th>
                      <th className="px-4 py-3 font-semibold">Assistant</th>
                      <th className="px-4 py-3 font-semibold">Statut</th>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingData && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>}
                    {!loadingData && filteredLeads.map(l => (
                      <tr key={l.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-all">
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-800">{l.name || 'Prospect anonyme'}</div>
                          <div className="text-xs text-slate-400 flex flex-wrap gap-x-3">
                            {l.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{l.phone}</span>}
                            {l.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{l.email}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-[220px]"><div className="truncate">{l.need || '—'}</div></td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{assistantById[l.assistantId || '']?.businessName || '—'}</td>
                        <td className="px-4 py-3">
                          <select
                            value={l.status}
                            onChange={(e) => handleLeadStatus(l, e.target.value)}
                            className={`text-xs font-semibold px-2 py-1.5 rounded-lg border cursor-pointer focus:outline-none ${
                              l.status === 'converti' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : l.status === 'qualifie' ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            <option value="nouveau">Nouveau</option>
                            <option value="qualifie">Qualifié</option>
                            <option value="converti">Converti</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(l.createdAt)} {fmtTime(l.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => setInspectLead(l)} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer" title="Détail + conversation">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteLead(l)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer" title="Supprimer">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!loadingData && !filteredLeads.length && (
                      <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">Aucun prospect trouvé.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============================================ FACTURES */}
          {activeTab === 'invoices' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Factures & Paiements</h1>
                  <p className="text-sm text-slate-500">Créer une facture monte automatiquement le plan des assistants du client.</p>
                </div>
                <button
                  onClick={() => { setShowNewInvoiceModal(true); }}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold flex items-center gap-2 shadow-sm shadow-purple-600/30 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Nouvelle facture
                </button>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3 font-semibold">Facture</th>
                      <th className="px-4 py-3 font-semibold">Client</th>
                      <th className="px-4 py-3 font-semibold">Plan</th>
                      <th className="px-4 py-3 font-semibold">Montant</th>
                      <th className="px-4 py-3 font-semibold">Statut</th>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingData && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>}
                    {!loadingData && invoicesList.map(inv => (
                      <tr key={inv.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-all">
                        <td className="px-5 py-3 font-mono text-xs text-slate-600">{inv.id}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{inv.customerName || '—'}</div>
                          <div className="text-xs text-slate-400">{inv.customerEmail}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{inv.planName || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {Number(inv.amountDzd) ? `${Number(inv.amountDzd).toLocaleString('fr-FR')} DA` : `$${inv.amountUsd || 0}`}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={inv.status}
                            onChange={(e) => handleInvoiceStatus(inv, e.target.value)}
                            className={`text-xs font-semibold px-2 py-1.5 rounded-lg border cursor-pointer focus:outline-none ${
                              inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : inv.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            <option value="paid">Payée</option>
                            <option value="pending">En attente</option>
                            <option value="failed">Échouée</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(inv.createdAt || inv.date)}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleDeleteInvoice(inv)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer" title="Supprimer">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!loadingData && !invoicesList.length && (
                      <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400 text-sm">Aucune facture.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============================================ SYSTÈME */}
          {activeTab === 'system' && (
            <div className="space-y-6 max-w-4xl">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Maintenance & SQL</h1>
                <p className="text-sm text-slate-500">État de la plateforme et permissions de la console.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Connexion Supabase</div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-slate-700">Données chargées correctement</span>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Compteurs de quota</div>
                  <div className="flex items-center gap-2 text-sm">
                    {sqlReady === false ? (
                      <><AlertCircle className="w-4 h-4 text-amber-500" /><span className="text-amber-700">SQL à exécuter (ci-dessous)</span></>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span className="text-slate-700">Opérationnels</span></>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="font-semibold text-slate-800 text-sm">SQL des permissions console (une seule fois)</div>
                    <div className="text-xs text-slate-500">Copie TOUT le bloc, colle-le dans Supabase → SQL Editor → Run. Sans risque, ré-exécutable.</div>
                  </div>
                  <button
                    onClick={() => handleCopy(CONSOLE_SQL, 'console-sql')}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-purple-600/30 transition-all cursor-pointer"
                  >
                    {copiedField === 'console-sql' ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedField === 'console-sql' ? 'Copié !' : 'Copier le SQL'}
                  </button>
                </div>
                <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-[11px] leading-relaxed overflow-x-auto max-h-72 overflow-y-auto whitespace-pre">
                  {CONSOLE_SQL}
                </pre>
              </div>

              {/* CAMPAGNE EMAIL (news / annonces) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="mb-3">
                  <div className="font-semibold text-slate-800 text-sm">📣 Campagne email (news, annonces, promos)</div>
                  <div className="text-xs text-slate-500">100 % ViaSocket : l'envoi part de TON Gmail — aucune clé Brevo. Uniquement tes clients (comptes existants, jamais les prospects), désabonnement « STOP » auto, envoi unique (la campagne se désarme après).</div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Sujet</label>
                    <input value={campSubject} onChange={(e) => setCampSubject(e.target.value)} maxLength={150} placeholder="🎉 Nouveauté JawebFlow : vos bots comprennent les photos !" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Message (HTML simple accepté : &lt;b&gt;, &lt;br&gt;, &lt;a href&gt;...)</label>
                    <textarea value={campHtml} onChange={(e) => setCampHtml(e.target.value)} rows={6} placeholder="Bonjour,<br><br>Nous sommes ravis de vous annoncer que...<br><br>L'équipe JawebFlow" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono text-xs focus:outline-none focus:border-purple-500 focus:bg-white" />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <select value={campAudience} onChange={(e) => { setCampAudience(e.target.value); setCampCount(null); }} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-purple-500 cursor-pointer">
                      <option value="all">Tous les clients</option>
                      <option value="paid">Clients payés (Basic, Pro, Enterprise)</option>
                    </select>
                    <button onClick={() => handleCampaign('preview')} disabled={campBusy !== null || !campSubject || !campHtml} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
                      {campBusy === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Compter les destinataires'}
                    </button>
                    <button onClick={() => handleCampaign('prepareTest')} disabled={campBusy !== null || !campSubject || !campHtml} className="px-3 py-2 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 text-sm font-semibold hover:bg-purple-100 disabled:opacity-50 cursor-pointer">
                      {campBusy === 'prepareTest' ? <Loader2 className="w-4 h-4 animate-spin" /> : '1. Tester sur moi'}
                    </button>
                    <button
                      onClick={() => { if (window.confirm(`Armer la campagne pour ${campCount ?? '?'} client(s) ?\n\nElle partira de TON Gmail via ton flux ViaSocket « Campagne » (envoi unique).\n\nRappel anti-spam : max 1 à 2 campagnes par mois.`)) handleCampaign('prepareReal'); }}
                      disabled={campBusy !== null || !campSubject || !campHtml || !campCount}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold shadow-sm shadow-purple-600/30 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      title={campCount === null ? "Compte d'abord les destinataires" : ''}
                    >
                      {campBusy === 'prepareReal' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} 2. Armer la campagne{campCount !== null ? ` (${campCount})` : ''}
                    </button>
                    <button onClick={() => handleCampaign('cancel')} disabled={campBusy !== null} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
                      {campBusy === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Annuler la campagne armée'}
                    </button>
                  </div>
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 space-y-1">
                    <p className="font-semibold">📤 L'envoi se fait dans VIASOCKET (ton Gmail) — comme le résumé de 21h :</p>
                    <p>1. Dans ton flux ViaSocket « Campagne », colle l'URL : <code className="bg-white px-1.5 py-0.5 rounded border border-sky-200 break-all">https://jawebflow.pages.dev/api/email/campaign?token=jwb-Telya-2026-K7mQ9xR2vB8nW4pZ&amp;mode=json</code></p>
                    <p>2. Boucle sur <code className="bg-white px-1 rounded border border-sky-200">recipients</code> → Gmail : <code className="bg-white px-1 rounded border border-sky-200">{'to={{email}}  subject={{subject}}  body(html)={{html}}'}</code> (ou « Ask AI to Build »)</p>
                    <p>3. Clique <b>Test</b> dans ViaSocket au moment voulu : les emails partent, la campagne se désarme toute seule (jamais 2 fois).</p>
                  </div>
                  {campMsg && (
                    <div className={`rounded-xl p-3 text-xs flex items-start gap-2 ${campMsg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                      {campMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                      <span>{campMsg.text}</span>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-400">Bonnes pratiques : 1 à 2 campagnes par mois maximum · teste TOUJOURS sur toi d'abord · Gmail gratuit ≈ 500 envois/jour (plafond de sécurité : 400 par campagne).</p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ============================================ MODALES */}
      {editingUser && (
        <Modal title={`Modifier — ${editingUser.displayName}`} onClose={() => setEditingUser(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Nom affiché</label>
              <input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Entreprise</label>
              <input value={editCompanyName} onChange={(e) => setEditCompanyName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Téléphone</label>
              <input value={editPhoneNumber} onChange={(e) => setEditPhoneNumber(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={handleSaveUser} disabled={editSaving} className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
                {editSaving && <Loader2 className="w-4 h-4 animate-spin" />} Enregistrer
              </button>
              <button onClick={() => setEditingUser(null)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 cursor-pointer">Annuler</button>
            </div>
          </div>
        </Modal>
      )}

      {editingAssistant && (() => {
        const [local, setLocal] = [editingAssistant, setEditingAssistant];
        return (
          <Modal title={`Assistant — ${local.businessName}`} onClose={() => setEditingAssistant(null)} wide>
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Nom de l'entreprise</label>
                  <input value={local.businessName} onChange={(e) => setLocal({ ...local, businessName: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Site web</label>
                  <input value={local.websiteUrl || ''} onChange={(e) => setLocal({ ...local, websiteUrl: e.target.value })} placeholder="https://..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Plan (verrou IA)</label>
                  <select value={local.plan} onChange={(e) => setLocal({ ...local, plan: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 cursor-pointer">
                    <option value="free">Gratuit — IA bloquée</option>
                    <option value="basic">Basic — 1 000 conv/mois</option>
                    <option value="pro">Pro — 5 000 conv/mois</option>
                    <option value="enterprise">Enterprise — illimité</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Ton</label>
                  <select value={local.tone || 'professionnel'} onChange={(e) => setLocal({ ...local, tone: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 cursor-pointer">
                    <option value="professionnel">Professionnel</option>
                    <option value="amical">Amical</option>
                    <option value="enthousiaste">Enthousiaste</option>
                    <option value="concis">Concis</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">WhatsApp (escalade)</label>
                  <input value={local.whatsappEscalation || ''} onChange={(e) => setLocal({ ...local, whatsappEscalation: e.target.value })} placeholder="+213..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white" />
                </div>
                <div className="flex items-end gap-6 pb-1">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={local.siteShopping} onChange={(e) => setLocal({ ...local, siteShopping: e.target.checked })} className="accent-purple-600 w-4 h-4" />
                    Commandes via le site
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={local.autoLeadCapture} onChange={(e) => setLocal({ ...local, autoLeadCapture: e.target.checked })} className="accent-purple-600 w-4 h-4" />
                    Capture auto des leads
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Langues de réponse</label>
                <div className="flex flex-wrap gap-4">
                  {([['fr', 'Français'], ['darija', 'Darija'], ['en', 'Anglais'], ['ar', 'Arabe']] as const).map(([k, lbl]) => (
                    <label key={k} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!local.languages?.[k]}
                        onChange={(e) => setLocal({ ...local, languages: { ...local.languages, [k]: e.target.checked } })}
                        className="accent-purple-600 w-4 h-4"
                      />
                      {lbl}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Description de l'entreprise</label>
                <textarea value={local.businessDescription || ''} onChange={(e) => setLocal({ ...local, businessDescription: e.target.value })} rows={2} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">FAQ</label>
                <textarea value={local.faqText || ''} onChange={(e) => setLocal({ ...local, faqText: e.target.value })} rows={3} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Code du widget (à copier chez le client)</label>
                <div className="flex gap-2">
                  <code className="flex-1 bg-slate-900 text-emerald-300 rounded-xl px-4 py-2.5 text-xs overflow-x-auto whitespace-nowrap">{widgetSnippet(local)}</code>
                  <button onClick={() => handleCopy(widgetSnippet(local), 'modal-snippet')} className="px-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    {copiedField === 'modal-snippet' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-500" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleSaveAssistant} disabled={assistantSaving} className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
                  {assistantSaving && <Loader2 className="w-4 h-4 animate-spin" />} Enregistrer
                </button>
                <button onClick={() => setEditingAssistant(null)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 cursor-pointer">Annuler</button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {inspectAssistant && (
        <Modal title={`Configuration JSON — ${inspectAssistant.businessName}`} onClose={() => setInspectAssistant(null)} wide>
          <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-[11px] leading-relaxed overflow-auto max-h-[60vh]">
            {JSON.stringify(inspectAssistant._row, null, 2)}
          </pre>
        </Modal>
      )}

      {inspectLead && (
        <Modal title={`Prospect — ${inspectLead.name || inspectLead.phone || inspectLead.email || inspectLead.id}`} onClose={() => setInspectLead(null)} wide>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Contact</div>
                <div className="text-slate-800 font-medium">{inspectLead.name || '—'}</div>
                <div className="text-slate-600">{inspectLead.phone || '—'}</div>
                <div className="text-slate-600">{inspectLead.email || '—'}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Contexte</div>
                <div className="text-slate-600">Assistant : {assistantById[inspectLead.assistantId || '']?.businessName || '—'}</div>
                <div className="text-slate-600">Page : {inspectLead.currentPage || '—'}</div>
                <div className="text-slate-600">Statut : {inspectLead.status}</div>
              </div>
            </div>
            {inspectLead.need && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm text-purple-900">
                <div className="text-xs uppercase tracking-wider text-purple-500 mb-1">Besoin exprimé</div>
                {inspectLead.need}
              </div>
            )}
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Conversation ({inspectLead.messages.length} messages)</div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {inspectLead.messages.map((m: any, i: number) => (
                  <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.sender === 'user' ? 'bg-slate-100 text-slate-800 ml-auto' : 'bg-purple-50 text-purple-900'}`}>
                    <div className="text-[10px] opacity-60 mb-0.5">{m.sender === 'user' ? 'Visiteur' : 'IA'}{m.timestamp ? ` · ${fmtTime(m.timestamp)}` : ''}</div>
                    {m.text}
                  </div>
                ))}
                {!inspectLead.messages.length && <div className="text-xs text-slate-400">Aucun message enregistré.</div>}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {showNewInvoiceModal && (
        <Modal title="Nouvelle facture" onClose={() => setShowNewInvoiceModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Email du client</label>
              <input value={newInvEmail} onChange={(e) => setNewInvEmail(e.target.value)} placeholder="client@exemple.com" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Nom du client (optionnel)</label>
              <input value={newInvName} onChange={(e) => setNewInvName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Plan facturé</label>
                <select
                  value={newInvPlan}
                  onChange={(e) => {
                    const p = e.target.value as 'basic' | 'pro' | 'enterprise';
                    setNewInvPlan(p);
                    setNewInvAmountDzd(PLAN_PRICES[p].dzd);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 cursor-pointer"
                >
                  <option value="basic">Basic</option>
                  <option value="pro">Pro / Business</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Montant (DA)</label>
                <input type="number" value={newInvAmountDzd} onChange={(e) => setNewInvAmountDzd(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Moyen de paiement</label>
                <select value={newInvMethod} onChange={(e) => setNewInvMethod(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 cursor-pointer">
                  <option value="baridimob_ccp">BaridiMob / CCP</option>
                  <option value="slickpay_dzd">Slickpay (CIB)</option>
                  <option value="stripe_card">Carte (Stripe)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Statut</label>
                <select value={newInvStatus} onChange={(e) => setNewInvStatus(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 cursor-pointer">
                  <option value="paid">Payée</option>
                  <option value="pending">En attente</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-500 bg-blue-50 border border-blue-200 rounded-xl p-3">
              À la création, tous les assistants de ce client passent automatiquement au plan facturé (l'IA sera débloquée à sa limite).
            </p>
            <div className="flex gap-2 pt-2">
              <button onClick={handleCreateInvoice} disabled={isCreatingInvoice || !newInvEmail.trim()} className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
                {isCreatingInvoice && <Loader2 className="w-4 h-4 animate-spin" />} Créer la facture
              </button>
              <button onClick={() => setShowNewInvoiceModal(false)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 cursor-pointer">Annuler</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation mot de passe pour changement de plan */}
      {pendingPlan && (
        <Modal title="Confirmer le changement de plan" onClose={() => { setPendingPlan(null); setPwError(''); }}>
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm text-purple-900">
              {pendingPlan.kind === 'user' ? (
                <>Plan de <strong>{pendingPlan.user?.displayName}</strong> → <strong>{PLAN_LABELS[pendingPlan.plan] || pendingPlan.plan}</strong> — tous ses assistants, futurs compris.</>
              ) : (
                <>Plan de l'assistant <strong>{pendingPlan.assistant?.businessName}</strong> → <strong>{PLAN_LABELS[pendingPlan.plan] || pendingPlan.plan}</strong>.</>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Ton mot de passe admin</label>
              <input
                type="password"
                value={pwPassword}
                onChange={(e) => setPwPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmPlanWithPassword(); }}
                placeholder="Mot de passe administrateur..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white"
                autoFocus
              />
            </div>
            {pwError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{pwError}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={confirmPlanWithPassword} disabled={pwBusy || !pwPassword} className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
                {pwBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Confirmer et appliquer
              </button>
              <button onClick={() => { setPendingPlan(null); setPwError(''); }} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 cursor-pointer">Annuler</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Notification toast */}
      {statusNotification && (
        <div className={`fixed top-20 right-6 z-[60] max-w-sm rounded-2xl border p-4 shadow-xl flex items-start gap-3 text-sm ${
          statusNotification.type === 'success' ? 'bg-white border-emerald-200 text-slate-800' : 'bg-white border-red-200 text-slate-800'
        }`}>
          {statusNotification.type === 'success'
            ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            : <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />}
          <span>{statusNotification.message}</span>
        </div>
      )}
    </div>
  );
}

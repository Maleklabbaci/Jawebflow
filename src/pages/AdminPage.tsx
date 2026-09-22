import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield, Users, Bot, Receipt, Database, LayoutDashboard, Search, Crown,
  CheckCircle2, AlertCircle, Trash2, ExternalLink, Sparkles, LogOut, Plus,
  Download, RefreshCw, MessageSquare, Phone, Mail, Building2, Calendar,
  CreditCard, Activity, Eye, X, Lock, Copy, Check, Loader2, Target,
  Pencil, Settings2, BarChart3, TrendingUp, Wallet, Globe, Zap, UserCog,
  FileJson, ChevronRight,
} from 'lucide-react';
import { isUserAdmin, supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export type AdminSectionId = 'overview' | 'users' | 'assistants' | 'leads' | 'invoices' | 'system';

// ---------------------------------------------------------------------------
// Normalisation des lignes Supabase (tolère snake_case + jsonb + ancien plat)
// ---------------------------------------------------------------------------

function normUser(row: any) {
  return {
    uid: row.id || row.uid,
    email: row.email || '',
    displayName: row.display_name || row.displayName || (row.email || '').split('@')[0],
    companyName: row.company_name || row.companyName || '',
    phoneNumber: row.phone_number || row.phoneNumber || '',
    photoURL: row.photo_url || row.photoURL || '',
    role: row.role || 'user',
    createdAt: row.created_at || row.createdAt || '',
  };
}

function normAssistant(row: any) {
  const cfg = row.config && typeof row.config === 'object' ? row.config : {};
  return {
    ...cfg,
    id: row.id,
    userId: row.user_id || row.userId || cfg.userId || '',
    businessName: row.business_name || cfg.businessName || 'Sans nom',
    websiteUrl: row.website_url || cfg.websiteUrl || '',
    knowledgeNotes: row.knowledge_notes || cfg.knowledgeNotes || [],
    createdAt: row.created_at || row.createdAt || '',
    updatedAt: row.updated_at || row.updatedAt || '',
    rawConfig: cfg,
  } as any;
}

function normLead(row: any) {
  const d = row.data && typeof row.data === 'object' ? row.data : row;
  return {
    id: row.id,
    assistantId: row.assistant_id || d.assistantId || '',
    name: d.name || d.full_name || 'Visiteur',
    phone: d.phone || d.phone_number || '',
    email: (d.email && !String(d.email).startsWith('Non')) ? d.email : '',
    need: d.need || d.message || d.request || '',
    status: d.status || 'nouveau',
    date: row.updated_at || row.created_at || d.date || '',
    currentPage: d.currentPage || '',
    userAgent: d.userAgent || '',
    messages: Array.isArray(d.messages) ? d.messages : [],
    raw: d,
  };
}

// ---------------------------------------------------------------------------
// Petits utilitaires
// ---------------------------------------------------------------------------

const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (d: any) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const money = (n: any) => (Number(n) || 0).toLocaleString('fr-FR') + ' DA';

function timeAgo(d: any) {
  if (!d) return '—';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (isNaN(s) || s < 0) return '—';
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

function daySeries(dates: any[], days = 14) {
  const out: { label: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - i);
    const next = new Date(day); next.setDate(next.getDate() + 1);
    const count = dates.filter(d => { const t = new Date(d).getTime(); return t >= day.getTime() && t < next.getTime(); }).length;
    out.push({ label: day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), value: count });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mini-composants UI
// ---------------------------------------------------------------------------

const inp = 'w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40';
const btnPrimary = 'inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors';
const btnGhost = 'inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium px-3 py-2 rounded-lg border border-slate-700 transition-colors';
const btnDanger = 'inline-flex items-center gap-2 bg-rose-600/90 hover:bg-rose-500 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors';
const iconBtn = 'p-1.5 rounded-md hover:bg-slate-700/70 text-slate-400 hover:text-white transition-colors';

function Badge({ tone, children }: { tone: 'violet' | 'green' | 'amber' | 'rose' | 'sky' | 'slate'; children: React.ReactNode }) {
  const tones: any = {
    violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    sky: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    slate: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

function roleBadge(role: string) {
  if (role === 'superadmin') return <Badge tone="violet"><Crown size={11} /> Super Admin</Badge>;
  if (role === 'admin') return <Badge tone="sky"><Shield size={11} /> Admin</Badge>;
  return <Badge tone="slate">Client</Badge>;
}

function planBadge(plan?: string) {
  const p = (plan || 'free').toLowerCase();
  if (p === 'enterprise') return <Badge tone="violet">Enterprise</Badge>;
  if (p === 'pro') return <Badge tone="sky">Pro</Badge>;
  if (p === 'basic') return <Badge tone="amber">Basic</Badge>;
  return <Badge tone="slate">Gratuit</Badge>;
}

function leadBadge(status: string) {
  const s = (status || '').toLowerCase();
  if (s.includes('converti') || s.includes('closed')) return <Badge tone="green">Converti</Badge>;
  if (s.includes('qualif')) return <Badge tone="violet">Qualifié</Badge>;
  if (s.includes('contact')) return <Badge tone="sky">Contacté</Badge>;
  if (s.includes('perdu')) return <Badge tone="rose">Perdu</Badge>;
  return <Badge tone="amber">Nouveau</Badge>;
}

function invoiceBadge(status: string) {
  const s = (status || '').toLowerCase();
  if (s === 'paid') return <Badge tone="green">Payée</Badge>;
  if (s === 'pending') return <Badge tone="amber">En attente</Badge>;
  return <Badge tone="rose">Échouée</Badge>;
}

function StatCard({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
      <div className={`p-2.5 rounded-xl ${accent}`}><Icon size={18} /></div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
        <div className="text-xl font-bold text-white truncate">{value}</div>
        {sub && <div className="text-[11px] text-slate-500 truncate">{sub}</div>}
      </div>
    </div>
  );
}

function MiniBars({ series, color }: { series: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...series.map(s => s.value), 1);
  return (
    <div>
      <div className="flex items-end gap-1 h-24">
        {series.map((s, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end h-full" title={`${s.label} : ${s.value}`}>
            <div className="w-full rounded-t-md" style={{ height: `${Math.max((s.value / max) * 100, s.value > 0 ? 6 : 2)}%`, background: color, opacity: s.value > 0 ? 1 : 0.2 }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1">
        {series.map((s, i) => (
          <div key={i} className="flex-1 text-center text-[8px] text-slate-600 truncate">{i % 2 === 0 ? s.label : ''}</div>
        ))}
      </div>
    </div>
  );
}

function HBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-slate-400 truncate">{label}</span>
      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color }} />
      </div>
      <span className="w-8 text-right text-slate-300 font-semibold">{value}</span>
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-slate-900 border border-slate-700 rounded-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[85vh] overflow-y-auto shadow-2xl`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <h3 className="text-white font-bold">{title}</h3>
          <button className={iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2 text-sm text-slate-300">
      <span className={`w-9 h-5 rounded-full relative transition-colors ${checked ? 'bg-violet-600' : 'bg-slate-700'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  );
}

const th = 'px-3 py-2.5 text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap';
const td = 'px-3 py-3 text-sm text-slate-300 align-middle';

// ---------------------------------------------------------------------------
// SQL de la console (même contenu que supabase/migration_admin_console.sql)
// ---------------------------------------------------------------------------

const CONSOLE_SQL = `do $console$
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
  execute $fn$
    create or replace function public.protect_user_profile()
    returns trigger language plpgsql security definer set search_path = public
    as $$
    begin
      if current_user in ('service_role','postgres','supabase_admin') then return new; end if;
      if tg_op = 'INSERT' then
        if new.role is distinct from 'user' then
          raise exception 'Rôle initial interdit : un nouveau compte doit être "user".';
        end if;
        return new;
      end if;
      if new.id is distinct from old.id then raise exception 'Changement d''identifiant interdit.'; end if;
      if new.email is distinct from old.email then raise exception 'Changement d''email interdit depuis le client.'; end if;
      if new.role is distinct from old.role and not public.is_superadmin() then
        raise exception 'Changement de rôle réservé au superadmin.';
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
// Page Admin
// ---------------------------------------------------------------------------

export function AdminPage() {
  const { user: authUser, profile, logout } = useAuth();

  const isSuperAdminLogged = isUserAdmin(profile);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(isSuperAdminLogged);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminEmail, setAdminEmail] = useState('admin@jawebflow.com');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminSectionId>('overview');

  const [usersList, setUsersList] = useState<any[]>([]);
  const [assistantsList, setAssistantsList] = useState<any[]>([]);
  const [leadsList, setLeadsList] = useState<any[]>([]);
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>('all');
  const [leadAssistantFilter, setLeadAssistantFilter] = useState<string>('all');

  const [statusNotification, setStatusNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [inspectingLead, setInspectingLead] = useState<any | null>(null);
  const [inspectingAssistantJson, setInspectingAssistantJson] = useState<any | null>(null);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editingAssistant, setEditingAssistant] = useState<any | null>(null);
  const [showNewInvoiceModal, setShowNewInvoiceModal] = useState(false);

  const [newInvEmail, setNewInvEmail] = useState('');
  const [newInvPlan, setNewInvPlan] = useState<'basic' | 'pro' | 'enterprise'>('pro');
  const [newInvAmountDzd, setNewInvAmountDzd] = useState<number>(18700);
  const [newInvMethod, setNewInvMethod] = useState<'baridimob_ccp' | 'slickpay_dzd' | 'stripe_card'>('baridimob_ccp');
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);

  useEffect(() => {
    if (isUserAdmin(profile)) setIsAdminAuthenticated(true);
    else if (sessionStorage.getItem('jawebflow_admin_auth') === 'true') setIsAdminAuthenticated(true);
  }, [authUser, profile]);

  useEffect(() => {
    if (isAdminAuthenticated) fetchAllPlatformData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminAuthenticated]);

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setStatusNotification({ type, message });
    setTimeout(() => setStatusNotification(null), 4500);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
    notify('Copié dans le presse-papiers : ' + label);
  };

  // ------------------------------------------------------------------ data

  const fetchAllPlatformData = async () => {
    setLoadingData(true);
    try {
      const [usersRes, asstRes, prosRes, invRes] = await Promise.all([
        supabase.from('users').select('*'),
        supabase.from('assistants').select('*'),
        supabase.from('prospects').select('*'),
        supabase.from('invoices').select('*'),
      ]);
      if (usersRes.error) throw usersRes.error;
      if (asstRes.error) throw asstRes.error;
      if (prosRes.error) throw prosRes.error;
      if (invRes.error) throw invRes.error;

      setUsersList((usersRes.data || []).map(normUser));
      setAssistantsList((asstRes.data || []).map(normAssistant));
      setLeadsList((prosRes.data || []).map(normLead));
      setInvoicesList(invRes.data || []);
    } catch (err: any) {
      console.error('Error fetching admin platform data:', err);
      notify('Erreur de synchronisation Supabase : ' + (err?.message || 'connexion'), 'error');
    } finally {
      setLoadingData(false);
    }
  };

  // ------------------------------------------------------------------ auth

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
        .from('users').select('*').eq('id', authData.user.id).maybeSingle();
      if (profileError) throw profileError;

      if (!isUserAdmin(profileData)) {
        await supabase.auth.signOut();
        setAuthError("Ce compte n'a pas les droits Super Admin.");
        return;
      }
      setIsAdminAuthenticated(true);
      sessionStorage.removeItem('jawebflow_admin_auth');
      notify('Bienvenue dans la console admin 👑');
    } catch (err: any) {
      console.error(err);
      setAuthError('Identifiants Super Admin invalides.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    sessionStorage.removeItem('jawebflow_admin_auth');
    await supabase.auth.signOut();
    setIsAdminAuthenticated(false);
    setAdminPassword('');
  };

  // ------------------------------------------------------------------ users

  const handleSaveUser = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('users').update({
        display_name: editingUser.displayName || '',
        company_name: editingUser.companyName || null,
        phone_number: editingUser.phoneNumber || null,
        role: editingUser.role,
        updated_at: new Date().toISOString(),
      }).eq('id', editingUser.uid);
      if (error) throw error;
      setUsersList(prev => prev.map(u => u.uid === editingUser.uid ? { ...editingUser } : u));
      notify(`Profil de ${editingUser.email} mis à jour.`);
      setEditingUser(null);
    } catch (err: any) {
      notify('Erreur : ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!window.confirm(`Supprimer définitivement le profil de "${email}" ?`)) return;
    try {
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (error) throw error;
      setUsersList(prev => prev.filter(u => u.uid !== userId));
      notify(`Profil de ${email} supprimé.`);
    } catch (err: any) {
      notify('Erreur : ' + err.message, 'error');
    }
  };

  // ------------------------------------------------------------- assistants

  const handleSaveAssistant = async () => {
    if (!editingAssistant) return;
    setSaving(true);
    try {
      const a = editingAssistant;
      const { data: cur, error: readErr } = await supabase.from('assistants').select('config').eq('id', a.id).single();
      if (readErr) throw readErr;
      const cfg = {
        ...(cur?.config || {}),
        plan: a.plan,
        assistantTone: a.assistantTone,
        businessDescription: a.businessDescription,
        faqText: a.faqText,
        languages: a.languages,
        whatsappEscalation: a.whatsappEscalation,
        siteShopping: !!a.siteShopping,
        autoLeadCapture: !!a.autoLeadCapture,
      };
      const { error } = await supabase.from('assistants').update({
        business_name: a.businessName,
        website_url: a.websiteUrl || null,
        config: cfg,
        updated_at: new Date().toISOString(),
      }).eq('id', a.id);
      if (error) throw error;
      setAssistantsList(prev => prev.map(x => x.id === a.id ? { ...x, ...a, rawConfig: cfg } : x));
      notify(`Assistant "${a.businessName}" mis à jour.`);
      setEditingAssistant(null);
    } catch (err: any) {
      notify('Erreur : ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssistant = async (assistantId: string, businessName: string) => {
    if (!window.confirm(`Supprimer définitivement l'assistant "${businessName}" ?`)) return;
    try {
      const { error } = await supabase.from('assistants').delete().eq('id', assistantId);
      if (error) throw error;
      setAssistantsList(prev => prev.filter(a => a.id !== assistantId));
      notify(`Assistant "${businessName}" supprimé.`);
    } catch (err: any) {
      notify('Erreur : ' + err.message, 'error');
    }
  };

  const widgetSnippet = (a: any) =>
    `<script src="${window.location.origin}/widget.js" data-widget-id="${a.widgetId || a.id}" async></script>`;

  // ------------------------------------------------------------------ leads

  const handleLeadStatus = async (lead: any, status: string) => {
    try {
      const { error } = await supabase.from('prospects').update({
        data: { ...lead.raw, status },
        updated_at: new Date().toISOString(),
      }).eq('id', lead.id);
      if (error) throw error;
      setLeadsList(prev => prev.map(p => p.id === lead.id ? { ...p, status, raw: { ...p.raw, status } } : p));
      if (inspectingLead?.id === lead.id) setInspectingLead({ ...lead, status });
      notify(`Statut du prospect "${lead.name}" → ${status}`);
    } catch (err: any) {
      notify('Erreur : ' + err.message + ' (exécutez la migration console SQL, onglet Système)', 'error');
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!window.confirm('Supprimer ce prospect du registre ?')) return;
    try {
      const { error } = await supabase.from('prospects').delete().eq('id', leadId);
      if (error) throw error;
      setLeadsList(prev => prev.filter(p => p.id !== leadId));
      if (inspectingLead?.id === leadId) setInspectingLead(null);
      notify('Prospect supprimé.');
    } catch (err: any) {
      notify('Erreur : ' + err.message, 'error');
    }
  };

  const exportLeadsCSV = () => {
    if (leadsList.length === 0) return notify('Aucun prospect à exporter.', 'error');
    const headers = ['ID', 'Nom', 'Téléphone', 'Email', 'Besoin', 'Statut', 'Assistant_ID', 'Date', 'Page_Visitee', 'Navigateur'];
    const rows = leadsList.map(p => [
      `"${p.id || ''}"`, `"${(p.name || '').replace(/"/g, '""')}"`, `"${(p.phone || '').replace(/"/g, '""')}"`,
      `"${(p.email || '').replace(/"/g, '""')}"`, `"${(p.need || '').replace(/"/g, '""')}"`, `"${p.status || ''}"`,
      `"${p.assistantId || ''}"`, `"${p.date || ''}"`, `"${(p.currentPage || '').replace(/"/g, '""')}"`, `"${(p.userAgent || '').replace(/"/g, '""')}"`,
    ]);
    const csv = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `jawebflow_master_leads_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    notify('Export CSV des prospects téléchargé.');
  };

  const exportAdsAudienceCSV = () => {
    if (leadsList.length === 0) return notify('Aucun prospect à exporter.', 'error');
    const headers = ['email', 'phone', 'first_name', 'last_name', 'country', 'locale', 'value'];
    const rows = leadsList.map(lead => {
      const nameParts = (lead.name || '').trim().split(/\s+/);
      let cleanPhone = (lead.phone || '').replace(/[^0-9+]/g, '');
      if (cleanPhone.startsWith('0') && !cleanPhone.startsWith('00')) cleanPhone = '213' + cleanPhone.substring(1);
      if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.substring(1);
      const hasEmail = !!lead.email;
      const hasPhone = cleanPhone.length >= 8;
      let value = '5.00';
      if (hasEmail && hasPhone) value = '20.00';
      if ((lead.status || '').toLowerCase().includes('qualif')) value = '35.00';
      return [hasEmail ? lead.email : '', hasPhone ? cleanPhone : '', nameParts[0] || 'Visiteur', nameParts.slice(1).join(' ') || '', 'DZ', 'fr', value];
    });
    const csv = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `jawebflow_ads_audiences_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    notify('Export Audience Ads (Meta/Google) téléchargé.');
  };

  // --------------------------------------------------------------- invoices

  const handleInvoiceStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase.from('invoices').update({ status }).eq('id', id);
      if (error) throw error;
      setInvoicesList(prev => prev.map(i => i.id === id ? { ...i, status } : i));
      notify(`Facture ${id} → ${status}`);
    } catch (err: any) {
      notify('Erreur : ' + err.message, 'error');
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    if (!window.confirm(`Supprimer la facture ${id} ?`)) return;
    try {
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) throw error;
      setInvoicesList(prev => prev.filter(i => i.id !== id));
      notify(`Facture ${id} supprimée.`);
    } catch (err: any) {
      notify('Erreur : ' + err.message, 'error');
    }
  };

  const handleCreateManualInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvEmail.trim()) return notify("Spécifiez l'e-mail du client.", 'error');
    setIsCreatingInvoice(true);
    try {
      const invId = `INV-${Math.floor(100000 + Math.random() * 900000)}`;
      const usdEquiv = newInvPlan === 'basic' ? 29 : newInvPlan === 'pro' ? 79 : 199;
      const newInvoice = {
        id: invId,
        customerEmail: newInvEmail.trim().toLowerCase(),
        customerName: newInvEmail.split('@')[0],
        planName: newInvPlan === 'basic' ? 'Plan Basic' : newInvPlan === 'pro' ? 'Plan Pro / Business' : 'Plan Enterprise',
        amountDzd: Number(newInvAmountDzd),
        amountUsd: usdEquiv,
        paymentMethod: newInvMethod === 'baridimob_ccp' ? 'Virement CCP / BaridiMob (Validé Admin)' : newInvMethod === 'slickpay_dzd' ? 'SlickPay DZD (Edahabia/CIB)' : 'Carte Bancaire',
        status: 'paid',
        date: new Date().toLocaleDateString('fr-FR'),
      };
      const { error } = await supabase.from('invoices').insert([{ ...newInvoice, createdAt: new Date().toISOString(), validatedByAdmin: true }]);
      if (error) throw error;

      // Monte automatiquement le plan des assistants du client
      const client = usersList.find(u => (u.email || '').toLowerCase() === newInvEmail.trim().toLowerCase());
      if (client) {
        for (const asst of assistantsList.filter(a => a.userId === client.uid)) {
          const { data: cur } = await supabase.from('assistants').select('config').eq('id', asst.id).single();
          await supabase.from('assistants').update({ config: { ...(cur?.config || {}), plan: newInvPlan }, updated_at: new Date().toISOString() }).eq('id', asst.id);
          setAssistantsList(prev => prev.map(a => a.id === asst.id ? { ...a, plan: newInvPlan } : a));
        }
      }
      setInvoicesList(prev => [newInvoice, ...prev]);
      setShowNewInvoiceModal(false);
      setNewInvEmail('');
      notify(`Quittance ${invId} générée et abonnement activé pour ${newInvEmail} !`);
    } catch (err: any) {
      notify('Erreur de création de facture : ' + err.message, 'error');
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  // ------------------------------------------------------------------ stats

  const stats = useMemo(() => {
    const paid = invoicesList.filter(i => (i.status || '').toLowerCase() === 'paid');
    const revenueDzd = paid.reduce((acc, i) => acc + (Number(i.amountDzd) || 0), 0);
    const revenueUsd = paid.reduce((acc, i) => acc + (Number(i.amountUsd) || 0), 0);
    const paying = assistantsList.filter(a => a.plan && a.plan !== 'free').length;
    const qualified = leadsList.filter(l => (l.status || '').toLowerCase().includes('qualif') || (l.status || '').toLowerCase().includes('converti')).length;
    const plans: Record<string, number> = {};
    assistantsList.forEach(a => { const p = (a.plan || 'free').toLowerCase(); plans[p] = (plans[p] || 0) + 1; });
    return { revenueDzd, revenueUsd, paying, qualified, plans, paidCount: paid.length, pendingCount: invoicesList.filter(i => (i.status || '').toLowerCase() === 'pending').length };
  }, [usersList, assistantsList, leadsList, invoicesList]);

  const userById = useMemo(() => {
    const m: Record<string, any> = {};
    usersList.forEach(u => { m[u.uid] = u; });
    return m;
  }, [usersList]);

  const assistantById = useMemo(() => {
    const m: Record<string, any> = {};
    assistantsList.forEach(a => { m[a.id] = a; });
    return m;
  }, [assistantsList]);

  // ------------------------------------------------------------------ locks

  if (!isAdminAuthenticated) {
    if (authUser && !isSuperAdminLogged) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mb-4"><Lock className="text-rose-400" size={22} /></div>
            <h1 className="text-xl font-bold text-white mb-2">Accès réservé</h1>
            <p className="text-sm text-slate-400 mb-6">
              Le compte <span className="text-slate-200 font-semibold">{profile?.email || authUser?.email}</span> n'a pas les droits Super Admin.
            </p>
            <div className="flex gap-3 justify-center">
              <a href="/dashboard" className={btnGhost}><LayoutDashboard size={16} /> Mon dashboard</a>
              <button onClick={logout} className={btnDanger}><LogOut size={16} /> Changer de compte</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="text-center mb-6">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center mb-3"><Shield className="text-violet-400" size={24} /></div>
            <h1 className="text-2xl font-bold text-white">Console Admin</h1>
            <p className="text-sm text-slate-500">JawebFlow — contrôle total de la plateforme</p>
          </div>
          <form onSubmit={handleAdminPasswordUnlock} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <Field label="E-mail super admin">
              <input className={inp} type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@jawebflow.com" required />
            </Field>
            <Field label="Mot de passe">
              <input className={inp} type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="••••••••••" required />
            </Field>
            {authError && (
              <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                <AlertCircle size={14} /> {authError}
              </div>
            )}
            <button type="submit" disabled={authLoading} className={`${btnPrimary} w-full justify-center disabled:opacity-50`}>
              {authLoading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />} Déverrouiller la console
            </button>
            <a href="/" className="block text-center text-xs text-slate-500 hover:text-slate-300">← Retour au site</a>
          </form>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ data views

  const q = searchQuery.trim().toLowerCase();

  const filteredUsers = usersList
    .filter(u => roleFilter === 'all' || u.role === roleFilter)
    .filter(u => !q || [u.displayName, u.email, u.companyName].join(' ').toLowerCase().includes(q))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const filteredAssistants = assistantsList
    .filter(a => planFilter === 'all' || (a.plan || 'free').toLowerCase() === planFilter)
    .filter(a => !q || [a.businessName, a.websiteUrl, userById[a.userId]?.email].join(' ').toLowerCase().includes(q))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const filteredLeads = leadsList
    .filter(l => leadStatusFilter === 'all' || (l.status || 'nouveau').toLowerCase() === leadStatusFilter)
    .filter(l => leadAssistantFilter === 'all' || l.assistantId === leadAssistantFilter)
    .filter(l => !q || [l.name, l.phone, l.email, l.need].join(' ').toLowerCase().includes(q))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const filteredInvoices = invoicesList
    .filter(i => !q || [i.id, i.customerEmail, i.customerName, i.planName].join(' ').toLowerCase().includes(q))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const signupsSeries = daySeries(usersList.map(u => u.createdAt));
  const leadsSeries = daySeries(leadsList.map(l => l.date));

  const NAV: { id: AdminSectionId; label: string; icon: any; count?: number }[] = [
    { id: 'overview', label: "Vue d'ensemble", icon: LayoutDashboard },
    { id: 'users', label: 'Utilisateurs', icon: Users, count: usersList.length },
    { id: 'assistants', label: 'Assistants IA', icon: Bot, count: assistantsList.length },
    { id: 'leads', label: 'Prospects', icon: Target, count: leadsList.length },
    { id: 'invoices', label: 'Factures', icon: Receipt, count: invoicesList.length },
    { id: 'system', label: 'Système', icon: Settings2 },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex">
      {/* ------------------------------------------------ sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-slate-800 bg-slate-900/60 min-h-screen sticky top-0 h-screen">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center"><Sparkles size={18} className="text-white" /></div>
          <div>
            <div className="text-white font-bold leading-tight">JawebFlow</div>
            <div className="text-[10px] uppercase tracking-widest text-violet-400 font-bold">Console Admin</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); setSearchQuery(''); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeTab === item.id ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30' : 'text-slate-400 hover:bg-slate-800/70 hover:text-white border border-transparent'}`}
            >
              <item.icon size={17} />
              <span className="flex-1 text-left">{item.label}</span>
              {typeof item.count === 'number' && <span className="text-[10px] bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5 text-slate-400">{item.count}</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800 space-y-1">
          <button onClick={fetchAllPlatformData} className={`${btnGhost} w-full justify-center`}><RefreshCw size={15} className={loadingData ? 'animate-spin' : ''} /> Actualiser</button>
          <button onClick={handleAdminLogout} className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-rose-400 py-2"><LogOut size={15} /> Quitter</button>
        </div>
      </aside>

      {/* ------------------------------------------------ main */}
      <div className="flex-1 min-w-0">
        {/* topbar */}
        <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-slate-800 px-4 md:px-6 py-3 flex items-center gap-3">
          <div className="md:hidden w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shrink-0"><Sparkles size={15} className="text-white" /></div>
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Rechercher (nom, email, business, besoin…)" className={`${inp} pl-9`} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500"><Activity size={13} className="text-emerald-400" /> {loadingData ? 'Synchronisation…' : 'Données à jour'}</span>
            <button onClick={fetchAllPlatformData} className={iconBtn} title="Actualiser"><RefreshCw size={16} className={loadingData ? 'animate-spin' : ''} /></button>
            <button onClick={handleAdminLogout} className={iconBtn} title="Quitter"><LogOut size={16} /></button>
          </div>
        </header>

        {/* mobile nav */}
        <div className="md:hidden flex gap-2 overflow-x-auto px-4 py-2 border-b border-slate-800 bg-slate-900/60">
          {NAV.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${activeTab === item.id ? 'bg-violet-600/20 text-violet-300 border-violet-500/40' : 'text-slate-400 border-slate-700'}`}>
              <item.icon size={13} /> {item.label}
            </button>
          ))}
        </div>

        {/* notification */}
        {statusNotification && (
          <div className={`fixed top-4 right-4 z-[60] max-w-sm flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-2xl ${statusNotification.type === 'success' ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200' : 'bg-rose-950/95 border-rose-500/40 text-rose-200'}`}>
            {statusNotification.type === 'success' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
            {statusNotification.message}
          </div>
        )}

        <main className="p-4 md:p-6 space-y-6">
          {loadingData && (
            <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> Chargement des données de la plateforme…</div>
          )}

          {/* ================================================= OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                <StatCard icon={Users} label="Utilisateurs" value={String(usersList.length)} sub={`${usersList.filter(u => new Date(u.createdAt).getTime() > Date.now() - 7 * 86400000).length} cette semaine`} accent="bg-sky-500/15 text-sky-400" />
                <StatCard icon={Bot} label="Assistants IA" value={String(assistantsList.length)} sub={`${stats.paying} payants`} accent="bg-violet-500/15 text-violet-400" />
                <StatCard icon={Target} label="Prospects" value={String(leadsList.length)} sub={`${stats.qualified} qualifiés/convertis`} accent="bg-amber-500/15 text-amber-400" />
                <StatCard icon={Wallet} label="Revenu DZD" value={money(stats.revenueDzd)} sub={`${stats.paidCount} factures payées`} accent="bg-emerald-500/15 text-emerald-400" />
                <StatCard icon={CreditCard} label="Revenu USD" value={'$' + (stats.revenueUsd).toLocaleString('fr-FR')} sub={`${stats.pendingCount} en attente`} accent="bg-fuchsia-500/15 text-fuchsia-400" />
                <StatCard icon={TrendingUp} label="Conversion" value={leadsList.length ? Math.round((stats.qualified / leadsList.length) * 100) + '%' : '0%'} sub="prospects → qualifiés" accent="bg-rose-500/15 text-rose-400" />
              </div>

              <div className="grid lg:grid-cols-3 gap-4">
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3"><Users size={15} className="text-sky-400" /> Inscriptions (14 jours)</div>
                  <MiniBars series={signupsSeries} color="#38bdf8" />
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3"><Target size={15} className="text-amber-400" /> Prospects captés (14 jours)</div>
                  <MiniBars series={leadsSeries} color="#fbbf24" />
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3"><BarChart3 size={15} className="text-violet-400" /> Répartition des plans</div>
                  <div className="space-y-2.5 mt-4">
                    <HBar label="Gratuit" value={stats.plans['free'] || 0} max={assistantsList.length} color="#64748b" />
                    <HBar label="Basic" value={stats.plans['basic'] || 0} max={assistantsList.length} color="#fbbf24" />
                    <HBar label="Pro" value={stats.plans['pro'] || 0} max={assistantsList.length} color="#38bdf8" />
                    <HBar label="Enterprise" value={stats.plans['enterprise'] || 0} max={assistantsList.length} color="#a78bfa" />
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-4">
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-white">Derniers utilisateurs</div>
                    <button onClick={() => setActiveTab('users')} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">Tout voir <ChevronRight size={12} /></button>
                  </div>
                  <div className="space-y-2">
                    {usersList.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 5).map(u => (
                      <div key={u.uid} className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 uppercase">{(u.displayName || u.email || '?')[0]}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-slate-200 truncate">{u.displayName}</div>
                          <div className="text-[11px] text-slate-500 truncate">{u.email}</div>
                        </div>
                        <div className="text-[10px] text-slate-600">{timeAgo(u.createdAt)}</div>
                      </div>
                    ))}
                    {usersList.length === 0 && <div className="text-xs text-slate-600">Aucun utilisateur.</div>}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-white">Derniers prospects</div>
                    <button onClick={() => setActiveTab('leads')} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">Tout voir <ChevronRight size={12} /></button>
                  </div>
                  <div className="space-y-2">
                    {filteredLeads.slice(0, 5).map(l => (
                      <div key={l.id} className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center"><Target size={13} className="text-amber-400" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-slate-200 truncate">{l.name}</div>
                          <div className="text-[11px] text-slate-500 truncate">{l.phone || l.email || assistantById[l.assistantId]?.businessName || ''}</div>
                        </div>
                        {leadBadge(l.status)}
                      </div>
                    ))}
                    {leadsList.length === 0 && <div className="text-xs text-slate-600">Aucun prospect capté pour l'instant.</div>}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-white">Dernières factures</div>
                    <button onClick={() => setActiveTab('invoices')} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">Tout voir <ChevronRight size={12} /></button>
                  </div>
                  <div className="space-y-2">
                    {invoicesList.slice(0, 5).map(i => (
                      <div key={i.id} className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center"><Receipt size={13} className="text-emerald-400" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-slate-200 truncate">{i.customerEmail}</div>
                          <div className="text-[11px] text-slate-500">{money(i.amountDzd)} • {i.planName}</div>
                        </div>
                        {invoiceBadge(i.status)}
                      </div>
                    ))}
                    {invoicesList.length === 0 && <div className="text-xs text-slate-600">Aucune facture.</div>}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ================================================= USERS */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><Users size={18} className="text-sky-400" /> Utilisateurs ({filteredUsers.length})</h2>
                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className={`${inp} w-auto`}>
                  <option value="all">Tous les rôles</option>
                  <option value="user">Clients</option>
                  <option value="admin">Admins</option>
                  <option value="superadmin">Super admins</option>
                </select>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead className="border-b border-slate-800 bg-slate-900">
                    <tr>
                      <th className={th}>Utilisateur</th>
                      <th className={th}>Entreprise</th>
                      <th className={th}>Rôle</th>
                      <th className={th}>Assistants</th>
                      <th className={th}>Prospects</th>
                      <th className={th}>Inscription</th>
                      <th className={th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredUsers.map(u => {
                      const asstCount = assistantsList.filter(a => a.userId === u.uid).length;
                      const leadCount = leadsList.filter(l => assistantsList.some(a => a.id === l.assistantId && a.userId === u.uid)).length;
                      return (
                        <tr key={u.uid} className="hover:bg-slate-800/30">
                          <td className={td}>
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 uppercase shrink-0">{(u.displayName || u.email || '?')[0]}</div>
                              <div className="min-w-0">
                                <div className="text-slate-100 font-medium truncate">{u.displayName}</div>
                                <div className="text-[11px] text-slate-500 truncate">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className={td}>{u.companyName || <span className="text-slate-600">—</span>}</td>
                          <td className={td}>{roleBadge(u.role)}</td>
                          <td className={td}><Badge tone={asstCount ? 'sky' : 'slate'}>{asstCount}</Badge></td>
                          <td className={td}><Badge tone={leadCount ? 'amber' : 'slate'}>{leadCount}</Badge></td>
                          <td className={td}><span className="text-xs text-slate-500">{fmtDate(u.createdAt)}</span></td>
                          <td className={td}>
                            <div className="flex items-center gap-1">
                              <button className={iconBtn} title="Modifier" onClick={() => setEditingUser({ ...u })}><Pencil size={15} /></button>
                              <button className={iconBtn} title="Supprimer" onClick={() => handleDeleteUser(u.uid, u.email)}><Trash2 size={15} className="hover:text-rose-400" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredUsers.length === 0 && <tr><td colSpan={7} className={`${td} text-center text-slate-600 py-8`}>Aucun utilisateur trouvé.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================= ASSISTANTS */}
          {activeTab === 'assistants' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><Bot size={18} className="text-violet-400" /> Assistants IA ({filteredAssistants.length})</h2>
                <select value={planFilter} onChange={e => setPlanFilter(e.target.value)} className={`${inp} w-auto`}>
                  <option value="all">Tous les plans</option>
                  <option value="free">Gratuit</option>
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-x-auto">
                <table className="w-full min-w-[860px]">
                  <thead className="border-b border-slate-800 bg-slate-900">
                    <tr>
                      <th className={th}>Assistant</th>
                      <th className={th}>Propriétaire</th>
                      <th className={th}>Plan</th>
                      <th className={th}>Langues</th>
                      <th className={th}>Prospects</th>
                      <th className={th}>Créé</th>
                      <th className={th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredAssistants.map(a => {
                      const owner = userById[a.userId];
                      const leadCount = leadsList.filter(l => l.assistantId === a.id).length;
                      const langs = a.languages ? Object.entries(a.languages).filter(([, v]) => v).map(([k]) => k.toUpperCase()).join(' · ') : '—';
                      return (
                        <tr key={a.id} className="hover:bg-slate-800/30">
                          <td className={td}>
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center shrink-0"><Bot size={14} className="text-violet-400" /></div>
                              <div className="min-w-0">
                                <div className="text-slate-100 font-medium truncate">{a.businessName}</div>
                                <div className="text-[11px] text-slate-500 truncate flex items-center gap-1">{a.websiteUrl && <><Globe size={10} /> {a.websiteUrl}</>}</div>
                              </div>
                            </div>
                          </td>
                          <td className={td}><span className="text-xs text-slate-400">{owner?.email || <span className="text-slate-600">inconnu</span>}</span></td>
                          <td className={td}>{planBadge(a.plan)}</td>
                          <td className={td}><span className="text-[11px] text-slate-500">{langs}</span></td>
                          <td className={td}><Badge tone={leadCount ? 'amber' : 'slate'}>{leadCount}</Badge></td>
                          <td className={td}><span className="text-xs text-slate-500">{fmtDate(a.createdAt)}</span></td>
                          <td className={td}>
                            <div className="flex items-center gap-1">
                              <button className={iconBtn} title="Copier le code du widget" onClick={() => handleCopy(widgetSnippet(a), 'code widget ' + a.businessName)}><Copy size={15} /></button>
                              <button className={iconBtn} title="Voir la config JSON" onClick={() => setInspectingAssistantJson(a)}><FileJson size={15} /></button>
                              <button className={iconBtn} title="Modifier" onClick={() => setEditingAssistant({ ...a, languages: a.languages || { fr: true, darija: false, en: false, ar: false } })}><Pencil size={15} /></button>
                              <button className={iconBtn} title="Supprimer" onClick={() => handleDeleteAssistant(a.id, a.businessName)}><Trash2 size={15} className="hover:text-rose-400" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredAssistants.length === 0 && <tr><td colSpan={7} className={`${td} text-center text-slate-600 py-8`}>Aucun assistant trouvé.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================= LEADS */}
          {activeTab === 'leads' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><Target size={18} className="text-amber-400" /> Prospects ({filteredLeads.length})</h2>
                <select value={leadStatusFilter} onChange={e => setLeadStatusFilter(e.target.value)} className={`${inp} w-auto`}>
                  <option value="all">Tous statuts</option>
                  <option value="nouveau">Nouveau</option>
                  <option value="contacte">Contacté</option>
                  <option value="qualifie">Qualifié</option>
                  <option value="converti">Converti</option>
                  <option value="perdu">Perdu</option>
                </select>
                <select value={leadAssistantFilter} onChange={e => setLeadAssistantFilter(e.target.value)} className={`${inp} w-auto max-w-[220px]`}>
                  <option value="all">Tous les assistants</option>
                  {assistantsList.map(a => <option key={a.id} value={a.id}>{a.businessName}</option>)}
                </select>
                <div className="ml-auto flex gap-2">
                  <button onClick={exportLeadsCSV} className={btnGhost}><Download size={15} /> CSV complet</button>
                  <button onClick={exportAdsAudienceCSV} className={btnGhost}><Download size={15} /> CSV Audience Ads</button>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-x-auto">
                <table className="w-full min-w-[860px]">
                  <thead className="border-b border-slate-800 bg-slate-900">
                    <tr>
                      <th className={th}>Prospect</th>
                      <th className={th}>Besoin exprimé</th>
                      <th className={th}>Assistant</th>
                      <th className={th}>Statut</th>
                      <th className={th}>Date</th>
                      <th className={th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredLeads.map(l => (
                      <tr key={l.id} className="hover:bg-slate-800/30">
                        <td className={td}>
                          <div className="min-w-0">
                            <div className="text-slate-100 font-medium">{l.name}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                              {l.phone && <span className="flex items-center gap-1"><Phone size={10} /> {l.phone}</span>}
                              {l.email && <span className="flex items-center gap-1"><Mail size={10} /> {l.email}</span>}
                            </div>
                          </div>
                        </td>
                        <td className={td}><span className="text-xs text-slate-400 line-clamp-2 max-w-[260px] block">{l.need || '—'}</span></td>
                        <td className={td}><span className="text-xs text-slate-400">{assistantById[l.assistantId]?.businessName || '—'}</span></td>
                        <td className={td}>
                          <select value={(l.status || 'nouveau').toLowerCase()} onChange={e => handleLeadStatus(l, e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg text-xs px-2 py-1 text-slate-200 focus:outline-none focus:border-violet-500">
                            <option value="nouveau">Nouveau</option>
                            <option value="contacte">Contacté</option>
                            <option value="qualifie">Qualifié</option>
                            <option value="converti">Converti</option>
                            <option value="perdu">Perdu</option>
                          </select>
                        </td>
                        <td className={td}><span className="text-xs text-slate-500">{fmtDateTime(l.date)}</span></td>
                        <td className={td}>
                          <div className="flex items-center gap-1">
                            <button className={iconBtn} title="Détails" onClick={() => setInspectingLead(l)}><Eye size={15} /></button>
                            <button className={iconBtn} title="Supprimer" onClick={() => handleDeleteLead(l.id)}><Trash2 size={15} className="hover:text-rose-400" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredLeads.length === 0 && <tr><td colSpan={6} className={`${td} text-center text-slate-600 py-8`}>Aucun prospect trouvé.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================= INVOICES */}
          {activeTab === 'invoices' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><Receipt size={18} className="text-emerald-400" /> Factures ({filteredInvoices.length})</h2>
                <div className="ml-auto flex items-center gap-3">
                  <div className="text-xs text-slate-500">Total payé : <span className="text-emerald-400 font-bold">{money(stats.revenueDzd)}</span> <span className="text-slate-600">/</span> <span className="text-emerald-400 font-bold">${stats.revenueUsd.toLocaleString('fr-FR')}</span></div>
                  <button onClick={() => setShowNewInvoiceModal(true)} className={btnPrimary}><Plus size={15} /> Nouvelle facture</button>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-x-auto">
                <table className="w-full min-w-[860px]">
                  <thead className="border-b border-slate-800 bg-slate-900">
                    <tr>
                      <th className={th}>N°</th>
                      <th className={th}>Client</th>
                      <th className={th}>Plan</th>
                      <th className={th}>Montant</th>
                      <th className={th}>Méthode</th>
                      <th className={th}>Statut</th>
                      <th className={th}>Date</th>
                      <th className={th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredInvoices.map(i => (
                      <tr key={i.id} className="hover:bg-slate-800/30">
                        <td className={td}><span className="font-mono text-xs text-slate-400">{i.id}</span></td>
                        <td className={td}>
                          <div className="text-slate-100 text-xs">{i.customerEmail}</div>
                          <div className="text-[11px] text-slate-500">{i.customerName}</div>
                        </td>
                        <td className={td}><span className="text-xs text-slate-300">{i.planName}</span></td>
                        <td className={td}>
                          <div className="text-xs font-semibold text-slate-100">{money(i.amountDzd)}</div>
                          <div className="text-[11px] text-slate-500">${Number(i.amountUsd || 0).toLocaleString('fr-FR')}</div>
                        </td>
                        <td className={td}><span className="text-[11px] text-slate-500">{i.paymentMethod}</span></td>
                        <td className={td}>
                          <div className="flex items-center gap-2">
                            {invoiceBadge(i.status)}
                            <select value={(i.status || 'paid').toLowerCase()} onChange={e => handleInvoiceStatus(i.id, e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg text-xs px-2 py-1 text-slate-200 focus:outline-none focus:border-violet-500">
                              <option value="paid">paid</option>
                              <option value="pending">pending</option>
                              <option value="failed">failed</option>
                            </select>
                          </div>
                        </td>
                        <td className={td}><span className="text-xs text-slate-500">{fmtDateTime(i.createdAt)}</span></td>
                        <td className={td}>
                          <button className={iconBtn} title="Supprimer" onClick={() => handleDeleteInvoice(i.id)}><Trash2 size={15} className="hover:text-rose-400" /></button>
                        </td>
                      </tr>
                    ))}
                    {filteredInvoices.length === 0 && <tr><td colSpan={8} className={`${td} text-center text-slate-600 py-8`}>Aucune facture trouvée.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================= SYSTEM */}
          {activeTab === 'system' && (
            <div className="space-y-4 max-w-3xl">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Settings2 size={18} className="text-slate-400" /> Système & permissions</h2>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="text-sm font-semibold text-white">État de la plateforme</div>
                <div className="grid sm:grid-cols-2 gap-2 text-xs text-slate-400">
                  <div className="flex justify-between bg-slate-800/50 rounded-lg px-3 py-2"><span>Admin connecté</span><span className="text-slate-200 font-semibold">{profile?.email || adminEmail}</span></div>
                  <div className="flex justify-between bg-slate-800/50 rounded-lg px-3 py-2"><span>Rôle</span>{roleBadge(profile?.role || 'superadmin')}</div>
                  <div className="flex justify-between bg-slate-800/50 rounded-lg px-3 py-2"><span>Projet Supabase</span><span className="text-slate-200 font-mono">{(supabase as any).supabaseUrl ? new URL((supabase as any).supabaseUrl).host.split('.')[0] : '—'}</span></div>
                  <div className="flex justify-between bg-slate-800/50 rounded-lg px-3 py-2"><span>Données</span><span className="text-slate-200">{usersList.length} users · {assistantsList.length} assistants · {leadsList.length} leads · {invoicesList.length} factures</span></div>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white"><Database size={15} className="text-violet-400" /> Permissions « tout faire » de la console</div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Si un bouton de la console affiche une erreur de permission (changer le statut d'un prospect, modifier un rôle, supprimer…), exécutez une seule fois le bloc SQL ci-dessous dans <span className="text-slate-200">Supabase → SQL Editor</span>. Il est sans risque et peut être ré-exécuté (fichier <span className="font-mono text-violet-300">supabase/migration_admin_console.sql</span> du dépôt).
                </p>
                <div className="relative">
                  <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[10px] text-slate-400 overflow-auto max-h-56 whitespace-pre-wrap">{CONSOLE_SQL}</pre>
                  <button onClick={() => handleCopy(CONSOLE_SQL, 'SQL permissions console')} className="absolute top-2 right-2 flex items-center gap-1 text-[11px] bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-2 py-1 text-slate-200">
                    {copiedField?.startsWith('SQL') ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} Copier
                  </button>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-rose-500/30 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-rose-300"><AlertCircle size={15} /> Zone sensible</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={fetchAllPlatformData} className={btnGhost}><RefreshCw size={15} /> Re-synchroniser toutes les données</button>
                  <button onClick={handleAdminLogout} className={btnDanger}><LogOut size={15} /> Verrouiller la console</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ================================================= MODALS */}

      {editingUser && (
        <Modal title={`Modifier ${editingUser.email}`} onClose={() => setEditingUser(null)}>
          <div className="space-y-4">
            <Field label="Nom affiché">
              <input className={inp} value={editingUser.displayName} onChange={e => setEditingUser({ ...editingUser, displayName: e.target.value })} />
            </Field>
            <Field label="Entreprise">
              <input className={inp} value={editingUser.companyName} onChange={e => setEditingUser({ ...editingUser, companyName: e.target.value })} />
            </Field>
            <Field label="Téléphone">
              <input className={inp} value={editingUser.phoneNumber} onChange={e => setEditingUser({ ...editingUser, phoneNumber: e.target.value })} />
            </Field>
            <Field label="Rôle">
              <select className={inp} value={editingUser.role} onChange={e => setEditingUser({ ...editingUser, role: e.target.value })}>
                <option value="user">user (client)</option>
                <option value="admin">admin</option>
                <option value="superadmin">superadmin</option>
              </select>
            </Field>
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5"><Shield size={12} /> L'e-mail et l'identifiant sont verrouillés (sécurité anti-escalade).</div>
            <div className="flex gap-2 justify-end">
              <button className={btnGhost} onClick={() => setEditingUser(null)}>Annuler</button>
              <button className={btnPrimary} disabled={saving} onClick={handleSaveUser}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Enregistrer</button>
            </div>
          </div>
        </Modal>
      )}

      {editingAssistant && (
        <Modal title={`Modifier ${editingAssistant.businessName}`} onClose={() => setEditingAssistant(null)} wide>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nom du business">
              <input className={inp} value={editingAssistant.businessName} onChange={e => setEditingAssistant({ ...editingAssistant, businessName: e.target.value })} />
            </Field>
            <Field label="Site web">
              <input className={inp} value={editingAssistant.websiteUrl || ''} onChange={e => setEditingAssistant({ ...editingAssistant, websiteUrl: e.target.value })} />
            </Field>
            <Field label="Plan d'abonnement">
              <select className={inp} value={(editingAssistant.plan || 'free').toLowerCase()} onChange={e => setEditingAssistant({ ...editingAssistant, plan: e.target.value })}>
                <option value="free">free</option>
                <option value="basic">basic</option>
                <option value="pro">pro</option>
                <option value="enterprise">enterprise</option>
              </select>
            </Field>
            <Field label="Ton de l'assistant">
              <select className={inp} value={editingAssistant.assistantTone || 'professionnel'} onChange={e => setEditingAssistant({ ...editingAssistant, assistantTone: e.target.value })}>
                {['professionnel', 'amical', 'commercial', 'luxueux', 'décontracté', 'expert'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="WhatsApp (escalade)">
              <input className={inp} value={editingAssistant.whatsappEscalation || ''} onChange={e => setEditingAssistant({ ...editingAssistant, whatsappEscalation: e.target.value })} placeholder="+213…" />
            </Field>
            <div className="flex flex-col gap-3 justify-end pb-1">
              <Toggle checked={!!editingAssistant.siteShopping} onChange={v => setEditingAssistant({ ...editingAssistant, siteShopping: v })} label="Commandes via le site (siteShopping)" />
              <Toggle checked={!!editingAssistant.autoLeadCapture} onChange={v => setEditingAssistant({ ...editingAssistant, autoLeadCapture: v })} label="Capture automatique de prospects" />
            </div>
            <div className="sm:col-span-2">
              <Field label="Langues">
                <div className="flex gap-4 flex-wrap">
                  {(['fr', 'darija', 'en', 'ar'] as const).map(l => (
                    <label key={l} className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked={!!editingAssistant.languages?.[l]} onChange={e => setEditingAssistant({ ...editingAssistant, languages: { ...editingAssistant.languages, [l]: e.target.checked } })} className="accent-violet-600" />
                      {l.toUpperCase()}
                    </label>
                  ))}
                </div>
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Description du business">
                <textarea className={`${inp} min-h-[90px]`} value={editingAssistant.businessDescription || ''} onChange={e => setEditingAssistant({ ...editingAssistant, businessDescription: e.target.value })} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="FAQ / infos métier">
                <textarea className={`${inp} min-h-[90px]`} value={editingAssistant.faqText || ''} onChange={e => setEditingAssistant({ ...editingAssistant, faqText: e.target.value })} />
              </Field>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <button className={btnGhost} onClick={() => setEditingAssistant(null)}>Annuler</button>
            <button className={btnPrimary} disabled={saving} onClick={handleSaveAssistant}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Enregistrer</button>
          </div>
        </Modal>
      )}

      {inspectingLead && (
        <Modal title={`Prospect : ${inspectingLead.name}`} onClose={() => setInspectingLead(null)} wide>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-800/50 rounded-xl px-3 py-2 flex items-center gap-2"><Phone size={14} className="text-emerald-400" /> {inspectingLead.phone || '—'}</div>
              <div className="bg-slate-800/50 rounded-xl px-3 py-2 flex items-center gap-2"><Mail size={14} className="text-sky-400" /> {inspectingLead.email || '—'}</div>
              <div className="bg-slate-800/50 rounded-xl px-3 py-2 flex items-center gap-2"><Bot size={14} className="text-violet-400" /> {assistantById[inspectingLead.assistantId]?.businessName || inspectingLead.assistantId}</div>
              <div className="bg-slate-800/50 rounded-xl px-3 py-2 flex items-center gap-2"><Calendar size={14} className="text-amber-400" /> {fmtDateTime(inspectingLead.date)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Besoin exprimé</div>
              <div className="bg-slate-800/50 rounded-xl px-3 py-2 text-sm text-slate-300 whitespace-pre-wrap">{inspectingLead.need || '—'}</div>
            </div>
            {inspectingLead.messages.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1"><MessageSquare size={12} /> Historique de conversation</div>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {inspectingLead.messages.map((m: any, idx: number) => (
                    <div key={idx} className={`rounded-xl px-3 py-2 text-xs ${m.role === 'user' || m.from === 'user' ? 'bg-sky-500/10 border border-sky-500/20 ml-8' : 'bg-slate-800/70 border border-slate-700 mr-8'}`}>
                      <div className="text-[10px] text-slate-500 mb-0.5">{m.role === 'user' || m.from === 'user' ? 'Client' : 'Assistant IA'}</div>
                      <div className="text-slate-300 whitespace-pre-wrap">{m.text || m.content || m.message || JSON.stringify(m)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {inspectingLead.currentPage && <div className="text-[11px] text-slate-500">Page visitée : {inspectingLead.currentPage}</div>}
            <div className="flex gap-2 justify-end">
              <button className={btnGhost} onClick={() => handleCopy(JSON.stringify(inspectingLead.raw, null, 2), 'données du prospect')}><Copy size={14} /> Copier les données</button>
              <button className={btnDanger} onClick={() => handleDeleteLead(inspectingLead.id)}><Trash2 size={14} /> Supprimer</button>
            </div>
          </div>
        </Modal>
      )}

      {inspectingAssistantJson && (
        <Modal title={`Configuration : ${inspectingAssistantJson.businessName}`} onClose={() => setInspectingAssistantJson(null)} wide>
          <div className="relative">
            <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 overflow-auto max-h-[60vh]">{JSON.stringify({ id: inspectingAssistantJson.id, userId: inspectingAssistantJson.userId, businessName: inspectingAssistantJson.businessName, websiteUrl: inspectingAssistantJson.websiteUrl, widgetId: inspectingAssistantJson.widgetId, plan: inspectingAssistantJson.plan, config: inspectingAssistantJson.rawConfig }, null, 2)}</pre>
            <button onClick={() => handleCopy(JSON.stringify(inspectingAssistantJson.rawConfig, null, 2), 'config JSON')} className="absolute top-2 right-2 flex items-center gap-1 text-[11px] bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-2 py-1 text-slate-200"><Copy size={12} /> Copier</button>
          </div>
        </Modal>
      )}

      {showNewInvoiceModal && (
        <Modal title="Nouvelle facture manuelle" onClose={() => setShowNewInvoiceModal(false)}>
          <form onSubmit={handleCreateManualInvoice} className="space-y-4">
            <Field label="E-mail du client">
              <input className={inp} type="email" value={newInvEmail} onChange={e => setNewInvEmail(e.target.value)} placeholder="client@exemple.com" required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plan">
                <select className={inp} value={newInvPlan} onChange={e => setNewInvPlan(e.target.value as any)}>
                  <option value="basic">Basic (29$)</option>
                  <option value="pro">Pro (79$)</option>
                  <option value="enterprise">Enterprise (199$)</option>
                </select>
              </Field>
              <Field label="Montant (DZD)">
                <input className={inp} type="number" value={newInvAmountDzd} onChange={e => setNewInvAmountDzd(Number(e.target.value))} />
              </Field>
            </div>
            <Field label="Méthode de paiement">
              <select className={inp} value={newInvMethod} onChange={e => setNewInvMethod(e.target.value as any)}>
                <option value="baridimob_ccp">CCP / BaridiMob</option>
                <option value="slickpay_dzd">SlickPay (Edahabia/CIB)</option>
                <option value="stripe_card">Carte bancaire</option>
              </select>
            </Field>
            <p className="text-[11px] text-slate-500">La facture est créée « payée » et le plan des assistants du client est mis à niveau automatiquement.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" className={btnGhost} onClick={() => setShowNewInvoiceModal(false)}>Annuler</button>
              <button type="submit" className={btnPrimary} disabled={isCreatingInvoice}>{isCreatingInvoice ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Créer la facture</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

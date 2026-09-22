import { createClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { KnowledgeNote } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // Erreur volontairement bruyante : mieux vaut un crash clair au démarrage
  // qu'un `auth.signIn` silencieusement cassé en prod.
  console.error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes. ' +
    'Ajoute-les à ton fichier .env (voir .env.example).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ----------------------------------------------------------------------
// Types (mêmes noms que src/lib/firebase.ts pour limiter les changements
// dans les composants qui les consomment)
// ----------------------------------------------------------------------

export interface UserProfile {
  uid: string; // = auth.users.id côté Supabase
  email: string;
  displayName: string;
  companyName?: string;
  phoneNumber?: string;
  photoURL?: string;
  role?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface WidgetCustomization {
  iconType: 'sparkles' | 'bot' | 'message' | 'zap' | 'headphone' | 'brain' | 'shield' | 'custom_logo';
  customLogoUrl?: string;
  primaryColor: string;
  gradientSecondary?: string;
  useGradient: boolean;
  position: 'bottom-right' | 'bottom-left';
  shape: 'circle' | 'squircle' | 'compact';
  size: 'standard' | 'large' | 'compact';
  showTeaser: boolean;
  teaserText: string;
  onlineBadge: boolean;
  headerTitle: string;
  headerSubtitle: string;
  welcomeMessage: string;
  themeMode: 'dark' | 'light';
  showBranding: boolean;
}

export interface AssistantConfig {
  id?: string;
  plan?: string;
  userId: string;
  businessName: string;
  websiteUrl?: string;
  siteType?: string;
  siteTypeConfidence?: number;
  scrapingStrategy?: string[];
  businessCategory: string;
  businessDescription?: string;
  faqText?: string;
  pricingServicesText?: string;
  specialRulesText?: string;
  knowledgeNotes?: KnowledgeNote[];
  assistantTone: string;
  languages: { fr: boolean; darija: boolean; en: boolean; ar: boolean };
  autoLeadCapture: boolean;
  whatsappEscalation?: string;
  webhookUrl?: string;
  widgetId: string;
  widgetConfig?: WidgetCustomization;
  createdAt?: any;
  updatedAt?: any;
}

// Ligne brute de la table `assistants` (colonnes snake_case + jsonb `config`).
// La table schema.sql stocke la config métier dans une colonne jsonb unique
// `config` plutôt qu'en colonnes séparées comme Firestore le faisait à plat.
// On (dé)sérialise ici pour garder AssistantConfig identique côté appelants.
interface AssistantRow {
  id: string;
  user_id: string;
  business_name: string;
  website_url: string | null;
  config: Record<string, any>;
  knowledge_notes: KnowledgeNote[];
  created_at: string;
  updated_at: string;
}

function rowToAssistant(row: AssistantRow): AssistantConfig {
  return {
    id: row.id,
    userId: row.user_id,
    businessName: row.business_name,
    websiteUrl: row.website_url || undefined,
    knowledgeNotes: row.knowledge_notes || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...row.config, // plan, siteType, assistantTone, languages, widgetConfig, etc.
  } as AssistantConfig;
}

function assistantToRow(assistant: Omit<AssistantConfig, 'createdAt' | 'updatedAt'>) {
  const { id, userId, businessName, websiteUrl, knowledgeNotes, ...rest } = assistant;
  return {
    ...(id ? { id } : {}),
    user_id: userId,
    business_name: businessName,
    website_url: websiteUrl || null,
    knowledge_notes: knowledgeNotes || [],
    config: rest,
  };
}

// ----------------------------------------------------------------------
// Auth
// ----------------------------------------------------------------------

async function upsertProfileFromAuthUser(user: SupabaseAuthUser, extra?: Partial<UserProfile>): Promise<UserProfile> {
  const payload = {
    id: user.id,
    email: user.email || '',
    display_name: extra?.displayName ?? (user.user_metadata?.full_name || user.email?.split('@')[0] || 'Utilisateur'),
    photo_url: extra?.photoURL ?? (user.user_metadata?.avatar_url || ''),
    ...(extra?.companyName ? { company_name: extra.companyName } : {}),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('users')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw error;

  return {
    uid: data.id,
    email: data.email,
    displayName: data.display_name,
    companyName: data.company_name || undefined,
    phoneNumber: data.phone_number || undefined,
    photoURL: data.photo_url || undefined,
    role: data.role,
  };
}

export async function signInWithGoogle(): Promise<UserProfile> {
  // OAuth Supabase redirige le navigateur : il n'y a pas de résultat
  // synchrone comme avec le popup Firebase. Le profil est récupéré au
  // retour de redirection via onAuthStateChange (voir AuthContext).
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
  return {} as UserProfile;
}

export async function registerWithEmail(
  email: string,
  pass: string,
  fullName: string,
  companyName: string
): Promise<UserProfile> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password: pass,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  if (!data.user) {
    throw new Error("Inscription en attente de confirmation par email.");
  }
  return upsertProfileFromAuthUser(data.user, { displayName: fullName, companyName });
}

export async function loginWithEmail(email: string, pass: string): Promise<UserProfile> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
  if (error) throw error;

  const { data: existing } = await supabase.from('users').select('*').eq('id', data.user.id).maybeSingle();
  if (existing) {
    return {
      uid: existing.id,
      email: existing.email,
      displayName: existing.display_name,
      companyName: existing.company_name || undefined,
      phoneNumber: existing.phone_number || undefined,
      photoURL: existing.photo_url || undefined,
      role: existing.role,
    };
  }
  return upsertProfileFromAuthUser(data.user);
}

export async function logoutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function updateUserAccountProfile(
  uid: string,
  data: { displayName?: string; companyName?: string; phoneNumber?: string; photoURL?: string }
): Promise<void> {
  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (data.displayName !== undefined) payload.display_name = data.displayName.trim();
  if (data.companyName !== undefined) payload.company_name = data.companyName.trim();
  if (data.phoneNumber !== undefined) payload.phone_number = data.phoneNumber.trim();
  if (data.photoURL !== undefined) payload.photo_url = data.photoURL.trim();

  const { error } = await supabase.from('users').update(payload).eq('id', uid);
  if (error) throw error;

  // Garde le profil auth (metadata) en phase pour l'avatar/nom affichés
  // sans requête supplémentaire dans certains écrans.
  await supabase.auth.updateUser({
    data: {
      ...(data.displayName !== undefined ? { full_name: data.displayName.trim() } : {}),
      ...(data.photoURL !== undefined ? { avatar_url: data.photoURL.trim() } : {}),
    },
  });
}

export async function changeUserPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function sendResetPassword(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

// ----------------------------------------------------------------------
// Assistants
// ----------------------------------------------------------------------

export async function saveAssistantToDatabase(
  assistant: Omit<AssistantConfig, 'createdAt' | 'updatedAt'>
): Promise<string> {
  const row = assistantToRow(assistant);
  const { data, error } = await supabase
    .from('assistants')
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function getUserAssistants(userId: string): Promise<AssistantConfig[]> {
  const { data, error } = await supabase.from('assistants').select('*').eq('user_id', userId);
  if (error) {
    console.error('Error fetching user assistants:', error);
    return [];
  }
  return (data as AssistantRow[]).map(rowToAssistant);
}

export async function getAssistantById(idOrWidgetId: string): Promise<AssistantConfig | null> {
  const { data: byId } = await supabase.from('assistants').select('*').eq('id', idOrWidgetId).maybeSingle();
  if (byId) return rowToAssistant(byId as AssistantRow);

  // widget_id est stocké dans la colonne jsonb `config` -> requête sur le champ jsonb.
  const { data: byWidget } = await supabase
    .from('assistants')
    .select('*')
    .eq('config->>widgetId', idOrWidgetId)
    .limit(1)
    .maybeSingle();
  return byWidget ? rowToAssistant(byWidget as AssistantRow) : null;
}

// ----------------------------------------------------------------------
// Admin (équivalent SUPER_ADMIN_EMAILS / isUserAdmin de firebase.ts)
// ----------------------------------------------------------------------

export function isUserAdmin(profile?: { role?: string } | null): boolean {
  return profile?.role === 'admin' || profile?.role === 'superadmin';
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase.from('users').select('*');
  if (error) { console.error('Error fetching all users:', error); return []; }
  return data.map(d => ({
    uid: d.id, email: d.email, displayName: d.display_name,
    companyName: d.company_name || undefined, photoURL: d.photo_url || undefined, role: d.role,
  }));
}

export async function getAllAssistants(): Promise<AssistantConfig[]> {
  const { data, error } = await supabase.from('assistants').select('*');
  if (error) { console.error('Error fetching all assistants:', error); return []; }
  return (data as AssistantRow[]).map(rowToAssistant);
}

export async function getAllProspects(): Promise<any[]> {
  const { data, error } = await supabase.from('prospects').select('*');
  if (error) { console.error('Error fetching all prospects:', error); return []; }
  return data;
}

export async function updateAssistantPlan(assistantId: string, plan: string): Promise<void> {
  // `plan` vit dans la colonne jsonb `config` -> lecture puis fusion, pas un
  // simple UPDATE de colonne (Postgres n'a pas d'équivalent direct au
  // `updateDoc({ plan })` de Firestore sur un champ imbriqué depuis le SDK JS).
  const { data, error: readErr } = await supabase
    .from('assistants')
    .select('config')
    .eq('id', assistantId)
    .single();
  if (readErr) throw readErr;

  const { error } = await supabase
    .from('assistants')
    .update({ config: { ...(data.config || {}), plan }, updated_at: new Date().toISOString() })
    .eq('id', assistantId);
  if (error) throw error;
}

export async function deleteAssistantDocument(assistantId: string): Promise<void> {
  const { error } = await supabase.from('assistants').delete().eq('id', assistantId);
  if (error) throw error;
}

export async function deleteUserRecord(userId: string): Promise<void> {
  // Supprime le profil ; la suppression du compte auth lui-même nécessite
  // service_role (admin API), donc un appel serveur, pas ce client anon.
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw error;
}

export async function deleteProspectRecord(prospectId: string): Promise<void> {
  const { error } = await supabase.from('prospects').delete().eq('id', prospectId);
  if (error) throw error;
}

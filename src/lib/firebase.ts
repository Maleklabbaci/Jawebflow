import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  sendPasswordResetEmail,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { KnowledgeNote } from '../types';

// Initialize Firebase App safely (singleton)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth & Firestore with dedicated Database ID
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export interface UserProfile {
  uid: string;
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
  userId: string;
  businessName: string;
  websiteUrl?: string;
  businessCategory: string;
  businessDescription?: string;
  faqText?: string;
  pricingServicesText?: string;
  specialRulesText?: string;
  knowledgeNotes?: KnowledgeNote[];
  assistantTone: string;
  languages: {
    fr: boolean;
    darija: boolean;
    en: boolean;
    ar: boolean;
  };
  autoLeadCapture: boolean;
  whatsappEscalation?: string;
  widgetId: string;
  widgetConfig?: WidgetCustomization;
  createdAt?: any;
  updatedAt?: any;
}

// Sync Firebase User with Firestore
export async function syncUserProfile(user: FirebaseUser): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  
  const profileData: UserProfile = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email?.split('@')[0] || 'Utilisateur',
    photoURL: user.photoURL || '',
    updatedAt: serverTimestamp(),
  };

  if (!userSnap.exists()) {
    profileData.createdAt = serverTimestamp();
    await setDoc(userRef, sanitizeFirestoreData(profileData));
  } else {
    const existing = userSnap.data() as UserProfile;
    if (existing.companyName) {
      profileData.companyName = existing.companyName;
    }
    const updatePayload = sanitizeFirestoreData({
      displayName: user.displayName || existing.displayName || '',
      photoURL: user.photoURL || existing.photoURL || '',
      updatedAt: serverTimestamp(),
    });
    await updateDoc(userRef, updatePayload);
  }

  return profileData;
}

// Google Sign-In helper (Pop-up with fallback)
export async function signInWithGoogle(): Promise<UserProfile> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return await syncUserProfile(result.user);
  } catch (error: any) {
    if (error?.code === 'auth/popup-blocked') {
      try {
        await signInWithRedirect(auth, googleProvider);
        return {} as UserProfile;
      } catch (redirectErr) {
        throw new Error("La fenêtre popup Google a été bloquée par le navigateur. Vous pouvez vous connecter avec votre Email & Mot de passe ci-dessous, ou autoriser les popups dans les paramètres de votre navigateur.");
      }
    }
    throw error;
  }
}

// Check redirect result on startup if applicable
export async function checkRedirectAuth(): Promise<UserProfile | null> {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      return await syncUserProfile(result.user);
    }
  } catch (e) {
    console.warn('Redirect auth check failed:', e);
  }
  return null;
}

// Email/Password Signup helper
export async function registerWithEmail(
  email: string, 
  pass: string, 
  fullName: string, 
  companyName: string
): Promise<UserProfile> {
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  const user = cred.user;

  if (fullName.trim()) {
    await updateProfile(user, { displayName: fullName.trim() });
  }

  const profileData: UserProfile = {
    uid: user.uid,
    email: user.email || email,
    displayName: fullName.trim() || email.split('@')[0],
    companyName: companyName.trim() || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'users', user.uid), profileData);
  return profileData;
}

// Email/Password Login helper
export async function loginWithEmail(email: string, pass: string): Promise<UserProfile> {
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  const user = cred.user;

  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    return userSnap.data() as UserProfile;
  }

  const profileData: UserProfile = {
    uid: user.uid,
    email: user.email || email,
    displayName: user.displayName || email.split('@')[0],
    updatedAt: serverTimestamp(),
  };
  await setDoc(userRef, profileData, { merge: true });
  return profileData;
}

// Sign-out helper
export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

// Recursive helper to remove undefined fields for Firestore
export function sanitizeFirestoreData<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue;
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && typeof (value as any).toMillis !== 'function') {
      result[key] = sanitizeFirestoreData(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Save Assistant to Firestore
export async function saveAssistantToDatabase(assistant: Omit<AssistantConfig, 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    const targetId = assistant.id?.trim() || null;
    const rawData: Record<string, any> = { ...assistant };
    delete rawData.id; // Crucial: never store id inside document data

    const sanitizedData = sanitizeFirestoreData(rawData);

    if (targetId) {
      const ref = doc(db, 'assistants', targetId);
      await setDoc(ref, {
        ...sanitizedData,
        updatedAt: serverTimestamp()
      }, { merge: true });
      return targetId;
    } else {
      const col = collection(db, 'assistants');
      const docRef = await addDoc(col, {
        ...sanitizedData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return docRef.id;
    }
  } catch (error) {
    console.error('Error saving assistant to database:', error);
    throw error;
  }
}

// Update User Profile in Auth and Firestore
export async function updateUserAccountProfile(
  uid: string, 
  data: { 
    displayName?: string; 
    companyName?: string; 
    phoneNumber?: string; 
    photoURL?: string; 
  }
): Promise<void> {
  const user = auth.currentUser;
  if (user) {
    const authUpdates: { displayName?: string; photoURL?: string } = {};
    if (data.displayName !== undefined) authUpdates.displayName = data.displayName.trim();
    if (data.photoURL !== undefined) authUpdates.photoURL = data.photoURL.trim();
    
    if (Object.keys(authUpdates).length > 0) {
      await updateProfile(user, authUpdates);
    }
  }

  const userRef = doc(db, 'users', uid);
  const updatePayload = sanitizeFirestoreData({
    ...data,
    updatedAt: serverTimestamp()
  });
  await setDoc(userRef, updatePayload, { merge: true });
}

// Change User Password
export async function changeUserPassword(newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Aucun utilisateur connecté.");
  await updatePassword(user, newPassword);
}

// Send Password Reset Email
export async function sendResetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// Get User Assistants from Firestore
export async function getUserAssistants(userId: string): Promise<AssistantConfig[]> {
  try {
    const q = query(
      collection(db, 'assistants'),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);
    const assistants: AssistantConfig[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      assistants.push({
        id: docSnap.id,
        ...data
      } as AssistantConfig);
    });
    return assistants;
  } catch (error) {
    console.error('Error fetching user assistants:', error);
    return [];
  }
}

// Get Assistant by Document ID or Widget ID
export async function getAssistantById(idOrWidgetId: string): Promise<AssistantConfig | null> {
  try {
    // First try by doc ID
    const docRef = doc(db, 'assistants', idOrWidgetId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as AssistantConfig;
    }
    
    // Otherwise query by widgetId field
    const q = query(collection(db, 'assistants'), where('widgetId', '==', idOrWidgetId));
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const firstDoc = querySnap.docs[0];
      return { id: firstDoc.id, ...firstDoc.data() } as AssistantConfig;
    }
    return null;
  } catch (error) {
    console.error('Error fetching assistant by ID:', error);
    return null;
  }
}


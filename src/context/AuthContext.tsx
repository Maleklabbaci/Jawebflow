// Nouvelle implémentation de AuthContext basée sur Supabase Auth.
//
// COMMENT L'ACTIVER SANS RIEN CASSER :
// Ce fichier ne remplace PAS encore src/context/AuthContext.tsx. Pour tester
// en gardant un retour arrière instantané (juste une variable d'env, pas un
// déploiement de code) :
//
//   1. Renomme l'ancien fichier en AuthContext.firebase.tsx
//   2. Crée src/context/AuthContext.tsx avec :
//        export * from
//          (import.meta.env.VITE_AUTH_PROVIDER === 'supabase'
//            ? './AuthContext.supabase'
//            : './AuthContext.firebase');
//      (ou plus simplement : un `if` au build, selon ton bundler — Vite gère
//      très bien l'`import.meta.env` statique pour ça)
//   3. VITE_AUTH_PROVIDER=firebase (défaut) tant que Supabase n'est pas
//      validé en prod ; VITE_AUTH_PROVIDER=supabase pour basculer.
//
// L'interface exposée (user.uid, user.email, profile, loading,
// signInWithGoogle, loginWithEmail, registerWithEmail, logout) est
// VOLONTAIREMENT identique à l'ancien AuthContext.tsx : aucun composant
// consommateur (Navbar, DashboardPlatform, AccountProfileView,
// InstagramIntegration, AdminPage, AuthPage, App.tsx) n'a besoin d'être
// modifié pour ce fichier seul.

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  supabase,
  UserProfile,
  signInWithGoogle,
  loginWithEmail,
  registerWithEmail,
  logoutUser,
} from '../lib/supabase';

// Objet compatible avec l'ancien `FirebaseUser` utilisé par les composants
// (ils ne lisent que .uid et .email — voir grep effectué avant réécriture).
export interface AdaptedUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}

interface AuthContextType {
  user: AdaptedUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<UserProfile>;
  loginWithEmail: (email: string, pass: string) => Promise<UserProfile>;
  registerWithEmail: (email: string, pass: string, fullName: string, companyName: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(uid: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from('users').select('*').eq('id', uid).maybeSingle();
  if (error || !data) return null;
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdaptedUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    // Même filet de sécurité que côté Firebase : jamais bloqué en
    // "chargement" indéfiniment (réseau lent, onglet restauré...).
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 6000);

    // Charge la session déjà persistée (localStorage) au montage.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      clearTimeout(safetyTimer);
      if (session?.user) {
        setUser({
          uid: session.user.id,
          email: session.user.email || null,
          displayName: session.user.user_metadata?.full_name || null,
          photoURL: session.user.user_metadata?.avatar_url || null,
        });
        setProfile(await fetchProfile(session.user.id));
      }
      setLoading(false);
    });

    // Écoute les changements (login, logout, refresh token, retour d'OAuth).
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser({
          uid: session.user.id,
          email: session.user.email || null,
          displayName: session.user.user_metadata?.full_name || null,
          photoURL: session.user.user_metadata?.avatar_url || null,
        });
        setProfile(await fetchProfile(session.user.id));
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleGoogleSignIn = async (): Promise<UserProfile> => {
    // Redirige le navigateur (pas de popup côté Supabase) : le profil arrive
    // via onAuthStateChange au retour, pas en valeur de retour directe.
    return signInWithGoogle();
  };

  const handleLoginWithEmail = async (email: string, pass: string): Promise<UserProfile> => {
    const p = await loginWithEmail(email, pass);
    setProfile(p);
    return p;
  };

  const handleRegisterWithEmail = async (
    email: string,
    pass: string,
    fullName: string,
    companyName: string
  ): Promise<UserProfile> => {
    const p = await registerWithEmail(email, pass, fullName, companyName);
    setProfile(p);
    return p;
  };

  const handleLogout = async (): Promise<void> => {
    await logoutUser();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithGoogle: handleGoogleSignIn,
        loginWithEmail: handleLoginWithEmail,
        registerWithEmail: handleRegisterWithEmail,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

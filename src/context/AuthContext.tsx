import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User as FirebaseUser,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  auth, 
  db, 
  UserProfile, 
  signInWithGoogle, 
  loginWithEmail, 
  registerWithEmail, 
  logoutUser 
} from '../lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<UserProfile>;
  loginWithEmail: (email: string, pass: string) => Promise<UserProfile>;
  registerWithEmail: (email: string, pass: string, fullName: string, companyName: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        // Real-time listener for user profile document
        const userRef = doc(db, 'users', fbUser.uid);
        const unsubProfile = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            setProfile({
              uid: fbUser.uid,
              email: fbUser.email || '',
              displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Utilisateur',
              photoURL: fbUser.photoURL || '',
            });
          }
        }, (err) => {
          console.warn('Profile sync snapshot fallback', err);
        });

        setLoading(false);
        return () => unsubProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async (): Promise<UserProfile> => {
    const p = await signInWithGoogle();
    setProfile(p);
    return p;
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

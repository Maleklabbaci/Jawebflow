import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext.tsx';
import { ConfigMissing } from './components/ConfigMissing.tsx';
import { isSupabaseConfigured } from './lib/supabase.ts';

// Configuration absente à la construction ? On explique à l'écran au lieu de
// laisser une page blanche (voir src/components/ConfigMissing.tsx).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSupabaseConfigured ? (
      <AuthProvider>
        <App />
      </AuthProvider>
    ) : (
      <ConfigMissing />
    )}
  </StrictMode>,
);

import { trpc } from "@/lib/trpc";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type LocalUser = { id: string; email: string; name: string };

type LocalSessionContextValue = {
  user: LocalUser | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const SESSION_KEY = "jawebflow-demo-session";
const LocalSessionContext = createContext<LocalSessionContextValue | null>(null);

function getStoredToken() {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function LocalSessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<LocalUser | null>(null);
  const loginMutation = trpc.auth.login.useMutation();
  const registerMutation = trpc.auth.register.useMutation();
  const sessionQuery = trpc.auth.me.useQuery(token ? { token } : undefined, {
    enabled: Boolean(token),
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setToken(getStoredToken());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    if (sessionQuery.data) {
      setUser(sessionQuery.data);
      return;
    }
    if (sessionQuery.isError || (sessionQuery.isFetched && sessionQuery.data === null)) {
      window.localStorage.removeItem(SESSION_KEY);
      setToken(null);
      setUser(null);
    }
  }, [sessionQuery.data, sessionQuery.isError, sessionQuery.isFetched, token]);

  const persistSession = (nextToken: string, nextUser: LocalUser) => {
    window.localStorage.setItem(SESSION_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
  };

  const value = useMemo<LocalSessionContextValue>(
    () => ({
      token,
      user,
      loading: !hydrated || (Boolean(token) && sessionQuery.isLoading),
      isAuthenticated: Boolean(token && user),
      login: async (email, password) => {
        const result = await loginMutation.mutateAsync({ email, password });
        persistSession(result.token, result.user);
      },
      register: async (email, password) => {
        const result = await registerMutation.mutateAsync({ email, password });
        persistSession(result.token, result.user);
      },
      logout: () => {
        window.localStorage.removeItem(SESSION_KEY);
        setToken(null);
        setUser(null);
      },
    }),
    [hydrated, loginMutation, registerMutation, sessionQuery.isLoading, token, user],
  );

  return <LocalSessionContext.Provider value={value}>{children}</LocalSessionContext.Provider>;
}

export function useLocalSession() {
  const context = useContext(LocalSessionContext);
  if (!context) throw new Error("useLocalSession must be used inside LocalSessionProvider");
  return context;
}

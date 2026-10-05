import { SESSION_EXPIRED } from "./sessionEvents";
import { apagarUsuarioId } from "../armazenamento";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authApi, type SessionUser } from "./authApi";

type AuthState = {
  currentUser: SessionUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string) => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let expired = false;
    const invalidate = () => {
      expired = true;
      setUser(null);
      apagarUsuarioId();
      window.location.hash = "/login";
    };
    window.addEventListener(SESSION_EXPIRED, invalidate);
    apagarUsuarioId();
    // Remove the old demo session; only the backend can restore authentication.
    try { localStorage.removeItem("xadrez-multiagente:demo-session:v1"); } catch { /* storage may be blocked */ }
    authApi.session().then(user => { if (active && !expired) setUser(user); }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.removeEventListener(SESSION_EXPIRED, invalidate); };
  }, []);
  return <AuthContext value={{
    currentUser, isAuthenticated: currentUser !== null, loading,
    login: async (email, password) => {
      const user = await authApi.login(email, password);
      apagarUsuarioId(); setUser(user); window.location.hash = "/partida";
    },
    register: async () => { throw new Error("O cadastro está desativado neste teste pessoal. Entre com sua conta configurada."); },
    logout: async () => {
      await authApi.logout();
      apagarUsuarioId(); setUser(null); window.location.hash = "/login";
    },
  }}>{children}</AuthContext>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth requires AuthProvider");
  return auth;
}

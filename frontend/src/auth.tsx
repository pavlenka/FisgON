import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearToken, getToken, setToken, setUnauthorizedHandler, type AuthUser } from "./api";
import { applyTheme, type Accent, type Theme } from "./theme";

// El tema del usuario vive en sus preferencias: se aplica cada vez que
// llega (login, arranque, cambio en Cuenta).
function syncTheme(u: AuthUser | null) {
  if (u) applyTheme(u.pref_theme as Theme, u.pref_accent as Accent);
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>(null!);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(getToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !!getToken());

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setTok(null);
      setUser(null);
    });

    if (getToken()) {
      api
        .me()
        .then((u) => {
          setUser(u);
          syncTheme(u);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    return () => setUnauthorizedHandler(null);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.access_token);
    setTok(res.access_token);
    const u = await api.me();
    setUser(u);
    syncTheme(u);
  };

  const logout = () => {
    clearToken();
    setTok(null);
    setUser(null);
  };

  const refreshUser = async () => {
    const u = await api.me();
    setUser(u);
    syncTheme(u);
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

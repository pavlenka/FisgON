import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearToken, getToken, setToken, setUnauthorizedHandler, type AuthUser } from "./api";

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
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
        .then(setUser)
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
    setUser(await api.me());
  };

  // El registro ya no inicia sesión: la cuenta queda pendiente hasta que el
  // usuario verifique su correo con el enlace que le enviamos.
  const register = async (email: string, password: string, name: string) => {
    await api.register(email, password, name);
  };

  const logout = () => {
    clearToken();
    setTok(null);
    setUser(null);
  };

  const refreshUser = async () => {
    setUser(await api.me());
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

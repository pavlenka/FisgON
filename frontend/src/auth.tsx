import { createContext, useContext, useState, type ReactNode } from "react";
import { api, clearToken, getToken, setToken } from "./api";

interface AuthContextValue {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>(null!);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(getToken());

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.access_token);
    setTok(res.access_token);
  };

  const register = async (email: string, password: string) => {
    const res = await api.register(email, password);
    setToken(res.access_token);
    setTok(res.access_token);
  };

  const logout = () => {
    clearToken();
    setTok(null);
  };

  return <AuthContext.Provider value={{ token, login, register, logout }}>{children}</AuthContext.Provider>;
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type ApiUser } from "../api/client";

const TOKEN_KEY = "grat_token";

type AuthState = {
  user: ApiUser | null;
  token: string | null;
  loading: boolean;
  login: (input: {
    email: string;
    displayName: string;
    role?: "USER" | "DESIGNER" | "ADMIN";
  }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const { user: me } = await api.me(token);
        if (!cancelled) setUser(me);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback(
    async (input: {
      email: string;
      displayName: string;
      role?: "USER" | "DESIGNER" | "ADMIN";
    }) => {
      const { token: nextToken, user: nextUser } = await api.devLogin(input);
      localStorage.setItem(TOKEN_KEY, nextToken);
      setToken(nextToken);
      setUser(nextUser);
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, logout }),
    [user, token, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, onUnauthorized } from "./api";
import { getToken, setToken } from "./storage";
import type { Me } from "./types";

interface AuthState {
  /** null = inte inloggad, undefined = håller på att läsas in */
  me: Me | null | undefined;
  refresh: () => Promise<void>;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setMe(null);
      return;
    }
    try {
      setMe(await api.me());
    } catch (e) {
      // Nätverksfel: behåll tidigare status. 401 hanteras av lyssnaren nedan.
      if (!(e instanceof Error && "status" in e && (e as { status: number }).status === 401)) {
        setMe((prev) => (prev === undefined ? null : prev));
      }
    }
  }, []);

  const signIn = useCallback(
    async (token: string) => {
      await setToken(token);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Sessionen kan redan vara ogiltig, logga ut lokalt ändå.
    }
    await setToken(null);
    setMe(null);
  }, []);

  useEffect(() => {
    void refresh();
    return onUnauthorized(() => {
      void setToken(null);
      setMe(null);
    });
  }, [refresh]);

  const value = useMemo(() => ({ me, refresh, signIn, signOut }), [me, refresh, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth utanför AuthProvider");
  return ctx;
}

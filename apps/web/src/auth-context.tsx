import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

const TOKEN_KEY = "ladlelink-auth-token";
const LEGACY_TOKEN_KEY = "ff-auth-token";

/** One-time migration: an old ff-auth-token moves to TOKEN_KEY on first read. */
export function readToken(): string {
  const current = localStorage.getItem(TOKEN_KEY);
  if (current !== null) return current;
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacy === null) return "";
  localStorage.setItem(TOKEN_KEY, legacy);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  return legacy;
}

type AuthContextValue = {
  token: string;
  setToken: (token: string) => void;
};

const AuthContext = createContext<AuthContextValue>({
  token: "",
  setToken: () => undefined,
});

/** Browser-only auth token helper (Android uses repository Docker config). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState(readToken);
  const setToken = useCallback((value: string) => {
    setTokenState(value);
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
  }, []);
  const value = useMemo(() => ({ token, setToken }), [token, setToken]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export { LEGACY_TOKEN_KEY, TOKEN_KEY };

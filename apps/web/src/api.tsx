import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const TOKEN_KEY = "ff-auth-token";

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
  const [token, setTokenState] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const setToken = useCallback((value: string) => {
    setTokenState(value);
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  }, []);
  const value = useMemo(() => ({ token, setToken }), [token, setToken]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export { TOKEN_KEY };

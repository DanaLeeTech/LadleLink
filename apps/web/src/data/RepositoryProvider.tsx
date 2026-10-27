import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createApiRepository } from "./api-repository";
import { createDemoRepository } from "./demo-repository";
import { createLocalFirstRepository } from "./local-repository";
import { isDemoMode } from "./demo";
import { isNativePlatform } from "./platform";
import type { RecipeRepository } from "./repository";

const RepositoryContext = createContext<RecipeRepository | null>(null);

export function RepositoryProvider({ children }: { children: ReactNode }) {
  const [repo] = useState<RecipeRepository>(() => {
    if (isDemoMode()) return createDemoRepository();
    return isNativePlatform() ? createLocalFirstRepository() : createApiRepository();
  });

  useEffect(() => {
    if (!repo.isNative()) return;
    // Opportunistic sync on launch
    void repo.syncNow().catch(() => undefined);
  }, [repo]);

  const value = useMemo(() => repo, [repo]);
  return (
    <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>
  );
}

export function useRepository(): RecipeRepository {
  const ctx = useContext(RepositoryContext);
  if (!ctx) {
    throw new Error("useRepository must be used within RepositoryProvider");
  }
  return ctx;
}

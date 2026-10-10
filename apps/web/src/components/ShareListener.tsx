import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { App as CapApp } from "@capacitor/app";
import { isNativePlatform } from "../data/platform";
import { safConsumeSharedUrl } from "../data/sync/saf-adapter";

function extractUrl(text: string): string | null {
  const parts = text.trim().split(/\s+/);
  for (const part of parts) {
    if (part.startsWith("http://") || part.startsWith("https://")) return part;
  }
  return null;
}

/** Listens for Android share / open-URL and routes to Import. */
export function ShareListener() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativePlatform()) return;

    let handle: { remove: () => Promise<void> } | undefined;

    async function goImport(url: string) {
      navigate(`/import?url=${encodeURIComponent(url)}`);
    }

    async function checkPendingShare() {
      try {
        const url = await safConsumeSharedUrl();
        if (url) await goImport(url);
      } catch {
        // bridge may be unavailable during first paint
      }
    }

    void checkPendingShare();

    void CapApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void checkPendingShare();
    }).then((h) => {
      handle = h;
    });

    void CapApp.addListener("appUrlOpen", ({ url }) => {
      const extracted = extractUrl(url);
      if (extracted) void goImport(extracted);
    });

    return () => {
      void handle?.remove();
    };
  }, [navigate]);

  return null;
}

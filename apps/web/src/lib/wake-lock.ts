import { useEffect, useState } from "react";

interface SentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
}

interface WakeLockLike {
  request: (type: "screen") => Promise<SentinelLike>;
}

function getWakeLock(): WakeLockLike | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { wakeLock?: WakeLockLike };
  return nav.wakeLock ?? null;
}

/** Keeps the screen awake while `enabled` (re-acquires when the tab becomes visible). */
export function useWakeLock(enabled: boolean): { supported: boolean; active: boolean } {
  const [supported] = useState(() => getWakeLock() !== null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const wakeLock = getWakeLock();
    if (!enabled || !wakeLock) return;

    let sentinel: SentinelLike | null = null;
    let disposed = false;

    async function request() {
      try {
        const next = await wakeLock!.request("screen");
        if (disposed) {
          void next.release();
          return;
        }
        sentinel = next;
        setActive(true);
        next.addEventListener("release", () => setActive(false));
      } catch {
        setActive(false);
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void request();
    }

    void request();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (sentinel) void sentinel.release().catch(() => undefined);
      setActive(false);
    };
  }, [enabled]);

  return { supported, active };
}

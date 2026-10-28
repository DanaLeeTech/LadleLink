import { useEffect } from "react";

const MESSAGE = "Discard unsaved changes?";
const GUARD = "__ladlelinkUnsavedGuard";

type GuardState = Record<string, unknown> & { [GUARD]?: boolean };

/**
 * Warn before leaving a dirty form: browser close/reload via beforeunload, and
 * in-app navigation by intercepting link clicks (this router is not a data
 * router, so useBlocker is unavailable).
 *
 * The phone Back gesture never fires a click, so a sentinel history entry is
 * pushed while dirty. Back lands on it, we ask, and either let the next Back go
 * through or restore the sentinel when the user cancels.
 */
export function useUnsavedChangesWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;

    const guardState: GuardState = { ...(history.state as GuardState | null), [GUARD]: true };
    history.pushState(guardState, "", location.href);
    let leaving = false;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function onPopState() {
      if (leaving) return;
      if (window.confirm(MESSAGE)) {
        leaving = true;
        history.back();
        return;
      }
      history.pushState(guardState, "", location.href);
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target && link.target !== "_self") return;
      const target = new URL(link.href, location.href);
      if (target.href === location.href) return;
      if (!window.confirm(MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
      // Drop the sentinel so Back works normally once the form is no longer dirty.
      if ((history.state as GuardState | null)?.[GUARD]) history.back();
    };
  }, [dirty]);
}

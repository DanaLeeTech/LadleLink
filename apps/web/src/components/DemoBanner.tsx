import { useEffect, useRef } from "react";
import { DEMO_NOTICE, isDemoMode } from "../data/demo";

/**
 * Public demo notice: a full-width sticky strip above the app.
 *
 * It sits outside the app shell so the app underneath keeps the exact layout of
 * the full build. Its measured height is published as `--demo-banner-height`,
 * which the stylesheet uses to extend the header band by the same amount — so
 * the app's top band, brand, and content end up in the same place they would in
 * the full app, just below the strip.
 */
export function DemoBanner() {
  const ref = useRef<HTMLDivElement>(null);
  const demo = isDemoMode();

  useEffect(() => {
    if (!demo) return;
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const apply = () =>
      root.style.setProperty("--demo-banner-height", `${element.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--demo-banner-height");
    };
  }, [demo]);

  if (!demo) return null;

  return (
    <div className="demo-banner" role="status" ref={ref}>
      <span className="demo-banner-tag">Demo</span>
      <span className="demo-banner-text">{DEMO_NOTICE}</span>
    </div>
  );
}

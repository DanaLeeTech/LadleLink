/**
 * Demo build detection.
 *
 * The public demo is the same web app built with FF_DEMO_BUILD=1. Vite replaces
 * __DEMO_MODE__ at build time, so the demo and the full app share one codebase
 * and any shared feature keeps working in both.
 */

declare const __DEMO_MODE__: boolean;

export function isDemoMode(): boolean {
  return typeof __DEMO_MODE__ !== "undefined" && __DEMO_MODE__;
}

export const DEMO_NOTICE = "Recipes you add are saved in this browser only.";

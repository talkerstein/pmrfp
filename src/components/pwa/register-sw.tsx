"use client";

import { useEffect } from "react";
import { captureInstallPrompt } from "@/components/pwa/install-prompt";

// This module loads on every page (root layout), so start listening for the
// browser's install offer as soon as the bundle runs, before hydration.
captureInstallPrompt();

/**
 * Registers /sw.js (offline fallback for page loads, nothing else cached) so
 * the installed app shows a calm "You're offline" page instead of the
 * browser's error screen. Production only, so dev never fights a worker.
 * Skipped inside iframes (embedded widgets on other sites). Any failure is
 * silent: the site works the same without it.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.self !== window.top) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    };
    // After load, so the worker never competes with the first paint.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

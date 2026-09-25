/**
 * Browser-side state for "Install the PMRFP app", shared by every InstallApp
 * on the page (sidebar card + mobile banner) through useSyncExternalStore.
 *
 * Chrome, Edge and Samsung Internet fire `beforeinstallprompt` once per page
 * load, often before React hydrates and usually on whatever page the visit
 * started on, so captureInstallPrompt() runs from the root layout
 * (register-sw.tsx) and keeps the event until a dashboard wants it.
 */
import { dismissedRecently, INSTALL_DISMISS_KEY, isAppArea, isIosSafari } from "@/lib/pwa/install";

/** Not in TypeScript's DOM lib (Chromium-only API). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/** hidden = render nothing; prompt = one-tap install; ios = Share → Add to Home Screen steps. */
export type InstallMode = "hidden" | "prompt" | "ios";

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let dismissed: boolean | null = null; // read from storage on first use
let listening = false;
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

/** Start holding on to the browser's install offer. Safe to call repeatedly and on the server. */
export function captureInstallPrompt(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    // Inside the dashboards our card replaces the browser's mini-infobar;
    // marketing pages keep the browser's default behaviour.
    if (isAppArea(window.location.pathname)) event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export function subscribeInstall(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

function isDismissed(): boolean {
  if (dismissed === null) {
    try {
      dismissed = dismissedRecently(window.localStorage.getItem(INSTALL_DISMISS_KEY), Date.now());
    } catch {
      dismissed = false; // storage blocked (private mode, policy): just show the card
    }
  }
  return dismissed;
}

/** Snapshot for useSyncExternalStore. Returns a string so it's stable between calls. */
export function getInstallMode(): InstallMode {
  if (installed || isStandalone() || isDismissed()) return "hidden";
  if (deferred) return "prompt";
  if (isIosSafari(navigator.userAgent, navigator.maxTouchPoints)) return "ios";
  return "hidden";
}

/** Server render (and hydration) always shows nothing; the client fills in. */
export function getServerInstallMode(): InstallMode {
  return "hidden";
}

/** Must run inside the click handler: prompt() needs the user's tap. */
export async function promptInstall(): Promise<void> {
  const event = deferred;
  if (!event) return;
  deferred = null; // each event can prompt once
  notify();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "dismissed") dismissInstall();
  } catch {
    // Already used or blocked by the browser; nothing useful to tell anyone.
  }
}

/** "Not now": hide the card everywhere for 30 days. */
export function dismissInstall(): void {
  dismissed = true;
  try {
    window.localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
  } catch {
    // Storage blocked: still hidden for the rest of this page's life.
  }
  notify();
}

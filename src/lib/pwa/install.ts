/**
 * Pure helpers behind the "Install the PMRFP app" card
 * (src/components/pwa/install-app.tsx). No window access here, so they can
 * be unit tested.
 */

/** How long "Not now" hides the install card. */
export const INSTALL_DISMISS_DAYS = 30;
export const INSTALL_DISMISS_KEY = "pmrfp:install-dismissed-at";

const DAY_MS = 24 * 60 * 60 * 1000;

/** True while a stored dismissal (epoch ms as a string) is under 30 days old. */
export function dismissedRecently(stored: string | null, now: number): boolean {
  if (!stored) return false;
  const at = Number(stored);
  if (!Number.isFinite(at) || at <= 0) return false;
  const age = now - at;
  // A timestamp from the future (clock changed) doesn't hide the card forever.
  return age >= 0 && age < INSTALL_DISMISS_DAYS * DAY_MS;
}

/**
 * iPhone / iPad Safari, where installing is manual (Share → Add to Home
 * Screen) because Safari has no install prompt. iPadOS reports a Mac user
 * agent, so a touch-capable "Mac" counts too. Other iOS browsers and in-app
 * webviews are left out: their menus differ, or they can't install at all.
 */
export function isIosSafari(userAgent: string, maxTouchPoints = 0): boolean {
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (!ios) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|LinkedInApp/.test(userAgent)) return false;
  return /Version\//.test(userAgent) && /Safari\//.test(userAgent);
}

/**
 * The signed-in app areas. There our own install card replaces the browser's
 * mini-infobar, which would otherwise sit on top of the mobile tab bar.
 */
export function isAppArea(pathname: string): boolean {
  return /^\/(?:dashboard|pm-dashboard|admin)(?:\/|$)/.test(pathname);
}

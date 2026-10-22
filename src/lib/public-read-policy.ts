/** Scope browsing limits to page reads, never payments, jobs or auth callbacks. */
export function isPublicPageRead(method: string, pathname: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  const path = pathname.replace(/^\/(?:en|fr|es)(?=\/|$)/, "") || "/";
  if (/^\/(?:api|auth|_next|dashboard|pm-dashboard|admin|onboarding|sign-in|sign-up|checkout|forgot-password|reset-password|account)(?:\/|$)/.test(path)) return false;
  if (/\.[a-z0-9]+$/i.test(path) || /\/(?:opengraph-image|twitter-image|icon|apple-icon)(?:[-/]|$)/.test(path)) return false;
  return true;
}

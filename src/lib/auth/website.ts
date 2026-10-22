/**
 * "marlinleads.com" is a website. The onboarding form only accepted
 * "https://…", so a real sign-up (2026-10-22) was refused on the one field that
 * looks optional and had to try again. Adds https:// when there is no scheme;
 * anything else is left for the schema to judge. Pure and client-safe.
 */
export function normalizeWebsite(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  return /^[^\s/]+\.[^\s/]{2,}/.test(v) ? `https://${v.replace(/^\/+/, "")}` : v;
}

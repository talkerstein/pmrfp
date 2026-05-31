/**
 * Safe-redirect helper for `next` URL params during sign-in / sign-up / onboarding.
 *
 * Only same-origin relative paths are allowed. This prevents open-redirect attacks
 * where an attacker tricks a user into signing in via a link that bounces them to
 * an attacker-controlled URL with the session cookie set.
 *
 * Returns the cleaned path, or null if the input is missing / unsafe.
 */
export function safeNextPath(input: string | null | undefined): string | null {
  if (!input) return null;
  if (!input.startsWith("/") || input.startsWith("//")) return null;
  // Block control chars + whitespace (NOT hyphens — slugs need them).
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c <= 0x20) return null;
  }
  if (input.includes("://")) return null;
  if (input.includes("\\")) return null;
  if (input.length > 512) return null;
  return input;
}

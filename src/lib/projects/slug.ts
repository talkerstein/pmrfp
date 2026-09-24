/**
 * Case-study slugs: readable words from the title plus a short random
 * suffix, so two "Flat roof replacement" projects never collide and the URL
 * still reads as the job.
 */
export function slugify(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60)
      .replace(/-$/, "") || "project"
  );
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Random lowercase suffix (no look-alike characters). */
export function randomSuffix(length = 5): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function projectSlug(title: string, suffix: string = randomSuffix()): string {
  return `${slugify(title)}-${suffix}`;
}

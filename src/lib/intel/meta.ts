import type { Metadata } from "next";
import { alternatesFor } from "@/i18n/metadata";
import type { Locale } from "@/i18n/config";

/**
 * Metadata for the paid /intel pages: never indexed (paid analysis; the
 * public winner pages and /intel itself are the indexable surface), links
 * still followed.
 */
export function intelNoindexMeta(lang: Locale, title: string, path: string): Metadata {
  return {
    title: { absolute: title },
    alternates: alternatesFor(lang, path),
    robots: { index: false, follow: true },
  };
}

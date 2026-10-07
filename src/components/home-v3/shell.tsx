import type { ReactNode } from "react";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { spotsLeft } from "@/lib/founding/config";
import { cachedLifetimeCount } from "@/lib/founding/server";
import { V3Frame } from "./chrome";
import { chromeMessages } from "./chrome-shared";

/** Founding 500 spots left, or null when the count can't be read. */
export async function foundingSpotsLeft(): Promise<number | null> {
  try {
    const sold = await cachedLifetimeCount();
    return sold == null ? null : spotsLeft(sold);
  } catch {
    return null;
  }
}

/**
 * Server frame for pages built from the Claude Design templates: the v3
 * announcement bar, header and footer around one <main>.
 */
export async function V3Shell({ lang, joinHref, children }: { lang: Locale; joinHref?: string; children: ReactNode }) {
  const left = await foundingSpotsLeft();
  return (
    <V3Frame t={chromeMessages(getDictionary(lang).homeV3)} lang={lang} foundingLeft={left} joinHref={joinHref}>
      {children}
    </V3Frame>
  );
}

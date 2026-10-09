"use client";

import { useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";
import type { ClientMessages } from "@/i18n/dictionaries";
import { translateServerMessage } from "@/lib/projects/server-messages";

type Messages = ClientMessages["portfolioClient"]["serverMessages"];

/**
 * lib/projects (and its routes) answer in English. Known answers show in the
 * visitor's language; anything else as-is.
 *   const say = useProjectMessage(); setError(say(res.error))
 */
export function useProjectMessage() {
  const t = useT("portfolioClient").serverMessages as Messages;
  return (message: string | null | undefined): string => {
    if (!message) return "";
    const hit = translateServerMessage(message);
    return hit ? fmt(t[hit.key], hit.values) : message;
  };
}

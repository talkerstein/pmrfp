import { Bot } from "lucide-react";
import { AUTO_LABEL_EN, AUTO_LABEL_FR } from "@/lib/forum/auto-threads";

/** "Automatic post" chip for PMRFP Board threads (lists and thread page). */
export function AutoPostChip({ lang, full = false }: { lang: string; full?: boolean }) {
  const fr = lang === "fr";
  const label = full ? (fr ? AUTO_LABEL_FR : AUTO_LABEL_EN) : fr ? "Publication automatique" : "Automatic post";
  return (
    <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-900" title={fr ? AUTO_LABEL_FR : AUTO_LABEL_EN}>
      <Bot className="size-3" aria-hidden /> {label}
    </span>
  );
}

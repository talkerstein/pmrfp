import { History } from "lucide-react";
import { Block } from "./blocks";
import type { RfpChange } from "@/lib/rfp-detail/changes";
import { getLang, getT } from "@/i18n/server";
import { fmt, formatDate } from "@/i18n/format";

/**
 * "Updated Oct 20, 2026: closing date moved from Oct 18, 2026 to Oct 25,
 * 2026." Free for everyone: a bidder needs to know the date moved. Shown
 * only when the importer has logged a change (lib/rfp-detail/changes).
 */
export function ChangeLog({ changes }: { changes: RfpChange[] }) {
  if (!changes.length) return null;
  const t = getT("rfpDepth").changes;
  const lang = getLang();
  const day = (d: string) => formatDate(d, lang, { month: "short", day: "numeric", year: "numeric" });
  const what = (c: RfpChange) =>
    c.field === "closing_date"
      ? fmt(t.closing_date, { from: day(c.oldValue), to: day(c.newValue) })
      : c.field === "title"
        ? fmt(t.title_changed, { from: c.oldValue, to: c.newValue })
        : t.status;
  return (
    <Block id="changes" icon={<History className="size-4 text-teal-700" aria-hidden />} title={t.title}>
      <ul className="mt-3 space-y-2 text-sm">
        {changes.map((c) => (
          <li key={`${c.field}-${c.at}-${c.newValue}`} data-change={c.field}>
            {fmt(t.item, { updated: fmt(t.updated, { date: day(c.at) }), what: what(c) })}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">{t.note}</p>
    </Block>
  );
}

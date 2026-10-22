import { ClipboardList } from "lucide-react";
import { Block } from "./blocks";
import type { PrepareItem } from "@/lib/rfp-detail/prepare";
import type { WorkType } from "@/lib/rfp-detail/facts";
import { getT } from "@/i18n/server";
import { fmt } from "@/i18n/format";

/**
 * "What to prepare to bid" (depth plan, Step 2, block 6): a general checklist
 * for the listing's province or state. Free for everyone. It says in its
 * first line that it is not read from this notice, every dollar limit is a
 * blank to confirm, and it ends "confirm against the tender documents".
 */
export function PrepareChecklist({
  items,
  place,
  workType,
  publicBuyer = true,
}: {
  items: PrepareItem[];
  place: string;
  workType: WorkType | null;
  /** False for a private job: the bonding line then makes no claim about municipal tenders. */
  publicBuyer?: boolean;
}) {
  if (!items.length) return null;
  const t = getT("rfpDepth").prepare;
  const construction = workType === null || workType === "construction";
  return (
    <Block id="prepare" icon={<ClipboardList className="size-4 text-teal-700" aria-hidden />} title={t.title} sub={place ? fmt(t.sub, { place }) : t.asOf}>
      <ul className="mt-3 space-y-3 text-sm">
        {items.map((it) => {
          // The bonding line differs for service work; everything else is one text per item.
          const key = it.key === "bonding" ? (!publicBuyer ? "bondingPrivate" : construction ? "bonding" : "bondingOther") : it.key;
          const text = t.items[key];
          return (
            <li key={`${it.key}-${it.code ?? ""}`} data-item={it.key}>
              <p className="font-medium">{text.h}</p>
              <p className="mt-0.5 leading-relaxed text-muted-foreground">{it.code ? fmt(text.b, { board: t.boards[it.code] }) : text.b}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs font-medium text-foreground" data-note="confirm">{t.confirm}</p>
      {place ? <p className="mt-1 text-[11px] text-muted-foreground">{t.asOf}</p> : null}
    </Block>
  );
}

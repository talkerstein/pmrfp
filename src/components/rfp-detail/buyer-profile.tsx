import type { ReactNode } from "react";
import { Building2 } from "lucide-react";
import Link from "@/i18n/link";
import { Block } from "./blocks";
import type { BuyerOffice } from "@/lib/rfp-detail/buyer-profile";
import { getT } from "@/i18n/server";
import { fmt, plural } from "@/i18n/format";

/**
 * "About the buyer" (depth plan, Step 2, block 2): name linked to its page,
 * the kind of buyer, open bids and past awards on record, what it usually
 * buys, and its office details. Office details are free for everyone: a
 * public buyer's address, phone and website are public information, and the
 * link to its official bids page is never behind a plan.
 */
export function BuyerProfile({
  name,
  path,
  kindLabel,
  openCount,
  awardCount,
  trades,
  office,
}: {
  name: string;
  /** The buyer page, already localized-free (Link adds the language). */
  path: string;
  kindLabel: string | null;
  openCount: number;
  awardCount: number;
  /** Trade names, already translated. */
  trades: string[];
  office: BuyerOffice | null;
}) {
  const t = getT("rfpDepth").buyer;
  const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  const rows: [string, ReactNode][] = [];
  if (kindLabel) rows.push([t.type, kindLabel]);
  rows.push([t.open, openCount > 0 ? plural(openCount, t.openCount) : t.none]);
  rows.push([t.awards, awardCount > 0 ? plural(awardCount, t.awardCount) : t.none]);
  if (trades.length) rows.push([t.usually, trades.join(", ")]);

  const officeRows: [string, ReactNode][] = [];
  if (office?.address) officeRows.push([t.address, office.address]);
  if (office?.phone) officeRows.push([t.phone, <a key="p" href={`tel:${office.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">{office.phone}</a>]);
  if (office?.email) officeRows.push([t.email, <a key="e" href={`mailto:${office.email}`} className="break-all hover:underline">{office.email}</a>]);
  if (office?.website) officeRows.push([t.website, <a key="w" href={office.website} target="_blank" rel="noopener noreferrer" className="break-all hover:underline">{host(office.website)} ↗</a>]);
  if (office?.bidsUrl) officeRows.push([t.bids, <a key="b" href={office.bidsUrl} target="_blank" rel="noopener noreferrer" className="break-all hover:underline">{host(office.bidsUrl)} ↗</a>]);

  return (
    <Block id="buyer" icon={<Building2 className="size-4 text-teal-700" aria-hidden />} title={t.title}>
      <p className="mt-2 text-lg font-semibold">
        <Link href={path} className="hover:text-teal-700 hover:underline" data-link="buyer">{name}</Link>
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
            <dd className="mt-0.5">{v}</dd>
          </div>
        ))}
      </dl>
      {officeRows.length > 0 && (
        <div className="mt-4 border-t border-border pt-3" data-section="buyer-office">
          <h3 className="text-sm font-semibold">{t.office}</h3>
          <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {officeRows.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className="mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <Link href={path} className="font-medium text-teal-700 hover:underline">{fmt(t.viewAll, { name })} →</Link>
      </div>
    </Block>
  );
}

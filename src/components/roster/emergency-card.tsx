import { Download, Pencil, Phone, Siren } from "lucide-react";
import Link from "@/i18n/link";
import type { Messages } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";
import { telHref, type RosterCountry, type RosterRow, type VendorSlot } from "@/lib/roster/rules";
import { rowLabel } from "@/lib/roster/view";
import { PrintButton } from "./print-button";

type R = Messages["roster"];

export interface CardRoster {
  building_name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  on_call_name: string | null;
  on_call_phone: string | null;
  on_call_notes: string | null;
  shutoff_water: string | null;
  shutoff_gas: string | null;
  shutoff_electric: string | null;
  shutoff_notes: string | null;
  emergency_line: string;
  non_emergency_line: string | null;
  other_numbers: string | null;
}

function CallButton({ name, phone, big, label }: { name: string | null; phone: string | null; big?: boolean; label: string }) {
  const tel = telHref(phone);
  const text = (
    <>
      <span className="min-w-0">
        <span className={`block truncate font-semibold ${big ? "text-lg" : "text-base"}`}>{name || phone}</span>
        {name && phone && <span className="block text-sm opacity-80">{phone}</span>}
      </span>
      <Phone className={big ? "size-6 shrink-0" : "size-5 shrink-0"} />
    </>
  );
  if (!tel) return <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-3">{text}</div>;
  return (
    <a
      href={tel}
      aria-label={fmt(label, { name: name || phone || "" })}
      className={`flex items-center justify-between gap-3 rounded-xl px-4 ${big ? "bg-indigo py-4 text-white" : "border border-indigo-200 bg-indigo-50 py-3 text-indigo-900"} active:translate-y-px print:border print:border-black print:bg-white print:text-black`}
    >
      {text}
    </a>
  );
}

function hasSlot(s: VendorSlot | null): s is VendorSlot {
  return Boolean(s && (s.name || s.phone));
}

/**
 * The mobile-first emergency card: big tap-to-call buttons, 911 first, the
 * on-call contact, then every trade the building needs (primary large,
 * backup below), the shut-offs and the other numbers. Shared by the PM's
 * card page and the read-only share link.
 */
export function EmergencyCard({
  roster,
  rows,
  country,
  lang,
  t,
  updatedAt,
  vcardHref,
  editHref,
  sharedBy,
}: {
  roster: CardRoster;
  rows: RosterRow[];
  country: RosterCountry;
  lang: Locale;
  t: R;
  updatedAt: string;
  vcardHref: string;
  editHref?: string;
  sharedBy?: string;
}) {
  const c = t.card;
  const needed = rows.filter((r) => !r.notNeeded);
  const where = [roster.address, roster.city, roster.province].filter(Boolean).join(", ");
  const shutoffs = [
    [c.water, roster.shutoff_water],
    [c.gas, roster.shutoff_gas],
    [c.electric[country], roster.shutoff_electric],
    [c.other, roster.shutoff_notes],
  ].filter((x): x is [string, string] => Boolean(x[1]));

  return (
    <article className="mx-auto max-w-xl space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{c.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{roster.building_name}</h1>
        {where && <p className="mt-1 text-sm text-muted-foreground">{where}</p>}
      </header>

      <section className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="flex items-start gap-2 text-sm font-medium text-red-800">
          <Siren className="mt-0.5 size-4 shrink-0" /> {fmt(c.lifeSafety, { emergency: roster.emergency_line })}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <a href={telHref(roster.emergency_line) ?? undefined} className="flex items-center justify-between rounded-xl bg-red-600 px-4 py-4 text-lg font-semibold text-white active:translate-y-px print:border print:border-black print:bg-white print:text-black">
            {c.emergency} · {roster.emergency_line} <Phone className="size-6" />
          </a>
          {roster.non_emergency_line && <CallButton name={c.nonEmergency} phone={roster.non_emergency_line} label={c.call} />}
        </div>
      </section>

      {(roster.on_call_phone || roster.on_call_name) && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{c.onCall}</h2>
          <CallButton name={roster.on_call_name} phone={roster.on_call_phone} big label={c.call} />
          {roster.on_call_notes && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{roster.on_call_notes}</p>}
        </section>
      )}

      <section className="space-y-4">
        {needed.map((r) => (
          <div key={r.key} className="rounded-xl border border-border bg-card p-3 print:break-inside-avoid">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-semibold">{rowLabel(r, t, country)}</h2>
              {r.available247 && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">{c.available247}</span>}
            </div>
            {hasSlot(r.primary) ? (
              <div className="space-y-2">
                <CallButton name={r.primary.name} phone={r.primary.phone} big label={c.call} />
                {hasSlot(r.backup) && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.backup}</p>
                    <CallButton name={r.backup.name} phone={r.backup.phone} label={c.call} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{c.noVendor}</p>
            )}
            {r.notes && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{r.notes}</p>}
          </div>
        ))}
      </section>

      {shutoffs.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{c.shutoffs}</h2>
          <dl className="mt-2 space-y-2 text-sm">
            {shutoffs.map(([k, v]) => (
              <div key={k}>
                <dt className="font-medium">{k}</dt>
                <dd className="whitespace-pre-line text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {roster.other_numbers && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{c.otherNumbers}</h2>
          <p className="mt-2 whitespace-pre-line text-sm">{roster.other_numbers}</p>
        </section>
      )}

      <footer className="space-y-3 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          {fmt(c.updated, { date: formatDate(updatedAt, lang) })}
          {sharedBy ? ` · ${fmt(t.share.readOnly, { company: sharedBy })}` : ""}
        </p>
        <div className="flex flex-wrap gap-2 print:hidden">
          <a href={vcardHref} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-medium hover:bg-muted">
            <Download className="size-4" /> {c.addToPhone}
          </a>
          <PrintButton label={c.print} variant="outline" />
          {editHref && (
            <Link href={editHref} className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-teal-700 hover:underline">
              <Pencil className="size-4" /> {c.edit}
            </Link>
          )}
        </div>
      </footer>
    </article>
  );
}

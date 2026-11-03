import type { Messages } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";
import type { RosterCountry, RosterRow, VendorSlot } from "@/lib/roster/rules";
import { rowLabel } from "@/lib/roster/view";
import type { CardRoster } from "./emergency-card";

type R = Messages["roster"];

function who(s: VendorSlot | null): string {
  if (!s || !(s.name || s.phone)) return "";
  return [s.name, s.phone].filter(Boolean).join(" · ");
}

/**
 * One printed page per building: 911 and the on-call contact on top, the
 * trade table (primary, backup, notes), the shut-offs and the numbers.
 * Black on white; the next building starts on a new page.
 */
export function RosterPrintSheet({ roster, rows, country, lang, t, printedAt }: { roster: CardRoster; rows: RosterRow[]; country: RosterCountry; lang: Locale; t: R; printedAt: Date }) {
  const p = t.print;
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
    <section className="mb-10 rounded-lg border border-border bg-white p-6 text-[13px] text-black print:mb-0 print:break-after-page print:rounded-none print:border-0 print:p-0 last:print:break-after-auto">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-black pb-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide">{p.title}</p>
          <h2 className="text-xl font-bold">{roster.building_name}</h2>
          {where && <p>{where}</p>}
        </div>
        <p className="text-[11px]">{fmt(p.printed, { date: formatDate(printedAt, lang) })}</p>
      </header>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 print:grid-cols-2">
        <p className="border-2 border-black p-2 font-bold">
          {fmt(c.lifeSafety, { emergency: roster.emergency_line })}
        </p>
        <div className="border border-black p-2">
          {roster.on_call_phone || roster.on_call_name ? (
            <p>
              <span className="font-semibold">{c.onCall}:</span> {[roster.on_call_name, roster.on_call_phone].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {roster.non_emergency_line && (
            <p>
              <span className="font-semibold">{c.nonEmergency}:</span> {roster.non_emergency_line}
            </p>
          )}
          {roster.on_call_notes && <p className="whitespace-pre-line">{roster.on_call_notes}</p>}
        </div>
      </div>

      <table className="mt-3 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1 pr-2 font-semibold">{p.trade}</th>
            <th className="py-1 pr-2 font-semibold">{p.primary}</th>
            <th className="py-1 pr-2 font-semibold">{p.backup}</th>
            <th className="py-1 font-semibold">{p.notes}</th>
          </tr>
        </thead>
        <tbody>
          {needed.map((r) => (
            <tr key={r.key} className="border-b border-neutral-300 align-top">
              <td className="py-1 pr-2 font-medium">
                {rowLabel(r, t, country)}
                {r.available247 && <span className="ml-1 text-[11px]">({p.yes247})</span>}
              </td>
              <td className="py-1 pr-2">{who(r.primary) || "—"}</td>
              <td className="py-1 pr-2">{who(r.backup) || "—"}</td>
              <td className="py-1 whitespace-pre-line">{r.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(shutoffs.length > 0 || roster.other_numbers) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
          {shutoffs.length > 0 && (
            <div>
              <p className="font-semibold">{c.shutoffs}</p>
              <dl>
                {shutoffs.map(([k, v]) => (
                  <div key={k}>
                    <dt className="inline font-medium">{k}: </dt>
                    <dd className="inline whitespace-pre-line">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {roster.other_numbers && (
            <div>
              <p className="font-semibold">{c.otherNumbers}</p>
              <p className="whitespace-pre-line">{roster.other_numbers}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

import { FOUNDING } from "@/lib/founding/config";
import { getT } from "@/i18n/server";
import { fmt } from "@/i18n/format";

/** The Founding 500 legal terms: one wording, shown on /founding-500 and /terms#founding-500. */
export function FoundingTermsList({ className }: { className?: string }) {
  const t = getT("founding");
  const vars = {
    usd: FOUNDING.priceUsd,
    cad: FOUNDING.priceCad,
    cap: FOUNDING.cap,
    days: FOUNDING.refundDays,
    months: FOUNDING.discontinueRefundMonths,
  };
  return (
    <ul className={`list-disc space-y-2 pl-5 ${className ?? ""}`}>
      {t.terms.map((line) => (
        <li key={line}>{fmt(line, vars)}</li>
      ))}
    </ul>
  );
}

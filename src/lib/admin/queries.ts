/** Format an ISO date string as en-CA, or "—" when null/empty. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-CA");
}

/** Format a numeric amount as "$X CAD" (or another currency), "—" when null. */
export function fmtMoney(amount: number | null | undefined, currency = "CAD"): string {
  if (amount == null) return "—";
  return `$${amount.toLocaleString("en-CA")} ${currency.toUpperCase()}`;
}

/** Coalesce a possibly-null/empty value to an em-dash for table cells. */
export function dash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

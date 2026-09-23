import { listRfps } from "@/lib/data/rfps";
import { reportContracts } from "@/lib/data/contracts-report";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

const cell = (v: string | number | null) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * The contract-level data behind /reports/public-building-contracts, for
 * journalists and researchers. Individuals are never named. Each row carries
 * its source licence (attribution travels with the data).
 */
export async function GET() {
  const rows = reportContracts(await listRfps()).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const header = ["award_date", "contract", "winner", "value_cad", "jurisdiction", "trades", "pmrfp_url", "source_licence"];
  const lines = rows.map((c) =>
    [
      c.date,
      c.title,
      c.publicWinner ?? "Individual (not named)",
      c.amount && c.amount > 0 ? c.amount : null,
      c.jurisdiction,
      c.categories.join("; "),
      `${SITE.url}/rfps/${c.slug}`,
      c.attribution,
    ]
      .map(cell)
      .join(","),
  );
  // BOM: Excel otherwise reads UTF-8 as Windows-1252 and mangles Quebec accents.
  return new Response("﻿" + [header.join(","), ...lines].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pmrfp-public-building-contracts.csv"',
    },
  });
}

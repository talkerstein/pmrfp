import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireRole } from "@/lib/access/access";
import { PageHeader } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { Badge } from "@/components/ui/badge";
import { listRfps } from "@/lib/data/rfps";
import { gcLeadsFromRfps } from "@/lib/gc/leads";
import { gcPostPath } from "@/lib/gc/packages";
import { compactDollars } from "@/lib/data/fomo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "GC leads · Admin · PMRFP" };

const fmt = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }) : "—";

/**
 * Contractors who just won public work — the people most likely to need subs
 * this month. For the owner to email by hand with their invite link; nothing
 * is sent automatically.
 */
export default async function AdminGcLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ gc?: string }>;
}) {
  await requireRole(["admin", "super_admin"]);
  const gcOnly = (await searchParams).gc === "1";
  const today = new Date().toISOString().slice(0, 10);
  const all = gcLeadsFromRfps(await listRfps().catch(() => []), { today, days: 30 });
  const leads = gcOnly ? all.filter((l) => l.generalContracting) : all;

  return (
    <>
      <PageHeader
        title="GC leads"
        description="Companies that won public contracts in the last 30 days, newest first. National firms and public bodies are left out. Email them their invite link — it opens the package form with the contract prefilled."
      />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link
          href="/admin/gc-leads"
          className={`rounded-full px-4 py-1.5 font-medium ${!gcOnly ? "bg-indigo text-white" : "border border-border hover:bg-secondary"}`}
        >
          All winners ({all.length})
        </Link>
        <Link
          href="/admin/gc-leads?gc=1"
          className={`rounded-full px-4 py-1.5 font-medium ${gcOnly ? "bg-indigo text-white" : "border border-border hover:bg-secondary"}`}
        >
          General contracting ({all.filter((l) => l.generalContracting).length})
        </Link>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          title="No recent winners"
          description="No public contract awards from the last 30 days on the board right now."
        />
      ) : (
        <ol className="space-y-3">
          {leads.map((l) => (
            <li key={l.key} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold">{l.name}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {l.awards.length} award{l.awards.length === 1 ? "" : "s"}
                    {l.totalValue ? ` · ${compactDollars(l.totalValue)}` : ""}
                    {l.regions.length ? ` · ${l.regions.join(", ")}` : ""} · latest {fmt(l.latest)}
                  </p>
                  {l.categories.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {l.categories.slice(0, 4).map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
                    </div>
                  )}
                </div>
                <div className="w-full max-w-sm text-xs sm:w-auto">
                  <div className="font-medium text-muted-foreground">Invite link</div>
                  <input
                    readOnly
                    value={`${SITE.url}${gcPostPath(l.awards[0]?.slug)}`}
                    className="mt-1 w-full rounded-md border border-input bg-secondary/40 px-2 py-1 font-mono text-[11px]"
                  />
                </div>
              </div>
              <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                {l.awards.map((a) => (
                  <li key={a.slug} className="flex flex-wrap items-baseline gap-x-2">
                    <Link href={`/rfps/${a.slug}`} target="_blank" className="font-medium text-teal-700 hover:underline">
                      {a.title}
                    </Link>
                    <span className="text-muted-foreground">
                      {a.value ?? "value not disclosed"}
                      {a.buyer ? ` · ${a.buyer}` : ""} · {fmt(a.date)}
                    </span>
                    {a.noticeUrl && (
                      <a
                        href={a.noticeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        notice <ExternalLink className="size-3" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { BreakGlassForm } from "@/components/towns/jobs/sealed-forms";
import { sealedCounts } from "@/lib/town-jobs/sealed-server";
import { isClosed, townClosesAt } from "@/lib/town-jobs/sealed";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Sealed Quote Boxes · Admin · PMRFP" };

interface Row {
  id: string;
  title: string;
  slug: string;
  buyer_name: string | null;
  buyer_key: string | null;
  deadline: string | null;
  status: string;
}

/**
 * Admin: towns' sealed quote boxes (PMRFP for Towns, Part C). Counts only:
 * admins can't see a sealed quote before the town's two-person opening,
 * except through break-glass, which needs a written reason, is logged in the
 * town's own record (who, when, why) and tells every member of the town
 * in-app. It does not open the box for the town. English only (admin screen).
 */
export default async function AdminSealedPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const demo = isDemoMode() || !isServiceConfigured();
  let rows: (Row & { received: number; opened: boolean })[] = [];
  if (!demo) {
    const db = createServiceClient();
    const { data } = await db
      .from("rfp_posts")
      .select("id,title,slug,buyer_name,buyer_key,deadline,status")
      .eq("sealed", true)
      .order("deadline", { ascending: false })
      .limit(200);
    const posts = (data ?? []) as Row[];
    const counts = await sealedCounts(db, posts.map((p) => p.id));
    rows = posts.map((p) => ({ ...p, received: counts.get(p.id)?.received ?? 0, opened: counts.get(p.id)?.opened ?? false }));
  }
  const shut = rows.filter((r) => !r.opened);
  return (
    <div className="max-w-5xl">
      {demo && <DemoBanner />}
      <PageHeader title="Sealed quote boxes" description="Counts only. Break-glass is for fraud, legal or safety reasons, with the town's knowledge: it's logged in the town's record and the town is told." />
      {shut.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sealed boxes waiting to be opened.</p>
      ) : (
        <ul className="space-y-4">
          {shut.map((r) => {
            const closes = townClosesAt(r.deadline, r.buyer_key);
            return (
              <li key={r.id} className="rounded-lg border border-border bg-card p-4" data-sealed-post={r.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.buyer_name ?? "—"} · {r.status} · {isClosed(closes) ? "closed" : "open"} {closes ? `(closes ${closes.slice(0, 16).replace("T", " ")} UTC)` : ""}</p>
                </div>
                <p className="mt-1 text-sm">{r.received} quote{r.received === 1 ? "" : "s"} in the box</p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-red-700">Break-glass (audited)</summary>
                  <div className="mt-3">
                    <BreakGlassForm rfpId={r.id} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

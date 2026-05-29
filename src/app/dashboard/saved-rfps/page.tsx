import Link from "next/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Saved RFPs" };

interface SavedRow {
  rfp_id: string;
  rfp_posts: { title: string; slug: string } | { title: string; slug: string }[] | null;
}

export default async function SavedRfpsPage() {
  const session = await requireRole(["trade"]);

  const saved: { title: string; slug: string }[] = [];
  if (!isDemoMode()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("saved_rfps")
      .select("rfp_id, rfp_posts(title,slug)")
      .eq("user_id", session.userId);
    for (const row of (data as SavedRow[] | null) ?? []) {
      const rel = Array.isArray(row.rfp_posts) ? row.rfp_posts[0] : row.rfp_posts;
      if (rel) saved.push(rel);
    }
  }

  return (
    <div>
      <PageHeader
        title="Saved RFPs"
        description="Opportunities you bookmarked to revisit."
      />

      {saved.length === 0 ? (
        <EmptyState
          title="No saved opportunities yet"
          description="Save RFPs from the feed to keep track of the ones that matter."
        >
          <Link href="/rfps" className={buttonVariants()}>
            Browse RFPs
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((r) => (
            <Link
              key={r.slug}
              href={`/rfps/${r.slug}`}
              className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-gold-400"
            >
              <h3 className="text-base font-semibold leading-snug">{r.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">View opportunity →</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

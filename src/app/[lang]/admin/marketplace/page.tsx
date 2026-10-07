import type { Metadata } from "next";
import Link from "@/i18n/link";
import { requireRole } from "@/lib/access/access";
import { PageHeader } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { listAllListingsForAdmin } from "@/lib/marketplace/data";
import { adminSetListingStatusAction } from "@/lib/marketplace/actions";
import { effectiveStatus, formatPrice, isFeatured } from "@/lib/marketplace/rules";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Marketplace · Admin · PMRFP" };

/** Admin (English only): every listing, with remove / restore. */
export default async function AdminMarketplacePage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const { ready, listings } = await listAllListingsForAdmin();

  return (
    <div className="space-y-6">
      <PageHeader title="Marketplace" description="Every listing. Remove anything that breaks the marketplace rules; reports arrive by email." />
      {!ready ? (
        <EmptyState title="Marketplace table not found" description="Apply supabase/migrations/20261006000001_marketplace.sql in the Supabase SQL editor." />
      ) : listings.length === 0 ? (
        <EmptyState title="No listings yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Listing</th>
                <th className="px-3 py-2">Seller</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => {
                const status = effectiveStatus(l);
                return (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link href={`/marketplace/${l.slug}`} className="font-medium hover:underline">{l.title}</Link>
                      <div className="text-xs text-muted-foreground">{l.category} · {l.city ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2">{l.seller?.name ?? <span className="text-muted-foreground">Individual</span>}</td>
                    <td className="px-3 py-2">{formatPrice(l.priceCents, l.currency) ?? "On request"}</td>
                    <td className="px-3 py-2">
                      {status}
                      {isFeatured(l.featuredUntil) && <span className="ml-1 text-teal-700">★</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">{l.createdAt.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-right">
                      <form action={adminSetListingStatusAction}>
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="status" value={l.status === "removed" ? "active" : "removed"} />
                        <button className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-secondary">
                          {l.status === "removed" ? "Restore" : "Remove"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

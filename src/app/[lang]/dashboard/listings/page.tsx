import type { Metadata } from "next";
import Link from "@/i18n/link";
import { Plus, Star } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/public/empty-state";
import { FeatureListingButton } from "@/components/marketplace/marketplace-forms";
import { requireUser } from "@/lib/access/access";
import { listMyListings } from "@/lib/marketplace/data";
import { deleteListingAction, setListingStatusAction } from "@/lib/marketplace/actions";
import { FREE_LISTING_LIMIT, effectiveStatus, formatPrice, isFeatured, isLive, listingsLeft } from "@/lib/marketplace/rules";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").marketplace.meta.dashTitle };
}

export default async function MyListingsPage({
  params,
  searchParams,
}: {
  params: Promise<object>;
  searchParams: Promise<{ error?: string; featured?: string }>;
}) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("marketplace");
  const d = t.dash;
  const labels = getT("marketplaceClient");
  const session = await requireUser();
  const sp = await searchParams;
  const { ready, listings } = await listMyListings(session.userId);
  const activeCount = listings.filter((l) => isLive(l)).length;
  const left = listingsLeft(session.hasTradeAccess, activeCount);

  const btn = "rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-secondary";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{d.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{d.lead}</p>
        </div>
        <Link href="/marketplace/new" className={buttonVariants()}>
          <Plus className="size-4" /> {d.new}
        </Link>
      </div>

      {sp.error === "limit" && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{d.limitError}</p>
      )}
      {sp.featured && <p className="rounded-md border border-teal-300 bg-teal-50/60 px-3 py-2 text-sm">{d.featuredThanks}</p>}

      <p className="text-sm text-muted-foreground">
        {left == null ? d.unlimited : fmt(d.left, { left, total: FREE_LISTING_LIMIT })}{" "}
        {left != null && (
          <Link href="/pricing" className="font-medium text-teal-700 hover:underline">{d.upgrade}</Link>
        )}
      </p>

      {!ready ? (
        <EmptyState title={t.index.comingSoonTitle} description={d.comingSoon} />
      ) : listings.length === 0 ? (
        <EmptyState title={d.empty}>
          <Link href="/marketplace/new" className={buttonVariants()}>{d.new}</Link>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {listings.map((l) => {
            const status = effectiveStatus(l);
            const featured = isFeatured(l.featuredUntil);
            return (
              <li key={l.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/marketplace/${l.slug}`} className="font-semibold hover:underline">{l.title}</Link>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatPrice(l.priceCents, l.currency, lang) ?? t.card.priceOnRequest} · {labels.categories[l.category]} · {fmt(d.views, { n: l.views })}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">{labels.statuses[status]}</span>
                      {status === "active" && <span className="text-muted-foreground">{fmt(d.expires, { date: formatDate(l.expiresAt, lang) })}</span>}
                      {featured && l.featuredUntil && (
                        <span className="inline-flex items-center gap-1 text-teal-700">
                          <Star className="size-3" /> {fmt(d.featuredUntil, { date: formatDate(l.featuredUntil, lang) })}
                        </span>
                      )}
                    </p>
                  </div>
                  {status !== "removed" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/marketplace/new?edit=${l.id}`} className={btn}>{d.edit}</Link>
                      {status === "active" && (
                        <form action={setListingStatusAction}>
                          <input type="hidden" name="lang" value={lang} />
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="status" value="sold" />
                          <button className={btn}>{d.markSold}</button>
                        </form>
                      )}
                      {status !== "active" && (
                        <form action={setListingStatusAction}>
                          <input type="hidden" name="lang" value={lang} />
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="status" value="active" />
                          <button className={btn}>{d.relist}</button>
                        </form>
                      )}
                      {status === "active" && (
                        <form action={setListingStatusAction}>
                          <input type="hidden" name="lang" value={lang} />
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="status" value="draft" />
                          <button className={btn}>{d.toDraft}</button>
                        </form>
                      )}
                      <form action={deleteListingAction}>
                        <input type="hidden" name="lang" value={lang} />
                        <input type="hidden" name="id" value={l.id} />
                        <button className={`${btn} text-destructive`}>{d.delete}</button>
                      </form>
                      {status === "active" && !featured && <FeatureListingButton listingId={l.id} currency={l.currency} />}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

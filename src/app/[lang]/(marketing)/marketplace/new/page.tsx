import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "@/i18n/link";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/public/empty-state";
import { ListingForm, type ListingFormDefaults } from "@/components/marketplace/marketplace-forms";
import { getSession, isDemoMode } from "@/lib/access/access";
import { countActiveListings, listMyListings } from "@/lib/marketplace/data";
import { canAddListing } from "@/lib/marketplace/rules";
import { getRegions } from "@/lib/data/taxonomy";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { regionName } from "@/i18n/terms";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = getDictionary(hasLocale(lang) ? lang : "en").marketplace.meta;
  return { title: { absolute: t.newTitle }, robots: { index: false, follow: true } };
}

export default async function NewListingPage({ params, searchParams }: { params: Promise<object>; searchParams: Promise<{ edit?: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("marketplace").newPage;
  const { edit } = await searchParams;
  const session = await getSession();
  if (!session) {
    const next = edit ? `/marketplace/new?edit=${edit}` : "/marketplace/new";
    redirect(localizePath(`/sign-in?next=${encodeURIComponent(next)}`, lang));
  }

  const [{ ready, listings }, regions] = await Promise.all([listMyListings(session.userId), getRegions().catch(() => [])]);
  if (!ready && !isDemoMode()) {
    return (
      <Container className="py-16">
        <EmptyState title={t.comingSoonTitle} description={t.comingSoonBody} />
      </Container>
    );
  }

  const existing = edit ? listings.find((l) => l.id === edit) : null;
  if (edit && (!existing || existing.status === "removed")) notFound();

  if (!existing) {
    const active = await countActiveListings(session.userId);
    if (!canAddListing(session.hasTradeAccess, active)) {
      return (
        <Container className="py-16">
          <EmptyState title={t.limitTitle} description={t.limitBody}>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/pricing" className={buttonVariants()}>{t.upgrade}</Link>
              <Link href="/dashboard/listings" className={buttonVariants({ variant: "outline" })}>{t.manage}</Link>
            </div>
          </EmptyState>
        </Container>
      );
    }
  }

  const defaults: ListingFormDefaults = existing
    ? {
        id: existing.id,
        title: existing.title,
        category: existing.category,
        condition: existing.condition,
        price: existing.priceCents != null ? String(existing.priceCents / 100) : "",
        currency: existing.currency,
        priceOnRequest: existing.priceOnRequest,
        description: existing.description,
        city: existing.city ?? "",
        regionSlug: existing.regionSlug ?? "",
        country: existing.country,
        photos: existing.photos,
      }
    : {
        id: null,
        title: "",
        category: "",
        condition: "",
        price: "",
        currency: "CAD",
        priceOnRequest: false,
        description: "",
        city: session.organization?.city ?? "",
        regionSlug: "",
        country: session.organization?.country === "USA" || session.organization?.country === "United States" ? "US" : "CA",
        photos: [],
      };

  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{existing ? t.titleEdit : t.titleNew}</h1>
      <p className="mt-2 text-muted-foreground">{t.lead}</p>
      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <ListingForm
          defaults={defaults}
          regions={regions.map((r) => ({ slug: r.slug, name: regionName(r.name, lang), country: r.country }))}
        />
      </div>
    </Container>
  );
}

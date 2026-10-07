import Link from "@/i18n/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/container";
import { ListingCard } from "@/components/marketplace/listing-card";
import { latestListings } from "@/lib/marketplace/data";
import { getT } from "@/i18n/server";

/** Homepage: the newest marketplace listings. Renders nothing when there are none (or before the migration). */
export async function HomeMarketplaceTeaser() {
  const listings = await latestListings(4).catch(() => []);
  if (listings.length === 0) return null;
  const t = getT("marketplace").home;
  return (
    <section className="border-t border-border bg-background">
      <Container className="py-16 md:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-teal-700">{t.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">{t.heading}</h2>
          </div>
          <Link href="/marketplace" className="inline-flex items-center gap-1 text-sm font-medium text-teal-ink hover:underline">
            {t.all} <ArrowRight className="size-4" />
          </Link>
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {listings.map((l) => (
            <li key={l.id}>
              <ListingCard listing={l} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

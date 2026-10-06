import type { Metadata } from "next";
import Link from "@/i18n/link";
import { ArrowRight, Trophy } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { TorontoAttribution } from "@/components/public/toronto-attribution";
import { JsonLd, breadcrumbSchema, itemListSchema } from "@/lib/seo/jsonld";
import { getTorontoIndexSafe } from "@/lib/data/toronto-awards";
import { compactDollars } from "@/lib/data/fomo";

export const revalidate = 86400;

/** Suppliers listed on the hub; the rest stay reachable from the sitemap and search. */
const LIST_LIMIT = 200;

export const metadata: Metadata = {
  title: "City of Toronto contract awards: who wins (updated daily)",
  description:
    "Every City of Toronto awarded contract since 2012 from TOBids open data, grouped by supplier: totals, divisions and award descriptions. See who wins Toronto's construction, goods and professional-services work.",
  alternates: { canonical: "/toronto-contracts" },
};

export default async function TorontoContractsPage() {
  const idx = await getTorontoIndexSafe();
  const listed = idx.suppliers.filter((s) => s.indexable).slice(0, LIST_LIMIT);
  const year = (d: string | null) => (d ? d.slice(0, 4) : "—");

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Ontario", path: "/ontario" },
          { name: "Toronto contract awards", path: "/toronto-contracts" },
        ])}
      />
      {listed.length > 0 && (
        <JsonLd
          data={itemListSchema(
            "Top City of Toronto contract suppliers",
            listed.slice(0, 50).map((s) => ({ name: s.name, path: `/toronto-contracts/${s.slug}` })),
          )}
        />
      )}

      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.07)]">
        <Container className="relative z-10 py-16">
          <span className="eyebrow flex items-center gap-2 text-teal-300">
            <Trophy className="size-3.5" /> Toronto open data
          </span>
          <h1 className="mt-4 max-w-3xl text-balance text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Who wins City of Toronto contracts
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-indigo-100/75">
            Every award the City has published through TOBids since 2012, grouped by supplier. Spelling variants
            (&ldquo;Ltd.&rdquo; vs &ldquo;Limited&rdquo;, capitals) are merged so each company&rsquo;s record is in one place.
          </p>
          <dl className="mt-10 grid max-w-2xl grid-cols-3 gap-6">
            {[
              [idx.suppliers.length.toLocaleString("en-CA"), "suppliers"],
              [idx.rows.toLocaleString("en-CA"), "award rows"],
              [idx.total ? compactDollars(idx.total) : "—", "awarded"],
            ].map(([v, k]) => (
              <div key={k}>
                <dd className="text-3xl font-extrabold text-white sm:text-4xl">{v}</dd>
                <dt className="mt-1 font-mono text-[11px] uppercase tracking-widest text-teal-300">{k}</dt>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <Container className="py-12">
        {listed.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-8 text-muted-foreground">
            The City of Toronto award feed is temporarily unavailable. Check back shortly, or browse{" "}
            <Link href="/ontario" className="text-teal-700 underline">open Ontario RFPs</Link>.
          </p>
        ) : (
          <>
            {idx.divisions.length > 0 && (
              <div className="mb-10">
                <Eyebrow>Biggest buyers inside the City</Eyebrow>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {idx.divisions.slice(0, 10).map((d) => (
                    <li key={d.name} className="rounded-full border border-border bg-card px-3 py-1 text-sm">
                      {d.name} <span className="text-muted-foreground">· {d.count} awards</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Eyebrow>Top {listed.length} suppliers by value</Eyebrow>
            <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
              <div className="hidden grid-cols-[1fr_90px_120px_110px] gap-4 border-b border-border bg-secondary/60 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
                <span>Supplier</span>
                <span className="text-right">Awards</span>
                <span className="text-right">Total</span>
                <span className="text-right">Years</span>
              </div>
              <ol>
                {listed.map((s, i) => (
                  <li key={s.slug} className="border-b border-border last:border-b-0">
                    <Link
                      href={`/toronto-contracts/${s.slug}`}
                      className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-4 transition-colors hover:bg-teal-50/60 md:grid-cols-[1fr_90px_120px_110px]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-3">
                          <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}</span>
                          <span className="truncate font-semibold group-hover:text-teal-700">{s.name}</span>
                        </div>
                        {s.topDivision && <p className="mt-0.5 truncate pl-11 text-xs text-muted-foreground">{s.topDivision}</p>}
                      </div>
                      <span className="text-right text-sm md:text-base">
                        <span className="font-semibold">{s.count}</span>
                        <span className="text-muted-foreground md:hidden"> awards</span>
                      </span>
                      <span className="hidden text-right font-semibold text-indigo md:block">{s.total ? compactDollars(s.total) : "—"}</span>
                      <span className="hidden text-right text-sm text-muted-foreground md:block">
                        {s.first && s.first.slice(0, 4) !== s.latest?.slice(0, 4) ? `${year(s.first)}–${year(s.latest)}` : year(s.latest)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}

        <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl bg-indigo p-8 text-white md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Want to be on this list?</h2>
            <p className="mt-2 text-indigo-100/80">See what Toronto and the rest of Ontario are tendering right now.</p>
          </div>
          <Link href="/ontario" className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-teal-300 px-5 py-3 font-semibold text-indigo hover:bg-teal-200">
            Open Ontario RFPs <ArrowRight className="size-4" />
          </Link>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Looking for awards from other buyers? See <Link href="/contract-winners" className="text-teal-700 underline">contract winners across Canada</Link>.
        </p>
        <TorontoAttribution className="mt-4" />
      </Container>
    </>
  );
}

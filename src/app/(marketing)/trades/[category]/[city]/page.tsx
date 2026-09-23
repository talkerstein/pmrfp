import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Eyebrow } from "@/components/container";
import { DirectoryCard } from "@/components/public/directory-card";
import { RfpCard } from "@/components/public/rfp-card";
import { CTASection } from "@/components/public/section";
import { buttonVariants } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JsonLd, breadcrumbSchema, faqSchema, itemListSchema } from "@/lib/seo/jsonld";
import {
  getQualifyingCombo,
  listAllRfpsCached,
  listCitiesForTrade,
  listQualifyingCombos,
  listTradesForRegion,
  type TradeCityCombo,
} from "@/lib/data/trade-city";
import { listVendors } from "@/lib/data/directory";
import { parseAward } from "@/lib/data/fomo";
import { isPublishableWinner, winnerKey, winnersFromRfps } from "@/lib/data/winners";
import { publicTenderSource } from "@/lib/tenders/sources";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { COST_GUIDES } from "@/lib/seo/cost-guides";
import { listCaseStudies } from "@/lib/data/case-studies";
import { getTemplatesForTrade } from "@/lib/seo/rfp-templates";
import { PRICING, SITE } from "@/lib/site";

export const revalidate = 3600;

/**
 * Content-gated programmatic page: exists ONLY for trade × place combos with
 * real content — enough approved vendors, or enough tenders (open or past).
 * See lib/data/trade-city. Everything else 404s: never rendered, never in the
 * sitemap, never linked. New combos turn on via ISR as vendors are approved
 * and tenders import. The busiest 40 prerender at build; the rest render on
 * first visit.
 */
export async function generateStaticParams() {
  const combos = await listQualifyingCombos();
  return combos.slice(0, 40).map((c) => ({ category: c.category.slug, city: c.region.slug }));
}

const hasListings = (c: TradeCityCombo) => c.open.length + c.past.length > 0;

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}

function awardStats(c: TradeCityCombo) {
  const amounts = c.past
    .map((r) => parseAward(r.summary).amount)
    .filter((n): n is number => !!n && n > 0)
    .sort((a, b) => a - b);
  if (amounts.length < 3) return null;
  return {
    count: amounts.length,
    median: amounts[Math.floor(amounts.length / 2)],
    min: amounts[0],
    max: amounts[amounts.length - 1],
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; city: string }>;
}): Promise<Metadata> {
  const { category, city } = await params;
  const combo = await getQualifyingCombo(category, city);
  if (!combo) return { title: "Not found" };
  const { category: cat, region, open, past } = combo;
  const lower = cat.name.toLowerCase();
  const canonical = { canonical: `/trades/${cat.slug}/${region.slug}` };

  if (!hasListings(combo)) {
    return {
      title: `Commercial ${cat.name} Contractors in ${region.name} | Directory & RFPs`,
      description: `${combo.vendorCount} commercial ${lower} ${
        combo.vendorCount === 1 ? "contractor" : "contractors"
      } serving ${region.name} on ${SITE.name} — compare companies, post an RFP free, and get quotes for ${lower} work.`,
      alternates: canonical,
    };
  }

  const stats = awardStats(combo);
  // Searchers type "<trade> rfp <city>" / "<trade> tenders <city>" / "<trade>
  // contracts <city>" — say those words, and the live count.
  const parts = [
    open.length ? `${open.length} open ${lower} RFPs and tenders in ${region.name}` : `${lower} RFPs and tenders in ${region.name}`,
    past.length ? `${past.length} past contracts with the winner${stats ? ` (median ${money(stats.median)})` : ""}` : null,
  ].filter(Boolean);
  return {
    title: `${cat.name} RFPs & Tenders in ${region.name}${open.length ? ` (${open.length} Open)` : ""}`,
    description: `${parts.join(", plus ")}. Updated every morning on ${SITE.name}.`.replace(/^./, (c) => c.toUpperCase()),
    alternates: canonical,
  };
}

export default async function TradeCityPage({
  params,
}: {
  params: Promise<{ category: string; city: string }>;
}) {
  const { category, city } = await params;
  const combo = await getQualifyingCombo(category, city);
  if (!combo) notFound();

  const { category: cat, region, open, past } = combo;
  const lower = cat.name.toLowerCase();

  const [vendors, caseStudies, allRfps, sameTrade, sameRegion] = await Promise.all([
    listVendors({ category: cat.slug, region: region.slug }),
    listCaseStudies({ categorySlug: cat.slug, regionSlug: region.slug, limit: 3 }),
    listAllRfpsCached(),
    listCitiesForTrade(cat.slug),
    listTradesForRegion(region.slug),
  ]);
  // A vendor-only page whose approvals were just revoked: don't render a hollow page.
  if (!hasListings(combo) && vendors.length === 0) notFound();

  const stats = awardStats(combo);
  const winnerPages = new Map(winnersFromRfps(allRfps).map((w) => [winnerKey(w.name), w.slug]));
  const pastRows = past.slice(0, 15).map((r) => {
    const a = parseAward(r.summary);
    const name = a.winner && isPublishableWinner(a.winner) ? a.winner : null;
    return { r, amount: a.amount, winner: name, winnerSlug: name ? winnerPages.get(winnerKey(name)) : undefined };
  });
  // Who wins this work here, by number of contracts.
  const tally = new Map<string, { name: string; count: number }>();
  for (const r of past) {
    const w = parseAward(r.summary).winner;
    if (!w || !isPublishableWinner(w)) continue; // never name individuals
    const t = tally.get(winnerKey(w)) ?? { name: w, count: 0 };
    t.count++;
    tally.set(winnerKey(w), t);
  }
  const topWinners = [...tally]
    .filter(([, t]) => t.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([k, t]) => ({ ...t, slug: winnerPages.get(k) }));
  const sources = [...new Set([...open, ...past].filter((r) => r.sourceType === "public_source").map((r) => publicTenderSource(r.slug).portal))];
  const hasPmRfps = open.some((r) => r.sourceType !== "public_source");

  const guide = COST_GUIDES.find((g) => g.tradeSlug === cat.slug);
  const templates = getTemplatesForTrade(cat.slug);
  const proHref = signUpHrefForPlan("pro", "annual");
  const otherPlaces = sameTrade.filter((c) => c.region.slug !== region.slug).slice(0, 10);
  const otherTrades = sameRegion.filter((c) => c.category.slug !== cat.slug).slice(0, 10);

  const faqs = hasListings(combo)
    ? [
        {
          q: `Where do ${lower} RFPs and tenders in ${region.name} come from?`,
          a: `${sources.length ? `Public buyers publishing on ${sources.join(", ")}` : "Property managers and owners"}${
            sources.length && hasPmRfps ? ", and property managers posting on " + SITE.name : ""
          }. ${SITE.name} checks the official open-data feeds every morning and lists the ${lower} work, so you don't have to search each portal. Bids go directly to the buyer.`,
        },
        ...(stats
          ? [
              {
                q: `How much do ${lower} contracts in ${region.name} pay?`,
                a: `Across the last ${stats.count} awarded ${lower} contracts here with a published value, the median was ${money(stats.median)} CAD, ranging from ${money(stats.min)} to ${money(stats.max)}. Each past contract below shows who won it and for how much.`,
              },
            ]
          : []),
        {
          q: `How do I hear about new ${lower} RFPs in ${region.name} first?`,
          a: `Trade Pro ($${PRICING.proAnnual} CAD a year, or $${PRICING.proMonthly} a month) emails you the morning a matching ${lower} tender or RFP posts in your regions, with the full scope, documents and the buyer's contact.`,
        },
        {
          q: `Hiring for ${lower} work in ${region.name}?`,
          a: `Write the RFP free with the ${SITE.name} RFP Writer, then post it free. ${cat.name} companies serving ${region.name} see it and express interest.`,
        },
      ]
    : [
        {
          q: `How do I get quotes from ${lower} contractors in ${region.name}?`,
          a: `Post your project as an RFP on ${SITE.name} — free for property managers and owners. ${cat.name} contractors serving ${region.name} see it and express interest, and you compare respondents in one place instead of chasing quotes by email.`,
        },
        {
          q: `Are these ${lower} companies vetted?`,
          a: `Each company maintains its own profile, including insurance and licensing details where provided. Listings marked Verified have been reviewed by ${SITE.name}. Always confirm credentials directly before awarding work.`,
        },
        {
          q: `I run a ${lower} company serving ${region.name} — how do I get listed?`,
          a: `Create a free profile, select ${cat.name} as a service category and ${region.name} as a service region. Your company appears in this directory where local property managers search.`,
        },
      ];

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Trades", path: "/trades" },
          { name: cat.name, path: `/trades/${cat.slug}` },
          { name: region.name, path: `/trades/${cat.slug}/${region.slug}` },
        ])}
      />
      {open.length > 0 ? (
        <JsonLd
          data={itemListSchema(
            `Open ${lower} RFPs in ${region.name}`,
            open.slice(0, 20).map((r) => ({ name: r.title, path: `/rfps/${r.slug}` })),
          )}
        />
      ) : vendors.length > 0 ? (
        <JsonLd
          data={itemListSchema(
            `${cat.name} companies in ${region.name}`,
            vendors.map((v) => ({ name: v.name, path: `/directory/${v.slug}` })),
          )}
        />
      ) : null}
      <JsonLd data={faqSchema(faqs)} />

      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <nav className="mb-3 text-xs text-muted-foreground">
            <Link href="/trades" className="hover:text-foreground">Trades</Link>
            {" / "}
            <Link href={`/trades/${cat.slug}`} className="hover:text-foreground">{cat.name}</Link>
            {" / "}
            {region.name}
          </nav>
          <Eyebrow>
            {cat.name} · {region.name}
          </Eyebrow>
          {hasListings(combo) ? (
            <>
              <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
                {cat.name} RFPs &amp; contracts in {region.name}
              </h1>
              <p className="mt-4 max-w-2xl text-muted-foreground">
                {open.length > 0
                  ? `${open.length} ${lower} ${open.length === 1 ? "tender is" : "tenders are"} open for bids in ${region.name} right now`
                  : `No ${lower} tenders are open in ${region.name} today`}
                {past.length > 0 ? `, and ${past.length} past ${past.length === 1 ? "contract shows" : "contracts show"} who won the work and for how much` : ""}.
                Updated every morning.
              </p>
              <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Open now</dt>
                  <dd className="text-2xl font-semibold">{open.length}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Past contracts</dt>
                  <dd className="text-2xl font-semibold">{past.length}</dd>
                </div>
                {stats && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Median award</dt>
                    <dd className="text-2xl font-semibold">{money(stats.median)}</dd>
                  </div>
                )}
                {vendors.length > 0 && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Companies listed</dt>
                    <dd className="text-2xl font-semibold">{vendors.length}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={proHref} className={buttonVariants()}>
                  Get {lower} RFPs by email
                </Link>
                <Link href="/rfp-writer" className={buttonVariants({ variant: "outline" })}>
                  Hiring? Write an RFP free
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Commercial {cat.name} Contractors in {region.name}
              </h1>
              <p className="mt-4 max-w-2xl text-muted-foreground">
                {combo.vendorCount === 1 ? "One" : combo.vendorCount} {lower}{" "}
                {combo.vendorCount === 1 ? "company" : "companies"} on {SITE.name}{" "}
                serve{combo.vendorCount === 1 ? "s" : ""} {region.name}. Managing property here? Post
                your {lower} project once, free, and interested contractors come to you.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/sign-up" className={buttonVariants()}>
                  Post a {lower} RFP — free
                </Link>
                <Link
                  href={`/directory?category=${cat.slug}&region=${region.slug}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Browse the directory
                </Link>
              </div>
            </>
          )}
        </Container>
      </section>

      {open.length > 0 && (
        <Container className="py-12">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              Open {lower} RFPs in {region.name}
            </h2>
            <Link href={`/rfps?category=${cat.slug}`} className="text-sm text-teal-700 hover:underline">
              All {lower} RFPs →
            </Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {open.slice(0, 12).map((r) => (
              <RfpCard key={r.slug} rfp={r} locked />
            ))}
          </div>
          {open.length > 12 && (
            <p className="mt-4 text-sm text-muted-foreground">
              +{open.length - 12} more on the <Link href={`/rfps?category=${cat.slug}`} className="text-teal-700 underline">RFP board</Link>.
            </p>
          )}
        </Container>
      )}

      {pastRows.length > 0 && (
        <section className="bg-secondary/30">
          <Container className="py-12">
            <h2 className="text-2xl font-semibold tracking-tight">
              Past {lower} contracts in {region.name}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Awarded public contracts: what the work was, who won it and the published value.
            </p>
            <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-3 font-medium">Contract</th>
                    <th className="p-3 font-medium">Won by</th>
                    <th className="p-3 text-right font-medium">Value</th>
                    <th className="hidden p-3 font-medium sm:table-cell">Awarded</th>
                  </tr>
                </thead>
                <tbody>
                  {pastRows.map(({ r, amount, winner, winnerSlug }) => (
                    <tr key={r.slug} className="border-b border-border last:border-0 align-top">
                      <td className="p-3">
                        <Link href={`/rfps/${r.slug}`} className="hover:text-teal-ink hover:underline">
                          {r.title}
                        </Link>
                      </td>
                      <td className="p-3">
                        {winner ? (
                          winnerSlug ? (
                            <Link href={`/contract-winners/${winnerSlug}`} className="text-teal-700 hover:underline">
                              {winner}
                            </Link>
                          ) : (
                            winner
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap p-3 text-right">{amount ? money(amount) : "—"}</td>
                      <td className="hidden whitespace-nowrap p-3 text-muted-foreground sm:table-cell">{r.deadline ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {topWinners.length > 0 && (
              <p className="mt-4 text-sm text-muted-foreground">
                Most frequent winners here:{" "}
                {topWinners.map((t, i) => (
                  <span key={t.name}>
                    {i > 0 && " · "}
                    {t.slug ? (
                      <Link href={`/contract-winners/${t.slug}`} className="text-teal-700 hover:underline">{t.name}</Link>
                    ) : (
                      t.name
                    )}{" "}
                    ({t.count})
                  </span>
                ))}
              </p>
            )}
          </Container>
        </section>
      )}

      {vendors.length > 0 && (
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">
            {cat.name} companies serving {region.name}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map((v) => (
              <DirectoryCard key={v.slug} vendor={v} />
            ))}
          </div>
        </Container>
      )}

      {caseStudies.length > 0 && (
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">
            Recent {lower} projects in {region.name}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {caseStudies.map((cs) => (
              <Link
                key={cs.slug}
                href={`/case-studies/${cs.slug}`}
                className="group flex flex-col rounded-lg border border-border bg-card p-5 transition-all hover:border-teal-400 hover:shadow-sm"
              >
                <h3 className="text-base font-semibold leading-snug group-hover:text-teal-ink">
                  {cs.title}
                </h3>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {cs.challenge}
                </p>
                <span className="mt-4 text-sm font-medium text-teal-ink">By {cs.orgName} →</span>
              </Link>
            ))}
          </div>
        </Container>
      )}

      {(guide || templates.length > 0) && (
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">
            Planning {lower} work in {region.name}?
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {guide && (
              <Link
                href={`/cost-guides/${guide.slug}`}
                className="group rounded-lg border border-border bg-card p-5 transition-all hover:border-teal-400 hover:shadow-sm"
              >
                <h3 className="text-base font-semibold group-hover:text-teal-ink">
                  What does it cost? →
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Planning ranges for {lower} work — before you collect real quotes.
                </p>
              </Link>
            )}
            {templates.slice(0, 1).map((t) => (
              <Link
                key={t.slug}
                href={`/rfp-templates/${t.slug}`}
                className="group rounded-lg border border-border bg-card p-5 transition-all hover:border-teal-400 hover:shadow-sm"
              >
                <h3 className="text-base font-semibold group-hover:text-teal-ink">
                  Start from an RFP template →
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t.name.replace(/ RFP Template$/, "")} — scope, requirements, and evaluation
                  criteria, ready to customize.
                </p>
              </Link>
            ))}
          </div>
        </Container>
      )}

      {(otherPlaces.length > 0 || otherTrades.length > 0) && (
        <Container className="pb-12">
          {otherPlaces.length > 0 && (
            <>
              <h2 className="text-lg font-semibold tracking-tight">{cat.name} in other places</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {otherPlaces.map((c) => (
                  <Link key={c.region.slug} href={`/trades/${cat.slug}/${c.region.slug}`} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-teal-400">
                    {cat.name} in {c.region.name}
                  </Link>
                ))}
              </div>
            </>
          )}
          {otherTrades.length > 0 && (
            <>
              <h2 className="mt-8 text-lg font-semibold tracking-tight">Other trades in {region.name}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {otherTrades.map((c) => (
                  <Link key={c.category.slug} href={`/trades/${c.category.slug}/${region.slug}`} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-teal-400">
                    {c.category.name} in {region.name}
                  </Link>
                ))}
              </div>
            </>
          )}
        </Container>
      )}

      <section className="border-t border-border">
        <Container size="narrow" className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">Frequently asked</h2>
          <Accordion className="mt-4">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`q${i}`}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Container>
      </section>

      {hasListings(combo) ? (
        <CTASection
          title={`Get ${lower} RFPs in ${region.name} the morning they post`}
          description={`Trade Pro: daily email alerts, full scopes, documents and buyer contacts. $${PRICING.proAnnual} CAD a year.`}
          primaryHref={proHref}
          primaryLabel="Start Trade Pro"
          secondaryHref={`/trades/${cat.slug}`}
          secondaryLabel={`All ${cat.name}`}
        />
      ) : (
        <CTASection
          title={`Need a ${lower} contractor in ${region.name}?`}
          description={`Post your project free on ${SITE.name} and compare interested ${lower} companies side by side.`}
          primaryHref="/sign-up"
          primaryLabel="Post an RFP free"
          secondaryHref={`/trades/${cat.slug}`}
          secondaryLabel={`All ${cat.name}`}
        />
      )}
    </>
  );
}

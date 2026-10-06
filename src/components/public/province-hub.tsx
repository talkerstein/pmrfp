import type { Metadata } from "next";
import Link from "@/i18n/link";
import { ArrowRight, Landmark, MapPin, Trophy } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { RfpCard } from "@/components/public/rfp-card";
import { TorontoAttribution } from "@/components/public/toronto-attribution";
import { buttonVariants } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { getProvinceHub, type ProvinceDef, type ProvinceHubData } from "@/lib/data/province-hub";
import { getTorontoIndexSafe, type TorontoIndex } from "@/lib/data/toronto-awards";
import { compactDollars } from "@/lib/data/fomo";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING, SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

const day = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";

async function load(def: ProvinceDef): Promise<{ hub: ProvinceHubData; toronto: TorontoIndex | null }> {
  const [hub, toronto] = await Promise.all([
    getProvinceHub(def),
    def.torontoAwards ? getTorontoIndexSafe() : Promise.resolve(null),
  ]);
  return { hub, toronto };
}

export function provinceTitle(def: ProvinceDef) {
  return `${def.name} commercial property RFPs & public tenders (live)`;
}

export async function provinceMetadata(def: ProvinceDef): Promise<Metadata> {
  const { hub } = await load(def);
  const trades = hub.trades.slice(0, 3).map((t) => t.name.toLowerCase()).join(", ");
  return {
    title: provinceTitle(def),
    description: `${hub.open.length} open ${def.name} RFPs and public tenders for commercial property work${
      trades ? ` (${trades} and more)` : ""
    }, plus who won past contracts, active buyers and ${hub.places.length} cities and regions. Updated daily.`,
    alternates: { canonical: `/${def.slug}` },
  };
}

function faqs(def: ProvinceDef, hub: ProvinceHubData, toronto: TorontoIndex | null) {
  const topTrades = hub.trades.slice(0, 3).map((t) => t.name.toLowerCase());
  const topPlaces = hub.places.filter((p) => p.total > 0).slice(0, 3).map((p) => p.name);
  const qa = [
    {
      q: `How many commercial property RFPs are open in ${def.name} right now?`,
      a: `${SITE.name} lists ${hub.open.length} open ${def.name} RFP${hub.open.length === 1 ? "" : "s"} and public tender${hub.open.length === 1 ? "" : "s"} today${
        topTrades.length ? `, most often for ${topTrades.join(", ")}` : ""
      }. The list refreshes daily from public tender feeds and property managers who post on ${SITE.name}.`,
    },
    {
      q: `Where do ${def.name} public tenders come from?`,
      a: hub.buyers.length
        ? `Recent ${def.name} listings come from ${hub.buyers.slice(0, 4).map((b) => b.name).join(", ")} and other public buyers, plus private property managers. Each listing links to the official source so you bid through the buyer's own process.`
        : `Listings come from public buyers' open-data tender feeds and from property managers who post directly. Each listing links to the official source so you bid through the buyer's own process.`,
    },
    {
      q: `Which ${def.name} cities have the most tenders?`,
      a: topPlaces.length
        ? `${topPlaces.join(", ")} currently have the most open and recent tenders on ${SITE.name}. Each city page lists its open RFPs, past awards and local trades.`
        : `City pages fill in as tenders import; browse every ${def.name} region from this page.`,
    },
    {
      q: `Can I see who won past ${def.name} contracts?`,
      a: toronto && toronto.suppliers.length
        ? `Yes. ${SITE.name} shows past award notices with winners and amounts, including ${toronto.rows.toLocaleString("en-CA")} City of Toronto contract awards since 2012 from Toronto Open Data, grouped by supplier.`
        : `Yes. Where buyers publish award notices, ${SITE.name} shows the winner and amount, and companies with repeat wins get their own contract-winner page.`,
    },
    {
      q: `Is ${SITE.name} run by the ${def.government}?`,
      a: `No. ${SITE.name} is an independent service and is not affiliated with or endorsed by the ${def.government} or any municipality. Always confirm details and submit bids through the official tender documents.`,
    },
  ];
  return qa;
}

export async function ProvinceHub({ def }: { def: ProvinceDef }) {
  const { hub, toronto } = await load(def);
  const qa = faqs(def, hub, toronto);
  const torontoTop = toronto?.suppliers.filter((s) => s.indexable).slice(0, 8) ?? [];

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Regions", path: "/regions" },
          { name: def.name, path: `/${def.slug}` },
        ])}
      />
      <JsonLd data={faqSchema(qa)} />

      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.07)]">
        <Container className="relative z-10 py-16">
          <span className="eyebrow flex items-center gap-2 text-teal-300">
            <MapPin className="size-3.5" /> {def.name}, {def.country}
          </span>
          <h1 className="mt-4 max-w-4xl text-balance text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            {provinceTitle(def)}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-indigo-100/75">
            Open tenders and property-manager RFPs across {def.name}, who has been winning the work, and the buyers putting it out.
            Updated daily.
          </p>
          <dl className="mt-10 grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              [String(hub.open.length), "open now"],
              [String(hub.past.length), "past awards"],
              [String(hub.places.length), "cities & regions"],
              [String(hub.buyers.length), "public buyers"],
            ].map(([v, k]) => (
              <div key={k}>
                <dd className="text-3xl font-extrabold text-white sm:text-4xl">{v}</dd>
                <dt className="mt-1 font-mono text-[11px] uppercase tracking-widest text-teal-300">{k}</dt>
              </div>
            ))}
          </dl>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={`/rfps?region=${def.slug}`} className={buttonVariants({ variant: "accent", size: "lg" })}>
              Browse {def.name} RFPs <ArrowRight className="size-4" />
            </Link>
            <Link href={signUpHrefForPlan("pro", "monthly")} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-white/30 bg-transparent text-white hover:bg-white/10")}>
              Get {def.name} alerts (${PRICING.proMonthly}/mo)
            </Link>
          </div>
        </Container>
      </section>

      <Container className="space-y-16 py-14">
        {/* Open RFPs */}
        <section>
          <Eyebrow>Open now</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            {hub.open.length ? `${hub.open.length} open ${def.name} RFPs and tenders` : `No open ${def.name} tenders this minute`}
          </h2>
          {hub.open.length > 0 ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {hub.open.slice(0, 9).map((r) => <RfpCard key={r.slug} rfp={r} locked />)}
            </div>
          ) : (
            <p className="mt-3 text-muted-foreground">New tenders import daily. Set an alert to hear about the next one first.</p>
          )}
          {hub.open.length > 9 && (
            <Link href={`/rfps?region=${def.slug}`} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline">
              See all {hub.open.length} <ArrowRight className="size-3.5" />
            </Link>
          )}
        </section>

        {/* Trades + places */}
        <div className="grid gap-12 lg:grid-cols-2">
          {hub.trades.length > 0 && (
            <section>
              <Eyebrow>Top trades in {def.name}</Eyebrow>
              <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
                {hub.trades.map((t) => (
                  <li key={t.slug}>
                    <Link href={t.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-teal-50/60">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {t.open} open · {t.total} total
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {hub.places.length > 0 && (
            <section>
              <Eyebrow>Cities & regions</Eyebrow>
              <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {hub.places.slice(0, 30).map((p) => (
                  <li key={p.slug}>
                    <Link href={`/regions/${p.slug}`} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-teal-300">
                      <span className="truncate">{p.name}</span>
                      {p.open > 0 && <span className="shrink-0 text-xs font-semibold text-teal-700">{p.open} open</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {hub.tradeCity.length > 0 && (
          <section>
            <Eyebrow>Trade × city pages</Eyebrow>
            <ul className="mt-4 flex flex-wrap gap-2">
              {hub.tradeCity.map((c) => (
                <li key={c.href}>
                  <Link href={c.href} className="inline-block rounded-full border border-border bg-card px-3 py-1 text-sm hover:border-teal-300">
                    {c.trade} in {c.place} <span className="text-muted-foreground">· {c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Awards */}
        {(hub.awards.length > 0 || (toronto && toronto.recent.length > 0)) && (
          <section>
            <Eyebrow><Trophy className="size-3.5" /> Recent awards</Eyebrow>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">Who won {def.name} work lately</h2>
            <div className="mt-6 grid gap-8 lg:grid-cols-2">
              {toronto && toronto.recent.length > 0 && (
                <div>
                  <h3 className="font-semibold">City of Toronto</h3>
                  <ul className="mt-3 space-y-3">
                    {toronto.recent.slice(0, 8).map((a, i) => (
                      <li key={`${a.doc}-${i}`} className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <Link href={`/toronto-contracts/${a.slug}`} className="font-medium hover:text-teal-700">{a.supplier}</Link>
                          <span className="shrink-0 font-semibold text-indigo">{a.amount ? compactDollars(a.amount) : "—"}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.description}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{a.division} · {day(a.date)}</p>
                      </li>
                    ))}
                  </ul>
                  <Link href="/toronto-contracts" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline">
                    All {toronto.suppliers.length.toLocaleString("en-CA")} Toronto suppliers <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              )}
              {hub.awards.length > 0 && (
                <div>
                  <h3 className="font-semibold">Public award notices on {SITE.name}</h3>
                  <ul className="mt-3 space-y-3">
                    {hub.awards.map((a) => (
                      <li key={a.slug} className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-medium">{a.winner}</span>
                          <span className="shrink-0 font-semibold text-indigo">{a.amount ? compactDollars(a.amount) : "—"}</span>
                        </div>
                        <Link href={`/rfps/${a.slug}`} className="mt-1 line-clamp-2 block text-sm text-muted-foreground hover:text-teal-700">{a.title}</Link>
                        <p className="mt-1 text-xs text-muted-foreground">{day(a.date)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Winners + buyers */}
        <div className="grid gap-12 lg:grid-cols-2">
          {(hub.winners.length > 0 || torontoTop.length > 0) && (
            <section>
              <Eyebrow>Repeat winners</Eyebrow>
              <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
                {hub.winners.map((w) => (
                  <li key={`w-${w.slug}`}>
                    <Link href={`/contract-winners/${w.slug}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-teal-50/60">
                      <span className="truncate font-medium">{w.name}</span>
                      <span className="shrink-0 text-sm text-muted-foreground">{w.count} wins{w.total ? ` · ${compactDollars(w.total)}` : ""}</span>
                    </Link>
                  </li>
                ))}
                {torontoTop.map((s) => (
                  <li key={`t-${s.slug}`}>
                    <Link href={`/toronto-contracts/${s.slug}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-teal-50/60">
                      <span className="truncate font-medium">{s.name} <span className="text-xs text-muted-foreground">(Toronto)</span></span>
                      <span className="shrink-0 text-sm text-muted-foreground">{s.count} wins · {compactDollars(s.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {hub.buyers.length > 0 && (
            <section>
              <Eyebrow><Landmark className="size-3.5" /> Buyers tendering in {def.name}</Eyebrow>
              <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
                {hub.buyers.map((b) => (
                  <li key={b.name} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">{b.name}</span>
                    <span className="shrink-0 text-sm text-muted-foreground">{b.count} listing{b.count === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* FAQ */}
        <section className="max-w-3xl">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">{def.name} tenders, answered</h2>
          <Accordion className="mt-4">
            {qa.map((f, i) => (
              <AccordionItem key={i} value={`q${i}`}>
                <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <div className="space-y-3 border-t border-border pt-6">
          <p className="text-sm font-medium">
            {SITE.name} is an independent service, not affiliated with the {def.government}.
          </p>
          {toronto && toronto.rows > 0 && <TorontoAttribution />}
        </div>
      </Container>
    </>
  );
}

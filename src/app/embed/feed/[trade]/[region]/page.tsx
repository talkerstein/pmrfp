import { closesOn, WidgetEmpty, WidgetRow, WidgetShell, WidgetUnavailable } from "@/components/embed/widget-shell";
import { listRfps } from "@/lib/data/rfps";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { closingLabel, daysUntil, isPastContract } from "@/lib/data/fomo";
import { MAX_ITEMS, outLink } from "@/lib/embed/widgets";
import { tradeWords } from "@/lib/gc/packages";
import { SITE } from "@/lib/site";

// Every trade × region combination is its own cached page, built on first view.
export const revalidate = 1800;
export async function generateStaticParams() {
  return [];
}

/** Live open tenders for a trade and/or region. "all" is the wildcard. */
export default async function FeedWidget({ params }: { params: Promise<{ trade: string; region: string }> }) {
  const { trade, region } = await params;
  const [categories, regions] = await Promise.all([getCategories(), getRegions()]);
  const cat = trade === "all" ? null : categories.find((c) => c.slug === trade);
  const reg = region === "all" ? null : regions.find((r) => r.slug === region);
  if (cat === undefined || reg === undefined) return <WidgetUnavailable href={outLink(SITE.url, "/rfps", "feed")} />;

  const all = await listRfps({ category: cat?.slug, region: reg?.slug });
  // Award notices ("contract winners") aren't biddable, so they stay off the feed.
  const open = all.filter((r) => r.status === "open" && !isPastContract(r));
  // Someone reading a widget can't bid on something closing in hours, so those go last.
  const lastMinute = (d: string | null) => {
    const days = daysUntil(d);
    return days !== null && days < 2;
  };
  const shown = [...open.filter((r) => !lastMinute(r.deadline)), ...open.filter((r) => lastMinute(r.deadline))].slice(0, MAX_ITEMS);

  const what = cat ? `${tradeWords(cat.name)} tenders` : "commercial property tenders";
  const where = reg ? ` in ${reg.name}` : "";
  const seeAll =
    cat && !reg ? `/trades/${cat.slug}` : `/rfps${reg ? `?${new URLSearchParams({ ...(cat ? { category: cat.slug } : {}), region: reg.slug })}` : ""}`;

  return (
    <WidgetShell
      kind="feed"
      eyebrow="Live on PMRFP"
      title={`Open ${what}${where}`}
      subtitle={open.length > 0 ? `${open.length} open now · updated every morning` : "Updated every morning"}
      footerLinks={[
        { href: outLink(SITE.url, seeAll, "feed"), label: open.length > shown.length ? `See all ${open.length}` : "See the full board" },
        { href: outLink(SITE.url, "/sign-up", "feed"), label: "Get these by email, free" },
      ]}
    >
      {shown.length === 0 ? (
        <WidgetEmpty>No open tenders right now. New ones land every morning.</WidgetEmpty>
      ) : (
        shown.map((r) => (
          <WidgetRow
            key={r.slug}
            href={outLink(SITE.url, `/rfps/${r.slug}`, "feed")}
            title={r.title}
            badge={cat ? null : r.categories[0] ?? null}
            meta={[r.city ?? r.regionName, closingLabel(daysUntil(r.deadline)) ? null : closesOn(r.deadline)].filter(Boolean).join(" · ")}
            urgent={closingLabel(daysUntil(r.deadline))}
          />
        ))
      )}
    </WidgetShell>
  );
}

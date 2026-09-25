import { closesOn, WidgetEmpty, WidgetRow, WidgetShell, WidgetUnavailable } from "@/components/embed/widget-shell";
import { closingLabel, daysUntil } from "@/lib/data/fomo";
import { getOrgBids } from "@/lib/embed/data";
import { isValidBidsKey } from "@/lib/embed/keys";
import { MAX_ITEMS, outLink } from "@/lib/embed/widgets";
import { SITE } from "@/lib/site";

export const revalidate = 900;
export async function generateStaticParams() {
  return [];
}

/** A property manager's open bids, for the "Work with us" page on its own site. */
export default async function BidsWidget({ params }: { params: Promise<{ org: string; key: string }> }) {
  const { org: slug, key } = await params;
  const found = await getOrgBids(slug);
  if (!found || !isValidBidsKey(found.org.id, key)) return <WidgetUnavailable href={outLink(SITE.url, "/rfps", "bids")} />;
  const { org, bids } = found;
  const shown = bids.slice(0, MAX_ITEMS);

  return (
    <WidgetShell
      kind="bids"
      eyebrow="Bid opportunities"
      title={`Open bids from ${org.name}`}
      subtitle="Qualified trades: review the scope and respond on PMRFP."
      footerLinks={[
        { href: outLink(SITE.url, "/sign-up", "bids"), label: "Join our vendor list, free" },
        { href: outLink(SITE.url, "/rfps", "bids"), label: "More open RFPs" },
      ]}
    >
      {shown.length === 0 ? (
        <WidgetEmpty>No open bids right now. Join free to hear about the next one.</WidgetEmpty>
      ) : (
        shown.map((b) => (
          <WidgetRow
            key={b.slug}
            href={outLink(SITE.url, `/rfps/${b.slug}`, "bids")}
            title={b.title}
            badge={b.categories[0] ?? null}
            meta={[b.city, closingLabel(daysUntil(b.deadline)) ? null : closesOn(b.deadline)].filter(Boolean).join(" · ")}
            urgent={closingLabel(daysUntil(b.deadline))}
          />
        ))
      )}
    </WidgetShell>
  );
}

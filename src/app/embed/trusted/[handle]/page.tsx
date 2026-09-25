import { WidgetEmpty, WidgetRow, WidgetShell, WidgetUnavailable } from "@/components/embed/widget-shell";
import { getPublicTrustedList } from "@/lib/trusted/data";
import { outLink } from "@/lib/embed/widgets";
import { SITE } from "@/lib/site";

export const revalidate = 900;
export async function generateStaticParams() {
  return [];
}

/** A realtor's (or PM's) published trusted-trades list, for their own website. */
export default async function TrustedWidget({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const page = await getPublicTrustedList(handle);
  if (!page) return <WidgetUnavailable href={outLink(SITE.url, "/directory", "trusted")} />;
  const { list, trades } = page;
  const full = outLink(SITE.url, `/trusted/${list.handle}`, "trusted");

  return (
    <WidgetShell
      kind="trusted"
      eyebrow="Trades I trust"
      title={`${list.displayName}'s trusted trades`}
      subtitle={list.brokerage}
      footerLinks={[
        { href: full, label: "See the full list" },
        { href: outLink(SITE.url, "/for/real-estate", "trusted"), label: "Make your own, free" },
      ]}
    >
      {trades.length === 0 ? (
        <WidgetEmpty>No trades on this list yet.</WidgetEmpty>
      ) : (
        trades.map((t) => (
          <WidgetRow
            key={t.organizationId}
            href={outLink(SITE.url, `/directory/${t.vendor.slug}`, "trusted")}
            title={t.vendor.name}
            badge={t.vendor.categories[0] ?? null}
            meta={t.note?.trim() || [t.vendor.city, t.vendor.province].filter(Boolean).join(", ")}
          />
        ))
      )}
    </WidgetShell>
  );
}

import { WidgetEmpty, WidgetLogo, WidgetRow, WidgetShell, WidgetUnavailable } from "@/components/embed/widget-shell";
import { loadBuyers } from "@/lib/buyers/load";
import { findBuyerPage } from "@/lib/buyers/model";
import { closingLabel, daysUntil } from "@/lib/data/fomo";
import { MAX_ITEMS, isWidgetLang, outLink } from "@/lib/embed/widgets";
import { SITE } from "@/lib/site";
import { buyerDisplayName } from "@/lib/towns/claimable";
import { buyerKey } from "@/lib/towns/managed";
import { inSentence } from "@/lib/towns/names";
import { getManagedPagesSnapshot } from "@/lib/towns/managed-data";
import { townWidgetData } from "@/lib/towns/nearby";
import { getDictionary } from "@/i18n/dictionaries";
import { localizePath } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";

// Every buyer × language is its own cached page, built on first view (same cache as the other widgets).
export const revalidate = 1800;
export async function generateStaticParams() {
  return [];
}

/**
 * "Town bids": a public buyer's current listings on PMRFP (imported with its
 * permission today, posted by it later), for its own website, in English,
 * French or Spanish. Each row opens the listing on PMRFP; the footer links
 * to follow the buyer on PMRFP and to its official bids page. Built from the
 * shared board and managed-page snapshots only.
 */
export default async function TownBidsWidget({ params }: { params: Promise<{ lang: string; province: string; slug: string }> }) {
  const { lang: rawLang, province, slug } = await params;
  const lang = isWidgetLang(rawLang) ? rawLang : "en";
  const t = getDictionary(lang).towns.widget;
  const [{ pages }, managedMap] = await Promise.all([loadBuyers(), getManagedPagesSnapshot()]);
  const p = isWidgetLang(rawLang) ? findBuyerPage(pages, province, slug) : null;
  if (!p) return <WidgetUnavailable href={outLink(SITE.url, "/buyers", "town-bids")} />;

  const managed = managedMap.get(buyerKey(p.provinceSlug, p.buyer.slug)) ?? null;
  const name = managed?.organizationName || buyerDisplayName(p, lang);
  const inText = inSentence(name, lang);
  const { bids, total, official } = townWidgetData(p, managed, MAX_ITEMS);
  const follow = outLink(SITE.url, localizePath(p.path, lang), "town-bids");
  const closes = (d: string | null) => (d ? fmt(t.closes, { date: formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang, { month: "short", day: "numeric" }) }) : t.noDeadline);

  return (
    <WidgetShell
      kind="town-bids"
      lang={lang === "en" ? undefined : `${lang}-CA`}
      media={managed?.logoUrl ? <WidgetLogo src={managed.logoUrl} name={name} /> : undefined}
      eyebrow={t.eyebrow}
      title={fmt(t.title, { name: inText })}
      subtitle={total > 0 ? fmt(t.subtitleOpen, { n: total }) : t.subtitle}
      homeHref={SITE.url}
      footerLinks={[
        { href: follow, label: fmt(t.follow, { name: inText }) },
        ...(official ? [{ href: official, label: t.official }] : []),
      ]}
    >
      {bids.length === 0 ? (
        <WidgetEmpty>{t.empty}</WidgetEmpty>
      ) : (
        bids.map((r) => (
          <WidgetRow
            key={r.slug}
            href={outLink(SITE.url, localizePath(`/rfps/${r.slug}`, lang), "town-bids")}
            title={r.title}
            meta={closes(r.deadline)}
            urgent={lang === "en" ? closingLabel(daysUntil(r.deadline)) : null}
          />
        ))
      )}
    </WidgetShell>
  );
}

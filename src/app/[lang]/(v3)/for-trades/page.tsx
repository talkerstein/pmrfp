import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { getVerticalFor } from "@/lib/seo/verticals.fr";
import { JsonLd, faqSchema } from "@/lib/seo/jsonld";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";
import { AudienceLanding } from "@/components/v3/audience";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).sales.forTrades.meta;
  return {
    title: t.title,
    description: t.description,
    alternates: alternatesFor(l, "/for-trades"),
  };
}

/** Audience landing template (Claude Design, tradesmen example) with the trade-company copy. */
export default async function ForTradesPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("sales");
  const p = t.forTrades;
  const lang = getLang();
  const v = getVerticalFor("tradesmen", lang);
  const it = p.included.items;
  return (
    <>
      <JsonLd data={faqSchema(p.faq)} />
      <AudienceLanding
        lang={lang}
        c={{
          key: "tradesmen",
          side: "seller",
          label: p.eyebrow,
          labelNote: p.who.trades.slice(0, 5).join(", "),
          h1: p.title,
          sub: fmt(p.lead, { site: SITE.name }),
          cta: { label: p.join, href: "/sign-up?role=trade" },
          cta2: { label: p.seePricing, href: "/pricing" },
          ctaNote: p.pricing.body,
          img: "/images/photos/electrical-panel-testing.webp",
          f1Img: "/images/photos/floor-coating-crew.webp",
          getLabel: p.included.eyebrow,
          getHead: p.included.title,
          tags: [it.feed.title, it.save.title, it.bid.title, it.alerts.title, it.profile.title],
          today: v ? { head: p.opportunity.title, items: v.pains } : undefined,
          features: [
            { t: it.directory.title, d: it.directory.body },
            { t: it.feed.title, d: it.feed.body },
            { t: it.bid.title, d: it.bid.body, drops: [it.save.title, it.alerts.title] },
            { t: it.profile.title, d: it.profile.body, chips: p.who.trades.slice(0, 5) },
            { t: fmt(p.badge.title, { site: SITE.name }), d: p.badge.body, href: "/badge" },
          ],
          steps: getT("seo").vertical.steps.seller.map((s) => ({ t: s.title, d: s.desc })),
          sellerSub: p.pricing.body,
          faq: p.faq,
          disclaimer: getT("common").disclaimer,
          endHead: p.cta.title,
          endSub: p.opportunity.punch,
          endImg: "/images/photos/site-crew-deck.webp",
        }}
      />
    </>
  );
}

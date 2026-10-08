import type { Metadata } from "next";
import Link from "@/i18n/link";
import { CategoryGrid } from "@/components/public/category-grid";
import { ReferBanner } from "@/components/public/refer-banner";
import { getCategories } from "@/lib/data/taxonomy";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { AudienceLanding } from "@/components/v3/audience";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).sales.forPms.meta;
  return {
    title: t.title,
    description: t.description,
    alternates: alternatesFor(l, "/for-property-managers"),
  };
}

/** Audience landing template with the property-manager copy, the landlord note and the directory grid. */
export default async function ForPropertyManagersPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("sales");
  const p = t.forPms;
  const lang = getLang();
  const categories = await getCategories().catch(() => []);
  const s = p.how.steps;
  return (
    <AudienceLanding
      lang={lang}
      c={{
        key: "pm",
        side: "buyer",
        label: p.eyebrow,
        labelNote: p.badge,
        h1: p.title,
        sub: (
          <>
            {p.lead.before}
            <Link href="/for/real-estate" style={{ color: "#91F2CF" }}>{p.lead.link}</Link>
            {p.lead.after}
          </>
        ),
        cta: { label: p.postFree, href: "/sign-up?role=property_manager" },
        cta2: { label: p.writeRfp, href: "/rfp-writer" },
        // The landlord section: same tools, same price, its own sign-up.
        ctaNote: (
          <>
            {p.landlord.text} <a href={localizePath("/sign-up?role=landlord", lang)}>{p.landlord.cta}</a>
          </>
        ),
        img: "/images/photos/retail-power-centre-aerial.webp",
        f1Img: "/images/home/pm-lobby.webp",
        getLabel: p.how.eyebrow,
        getHead: p.how.title,
        tags: [p.badge, p.noObligation, p.privacy.title],
        features: [
          { t: p.directory.title, d: p.directory.description },
          { t: p.privacy.title, d: p.privacy.body },
          { t: p.noObligation, d: t.copy.pmValue },
          { t: p.writeRfp, d: p.caption, href: "/rfp-writer" },
        ],
        steps: [s.post, s.find, s.time].map((x) => ({ t: x.title, d: x.body })),
        faq: [],
        disclaimer: getT("common").disclaimer,
        endHead: p.cta.title,
        endSub: p.cta.description,
        endImg: "/images/photos/office-tower-glass.webp",
        extra: (
          <div className="v3p-tw">
            <div className="eb">{p.directory.eyebrow}</div>
            <h2 className="h2" style={{ marginTop: 10 }}>{p.directory.title}</h2>
            {categories.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <CategoryGrid categories={categories} limit={12} />
              </div>
            )}
            <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <a href={localizePath("/directory", lang)} className="btn navy md">{p.directory.cta} →</a>
            </div>
            <ReferBanner variant="subtle" className="mt-10 max-w-3xl" />
            <p className="disc" style={{ marginTop: 24, fontSize: 14, color: "#4B4F6B", maxWidth: 760 }}>{getT("common").disclaimer}</p>
          </div>
        ),
      }}
    />
  );
}

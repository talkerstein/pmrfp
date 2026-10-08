import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectoryCard } from "@/components/public/directory-card";
import { AudienceLanding, type AudienceKey } from "@/components/v3/audience";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { VERTICALS } from "@/lib/seo/verticals";
import { getVerticalFor } from "@/lib/seo/verticals.fr";
import { listVendors } from "@/lib/data/directory";
import { PHOTOS, type Photo } from "@/lib/photos";
import { getDictionary } from "@/i18n/dictionaries";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";

export const revalidate = 3600;

export async function generateStaticParams() {
  return VERTICALS.map((v) => ({ vertical: v.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; vertical: string }> }): Promise<Metadata> {
  const { lang, vertical } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const v = getVerticalFor(vertical, l);
  if (!v) return { title: getDictionary(l).seo.notFound };
  return { title: v.metaTitle, description: v.metaDescription, alternates: alternatesFor(l, `/for/${v.slug}`) };
}

/** Buyers post work and hire; sellers find work and get found. The page's proof and steps follow that. */
const BUYERS = new Set(["builders", "general-contractors", "real-estate", "condo-boards", "investors"]);

const HERO_PHOTO: Record<string, Photo> = {
  builders: PHOTOS.siteCrew,
  "general-contractors": PHOTOS.scaffolding,
  tradesmen: PHOTOS.electrical,
  "sales-teams": PHOTOS.officeTower,
  investors: PHOTOS.retailAerial,
  "real-estate": PHOTOS.keys,
  "condo-boards": PHOTOS.condo,
  suppliers: PHOTOS.loadingDocks,
};

/** Photo behind feature 01 and the closing band. */
const SECOND_PHOTO: Record<string, Photo> = {
  builders: PHOTOS.framing,
  "general-contractors": PHOTOS.drywall,
  tradesmen: PHOTOS.floorCoating,
  "sales-teams": PHOTOS.lobby,
  investors: PHOTOS.parkingLot,
  "real-estate": PHOTOS.lobbyGates,
  "condo-boards": PHOTOS.elevatorLobby,
  suppliers: PHOTOS.floorCrew,
};

const KEY: Record<string, AudienceKey> = {
  tradesmen: "tradesmen",
  "condo-boards": "condo",
  investors: "investors",
  "real-estate": "realestate",
  suppliers: "suppliers",
  builders: "builders",
  "general-contractors": "gc",
};

/** Audience landing template (Claude Design), one per vertical. */
export default async function VerticalPage({ params }: { params: Promise<{ vertical: string }> }) {
  await setLangFrom(params);
  const seo = getT("seo");
  const t = seo.vertical;
  const lang = getLang();
  const { vertical } = await params;
  const v = getVerticalFor(vertical, lang);
  if (!v) notFound();
  const buyer = BUYERS.has(v.slug);
  const photo = HERO_PHOTO[v.slug] ?? PHOTOS.officeTower;
  const second = SECOND_PHOTO[v.slug] ?? PHOTOS.lobby;
  const vendors = buyer ? await listVendors({ sort: "featured" }).catch(() => []) : [];
  const showcase = vendors.filter((x) => x.logoUrl).slice(0, 3);

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: seo.crumbs.home, path: localizePath("/", lang) },
          { name: seo.crumbs.solutions, path: localizePath("/for", lang) },
          { name: v.name, path: localizePath(`/for/${v.slug}`, lang) },
        ])}
      />
      <JsonLd data={faqSchema(v.faqs)} />
      <AudienceLanding
        lang={lang}
        c={{
          key: KEY[v.slug] ?? null,
          side: buyer ? "buyer" : "seller",
          label: fmt(t.eyebrow, { who: v.who }),
          h1: v.headline,
          sub: v.positioning,
          cta: v.cta,
          cta2: v.secondaryCta,
          img: photo.src,
          f1Img: second.src,
          getLabel: t.withUs,
          getHead: t.changesTitle,
          tags: v.features,
          today: { head: t.today, items: v.pains },
          features: v.valueProps.map((x) => ({ t: x.title, d: x.desc })),
          steps: t.steps[buyer ? "buyer" : "seller"].map((s) => ({ t: s.title, d: s.desc })),
          sellerSub: getT("sales").forTrades.pricing.body,
          faq: v.faqs,
          disclaimer: getT("common").disclaimer,
          endHead: v.headline,
          endSub: v.positioning,
          endImg: second.src,
          extra:
            buyer && showcase.length === 3 ? (
              <div>
                <div className="a-open-head" style={{ marginTop: 0 }}>
                  <h2 className="h2" style={{ fontSize: 34 }}>{t.proofBuyer}</h2>
                  <a href={localizePath("/directory", lang)} style={{ fontWeight: 700 }}>{seo.browseDirectory} →</a>
                </div>
                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  {showcase.map((x) => <DirectoryCard key={x.slug} vendor={x} />)}
                </div>
              </div>
            ) : undefined,
        }}
      />
    </>
  );
}


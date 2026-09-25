import { SITE } from "@/lib/site";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");

/**
 * Renders a JSON-LD <script>. Values include user-written text (company names,
 * job titles), so "<" is escaped: a "</script>" inside a string can't close
 * the tag. < is still "<" to any JSON parser.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdString(data) }}
    />
  );
}

export function jsonLdString(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const absolute = (u?: string | null) => (u ? (/^https?:\/\//.test(u) ? u : `${BASE}${u.startsWith("/") ? "" : "/"}${u}`) : undefined);

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: BASE,
    description: SITE.description,
    email: SITE.email,
    logo: `${BASE}/apple-icon.png`,
    areaServed: ["CA", "US"],
    // sameAs is for profiles of THIS organization only (not sister brands);
    // add LinkedIn/Crunchbase here once those pages exist.
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: BASE,
    potentialAction: {
      "@type": "SearchAction",
      target: `${BASE}/directory?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function localBusinessSchema(v: {
  name: string;
  slug: string;
  city: string | null;
  province: string | null;
  shortDescription: string | null;
  categories: string[];
  logoUrl?: string | null;
  /**
   * First-party reviews collected and moderated on PMRFP only (never the
   * Google rating). Pass it only when at least one is published and shown
   * on the page: markup must match visible reviews.
   */
  aggregateRating?: { ratingValue: number; reviewCount: number };
}) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: v.name,
    url: `${BASE}/directory/${v.slug}`,
    description: v.shortDescription ?? undefined,
    image: absolute(v.logoUrl),
    logo: absolute(v.logoUrl),
    address: {
      "@type": "PostalAddress",
      addressLocality: v.city ?? undefined,
      addressRegion: v.province ?? undefined,
      addressCountry: "CA",
    },
    knowsAbout: v.categories,
    areaServed: v.province ?? "Canada",
    aggregateRating:
      v.aggregateRating && v.aggregateRating.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: v.aggregateRating.ratingValue,
            reviewCount: v.aggregateRating.reviewCount,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${BASE}${it.path}`,
    })),
  };
}

export function itemListSchema(name: string, items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: `${BASE}${it.path}`,
    })),
  };
}

export function faqSchema(qa: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map((x) => ({
      "@type": "Question",
      name: x.q,
      acceptedAnswer: { "@type": "Answer", text: x.a },
    })),
  };
}

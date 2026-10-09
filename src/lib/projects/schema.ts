import type { CaseStudyDetail } from "@/lib/data/case-studies";
import type { ProjectExtras } from "@/lib/data/projects";
import { SITE } from "@/lib/site";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");

/**
 * schema.org Article for a PUBLIC case study, authored by the company that
 * did the work, about the service it performed. No aggregateRating here:
 * review markup belongs on the company (LocalBusiness) where the reviews
 * are summarised, and only from first-party reviews. Unlisted and private
 * projects get no markup at all.
 */
export function caseStudySchema(cs: CaseStudyDetail, extras: ProjectExtras, orgUrl: string | null) {
  const url = `${BASE}/case-studies/${cs.slug}`;
  const place = [cs.city, cs.province].filter(Boolean).join(", ") || undefined;
  const author = { "@type": "Organization", name: cs.orgName, ...(orgUrl ? { url: orgUrl } : {}) };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: cs.title.slice(0, 110),
    description: (extras.summary ?? cs.challenge).slice(0, 300),
    image: extras.photos.length ? extras.photos.map((p) => p.url) : undefined,
    datePublished: cs.publishedAt ?? undefined,
    dateModified: cs.updatedAt ?? cs.publishedAt ?? undefined,
    author,
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      url: BASE,
      logo: { "@type": "ImageObject", url: `${BASE}/apple-icon.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    about: cs.categoryName
      ? { "@type": "Service", serviceType: cs.categoryName, provider: author, ...(place ? { areaServed: place } : {}) }
      : undefined,
    contentLocation: place ? { "@type": "Place", name: place } : undefined,
  };
}

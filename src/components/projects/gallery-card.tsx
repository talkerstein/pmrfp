import Image from "next/image";
import type { GalleryItem } from "@/lib/projects/gallery";
import { clientTypeKey } from "@/lib/projects/case-study";
import { getT } from "@/i18n/server";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

/** One public project in the /projects gallery (v3 card, styles in portfolio.css). */
export function GalleryCard({ i, lang }: { i: GalleryItem; lang: Locale }) {
  const t = getT("portfolio").gallery;
  const pc = getT("portfolioClient");
  const client = clientTypeKey(i.clientType);
  const tag = [
    i.categoryName ? tradeName(i.categoryName, lang) : null,
    [i.city, i.province ? regionName(i.province, lang) : null].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
  const blurb = i.summary ?? (client ? pc.clientTypes[client] : null);
  return (
    <a href={localizePath(`/case-studies/${i.slug}`, lang)} className="pf-card">
      <div className="ph">
        {i.isCaseStudy && <span className="pf-badge">{t.caseStudy}</span>}
        {i.heroUrl ? (
          <Image src={i.heroUrl} alt={i.title} fill sizes="(min-width: 1024px) 390px, (min-width: 640px) 45vw, 100vw" style={{ objectFit: "cover" }} />
        ) : (
          <span className="none" aria-hidden>{t.h1}</span>
        )}
      </div>
      <div className="bd">
        {tag && <div className="tg">{tag}</div>}
        <div className="ti">{i.title}</div>
        {blurb && <div className="sm">{blurb}</div>}
        <div className="by">{fmt(t.by, { org: i.orgName })}</div>
      </div>
    </a>
  );
}

import "@/components/v3-pages/portfolio.css";
import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { SimplePage } from "@/components/v3/simple";
import { CaseStudyBody } from "@/components/projects/case-study-view";
import { getSharedProject } from "@/lib/projects/share";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

// The token decides what (if anything) shows: never cache a render.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: string; token: string }> }): Promise<Metadata> {
  const { lang, token } = await params;
  const t = getDictionary(hasLocale(lang) ? lang : "en").portfolio.page;
  const shared = await getSharedProject(token);
  return {
    title: shared ? fmt(t.sharedTitle, { title: shared.project.title }) : t.sharedNotFound,
    robots: { index: false, follow: false, nocache: true },
    // Don't hand the token to other sites through the Referer header.
    referrer: "no-referrer",
  };
}

/**
 * /shared/<token> — a project a company shared privately (a bid, a
 * prequalification package). Works for private, unlisted and public
 * projects alike while the link is on; a turned-off link, an unpublished
 * project or a bad token all show the same "link is off" page.
 */
export default async function SharedProjectPage({ params }: { params: Promise<{ token: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("portfolio").page;
  const { token } = await params;
  const shared = await getSharedProject(token);

  if (!shared) {
    return (
      <SimplePage lang={lang} current={null} group="company" crumbs={[{ label: t.crumb, href: "/projects" }]} tabs={false} aside={false} title={t.sharedNotFound}>
        <p>{t.sharedNotFoundBody}</p>
      </SimplePage>
    );
  }

  const { project: cs, extras, reviews, orgListed } = shared;
  const lead = [
    cs.categoryName ? tradeName(cs.categoryName, lang) : null,
    [cs.city, cs.province ? regionName(cs.province, lang) : null].filter(Boolean).join(", "),
    fmt(t.by, { org: cs.orgName }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <SimplePage
      lang={lang}
      current={null}
      group="company"
      crumbs={[{ label: t.crumb }]}
      tabs={false}
      aside={false}
      title={cs.title}
      lead={extras.summary ? <>{extras.summary}<br /><small>{lead}</small></> : lead}
      heroImage={extras.heroUrl ? { src: extras.heroUrl, alt: "" } : null}
    >
      <CaseStudyBody
        cs={cs}
        extras={extras}
        reviews={reviews}
        orgLinked={orgListed}
        banner={
          <p className="pf-banner" role="note">
            <Lock className="mt-1 size-4 shrink-0" aria-hidden />
            <span>{fmt(t.sharedBanner, { org: cs.orgName })}</span>
          </p>
        }
      />
    </SimplePage>
  );
}

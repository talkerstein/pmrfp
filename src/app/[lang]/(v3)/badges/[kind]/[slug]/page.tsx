import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Snippet } from "@/components/public/badge-embed";
import { SH2, SimplePage } from "@/components/v3/simple";
import { getBadgeInfo, getKarmaBadgeInfo } from "@/lib/badge/data";
import { winnerFacts } from "@/lib/badge/winner-facts";
import { KARMA_BADGE_MIN_LEVEL, winnerFactsLine, type BadgeLang } from "@/lib/badge/svg";
import { BADGE_SIZE, badgeHtml, badgeImageUrl, badgeMarkdown, badgeTextLink, type BadgeKind, type BadgeSnippetInput } from "@/lib/badge/snippet";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";

/**
 * One company's badge kit: preview + copy-paste code for each badge it has
 * earned. /badges/company/<directory slug> (directory + reputation badges),
 * /badges/winner/<contract-winner slug> (public contract winner badge).
 * Utility page: not indexed. Rendered on first visit, then cached.
 */
export const revalidate = 86400;

export async function generateStaticParams() {
  return [];
}

type Params = Promise<{ lang: string; kind: string; slug: string }>;

async function load(kind: string, slug: string) {
  if (kind === "winner") {
    const facts = await winnerFacts(slug).catch(() => null);
    return facts ? { kind: "winner" as const, name: facts.name, facts } : null;
  }
  if (kind === "company") {
    const [info, karma] = await Promise.all([getBadgeInfo(slug), getKarmaBadgeInfo(slug)]);
    return info.found ? { kind: "company" as const, name: info.name, level: karma.level } : null;
  }
  return null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, kind, slug } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).growth.badges;
  const d = await load(kind, slug);
  return {
    title: d ? fmt(t.metaTitle, { name: d.name }) : "PMRFP",
    description: d ? fmt(t.metaDescription, { name: d.name }) : undefined,
    robots: { index: false, follow: true },
  };
}

export default async function BadgeKitPage({ params }: { params: Params }) {
  await setLangFrom(params);
  const lang = getLang();
  const { kind, slug } = await params;
  const d = await load(kind, slug);
  if (!d) notFound();

  const t = getT("growth").badges;
  const L = (p: string) => localizePath(p, lang);
  const base = SITE.url.replace(/\/$/, "");
  const badgeLang: BadgeLang = lang === "fr" || lang === "es" ? lang : "en";
  const pagePath = d.kind === "winner" ? `/contract-winners/${slug}` : `/directory/${slug}`;
  const pageUrl = `${base}${L(pagePath)}`;

  const kit = (badge: BadgeKind) => {
    const input: BadgeSnippetInput = { kind: badge, base, slug, pageUrl, name: d.name, lang: badgeLang };
    const { width, height } = BADGE_SIZE[badge];
    // Preview from this site (relative URL), so previews here never count as installs.
    const preview = (theme: "light" | "dark") => badgeImageUrl({ ...input, base: "", theme });
    return (
      <>
        <h3 className="s-h2 sm">{t.preview}</h3>
        <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-[#E3E4EE] p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview("light")} alt={d.name} width={width} height={height} />
          <div className="rounded-xl bg-[#282B59] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview("dark")} alt={d.name} width={width} height={height} />
          </div>
        </div>
        <div className="mt-6 space-y-6">
          <Snippet label={t.light} code={badgeHtml(input)} />
          <Snippet label={t.dark} code={badgeHtml({ ...input, theme: "dark" })} />
          <Snippet label={t.textLink} code={badgeTextLink(input)} />
          <Snippet label={t.markdown} code={badgeMarkdown(input)} />
        </div>
      </>
    );
  };

  let no = 0;
  return (
    <SimplePage
      lang={lang}
      current={null}
      group="company"
      crumbs={[{ label: t.eyebrow }]}
      tabs={false}
      aside={false}
      title={fmt(d.kind === "winner" ? t.titleWinner : t.titleCompany, { name: d.name })}
      lead={d.kind === "winner" ? t.leadWinner : t.leadCompany}
    >
      {d.kind === "winner" ? (
        <>
          <SH2 no={++no} id="winner">{t.winnerTitle}</SH2>
          <p>{fmt(t.winnerFacts, { facts: winnerFactsLine(d.facts.awards, d.facts, badgeLang) })}</p>
          {kit("winner")}
        </>
      ) : (
        <>
          <SH2 no={++no} id="listed">{t.listedTitle}</SH2>
          {kit("listed")}
          <SH2 no={++no} id="reputation">{t.karmaTitle}</SH2>
          {d.level && d.level >= KARMA_BADGE_MIN_LEVEL ? (
            <>
              <p>{fmt(t.karmaLive, { level: d.level })}</p>
              {kit("karma")}
            </>
          ) : (
            <div className="s-callout" data-locked="karma">
              <p>{t.karmaLocked}</p>
              <p><a href={L("/reputation")}>{t.karmaHow} →</a></p>
            </div>
          )}
        </>
      )}

      <SH2 no={++no} id="rules">{t.rulesTitle}</SH2>
      <ul className="s-legal">
        {t.rules.map((r) => <li key={r}>{r}</li>)}
      </ul>

      <div className="s-links">
        <a href={L(pagePath)}>{t.viewPage} →</a>
        {d.kind === "winner" && <a href={L(`/contract-winners/${slug}/claim`)}>{t.claim} →</a>}
      </div>
    </SimplePage>
  );
}

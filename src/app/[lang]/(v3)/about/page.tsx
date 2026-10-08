import type { Metadata } from "next";
import { Fragment } from "react";
import { JsonLd, organizationSchema } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";
import { SH2, SimplePage } from "@/components/v3/simple";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).misc.about.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/about") };
}

/** Fills {name} slots in a translated sentence with links. */
function rich(template: string, slots: Record<string, React.ReactNode>): React.ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={i}>{key && key in slots ? slots[key] : part}</Fragment>;
  });
}

/** Short code for each public tender source, as in the design's table. */
function sourceCode(name: string): string {
  if (/canadabuys/i.test(name)) return "CA";
  if (/toronto/i.test(name)) return "TO";
  if (/seao|qu[eé]bec/i.test(name)) return "QC";
  if (/yukon/i.test(name)) return "YT";
  if (/nova scotia|nouvelle-[ée]cosse|nueva escocia/i.test(name)) return "NS";
  if (/sam\.gov/i.test(name)) return "US";
  if (/new york|nueva york/i.test(name)) return "NY";
  return name.slice(0, 2).toUpperCase();
}

/** About, on the simple page template (Claude Design "Simple page, About example"). */
export default async function AboutPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("misc").about;
  const v = getT("v3Pages").simple;
  const L = (p: string) => localizePath(p, lang);
  const address = process.env.BUSINESS_MAILING_ADDRESS?.trim();
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "AboutPage", name: t.title, mainEntity: organizationSchema() }} />
      <SimplePage lang={lang} current="about" group="company" title={t.title} lead={t.caption}>
        <div className="eb">{v.about.whatIs}</div>
        <p className="intro">{t.lead}</p>

        <blockquote className="s-quote">
          <span className="q" aria-hidden>“</span>
          <span className="c" aria-hidden />
          <span className="k">{v.about.mission}</span>
          <span className="h">{v.about.missionHead}</span>
          <span className="b">{v.about.missionBody}</span>
        </blockquote>

        <SH2 no={1}>{t.whoTitle}</SH2>
        <p>
          {rich(t.whoBody, {
            sister: <a href={SITE.sisterBrand.url}>{SITE.sisterBrand.name}</a>,
            tcg: <a href="https://talkerstein.com">Talkerstein Consulting Group</a>,
          })}
        </p>
        <div className="s-facts">
          <div><div className="k">{v.about.founder}</div><div className="v">R. Talkar</div></div>
          <div><div className="k">{v.about.builtIn}</div><div className="v">{v.about.toronto}</div></div>
          <div><div className="k">{v.about.teamBehind}</div><div className="v">{SITE.sisterBrand.name}</div></div>
        </div>
        <p>
          {rich(t.contactBody, {
            email: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>,
            form: <a href={L("/contact")}>{t.contactForm}</a>,
            mail: address ? fmt(t.mail, { address }) : "",
          })}
        </p>

        <SH2 no={2}>{t.sourcesTitle}</SH2>
        <p>{t.sourcesBody}</p>
        <ul className="s-table">
          {t.sources.map((s) => (
            <li key={s.name}>
              <span className="code" aria-hidden>{sourceCode(s.name)}</span>
              <span>
                <span className="nm">{s.name}</span>
                <span className="wt">{s.what}</span>
                <span className="lic">{s.licence}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="small muted">
          {rich(t.awardsBody, {
            report: <a href={L("/reports/public-building-contracts")}>{t.reportLink}</a>,
            winners: <a href={L("/contract-winners")}>{t.winnersLink}</a>,
          })}
        </p>

        <SH2 no={3}>{t.directoryTitle}</SH2>
        <p>{rich(t.directoryBody, { paid: <a href={L("/pricing")}>{t.paidPlan}</a> })}</p>

        <SH2 no={4}>{v.about.promiseTitle}</SH2>
        <div className="s-callout">
          <p>{getT("common").disclaimer}</p>
        </div>

        <div className="s-links">
          <a href={L("/terms")}>{getT("homeV3").footer.terms} →</a>
          <a href={L("/privacy")}>{getT("homeV3").footer.privacy} →</a>
          <a href={L("/disclaimer")}>{v.disclaimer} →</a>
          <a href={L("/reports/public-building-contracts")}>{v.about.reportLink} →</a>
        </div>
      </SimplePage>
    </>
  );
}

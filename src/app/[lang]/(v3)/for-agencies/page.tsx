import type { Metadata } from "next";
import { Fragment } from "react";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { SH2, SimplePage } from "@/components/v3/simple";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).agencies.forAgencies.meta;
  return { title: { absolute: t.title }, description: t.description, alternates: alternatesFor(l, "/for-agencies") };
}

/** Inbound page for marketing/SEO agencies serving construction clients (simple page template). */
export default async function ForAgenciesPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("agencies").forAgencies;
  const g = getT("agencies").resourcesCard;
  const home = getT("v3Pages").simple.home;
  const L = (p: string) => localizePath(p, lang);
  const [before, after] = t.multi.split("{email}");
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: home, path: L("/") }, { name: t.crumb, path: L("/for-agencies") }])} />
      <JsonLd data={faqSchema(t.faq)} />
      <SimplePage lang={lang} current={null} group="company" crumbs={[]} tabs={false} title={t.title} lead={t.lead}>
        <SH2 no={1}>{t.getTitle}</SH2>
        <ul className="s-table">
          {t.get.map((x, i) => (
            <li key={x.t}>
              <span className="code" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
              <span><span className="nm">{x.t}</span><span className="wt">{x.d}</span></span>
            </li>
          ))}
        </ul>

        <SH2 no={2}>{t.whoTitle}</SH2>
        <p>{t.who}</p>

        <SH2 no={3}>{t.howTitle}</SH2>
        <ol style={{ marginTop: 16, paddingLeft: 22, listStyle: "decimal" }}>
          {t.how.map((s) => <li key={s} style={{ marginTop: 8 }}>{s}</li>)}
        </ol>
        <p><a href={L("/sign-up?role=trade")} className="btn ink md">{t.howCta} →</a></p>
        <p className="small muted">
          {before}<a href={`mailto:${SITE.email}`}>{SITE.email}</a>{after}
        </p>

        <SH2 no={4}>{t.dontTitle}</SH2>
        <div className="s-callout">
          {t.dont.map((d) => <p key={d}>{d}</p>)}
        </div>

        <SH2 no={5}>{t.guideTitle}</SH2>
        <p>{t.guideBody} <a href={L("/resources/contractor-directories")}>{t.guideCta} →</a></p>

        <SH2 no={6}>{t.faqTitle}</SH2>
        {t.faq.map((f) => (
          <Fragment key={f.q}>
            <h3 style={{ marginTop: 24, fontWeight: 700 }}>{f.q}</h3>
            <p style={{ marginTop: 6 }}>{f.a}</p>
          </Fragment>
        ))}

        <div className="s-links">
          <a href={L("/badge")}>{t.badge} →</a>
          <a href={L("/directory")}>{getT("homeV3").footer.directory} →</a>
          <a href={L("/resources/contractor-directories")}>{g.cta} →</a>
        </div>
      </SimplePage>
    </>
  );
}

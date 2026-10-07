import type { Metadata } from "next";
import { verticalsFor } from "@/lib/seo/verticals.fr";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";

export const revalidate = 86400;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).seo.forIndex.meta;
  return {
    title: t.title,
    description: fmt(t.description, { site: SITE.name }),
    alternates: alternatesFor(l, "/for"),
  };
}

export default async function SolutionsIndexPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("seo").forIndex;
  const verticals = verticalsFor(getLang());
  const lang = getLang();
  const L = (p: string) => localizePath(p, lang);
  return (
    <>
      <div className="dark f-band">
        <section className="wrap f-band-in">
          <div className="kick" style={{ marginTop: 0 }}><span className="dot" />{t.eyebrow}</div>
          <h1 className="s-h1" style={{ marginTop: 18, maxWidth: 900 }}>{t.title}</h1>
          <p className="s-lead">{fmt(t.lead, { site: SITE.name })}</p>
        </section>
      </div>
      <section className="wrap" style={{ paddingTop: 56, paddingBottom: 96 }}>
        <div className="f-grid4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", marginTop: 0 }}>
          {verticals.map((v, i) => (
            <a key={v.slug} href={L(`/for/${v.slug}`)} className="f-b lift">
              <span className="top"><span className="no">{String(i + 1).padStart(2, "0")}</span></span>
              <span className="lb" style={{ color: "#4B4F6B", marginTop: 14 }}>{fmt(t.cardEyebrow, { who: v.who })}</span>
              <h2 className="nm">{v.name}</h2>
              <span className="ds">{v.positioning}</span>
              <span className="ft"><span className="go">{t.learnMore} →</span></span>
            </a>
          ))}
        </div>
      </section>
      <section className="s-band">
        <div className="wrap s-band-in">
          <div>
            <h2 className="hd">{t.cta.title}</h2>
            <div className="sb">{t.cta.description}</div>
          </div>
          <div className="cta">
            <a href={L("/sign-up")} className="btn ink xl">{fmt(t.cta.primary, { site: SITE.name })}</a>
            <a href={L("/vs")} className="btn line-ink xl">{t.cta.secondary}</a>
          </div>
        </div>
      </section>
    </>
  );
}

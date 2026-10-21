import "@/components/v3-pages/public-buyers.css";
import type { Metadata } from "next";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";
import { regionName } from "@/i18n/terms";
import { SH2, SimplePage } from "@/components/v3/simple";
import { BuyerSourceForm, type BuyerSourceFormCopy } from "@/components/v3-pages/buyer-source-form";
import { DIRECTORY, PROVINCE_NAMES } from "@/lib/buyers/model";
import { CA_PROVINCE_CODES, SLUG } from "@/lib/buyers/source-requests";
import { FOR_PUBLIC_BUYERS_PATH, NOTICES_EMAIL } from "@/lib/buyers/source-links";
import { PERMISSION_METHODS } from "@/lib/buyers/permissions";
import { isServiceConfigured } from "@/lib/supabase/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).buyers.forBuyers.meta;
  return { title: { absolute: t.title }, description: t.description, alternates: alternatesFor(l, FOR_PUBLIC_BUYERS_PATH) };
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * "List your tenders on PMRFP, free": for Canadian public buyers (country-
 * first: the U.S. isn't part of this). What we show, what we never do,
 * link-back and removal, how we get the tenders, and the request form
 * (/api/buyer-sources → /admin/buyer-sources). A buyer page's "Are you this
 * buyer?" link prefills it (?buyer=<slug>&province=<code>). Without a
 * backend the form is an email link to info@pmrfp.com.
 */
export default async function ForPublicBuyersPage({
  params,
  searchParams,
}: {
  params: Promise<object>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("buyers").forBuyers;
  const home = getT("v3Pages").simple.home;
  const L = (p: string) => localizePath(p, lang);
  const sp = await searchParams;
  const email = NOTICES_EMAIL;
  const e = (s: string) => fmt(s, { email });

  const slug = one(sp.buyer)?.toLowerCase();
  const buyerSlug = slug && SLUG.test(slug) ? slug : "";
  const known = buyerSlug ? DIRECTORY.find((b) => b.slug === buyerSlug) : undefined;
  const province = one(sp.province)?.toUpperCase();
  const provinceCode = province && (CA_PROVINCE_CODES as readonly string[]).includes(province) ? province : (known?.provinceCode ?? "");
  const provinces = CA_PROVINCE_CODES.map((code) => ({ code, name: regionName(PROVINCE_NAMES[code], lang) }));

  const f = t.form;
  const copy: BuyerSourceFormCopy = {
    title: t.formTitle,
    organization: f.organization,
    contactName: f.contactName,
    workEmail: f.workEmail,
    tendersUrl: f.tendersUrl,
    tendersHint: f.tendersHint,
    method: f.method,
    feedUrl: f.feedUrl,
    province: f.province,
    choose: f.choose,
    authorized: f.authorized,
    submit: f.submit,
    sending: f.sending,
    doneTitle: f.doneTitle,
    doneBody: e(f.doneBody),
    error: e(f.error),
    tooMany: e(f.tooMany),
    invalid: f.invalid,
    fallbackTitle: f.fallbackTitle,
    fallbackBody: e(f.fallbackBody),
    fallbackCta: e(f.fallbackCta),
    mailSubject: f.mailSubject,
    prefer: e(f.prefer),
    methods: Object.fromEntries(PERMISSION_METHODS.map((m) => [m, { t: t.methods[m].t, d: e(t.methods[m].d) }])) as BuyerSourceFormCopy["methods"],
  };

  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: home, path: L("/") }, { name: t.crumb, path: L(FOR_PUBLIC_BUYERS_PATH) }])} />
      <SimplePage lang={lang} current={null} group="company" crumbs={[]} tabs={false} title={t.title} lead={t.lead}>
        <SH2 no={1}>{t.showTitle}</SH2>
        <ul className="s-table" data-list="show">
          {t.show.map((x, i) => (
            <li key={x}>
              <span className="code" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
              <span><span className="nm">{x}</span></span>
            </li>
          ))}
        </ul>

        <SH2 no={2}>{t.neverTitle}</SH2>
        <div className="s-callout" data-list="never">
          {t.never.map((d) => <p key={d}>{d}</p>)}
        </div>

        <SH2 no={3}>{t.removalTitle}</SH2>
        {t.removal.map((p) => <p key={p}>{e(p)}</p>)}

        <SH2 no={4}>{t.howTitle}</SH2>
        <ul className="pb-how" data-list="methods">
          {PERMISSION_METHODS.map((m) => (
            <li key={m}>
              <span className="nm">{t.methods[m].t}</span>
              <span className="wt">{e(t.methods[m].d)}</span>
            </li>
          ))}
        </ul>
        <p className="small muted">{t.canadaOnly}</p>

        <div className="s-form" id="form" style={{ marginTop: 32, scrollMarginTop: 96 }}>
          <BuyerSourceForm
            t={copy}
            lang={lang}
            provinces={provinces}
            prefill={{ buyerSlug, organization: known?.name ?? "", tendersUrl: known?.tendersUrl ?? "", provinceCode }}
            available={isServiceConfigured()}
          />
        </div>

        <div className="s-links">
          <a href={L("/buyers")}>{getT("buyers").page.back} →</a>
          <a href={`mailto:${email}`}>{email}</a>
        </div>
      </SimplePage>
    </>
  );
}

import "@/components/advertise/advertise.css";
import type { Metadata } from "next";
import { SH2, SimplePage } from "@/components/v3/simple";
import { SponsorCardMock } from "@/components/advertise/sponsor-mock";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { getSponsorSnapshot } from "@/lib/sponsors/data";
import { loadAudience } from "@/lib/sponsors/audience-load";
import { normalizeRegion, regionCountryOf, regionsFor, slotState, torontoDay, type SlotState } from "@/lib/sponsors/model";
import {
  LAUNCH_PRICING,
  SPONSOR_TIERS,
  currencyFor,
  parseTierParam,
  sponsorPrice,
  sponsorStripePrice,
  type SponsorTier,
} from "@/lib/sponsors/pricing";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { SponsorEnquiryForm, type TierOption } from "./enquiry-form";

type SP = Record<string, string | undefined>;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<SP> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).v3Pages.advertise.meta;
  const sp = await searchParams;
  // Slot checks and country views are for people; only the plain page is indexed.
  const filtered = Object.entries(sp).some(([k, v]) => v && k !== "lang");
  return {
    title: t.title,
    description: t.description,
    alternates: alternatesFor(l, "/advertise"),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * Sells direct sponsorships by trade × province/state (+ national, + email
 * only). One country per visitor (lib/visitor-geo resolver): its numbers,
 * its slots, its currency; ?country=ca|us views the other. Every number is
 * computed from PMRFP's own data (lib/sponsors/audience): no traffic or
 * open-rate claims. Delivery: lib/sponsors (model, data, SponsorSlot,
 * /go/<slug>, /admin/sponsors).
 */
export default async function AdvertisePage({ params, searchParams }: { params: Promise<object>; searchParams: Promise<SP> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("v3Pages").advertise;
  const home = getT("v3Pages").simple.home;
  const sp = await searchParams;
  const { country } = await getVisitorCountry({ param: sp.country });
  const [{ audience, categories }, sponsors] = await Promise.all([loadAudience(country), getSponsorSnapshot()]);
  const today = torontoDay();
  const L = (p: string) => localizePath(p, lang);
  const n = (x: number) => formatNumber(x, lang);
  const currency = currencyFor(country);
  const money = (x: number) => (lang === "fr" ? `${n(x)} $` : `$${n(x)}`);
  const countryName = t.country[country];
  const day = (d: string) => formatDate(d, lang, { year: "numeric", month: "short", day: "numeric" });

  const nums = [
    audience.open > 0 && { v: n(audience.open), k: t.audience.open },
    audience.awards > 0 && { v: n(audience.awards), k: t.audience.awards },
    audience.projects && { v: n(audience.projects), k: t.audience.projects },
    audience.companies && audience.companies.n > 0 && { v: audience.companies.capped ? `${n(audience.companies.n)}+` : n(audience.companies.n), k: t.audience.companies },
    audience.tradesWithWork > 0 && { v: n(audience.tradesWithWork), k: t.audience.trades },
  ].filter((x): x is { v: string; k: string } => !!x);

  const topSlots = audience.slots.filter((s) => s.open + s.awards + s.projects > 0).slice(0, 12);
  const showProjects = country === "CA" && topSlots.some((s) => s.projects > 0);
  const showCompanies = topSlots.some((s) => s.companies != null);
  const stateBadge = (s: SlotState) =>
    s.taken ? (
      <span className="ad-badge taken">{s.until ? fmt(t.slots.takenUntil, { date: day(s.until) }) : t.slots.taken}</span>
    ) : (
      <span className="ad-badge open">{t.slots.available}</span>
    );

  // "Check a slot" (?trade=&where=): this country's trades and provinces/states only.
  const checkTrade = categories.find((c) => c.slug === sp.trade) ?? null;
  const checkWhere = sp.where === "*" ? "*" : normalizeRegion(sp.where);
  const whereOk = checkWhere === "*" || (checkWhere != null && regionCountryOf(checkWhere) === country);
  const check = checkTrade && whereOk ? (() => {
    const where = checkWhere as string;
    const tier: SponsorTier = where === "*" ? "national" : "province";
    const state = slotState({ country, trade: checkTrade.slug, region: where, tier }, sponsors, today);
    const vars = { trade: tradeName(checkTrade.name, lang), where: where === "*" ? countryName : regionName(where, lang), country: countryName };
    const head =
      where === "*"
        ? fmt(state.taken ? t.check.nationalTaken : t.check.nationalOpen, vars)
        : state.taken
          ? state.until
            ? fmt(t.check.takenUntil, { ...vars, date: day(state.until) })
            : fmt(t.check.taken, vars)
          : fmt(t.check.open, vars);
    const stats = where === "*" ? null : audience.slots.find((s) => s.trade === checkTrade.slug && s.province === where) ?? null;
    return { head, stats, vars, where };
  })() : null;

  const regionOptions = regionsFor(country)
    .map((r) => ({ value: r, label: regionName(r, lang) }))
    .sort((a, b) => a.label.localeCompare(b.label, lang));
  const tradeOptions = categories
    .map((c) => ({ value: c.slug, label: tradeName(c.name, lang) }))
    .sort((a, b) => a.label.localeCompare(b.label, lang));
  const tierOptions: TierOption[] = SPONSOR_TIERS.map((tier) => ({
    value: tier,
    label: `${t.pricing.tiers[tier].name} · ${money(sponsorPrice(tier, country).amount)} ${currency} ${t.pricing.perMonth}`,
    payable: Boolean(sponsorStripePrice(tier, country)),
  }));
  const initialTier = parseTierParam(sp.tier ?? sp.package);

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: home, path: L("/") },
          { name: getT("homeV3").footer.advertise, path: L("/advertise") },
        ])}
      />
      <SimplePage lang={lang} current="advertise" group="company" title={t.title} lead={t.lead} aside={false}>
        <div className="eb">{t.whoEyebrow}</div>
        <p className="intro">{t.intro}</p>
        <ul className="ad-who">
          {t.who.map((w) => <li key={w}>{w}</li>)}
        </ul>

        <SH2 no={1} id="audience">{t.audience.title}</SH2>
        <p>{fmt(t.audience.body, { country: countryName })}</p>
        {nums.length > 0 && (
          <div className="ad-nums" data-country={country}>
            {nums.map((x) => (
              <div key={x.k}>
                <div className="v">{x.v}</div>
                <div className="k">{x.k}</div>
              </div>
            ))}
          </div>
        )}
        <p className="small muted">{t.audience.noTraffic}</p>

        <SH2 no={2} id="slots">{country === "US" ? t.slots.titleUs : t.slots.title}</SH2>
        <p>{t.slots.body}</p>
        {topSlots.length ? (
          <div className="s-dtw">
            <table className="s-dt">
              <thead>
                <tr>
                  <th scope="col">{t.slots.trade}</th>
                  <th scope="col">{country === "US" ? t.slots.state : t.slots.province}</th>
                  <th scope="col" className="r">{t.slots.open}</th>
                  <th scope="col" className="r">{t.slots.awards}</th>
                  {showProjects && <th scope="col" className="r">{t.slots.projects}</th>}
                  {showCompanies && <th scope="col" className="r">{t.slots.companies}</th>}
                  <th scope="col">{t.slots.status}</th>
                </tr>
              </thead>
              <tbody>
                {topSlots.map((s) => (
                  <tr key={`${s.trade}|${s.province}`}>
                    <td className="nm">
                      <a href={L(`/advertise?trade=${s.trade}&where=${encodeURIComponent(s.province)}#check`)}>{tradeName(s.tradeName, lang)}</a>
                    </td>
                    <td>{regionName(s.province, lang)}</td>
                    <td className="r">{n(s.open)}</td>
                    <td className="r">{n(s.awards)}</td>
                    {showProjects && <td className="r">{n(s.projects)}</td>}
                    {showCompanies && <td className="r">{s.companies == null ? "—" : n(s.companies)}</td>}
                    <td>{stateBadge(slotState({ country, trade: s.trade, region: s.province, tier: "province" }, sponsors, today))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{fmt(t.slots.none, { country: countryName })}</p>
        )}
        {showCompanies && <p className="small muted">{t.slots.note}</p>}

        <SH2 no={3} id="check">{t.check.title}</SH2>
        <form method="get" action={L("/advertise")} className="ad-check">
          {sp.country && <input type="hidden" name="country" value={sp.country} />}
          <label className="s-fld">
            <span>{t.check.trade}</span>
            <select name="trade" defaultValue={checkTrade?.slug ?? ""} required>
              <option value="">{t.check.pickTrade}</option>
              {tradeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="s-fld">
            <span>{t.check.where}</span>
            <select name="where" defaultValue={check?.where ?? ""} required>
              <option value="*">{t.check.national}</option>
              {regionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <button type="submit">{t.check.button}</button>
        </form>
        {check && (
          <div className="s-callout ad-result" role="status">
            <p><b>{check.head}</b></p>
            {check.where !== "*" && (
              check.stats && (check.stats.open || check.stats.awards || check.stats.projects) ? (
                <p>
                  {fmt(t.check.stats, { ...check.vars, open: n(check.stats.open), awards: n(check.stats.awards) })}
                  {check.stats.projects > 0 && <> {fmt(t.check.statsProjects, { n: n(check.stats.projects) })}</>}
                </p>
              ) : (
                <p>{fmt(t.check.quiet, check.vars)}</p>
              )
            )}
          </div>
        )}

        <SH2 no={4} id="placements">{t.placements.title}</SH2>
        <p>{t.placements.body}</p>
        <div className="ad-place">
          <ul className="s-table">
            {t.placements.items.map((p) => (
              <li key={p.name}>
                <span>
                  <span className="nm">{p.name}</span>
                  <span className="wt">{p.where}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="ad-sample">
            <div className="eb">{t.placements.sample}</div>
            <SponsorCardMock />
          </div>
        </div>
        <p className="small muted">{t.placements.never}</p>

        <SH2 no={5} id="pricing">{t.pricing.title}</SH2>
        {LAUNCH_PRICING && <span className="ad-launch">{t.pricing.launch}</span>}
        <div className="ad-tiers">
          {SPONSOR_TIERS.map((tier) => (
            <div key={tier} className={`ad-tier${tier === "province" ? " hi" : ""}`} data-tier={tier}>
              <div className="nm">{t.pricing.tiers[tier].name}</div>
              <div className="pr">
                {money(sponsorPrice(tier, country).amount)} <small>{currency} {t.pricing.perMonth}</small>
              </div>
              <div className="bd">{fmt(t.pricing.tiers[tier].body, { country: countryName })}</div>
              <a className="go" href={L(`/advertise?tier=${tier}${sp.country ? `&country=${sp.country}` : ""}#enquire`)}>{t.pricing.ask} →</a>
            </div>
          ))}
        </div>
        <p className="small muted">{fmt(t.pricing.currency, { currency })}</p>
        {country === "CA" && <p className="small">{t.pricing.quebec}</p>}

        <SH2 no={6} id="enquire">{t.form.title}</SH2>
        <p>{t.form.body}</p>
        <div className="s-form ad-enquire">
          <SponsorEnquiryForm
            t={t.form}
            country={country}
            tiers={tierOptions}
            trades={tradeOptions}
            regions={regionOptions}
            nationalLabel={t.check.national}
            initial={{ tier: initialTier, trade: checkTrade?.slug ?? "", where: check?.where ?? "" }}
            paid={sp.paid === "1"}
          />
        </div>

        <SH2 no={7} id="policy">{t.policy.title}</SH2>
        <ul className="ad-policy">
          {t.policy.items.map((x) => <li key={x}>{x}</li>)}
        </ul>
      </SimplePage>
    </>
  );
}

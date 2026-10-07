import type { Metadata } from "next";
import { BigTick, ROLE_PHOTO, SignupAside, SignupFrame, SignupSticky, SignupTop, Stepper } from "@/components/home-v3/signup-ui";
import { getListCounts } from "@/lib/data/list-counts";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { billingPathForIntent } from "@/lib/billing/plan-intent";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  return { title: getDictionary(l).auth.meta.checkEmail, alternates: alternatesFor(l, "/check-email"), robots: { index: false, follow: true } };
}

const ROLES = ["trade", "supplier", "property_manager", "landlord", "general_contractor", "real_estate_agent", "talent", "visitor"] as const;
type Role = (typeof ROLES)[number];

/**
 * "Done" step of the sign-up flow: the landing after sign-up when email
 * confirmation is required (no session yet). Without it, new sign-ups were
 * silently bounced to /sign-in with no explanation.
 */
export default async function CheckEmailPage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ email?: string; role?: string; plan?: string }>;
  params: Promise<object>;
}) {
  const lang = await setLangFrom(params);
  const t = getT("v3Pages").signup;
  const { email, role: rawRole, plan } = await searchParams;
  const role: Role | null = rawRole && (ROLES as readonly string[]).includes(rawRole) ? (rawRole as Role) : null;
  const seller = role === "trade" || role === "supplier" || role === "talent" || role === null;
  const pro = (role === "trade" || role === "supplier") && plan === "pro";
  const [counts, categories, regions] = await Promise.all([getListCounts(), getCategories(), getRegions()]);
  const L = (p: string) => localizePath(p, lang);
  const num = (n: number) => formatNumber(n, lang);
  const checkout = `/sign-in?next=${encodeURIComponent(billingPathForIntent({ plan: "pro", interval: "annual", name: "Trade Pro", priceLabel: "" }))}`;

  const steps = seller && role !== "talent" ? t.nextSeller : t.nextPoster;
  const bigs = seller && role !== "talent"
    ? [counts.open != null ? num(counts.open) : "→", "01", "9 AM"]
    : [lang === "fr" ? "0 $" : "$0", num(categories.length), t.freeWord];
  const hrefs = seller && role !== "talent" ? ["/rfps", "/dashboard/projects", "/dashboard/settings"] : ["/pm-dashboard/rfps/new", "/directory", "/rfp-writer"];

  return (
    <>
      <SignupFrame
        aside={
          <SignupAside
            d={{
              photo: ROLE_PHOTO[role ?? "trade"],
              live: t.live,
              open: counts.open != null ? num(counts.open) : null,
              openLabel: t.openNow,
              three: [
                ...(counts.closing7 != null ? [{ n: num(counts.closing7), l: t.closing }] : []),
                { n: num(categories.length), l: t.trades },
                { n: num(regions.length), l: t.regions },
              ],
              getsLabel: pro ? t.getPro : t.getFree,
              gets: seller ? (pro ? t.getsPro : t.getsSeller) : t.getsPoster,
              setupLabel: t.setup,
              stepText: t.done,
              summary: [
                ...(role ? [{ k: t.sumAccount, v: t.roles[role].name, tone: "on" as const }] : []),
                { k: t.sumPlan, v: seller ? (pro ? t.planPro : t.planFree) : t.planPoster, tone: "mint" as const },
              ],
              lock: t.noCard,
            }}
          />
        }
      >
        <SignupTop eyebrow={t.eyebrow}>
          <Stepper labels={t.steps} step={3} />
        </SignupTop>
        <div className="v3-su-pane" style={{ paddingTop: 36 }}>
          <div className="v3-su-done pop-in">
            <span className="ok"><span className="ping" aria-hidden /><span><BigTick stroke="#1B1D3A" size={34} /></span></span>
            <div>
              <div className="k">{seller ? t.doneTagSeller : t.doneTagPoster}</div>
              <h1>{t.doneHead}</h1>
            </div>
          </div>
          <p className="v3-su-sub" style={{ marginTop: 16 }}>{email ? fmt(t.doneSubSent, { email }) : t.doneSub}</p>
          <p className="v3-su-fine">{t.spam}</p>

          {pro && (
            <div className="v3-su-checkout">
              <div><div className="h">{t.checkoutHead}</div><div className="p">{t.checkoutBody}</div></div>
              <a href={L(checkout)} className="v3-pill mint">{t.checkoutCta}</a>
            </div>
          )}

          <h2 className="v3-su-next-h">{t.nextHead}</h2>
          <div className="v3-su-next">
            {steps.map((s, i) => (
              <a key={s.title} className="lift" href={L(hrefs[i])}>
                <span className="big">{bigs[i]}</span>
                <span className="tx"><b>{s.title}</b><span>{s.desc}</span></span>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#282B59" strokeWidth="2.5" aria-hidden style={{ flexShrink: 0 }}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </a>
            ))}
          </div>
          <p className="v3-su-fine">{t.confirmed} <a href={L("/sign-in")} style={{ fontWeight: 700 }}>{t.signIn}</a></p>
        </div>
        <div className="v3-su-foot"><div className="v3-su-legal" style={{ marginTop: 0 }}>{t.disclaimer}</div></div>
      </SignupFrame>
      {counts.open != null && (
        <SignupSticky
          a={fmt(t.stickyA, { n: num(counts.open) })}
          b={counts.closing7 != null ? fmt(t.stickyB, { n: num(counts.closing7) }) : ""}
          meta={t.done}
          cta={{ href: L("/sign-up?role=property_manager"), label: t.postFree }}
        />
      )}
    </>
  );
}

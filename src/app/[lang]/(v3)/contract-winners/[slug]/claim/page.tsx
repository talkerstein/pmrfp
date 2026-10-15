import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SH2, SimplePage } from "@/components/v3/simple";
import { getSession } from "@/lib/access/access";
import { winnerFacts } from "@/lib/badge/winner-facts";
import { getOwnClaim, getWinnerClaim } from "@/lib/claims/data";
import { canClaim } from "@/lib/claims/domain";
import { submitWinnerClaimAction } from "@/lib/claims/actions";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";

/**
 * "Is this your company? Claim this page" for /contract-winners/<slug>.
 * Signed out: what a claim gives you + sign up / sign in (back here after).
 * Signed in: the claim form, or where the claim stands. Not indexed.
 */
// Dynamic because it reads the session (cookies). Deliberately no
// `dynamic = "force-dynamic"`, which would bypass the cached board snapshot.

type Params = Promise<{ lang: string; slug: string }>;
type SP = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, slug } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const w = await winnerFacts(slug).catch(() => null);
  return { title: fmt(getDictionary(l).growth.claim.metaTitle, { name: w?.name ?? "PMRFP" }), robots: { index: false, follow: false } };
}

const box = { border: "1px solid #E3E4EE", borderRadius: 20, padding: "22px 26px", marginTop: 20 } as const;

export default async function ClaimWinnerPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  await setLangFrom(params);
  const lang = getLang();
  const { slug } = await params;
  const sp = await searchParams;
  const winner = await winnerFacts(slug).catch(() => null);
  if (!winner) notFound();

  const t = getT("growth").claim;
  const L = (p: string) => localizePath(p, lang);
  const here = L(`/contract-winners/${slug}/claim`);
  const [session, live] = await Promise.all([getSession(), getWinnerClaim(slug)]);
  const own = session ? await getOwnClaim(slug) : null;
  const org = session?.organization ?? null;
  const mine = Boolean(own?.status === "approved" && org && own.organizationId === org.id);
  const errors = t.errors as Record<string, string>;
  const error = sp.error && errors[sp.error] ? errors[sp.error] : null;
  let no = 0;

  let body: React.ReactNode;
  if (sp.status === "approved" || mine) {
    body = (
      <div style={box} data-claim="approved">
        <p><b>{sp.status === "approved" && org ? fmt(t.approvedNow, { name: winner.name, org: org.name }) : t.mine}</b></p>
        <p className="s-links" style={{ marginTop: 16, paddingTop: 0, border: 0 }}>
          <a href={L("/dashboard/company")}>{t.mineEdit} →</a>
          <a href={L(`/contract-winners/${slug}`)}>{t.view} →</a>
          <a href={L(`/badges/winner/${slug}`)}>{getT("growth").winner.badgeCta} →</a>
        </p>
      </div>
    );
  } else if (live) {
    body = <div style={box} data-claim="taken"><p>{fmt(t.taken, { org: live.name, email: SITE.email })}</p></div>;
  } else if (!session) {
    body = (
      <div style={box} data-claim="signed-out">
        <p>{t.signedOut}</p>
        <div className="g-acts" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
          <a className="btn navy lg" href={`${L("/sign-up")}?role=trade&next=${encodeURIComponent(here)}`}>{t.signUp}</a>
          <a className="btn lg" href={`${L("/sign-in")}?next=${encodeURIComponent(here)}`}>{t.signIn}</a>
        </div>
      </div>
    );
  } else if (!org) {
    body = (
      <div style={box} data-claim="no-org">
        <p>{t.noOrg}</p>
        <p style={{ marginTop: 12 }}><a href={L("/dashboard/company")}>{t.noOrgCta} →</a></p>
      </div>
    );
  } else if (!canClaim(org.organization_type)) {
    body = <div style={box} data-claim="wrong-type"><p>{t.wrongType}</p></div>;
  } else if (own?.status === "pending" || sp.status === "pending") {
    body = <div style={box} data-claim="pending"><p>{sp.status === "pending" ? t.pendingNow : t.pending}</p></div>;
  } else {
    body = (
      <div className="s-form" style={{ marginTop: 20 }}>
        <form action={submitWinnerClaimAction}>
          <div className="hd">{fmt(t.formTitle, { org: org.name })}</div>
          {own?.status === "rejected" && <div className="sb">{t.rejected}</div>}
          <div className="sb">{fmt(t.emailLine, { email: session.profile.email })}</div>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="lang" value={lang} />
          <label className="s-fld fld">
            <span>{t.website}</span>
            <input name="website" required defaultValue={org.website ?? ""} placeholder="yourcompany.ca" autoComplete="url" />
          </label>
          <span className="small muted">{t.websiteHint}</span>
          <label className="s-fld fld">
            <span>{t.note}</span>
            <textarea name="note" rows={3} maxLength={1000} />
          </label>
          {error && <p className="err" role="alert">{error}</p>}
          <button type="submit">{t.submit} →</button>
        </form>
      </div>
    );
  }

  return (
    <SimplePage
      lang={lang}
      current={null}
      group="company"
      crumbs={[{ label: getT("partners").crumbs.winners, href: "/contract-winners" }, { label: winner.name, href: `/contract-winners/${slug}` }]}
      tabs={false}
      aside={false}
      title={fmt(t.title, { name: winner.name })}
      lead={t.lead}
    >
      {body}

      <SH2 no={++no} id="get">{t.getTitle}</SH2>
      <ul className="s-legal">{t.get.map((g) => <li key={g}>{g}</li>)}</ul>
      <SH2 no={++no} id="not">{t.notTitle}</SH2>
      <p>{t.not}</p>
      <SH2 no={++no} id="how">{t.howTitle}</SH2>
      <p>{t.how}</p>

      <div className="s-links">
        <a href={L(`/contract-winners/${slug}`)}>{t.view} →</a>
      </div>
    </SimplePage>
  );
}

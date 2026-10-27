import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import "./community.css";
import { PRICING, SITE } from "@/lib/site";
import { getListCounts } from "@/lib/data/list-counts";
import { COMMUNITY_CAMPAIGNS, communitySignUpHref } from "@/lib/campaigns/community";
import { TRIAL_DAYS } from "@/lib/entitlement/trial";
import { setLangFrom } from "@/i18n/server";
import { localizePath } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";

export const revalidate = 3600;

const C = COMMUNITY_CAMPAIGNS.ejt;

/**
 * Unlisted landing page for members of the Everything Jewish Toronto Facebook
 * group (lib/campaigns/community). Not in the sitemap or any navigation,
 * noindex/nofollow. Unlisted, not private. English only: the group posts in
 * English, so /fr and /es send people to the English page.
 *
 * Every claim matches what the product does today (pricing page, sign-up
 * copy, lib/entitlement/trial). Registration is free for everyone; this page
 * doesn't pretend otherwise.
 */
export const metadata: Metadata = {
  title: { absolute: `Free registration for ${C.group} members · PMRFP` },
  description: "Contractors, landlords, property managers, suppliers and real estate pros: register on PMRFP free, no card needed.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

const WORK = [
  "A free company profile in the PMRFP directory, listed on your trade and city pages",
  "Show up when owners, managers and builders search for vendors",
  "A website badge that links to your profile",
  "The weekly tender digest for your trade",
  `Want full tender details and an email the morning a match posts? Trade Pro, free for ${TRIAL_DAYS} days, no card`,
];

const HIRE = [
  "Post repair, maintenance, renovation and sub-trade jobs at no cost",
  "Browse and shortlist trades by trade and city",
  "Keep your company private until you approve a trade",
  "Real estate pros: post pre-listing repairs, turnovers or portfolio work for your clients",
];

const STEPS = [
  { t: "Register with your email", d: "Pick who you are. We email you a sign-in link, so there's no password to remember." },
  { t: "List your business or post a job", d: "Choose your trades and the areas you work in, or describe the job and where it is." },
  { t: "Get connected", d: "Trades that match a job's category and region see it and can respond. Owners and managers browse the directory and shortlist." },
];

const FAQ = [
  {
    q: "Is registration really free?",
    a: `Yes. Registering, listing a business, posting jobs and browsing trades are free, with no card. Trade Pro is optional: $${PRICING.proAnnual} ${PRICING.currency} a year or $${PRICING.proMonthly} a month, and you can try it free for ${TRIAL_DAYS} days first (no card, one trial per company). You're only charged if you choose a paid plan at checkout.`,
  },
  {
    q: "Is this offer only for group members?",
    a: "Registering on PMRFP is free for everyone. This page is the group's own way in, shared only in the group. It isn't password protected, so it's fine to pass it to someone you'd recommend.",
  },
  {
    q: "Is this a Jewish business directory?",
    a: "No. PMRFP is open to every business and property owner. Nobody is asked about religion and profiles don't show it. This group is simply where we're inviting people first.",
  },
  {
    q: "Who should register?",
    a: "Contractors and trades, service companies, building material suppliers, landlords and property owners, property management companies, builders hiring subs, and real estate professionals.",
  },
  {
    q: "What happens after I register?",
    a: "We email you a sign-in link. Click it, add your company details or your first job, and you're in. New listings may be checked by our team before they appear in the directory.",
  },
  {
    q: "Does PMRFP guarantee work?",
    a: "No. PMRFP is where jobs get posted and businesses get found. We don't guarantee contracts, replies or revenue. You choose who you hire or work with, and checking insurance, licences and references is up to you.",
  },
];

export default async function CommunityWelcomePage({ params }: { params: Promise<object> }) {
  const lang = await setLangFrom(params);
  if (lang !== "en") redirect(localizePath(C.path, "en"));
  const ca = (await getListCounts().catch(() => null))?.CA ?? null;
  const L = (p: string) => localizePath(p, "en");
  const href = (role?: string) => L(communitySignUpHref("ejt", role));
  const num = (n: number) => formatNumber(n, "en");

  return (
    <div className="cm">
      <section className="cm-hero">
        <div className="cm-wrap cm-hero-in">
          <div>
            <div className="cm-eyebrow">For members of {C.group}</div>
            <h1 className="cm-h1">Keep good work <span>close to home.</span></h1>
            <p className="cm-lead">
              PMRFP is one board for property work. Landlords, owners and property managers post jobs free. Contractors, service companies and suppliers list free and get found. Members of the group can register free through this page.
            </p>
            <div className="cm-ctas">
              <a className="cm-btn mint" href={href()}>Register free</a>
              <a className="cm-btn ghost" href="#how">How it works</a>
            </div>
            <p className="cm-fine">No card. About two minutes. Start with just your email.</p>
          </div>
          <div className="cm-offer" aria-label="Your free registration">
            <div className="cm-offer-tag">Your free registration</div>
            <ul>
              <li>No card, no contract</li>
              <li>List your business or post a job at no cost</li>
              <li>Sign in with an emailed link, no password</li>
              <li>Optional Trade Pro trial: {TRIAL_DAYS} days free</li>
            </ul>
            {ca?.open != null && ca.open > 0 && (
              <div className="cm-live"><b>{num(ca.open)}</b> public tenders open in Canada right now{ca.closing7 ? <>, {num(ca.closing7)} closing this week</> : null}.</div>
            )}
          </div>
        </div>
      </section>

      <section className="cm-wrap cm-why">
        <div className="cm-why-img">
          <Image src="/images/photos/toronto-flatiron.webp" alt="" fill sizes="(max-width: 900px) 100vw, 420px" />
        </div>
        <div>
          <div className="cm-eyebrow ink">Why we're sharing it here</div>
          <h2 className="cm-h2">Most of us already hire on a recommendation.</h2>
          <p>
            The electrician a neighbour swears by. The property manager a friend from shul trusts. PMRFP makes those businesses easier to find, and makes it easier to send work their way.
          </p>
          <p>
            Everything costs more this year, and a bad hire costs the most. We can make the next good referral a little easier.
          </p>
        </div>
      </section>

      <section className="cm-wrap cm-paths" aria-label="Choose your path">
        <article className="cm-path">
          <div className="cm-eyebrow ink">I do the work</div>
          <h2 className="cm-h3">Contractors, trades, service companies and suppliers</h2>
          <ul className="cm-list">{WORK.map((x) => <li key={x}>{x}</li>)}</ul>
          <div className="cm-path-ctas">
            <a className="cm-btn navy" href={href("trade")}>Register my business free</a>
            <a className="cm-link" href={href("supplier")}>I&rsquo;m a building material supplier →</a>
          </div>
        </article>
        <article className="cm-path dark">
          <div className="cm-eyebrow mint">I need work done</div>
          <h2 className="cm-h3">Landlords, owners, property managers and real estate pros</h2>
          <ul className="cm-list">{HIRE.map((x) => <li key={x}>{x}</li>)}</ul>
          <div className="cm-path-ctas">
            <a className="cm-btn mint" href={href("landlord")}>I&rsquo;m a landlord or owner</a>
            <div className="cm-chips">
              <a href={href("property_manager")}>Property manager</a>
              <a href={href("real_estate_agent")}>Real estate pro</a>
              <a href={href("general_contractor")}>Builder hiring subs</a>
            </div>
          </div>
        </article>
      </section>

      <section id="how" className="cm-wrap cm-how">
        <div className="cm-eyebrow ink">How it works</div>
        <h2 className="cm-h2">Three steps.</h2>
        <ol className="cm-steps">
          {STEPS.map((s, i) => (
            <li key={s.t}>
              <span className="cm-no" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="cm-wrap cm-faq">
        <div className="cm-eyebrow ink">Questions</div>
        <h2 className="cm-h2">Before you register.</h2>
        <div className="cm-faq-list">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
        <p className="cm-contact">Something else? Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.</p>
      </section>

      <section className="cm-final">
        <div className="cm-wrap cm-final-in">
          <h2 className="cm-h2 light">Two minutes, no card. Let&rsquo;s get each other working.</h2>
          <a className="cm-btn mint lg" href={href()}>Register free</a>
          <p className="cm-indep">PMRFP is an independent platform. It isn&rsquo;t run by or affiliated with the {C.group} group.</p>
        </div>
      </section>
    </div>
  );
}

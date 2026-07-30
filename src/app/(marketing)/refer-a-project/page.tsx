import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  Mail,
  Trophy,
  Eye,
  Quote,
} from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { ReferProjectForm } from "@/components/forms/refer-project-form";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { REFERRAL, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: `Refer a Project — Public Credit + Top Connectors Leaderboard`,
  description: `Know someone with a property project? Refer it to ${SITE.name}. When the RFP goes live, you get public credit ("Introduced by [you]") and a spot on the Top Connectors leaderboard. For cash, refer a trade and earn $${REFERRAL.tradeFee}.`,
  alternates: { canonical: "/refer-a-project" },
};

const STEPS = [
  {
    icon: Mail,
    title: "Tell us about the project",
    desc: "Describe the work, location, and who the property contact is. Two minutes.",
  },
  {
    icon: Eye,
    title: "We structure and post the RFP",
    desc: `${SITE.name} drafts a clear scope and publishes the RFP to qualified Canadian trades.`,
  },
  {
    icon: Award,
    title: "Public credit + leaderboard placement",
    desc: `When the RFP goes live, "Introduced by [you]" appears on the listing and your name moves up the Top Connectors leaderboard. Recognition where the people you'd want to know are watching.`,
  },
];

const WHO = [
  {
    title: "Real estate agents",
    body: "Pre-listing repairs, post-sale turnovers, and seller-side capital recommendations.",
  },
  {
    title: "Mortgage brokers",
    body: "Pre-funding repairs flagged in the appraisal — without losing the deal.",
  },
  {
    title: "Real estate lawyers",
    body: "Estate cleanups, probate property work, and post-closing remediation.",
  },
  {
    title: "Insurance brokers",
    body: "Claims-related repair work where trade response speed matters.",
  },
  {
    title: "Property managers",
    body: "Peer PM referrals when scope is outside your bench, or you're booked.",
  },
  {
    title: "Anyone with a project",
    body: "Owners, neighbours, family — if you know about work that needs doing, refer it.",
  },
];

export default function ReferProjectPage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-border bg-indigo text-white">
        <Container className="py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_320px] lg:items-center">
            <div>
              <Eyebrow className="text-teal">Project referral · recognition lane</Eyebrow>
              <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
                Introduce a project.
                <br />
                <span className="text-teal-300">Get credit</span> when the RFP
                goes live.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-indigo-100/80">
                Know someone with a property project — pre-listing repairs,
                portfolio maintenance, capital work? Refer it to {SITE.name}.
                We&rsquo;ll help structure the RFP and publish it live. Your name appears on
                the listing as the connector who brought it, and you climb the Top Connectors
                leaderboard. Real visibility in the network you care about.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#refer-form"
                  className="inline-flex items-center gap-2 rounded-full bg-teal-300 px-5 py-2.5 text-sm font-semibold text-indigo transition-colors hover:bg-teal-300/90"
                >
                  Refer a project <ArrowRight className="size-4" />
                </a>
                <Link
                  href="/refer-a-trade"
                  className="inline-flex items-center px-3 py-2.5 text-sm font-medium text-indigo-100/80 transition-colors hover:text-white"
                >
                  Want cash? Refer a trade for $75 →
                </Link>
              </div>
            </div>

            {/* "the offer" card — recognition, not cash */}
            <div className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-teal-300 text-indigo">
                  <Trophy className="size-5" />
                </span>
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-teal-300">
                    What you get
                  </p>
                  <p className="text-xl font-semibold text-white">Public credit + leaderboard</p>
                </div>
              </div>
              <ul className="mt-5 space-y-2.5 text-sm text-indigo-100/85">
                <li>· &ldquo;Introduced by [you]&rdquo; on every live RFP you bring</li>
                <li>· climb the Top Connectors leaderboard at /refer/leaderboard</li>
                <li>· optional firm/affiliation shown alongside your name</li>
                <li>· monthly summary email of all your referred RFPs</li>
                <li>· no cap on referrals · no signup required</li>
              </ul>
              <p className="mt-5 border-t border-white/15 pt-4 text-xs text-indigo-100/65">
                Want cash? The{" "}
                <Link href="/refer-a-trade" className="font-semibold text-teal-300 hover:text-teal-300/80">
                  Refer a Trade lane pays $75
                </Link>
                {" "}per activated Pro subscription.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="bg-background">
        <Container className="py-16">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Three steps. No login. No catch.
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-teal-100 text-teal-ink">
                    <s.icon className="size-5" />
                  </span>
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Step {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* WHO REFERS */}
      <section className="border-t border-border bg-secondary/30">
        <Container className="py-16">
          <Eyebrow>Who refers projects</Eyebrow>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
            Built for the professionals who know about property work before anyone else.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WHO.map((w) => (
              <div key={w.title} className="rounded-lg border border-border bg-card p-5">
                <h3 className="text-base font-semibold">{w.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{w.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* WHY REFER (the value framing) */}
      <Container className="py-16">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Why refer</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Help your client. Get paid. Stay informed.
            </h2>
            <ul className="mt-6 space-y-4 text-base leading-relaxed text-foreground/85">
              <li className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-ink" />
                <span>
                  <strong className="text-foreground">Help your client first.</strong>{" "}
                  Their project gets competitive bids fast — better outcome, stronger relationship.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-ink" />
                <span>
                  <strong className="text-foreground">Get publicly credited.</strong>{" "}
                  &ldquo;Introduced by [you]&rdquo; shows on the live RFP — the connector tag
                  most professionals would pay for. Your name climbs the Top Connectors leaderboard.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-ink" />
                <span>
                  <strong className="text-foreground">No follow-up chasing.</strong>{" "}
                  Monthly summary email tells you where each referred project stands.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-ink" />
                <span>
                  <strong className="text-foreground">Keep it at arm&rsquo;s length.</strong>{" "}
                  An open posting several companies can respond to — vs. personally
                  vouching for &ldquo;a guy you know&rdquo; and owning the outcome.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-ink" />
                <span>
                  <strong className="text-foreground">Optional public credit.</strong>{" "}
                  &ldquo;Introduced by [you]&rdquo; on the RFP — visibility to the trades in your
                  area.
                </span>
              </li>
            </ul>
          </div>

          <div className="self-start rounded-2xl border border-border bg-card p-8">
            <Quote className="size-7 text-teal-ink" />
            <p className="mt-4 text-lg leading-relaxed text-foreground/90">
              The smart play for any professional who touches real estate but doesn&rsquo;t
              sell trades: be the person who knew how to get the work done. We handle the
              process. You get paid for the introduction.
            </p>
            <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">
              — The {SITE.name} team
            </p>
          </div>
        </div>
      </Container>

      {/* THE FORM */}
      <section id="refer-form" className="border-t border-border bg-secondary/30">
        <Container size="narrow" className="py-16">
          <Eyebrow>Refer a project</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Two minutes. Get credit when the RFP goes live.
          </h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
            Tell us about the project. If you have the property contact&rsquo;s details and
            permission to share, add them. If not, leave them blank and we&rsquo;ll work with
            you to make the introduction.
          </p>
          <div className="mt-8">
            <ReferProjectForm />
          </div>
          <div className="mt-10">
            <TrustDisclaimer
              text={`Project referrals earn public credit on the RFP + a spot on the Top Connectors leaderboard — not cash. The cash-paying lane is /refer-a-trade ($75 per activated Trade Pro subscription). PMRFP does not guarantee work or vendor selection. Trades and property contacts make their own decisions.`}
            />
          </div>
        </Container>
      </section>
    </>
  );
}

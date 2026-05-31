import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Banknote, Mail, HandCoins, Eye, Quote } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { ReferTradeForm } from "@/components/forms/refer-trade-form";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { PRICING, REFERRAL, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: `Refer a Trade — Earn $${REFERRAL.tradeFee} When They List`,
  description: `Know a Canadian commercial trade who'd benefit from being listed on ${SITE.name}? Refer them and earn $${REFERRAL.tradeFee} ${REFERRAL.currency} once they activate Trade Pro and stay active 90 days.`,
  alternates: { canonical: "/refer-a-trade" },
};

const STEPS = [
  {
    icon: Mail,
    title: "Tell us about the trade",
    desc: "Company name, location, what they do, and (if you have it) their contact. Two minutes.",
  },
  {
    icon: Eye,
    title: "We invite them to list",
    desc: `${SITE.name} reaches out, helps them set up a profile in the directory, and walks them through Trade Pro.`,
  },
  {
    icon: HandCoins,
    title: `$${REFERRAL.tradeFee} when it sticks`,
    desc: `Once the referred trade activates Trade Pro and stays active 90 days, your $${REFERRAL.tradeFee} ${REFERRAL.currency} is paid by e-transfer within 7 days. The 90-day window keeps the lane honest on both sides.`,
  },
];

const WHO = [
  {
    title: "Property managers",
    body: "Refer the trades you actually use. Strengthens your bench, gives them a paper trail, and pays you for the introduction.",
  },
  {
    title: "Other trades",
    body: "Refer peers in adjacent trades (HVAC ↔ electrical, roofing ↔ waterproofing). $75 per referred Pro sub adds up fast.",
  },
  {
    title: "Suppliers + distributors",
    body: "Your trade customers should be listed where commercial RFPs land. Refer them, earn the fee.",
  },
  {
    title: "Trade associations",
    body: "Bulk introduce your members. Each Pro activation pays $75. We can do co-marketing for membership lists.",
  },
  {
    title: "Industry consultants",
    body: "You know who's growing and who's hiring. Steer them to PMRFP for visibility, earn on every list.",
  },
  {
    title: "Anyone who knows a good trade",
    body: "Family contractor? Neighbour's roofer? If they do commercial work in Canada, refer them.",
  },
];

export default function ReferTradePage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-border bg-indigo text-white">
        <Container className="py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_320px] lg:items-center">
            <div>
              <Eyebrow className="text-teal">Trade referral · direct-revenue lane</Eyebrow>
              <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
                Refer a trade.
                <br />
                <span className="text-teal-300">Earn ${REFERRAL.tradeFee}</span> when they list.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-indigo-100/80">
                Know a Canadian commercial trade or service company that should be listed on{" "}
                {SITE.name}? Refer them. Once they activate Trade Pro and stay on for 90 days,
                you earn a ${REFERRAL.tradeFee} {REFERRAL.currency} finder&rsquo;s fee by e-transfer.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#refer-form"
                  className="inline-flex items-center gap-2 rounded-full bg-teal-300 px-5 py-2.5 text-sm font-semibold text-indigo transition-colors hover:bg-teal-300/90"
                >
                  Refer a trade <ArrowRight className="size-4" />
                </a>
                <Link
                  href="/refer-a-project"
                  className="inline-flex items-center px-3 py-2.5 text-sm font-medium text-indigo-100/80 transition-colors hover:text-white"
                >
                  Have a project instead? Refer that for $25 →
                </Link>
              </div>
            </div>

            {/* offer card */}
            <div className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-teal-300 text-indigo">
                  <Banknote className="size-5" />
                </span>
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-teal-300">
                    Finder&rsquo;s fee
                  </p>
                  <p className="text-2xl font-semibold text-white">
                    ${REFERRAL.tradeFee} {REFERRAL.currency}
                  </p>
                </div>
              </div>
              <ul className="mt-5 space-y-2.5 text-sm text-indigo-100/85">
                <li>· $75 cash per referred Trade Pro sub</li>
                <li>· paid once they&rsquo;ve stayed active 90 days</li>
                <li>· then by e-transfer within 7 days</li>
                <li>· no cap on referrals · no signup required</li>
              </ul>
            </div>
          </div>
        </Container>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-background">
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
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* WHO REFERS */}
      <section className="border-t border-border bg-secondary/30">
        <Container className="py-16">
          <Eyebrow>Who refers trades</Eyebrow>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
            Anyone who knows a Canadian trade doing commercial work.
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

      {/* WHY HIGHER FEE */}
      <Container className="py-16">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Why this lane pays cash and the project lane doesn&rsquo;t</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Honest math. Cash where revenue flows, recognition where it doesn&rsquo;t.
            </h2>
            <ul className="mt-6 space-y-4 text-base leading-relaxed text-foreground/85">
              <li className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-ink" />
                <span>
                  <strong className="text-foreground">A new Trade Pro subscription is ${PRICING.proAnnual}/yr (or ${PRICING.proMonthly}/mo)</strong> in direct revenue to {SITE.name}. Paying $
                  {REFERRAL.tradeFee} to the referrer beats almost any paid acquisition channel — and the 90-day hold means the revenue has cleared before the fee goes out.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-ink" />
                <span>
                  <strong className="text-foreground">Project referrals create inventory but not direct revenue,</strong>{" "}
                  so we reward those with public credit on the RFP + a Top Connectors leaderboard
                  spot — real visibility, not cash.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-ink" />
                <span>
                  <strong className="text-foreground">No cap on referrals.</strong>{" "}
                  Refer 1, refer 50 — same per-referral fee. PM firms with 30+ vendors in their bench can
                  generate real income just by introducing the ones who&rsquo;d benefit most.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-ink" />
                <span>
                  <strong className="text-foreground">Paid clean.</strong>{" "}
                  Once the referred trade hits 90 days active, your e-transfer goes out within 7 days. No quarterly-payout runaround.
                </span>
              </li>
            </ul>
          </div>

          <div className="self-start rounded-2xl border border-border bg-card p-8">
            <Quote className="size-7 text-teal-ink" />
            <p className="mt-4 text-lg leading-relaxed text-foreground/90">
              The honest deal: we make money when trades subscribe. So we pay you to bring them
              the trades worth subscribing. Higher fee, faster payout, direct line.
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
          <Eyebrow>Refer a trade</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Two minutes. Earn ${REFERRAL.tradeFee} when they list.
          </h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
            Tell us about the trade. If you have their contact details and permission to share,
            add them. If not, leave blank and we&rsquo;ll work with you to make the introduction.
          </p>
          <div className="mt-8">
            <ReferTradeForm />
          </div>
          <div className="mt-10">
            <TrustDisclaimer
              text={`Finder's fees are paid after the referred trade activates Trade Pro and remains active for 90 days (annual at $${PRICING.proAnnual}/yr or monthly at $${PRICING.proMonthly}/mo). PMRFP does not guarantee that any referred trade will subscribe or remain subscribed.`}
            />
          </div>
        </Container>
      </section>
    </>
  );
}

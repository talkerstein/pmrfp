/**
 * /refer — top-level hub. Two-lane referral program splash. Most banners
 * across the site point here; users pick the lane that fits.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Banknote, HardHat, FileText, Trophy } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { PRICING, REFERRAL, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: `Refer to ${SITE.name} — Earn $${REFERRAL.tradeFee} (Trade) or Get Credit (Project)`,
  description: `Two referral lanes. Refer a trade and earn $${REFERRAL.tradeFee} cash when they activate Trade Pro. Refer a project and earn public credit on the RFP + a spot on the Top Connectors leaderboard.`,
  alternates: { canonical: "/refer" },
};

export default function ReferHubPage() {
  return (
    <section className="border-b border-border bg-indigo text-white">
      <Container className="py-20 sm:py-24">
        <Eyebrow className="text-teal">Referral program</Eyebrow>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          Two lanes.{" "}
          <span className="text-teal-300">${REFERRAL.tradeFee} cash</span> for trades. Public
          credit for projects.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-indigo-100/80">
          Both lanes trigger when the LISTING happens. The cash lane (trade) pays where the
          revenue is. The credit lane (project) pays in visibility — your name on every RFP
          you bring, plus a spot on the Top Connectors leaderboard.
        </p>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {/* TRADE LANE — direct revenue */}
          <Link
            href="/refer-a-trade"
            className="group relative overflow-hidden rounded-2xl border border-teal-300 bg-white/5 p-8 transition-colors hover:bg-white/10"
          >
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-teal-300 text-indigo">
                <HardHat className="size-6" />
              </span>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-teal-300">
                  Direct-revenue lane
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-white">Refer a Trade</h2>
                <p className="mt-1 text-3xl font-semibold text-teal-300">
                  ${REFERRAL.tradeFee} {REFERRAL.currency}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-indigo-100/85">
                  Refer a Canadian trade or service company. Fee paid when they activate Trade
                  Pro (${PRICING.proAnnual}/yr). E-transfer within 7 days.
                </p>
                <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-300">
                  Refer a trade <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </p>
              </div>
            </div>
          </Link>

          {/* PROJECT LANE — credit / status */}
          <Link
            href="/refer-a-project"
            className="group relative overflow-hidden rounded-2xl border border-white/20 bg-white/5 p-8 transition-colors hover:bg-white/10"
          >
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                <Trophy className="size-6" />
              </span>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-indigo-100/70">
                  Recognition lane
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-white">Refer a Project</h2>
                <p className="mt-1 text-xl font-semibold text-white">
                  Public credit + leaderboard
                </p>
                <p className="mt-3 text-sm leading-relaxed text-indigo-100/85">
                  Refer a property project (pre-listing repairs, maintenance, capital work).
                  When the RFP goes live, your name appears on the listing as the connector and
                  you climb the Top Connectors leaderboard. No cash, just real visibility.
                </p>
                <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                  Refer a project <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </p>
              </div>
            </div>
          </Link>
        </div>

        <div className="mt-12 flex items-start gap-4 rounded-xl border border-white/15 bg-white/5 p-5">
          <Banknote className="mt-0.5 size-5 shrink-0 text-teal-300" />
          <p className="text-sm leading-relaxed text-indigo-100/80">
            <strong className="text-white">Why two lanes:</strong> Trade subscriptions are PMRFP&rsquo;s
            direct revenue, so the trade lane pays cash. Project referrals create the inventory
            that retains paying trades — real value, but indirect — so we reward those in
            recognition (public credit + leaderboard) rather than cash. Both fire when the
            listing happens; both are no-cap; both have no signup required. The reference visible
            on the live RFP is the most valuable thing your name can sit next to in this network.
          </p>
        </div>

        {/* trophy ghost — referenced by an icon import already */}
        <FileText className="hidden" />
      </Container>
    </section>
  );
}

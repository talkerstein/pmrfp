/**
 * /refer — top-level hub. Two-lane referral program splash. Most banners
 * across the site point here; users pick the lane that fits.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Banknote, HardHat, FileText } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { PRICING, REFERRAL, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: `Refer to ${SITE.name} — Earn up to $${REFERRAL.maxFee} per Referral`,
  description: `Two referral lanes: refer a trade and earn $${REFERRAL.tradeFee} when they activate Trade Pro, OR refer a project and earn $${REFERRAL.projectFee} when the RFP goes live. Paid by e-transfer.`,
  alternates: { canonical: "/refer" },
};

export default function ReferHubPage() {
  return (
    <section className="border-b border-border bg-indigo text-white">
      <Container className="py-20 sm:py-24">
        <Eyebrow className="text-teal">Referral program</Eyebrow>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          Two lanes. Up to{" "}
          <span className="text-teal-300">${REFERRAL.maxFee}</span> per referral. Both trigger
          on listing.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-indigo-100/80">
          The fee fires when the LISTING happens — when a trade activates Trade Pro, or when a
          project goes live as an RFP — not on downstream events. Direct, fast payout.
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

          {/* PROJECT LANE — inventory */}
          <Link
            href="/refer-a-project"
            className="group relative overflow-hidden rounded-2xl border border-white/20 bg-white/5 p-8 transition-colors hover:bg-white/10"
          >
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                <FileText className="size-6" />
              </span>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-indigo-100/70">
                  Inventory lane
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-white">Refer a Project</h2>
                <p className="mt-1 text-3xl font-semibold text-white">
                  ${REFERRAL.projectFee} {REFERRAL.currency}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-indigo-100/85">
                  Refer a property project (pre-listing repairs, maintenance, capital work). Fee
                  paid when the RFP goes live on {SITE.name}. E-transfer within 7 days.
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
            direct revenue, so that lane pays more. Project referrals create the inventory that
            keeps paying trades subscribed — valuable, paid proportionally. Both fire when the
            listing happens; both are no-cap; both pay by e-transfer within 7 days.
          </p>
        </div>
      </Container>
    </section>
  );
}

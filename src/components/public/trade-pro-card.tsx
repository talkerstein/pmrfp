"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRICING, SITE } from "@/lib/site";

const FEATURES = [
  "Full company profile",
  "Directory listing",
  "Full RFP access",
  "Save opportunities",
  "Express interest",
  "Matching alerts",
  "Priority placement",
  "Verified vendor badge for your website",
];

export function TradeProCard({ monthlyEnabled = true }: { monthlyEnabled?: boolean }) {
  const [interval, setInterval] = useState<"annual" | "monthly">("annual");
  const isAnnual = interval === "annual" || !monthlyEnabled;

  const annualEffective = PRICING.proMonthly * 12;
  const savings = annualEffective - PRICING.proAnnual;

  // Both intervals route to /sign-up; trade picks final interval on /dashboard/billing
  // after onboarding (keeps signup flow simple, both plans visible at activation).

  return (
    <div className="relative flex h-full flex-col rounded-xl border border-teal-400 bg-card p-8 ring-2 ring-teal-400">
      <span className="absolute -top-3 left-8 inline-flex items-center gap-1.5 rounded-full bg-teal-500 px-3 py-1 text-xs font-semibold text-white">
        <Sparkles className="size-3.5" />
        Most popular
      </span>
      <h2 className="text-lg font-semibold text-foreground">Trade Pro</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Full RFP access and everything you need to win commercial work.
      </p>

      {/* Interval toggle — hidden until monthly price is configured in Stripe */}
      {monthlyEnabled && (
        <div
          role="tablist"
          aria-label="Billing interval"
          className="mt-5 inline-flex self-start rounded-full border border-border bg-background p-1"
        >
          <button
            role="tab"
            aria-selected={isAnnual}
            onClick={() => setInterval("annual")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition",
              isAnnual
                ? "bg-indigo text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Annual · save ${savings}
          </button>
          <button
            role="tab"
            aria-selected={!isAnnual}
            onClick={() => setInterval("monthly")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition",
              !isAnnual
                ? "bg-indigo text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Monthly
          </button>
        </div>
      )}

      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-4xl font-semibold text-foreground">
          ${isAnnual ? PRICING.proAnnual : PRICING.proMonthly}
        </span>
        <span className="text-sm text-muted-foreground">
          {PRICING.currency}/{isAnnual ? "year" : "month"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {isAnnual
          ? `~$${(PRICING.proAnnual / 12).toFixed(0)}/mo billed annually`
          : `$${annualEffective}/yr if held all year — switch to annual any time to save $${savings}`}
      </p>

      <ul className="mt-6 flex-1 space-y-3">
        {FEATURES.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-foreground">
            <Check className="mt-0.5 size-4 shrink-0 text-teal-600" />
            {f}
          </li>
        ))}
      </ul>
      <Link
        href="/sign-up"
        className={cn(buttonVariants({ size: "lg" }), "mt-8 w-full")}
      >
        Join {SITE.name}
      </Link>
    </div>
  );
}

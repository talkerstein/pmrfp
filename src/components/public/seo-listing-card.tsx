"use client";

import Link from "next/link";
import { useState } from "react";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRICING } from "@/lib/site";

const FEATURES = [
  "Listed on your trade + city pages",
  "Unlimited project photo gallery",
  "Case studies featured on your profile",
  "Google rating displayed on your profile",
  "Priority over free listings",
];

export function SeoListingCard({ monthlyEnabled = true }: { monthlyEnabled?: boolean }) {
  const [interval, setInterval] = useState<"annual" | "monthly">("annual");
  const isAnnual = interval === "annual" || !monthlyEnabled;

  const annualEffective = PRICING.seoMonthly * 12;
  const savings = annualEffective - PRICING.seoAnnual;

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-8">
      <h2 className="text-lg font-semibold text-foreground">SEO Listing</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Get found where property managers actually search — no RFP access.
      </p>

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
              isAnnual ? "bg-indigo text-white" : "text-muted-foreground hover:text-foreground",
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
              !isAnnual ? "bg-indigo text-white" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Monthly
          </button>
        </div>
      )}

      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-4xl font-semibold text-foreground">
          ${isAnnual ? PRICING.seoAnnual : PRICING.seoMonthly}
        </span>
        <span className="text-sm text-muted-foreground">
          {PRICING.currency}/{isAnnual ? "year" : "month"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {isAnnual
          ? `~$${(PRICING.seoAnnual / 12).toFixed(2)}/mo billed annually`
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
        href={signUpHrefForPlan("seo", isAnnual ? "annual" : "monthly")}
        className={cn(buttonVariants({ size: "lg", variant: "outline" }), "mt-8 w-full")}
      >
        Get an SEO Listing
      </Link>
    </div>
  );
}

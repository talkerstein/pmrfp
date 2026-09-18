"use client";

/**
 * Founding-region notice + inline waitlist capture.
 *
 * Shown wherever a region has insufficient liquidity (RFP board, directory,
 * region page, post-RFP confirmation) so demand is captured honestly instead of
 * dropped into an empty marketplace. Embeds the regional waitlist form, which
 * calls joinRegionalWaitlistAction (persists now; GHL lights up later).
 */
import { useActionState } from "react";
import Link from "next/link";
import { joinRegionalWaitlistAction, type WaitlistActionState } from "@/lib/waitlist/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type WaitlistReason =
  | "founding_region_rfp"
  | "no_supply_directory"
  | "region_request"
  | "early_access";

interface NoticeCopy {
  eyebrow: string;
  title: string;
  body: string;
}

function copyFor(regionName: string, reason: WaitlistReason): NoticeCopy {
  switch (reason) {
    case "region_request":
      return {
        eyebrow: "Founding region",
        title: `We don't cover ${regionName} yet`,
        body: `Add yourself and we'll prioritize building trade coverage in ${regionName} — you'll be the first to know when it opens.`,
      };
    case "no_supply_directory":
      return {
        eyebrow: "Founding region",
        title: `We're building our trade network in ${regionName}`,
        body: `${regionName} is a founding region — we're recruiting commercial trades here now. Join the list and we'll alert you the moment there's coverage.`,
      };
    case "founding_region_rfp":
      return {
        eyebrow: "Founding region",
        title: `${regionName} is just getting started`,
        body: `Your RFP is live, but we're still recruiting trades in ${regionName}. We'll notify you the moment matching trades join — and your listing is ready for them.`,
      };
    default:
      return {
        eyebrow: "Early access",
        title: `Be first in ${regionName}`,
        body: `Join the list and we'll email you as PMRFP activity grows in ${regionName}.`,
      };
  }
}

export interface FoundingRegionNoticeProps {
  regionName: string;
  regionSlug?: string;
  reason?: WaitlistReason;
  role?: string;
  requestedRegionText?: string;
  province?: string;
  country?: string;
  /** Show the "know a trade here? refer them" CTA (default true). */
  showReferralCta?: boolean;
  className?: string;
}

export function FoundingRegionNotice({
  regionName,
  regionSlug,
  reason = "no_supply_directory",
  role,
  requestedRegionText,
  province,
  country,
  showReferralCta = true,
  className,
}: FoundingRegionNoticeProps) {
  const c = copyFor(regionName, reason);
  return (
    <div
      className={`rounded-2xl border border-teal-300 bg-teal-100/30 p-6 sm:p-8 ${className ?? ""}`}
    >
      <p className="font-mono text-[12.5px] uppercase tracking-[0.18em] text-teal-ink">
        {c.eyebrow}
      </p>
      <h3 className="mt-2 text-xl font-semibold text-foreground">{c.title}</h3>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-foreground/80">{c.body}</p>

      <div className="mt-5">
        <RegionalWaitlistForm
          regionSlug={regionSlug}
          role={role}
          reason={reason}
          requestedRegionText={requestedRegionText}
          province={province}
          country={country}
        />
      </div>

      {showReferralCta && (
        <p className="mt-4 text-sm text-foreground/75">
          Know a great commercial trade in {regionName}?{" "}
          <Link
            href="/refer-a-trade"
            className="font-medium text-teal-ink underline underline-offset-2"
          >
            Refer them to Trade Pro and earn up to $75
          </Link>{" "}
          when they subscribe — it&apos;s how founding regions get built.
        </p>
      )}
    </div>
  );
}

export interface RegionalWaitlistFormProps {
  regionSlug?: string;
  role?: string;
  reason?: WaitlistReason;
  requestedRegionText?: string;
  province?: string;
  country?: string;
  buttonLabel?: string;
}

export function RegionalWaitlistForm({
  regionSlug,
  role,
  reason = "early_access",
  requestedRegionText,
  province,
  country,
  buttonLabel = "Join the list",
}: RegionalWaitlistFormProps) {
  const [state, action, pending] = useActionState(
    joinRegionalWaitlistAction,
    {} as WaitlistActionState,
  );

  if (state.success) {
    return (
      <p className="rounded-md bg-teal-100/60 px-3 py-2 text-sm font-medium text-teal-ink">
        {state.success}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2">
      {/* Honeypot */}
      <input
        type="text"
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />
      {regionSlug && <input type="hidden" name="regionSlug" value={regionSlug} />}
      {role && <input type="hidden" name="role" value={role} />}
      <input type="hidden" name="reason" value={reason} />
      {requestedRegionText && (
        <input type="hidden" name="requestedRegionText" value={requestedRegionText} />
      )}
      {province && <input type="hidden" name="province" value={province} />}
      {country && <input type="hidden" name="country" value={country} />}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="email"
          type="email"
          required
          aria-label="Email address"
          placeholder="you@company.com"
          className="sm:max-w-xs"
        />
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Adding…" : buttonLabel}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">{state.error}</p>
      )}
    </form>
  );
}

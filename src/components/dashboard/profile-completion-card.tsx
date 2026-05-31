/**
 * Trade-dashboard profile-completion card. Single prominent component that
 * replaces the previous trio (stat-card + checklist + recommended-action).
 *
 * Computes the score fresh from the org snapshot so it always reflects the
 * latest state — the persisted organizations.profile_completion_score may be
 * stale between a save and the next dashboard hit. Score weights match the
 * checklist below for one-to-one mental mapping.
 *
 * Used on /dashboard/page.tsx. Visual treatment: indigo progress bar, no
 * animation, single prominent next-step nudge.
 */
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import type { Organization } from "@/types/db";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  label: string;
  done: boolean;
  /** Where the user goes to fix this. */
  href: string;
  /** Priority — higher = surfaced first when this item is the next step. */
  weight: number;
}

export function ProfileCompletionCard({
  org,
  hasActiveSub,
}: {
  org: Organization | null;
  hasActiveSub: boolean;
}) {
  const checklist: ChecklistItem[] = [
    { label: "Add a company logo", done: Boolean(org?.logo_url), href: "/dashboard/company", weight: 10 },
    { label: "Write a short description", done: Boolean(org?.short_description), href: "/dashboard/company", weight: 9 },
    { label: "Write a full description", done: Boolean(org?.full_description), href: "/dashboard/company", weight: 6 },
    { label: "Add your website", done: Boolean(org?.website), href: "/dashboard/company", weight: 7 },
    { label: "Add a phone number", done: Boolean(org?.phone), href: "/dashboard/company", weight: 5 },
    { label: "Confirm your service city", done: Boolean(org?.city), href: "/dashboard/company", weight: 4 },
    { label: "Confirm insurance status", done: Boolean(org?.insurance_status), href: "/dashboard/company", weight: 8 },
    { label: "Confirm WSIB / provincial coverage", done: Boolean(org?.wsib_status), href: "/dashboard/company", weight: 6 },
    { label: "Set team size", done: Boolean(org?.employee_count_range), href: "/dashboard/company", weight: 3 },
    { label: "Activate Trade Pro membership", done: hasActiveSub, href: "/dashboard/billing", weight: 10 },
  ];

  const completed = checklist.filter((c) => c.done).length;
  const pct = Math.round((completed / checklist.length) * 100);

  // The recommended next step = highest-weight incomplete item.
  const nextStep = [...checklist]
    .filter((c) => !c.done)
    .sort((a, b) => b.weight - a.weight)[0];

  // The next checklist item to surface visually (top 6 — keep the card compact).
  const compactList = checklist.slice(0, 6);

  return (
    <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <p className="eyebrow text-teal-ink">
            <span className="mr-2 inline-block h-px w-5 align-middle bg-teal-500" />
            Profile completion
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">{pct}%</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {completed} of {checklist.length} steps complete
        </p>
      </div>

      {/* Progress bar — indigo fill, no animation, single neutral track. */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full transition-[width] duration-500",
            pct === 100 ? "bg-success" : "bg-indigo",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {nextStep ? (
        <div className="mt-6 flex flex-col gap-3 rounded-lg border border-teal-300/60 bg-teal-100/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-teal-ink">
              Recommended next step
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{nextStep.label}</p>
          </div>
          <Link
            href={nextStep.href}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-indigo px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Do it now <ArrowRight className="size-4" />
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-success/30 bg-success/10 p-4">
          <p className="text-sm font-semibold text-success">
            Your profile is complete. You&rsquo;ll rank higher in the directory.
          </p>
          <Link
            href="/dashboard/rfps"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-teal-ink"
          >
            Browse RFPs <ArrowRight className="size-4" />
          </Link>
        </div>
      )}

      <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
        {compactList.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 text-sm">
            {item.done ? (
              <CheckCircle2 className="size-4 shrink-0 text-success" />
            ) : (
              <Circle className="size-4 shrink-0 text-muted-foreground" />
            )}
            <Link
              href={item.href}
              className={cn(
                "truncate transition-colors",
                item.done
                  ? "text-muted-foreground"
                  : "text-foreground hover:text-teal-ink",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>

      {compactList.length < checklist.length && (
        <p className="mt-3 text-xs text-muted-foreground">
          + {checklist.length - compactList.length} more steps on{" "}
          <Link href="/dashboard/company" className="font-medium text-teal-ink hover:underline">
            Company Profile
          </Link>
        </p>
      )}
    </div>
  );
}

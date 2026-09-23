import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Lock, MinusCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { bidCheckRows, type BidCheck } from "@/lib/bid-check/schema";
import { cn } from "@/lib/utils";

/**
 * "Can my company bid?" on an open RFP. The plain-English summary is free for
 * everyone (for French SEAO notices it's the only English version a Toronto or
 * U.S. contractor can read). Trade Pro members see what the notice states,
 * watch-outs, and — honestly, in one line — what it doesn't state.
 */
export function BidChecklist({
  check,
  locked,
  proHref,
  translated = false,
}: {
  check: BidCheck;
  locked: boolean;
  proHref: string;
  /** The source notice is in French (SEAO): say the summary is a translation. */
  translated?: boolean;
}) {
  const rows = bidCheckRows(check);
  const stated = rows.filter((r) => r.state !== "unknown");
  const unstated = rows.filter((r) => r.state === "unknown");

  return (
    <section className="rounded-2xl border border-teal-300/60 bg-teal-50/40 p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ClipboardCheck className="size-5 text-teal-700" /> Can my company bid?
      </h2>
      <p className="mt-3 leading-relaxed text-foreground">{check.plainSummary}</p>
      {translated && <p className="mt-1 text-xs text-muted-foreground">Summarized in English from the French notice.</p>}

      {locked ? (
        <div className="mt-5 rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Lock className="size-4 text-teal-700" />
            {stated.length > 0
              ? `The notice states ${stated.length} of ${rows.length} bid requirements: ${stated.map((r) => r.label.toLowerCase()).join(", ")}.`
              : "See which bid requirements this notice states, and which it leaves to the documents."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Trade Pro shows the full checklist and watch-outs on every tender, so you can skip the ones you can&apos;t bid.
          </p>
          <Link href={proHref} className={cn(buttonVariants({ size: "sm" }), "mt-3")}>
            See the bid checklist with Trade Pro
          </Link>
        </div>
      ) : (
        <>
          {stated.length > 0 && (
            <dl className="mt-5 divide-y divide-border rounded-xl border border-border bg-card">
              {stated.map((r) => (
                <div key={r.key} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[190px_1fr]">
                  <dt className="flex items-center gap-2 font-medium">
                    {r.state === "yes" ? (
                      <CheckCircle2 className="size-4 shrink-0 text-teal-700" />
                    ) : (
                      <MinusCircle className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    {r.label}
                  </dt>
                  <dd className="text-muted-foreground">{r.value || (r.state === "no" ? "Not required" : "Required")}</dd>
                </div>
              ))}
            </dl>
          )}
          {unstated.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              <strong className="font-medium text-foreground">Not stated in the notice:</strong>{" "}
              {unstated.map((r) => r.label.toLowerCase()).join(", ")}. Check the solicitation documents before you price it.
            </p>
          )}
          {check.watchOuts.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-sm">
              {check.watchOuts.map((w) => (
                <li key={w} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Read from the notice text by AI. Confirm every requirement in the official solicitation documents before you bid.
      </p>
    </section>
  );
}

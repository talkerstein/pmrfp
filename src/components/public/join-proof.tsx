import { Check, Flame } from "lucide-react";
import type { JoinProof as Proof } from "@/lib/data/join-proof";
import { closingLabel, compactDollars, daysUntil } from "@/lib/data/fomo";

type Audience = "trade" | "buyer";

const FREE_FOR_TRADES = [
  "A company profile in the trade directory",
  "A website badge that links to your profile",
  "The weekly tender digest for your trade",
];

const BUYER_STEPS = [
  ["Describe the job", "Or let the free RFP writer draft it: scope, insurance and WSIB requirements, bid scoring."],
  ["Trades in that trade see it", "Local trades who cover your area get it in their morning email."],
  ["Compare who responds", "Profiles, photos of past work and reviews, side by side. You pick."],
] as const;

/**
 * The sign-up page's "why join" panel: live board numbers and real listings
 * for trades; how posting works for property managers, GCs and realtors.
 */
export function JoinProof({ proof, audience }: { proof: Proof; audience: Audience }) {
  return (
    <aside className="grid-tex relative overflow-hidden rounded-2xl bg-indigo p-7 text-white [--grid-color:rgba(145,242,207,0.06)] sm:p-9">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(145,242,207,.16), transparent 62%)" }}
      />
      <div className="relative">
        <p className="inline-flex items-center gap-2.5 text-sm text-indigo-100">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full rounded-full bg-teal-300 opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-teal-300" />
          </span>
          Live on the board right now
        </p>

        {audience === "trade" ? (
          <>
            <div className="mt-6 grid grid-cols-2 gap-6">
              <Stat value={String(proof.open)} label="contracts open for bids" accent />
              {proof.awardedValue > 0 && (
                <Stat value={compactDollars(proof.awardedValue)} label={`awarded in ${proof.pastContracts} public contracts`} />
              )}
            </div>
            {proof.rows.length > 0 && (
              <ul className="mt-8 space-y-2.5">
                {proof.rows.map((r, i) => {
                  const soon = closingLabel(daysUntil(r.deadline));
                  return (
                    <li
                      key={r.slug}
                      className="animate-rise rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3"
                      style={{ animationDelay: `${120 + i * 90}ms` }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[11px] uppercase tracking-wide text-teal-300">
                          {r.categories[0]} · {r.regionName ?? "Canada"}
                        </span>
                        {soon && (
                          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-amber-200">
                            <Flame className="size-3" /> {soon}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 line-clamp-1 text-[15px] font-medium text-white">{r.title}</div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-8 border-t border-white/10 pt-6">
              <p className="font-semibold">Free to join, no card needed</p>
              <ul className="mt-3 space-y-2 text-sm text-indigo-100/85">
                {FREE_FOR_TRADES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-teal-300" strokeWidth={3} />
                    {f}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-indigo-100/65">
                Upgrade to Trade Pro any time for the full scope, documents and buyer contact, and an email the
                morning every match posts.
              </p>
            </div>
          </>
        ) : (
          <>
            <h2 className="mt-5 text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Post free. Qualified trades come to you.
            </h2>
            <ol className="mt-7 space-y-5">
              {BUYER_STEPS.map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-teal-300/40 font-mono text-sm text-teal-300">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold">{title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-indigo-100/75">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex items-baseline gap-3 border-t border-white/10 pt-6">
              <span className="font-heading text-4xl font-extrabold tracking-tight text-teal-300">{proof.open}</span>
              <span className="text-sm text-indigo-100/75">contracts on the board today. Posting is free for buyers, always.</span>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div>
      <div className={`font-heading text-4xl font-extrabold tracking-tight sm:text-5xl ${accent ? "text-teal-300" : "text-white"}`}>
        {value}
      </div>
      <div className="mt-1.5 text-sm leading-snug text-indigo-100/75">{label}</div>
    </div>
  );
}

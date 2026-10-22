import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { setLangFrom } from "@/i18n/server";
import { isEnabledLocale, type Locale } from "@/i18n/config";
import { STEPS, STEP_LABEL, isBadgeStep, isStepId, lifecycleEnabled, lifecycleMaxPerDay, lifecycleStartAt, type StepId } from "@/lib/lifecycle/config";
import { listStalledSignups, previewEmail, runLifecycle, type MemberPlan, type RunReport, type StalledRow } from "@/lib/lifecycle/server";
import { nextSendWindow } from "@/lib/lifecycle/timezone";
import { badgeRewardEnabled } from "@/lib/badge/reward";
import { stallCounts, STAGE_LABEL } from "@/lib/onboarding/steps";
import { CopyTextButton } from "@/components/admin/copy-text-button";
import { sendLifecycleTestAction } from "@/lib/lifecycle/actions";
import type { Persona } from "@/lib/lifecycle/persona";

export const metadata: Metadata = { title: "Lifecycle emails · Admin · PMRFP" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | undefined>>;

interface SendRow {
  step: string;
  status: string;
  opened_at: string | null;
  clicked_at: string | null;
}

const PERSONAS: Persona[] = ["specialty", "recurring", "subtrade"];
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const age = (h: number) => (h < 48 ? `${h}h` : `${Math.round(h / 24)}d`);

/**
 * Admin: the lifecycle sequence (lib/lifecycle). Funnel per step from
 * lifecycle_sends (opens / clicks only when Resend tracking is on), a dry
 * run of the next cron (who would get what, nothing sent or written), and a
 * preview of every template in en / fr / es with sample data, plus "send a
 * test to me". The switch is LIFECYCLE_EMAILS_ENABLED.
 */
export default async function LifecycleAdminPage({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const sp = await searchParams;
  const demo = isDemoMode() || !isServiceConfigured();
  const enabled = lifecycleEnabled();

  const step: StepId = isStepId(sp.step) ? sp.step : "welcome";
  const lang: Locale = isEnabledLocale(sp.lang) ? sp.lang : "en";
  const country = sp.country === "US" ? "US" : "CA";
  const persona: Persona = PERSONAS.find((p) => p === sp.persona) ?? "specialty";
  // Badge emails: the reward line follows the live flag unless the admin flips it; "website=0" previews a company with no website.
  const rewardFlag = badgeRewardEnabled();
  const rewardShown = sp.reward === "1" ? true : sp.reward === "0" ? false : rewardFlag;
  const hasWebsite = sp.website !== "0";
  const preview = previewEmail(step, lang, country, "preview-user", persona, { reward: rewardShown, website: hasWebsite });
  const qs = (o: Record<string, string>) =>
    `?${new URLSearchParams({ step, lang, country, persona, ...(sp.reward ? { reward: sp.reward } : {}), ...(sp.website ? { website: sp.website } : {}), ...o }).toString()}`;
  const startAt = lifecycleStartAt();
  const maxPerDay = lifecycleMaxPerDay();
  const atWindow = sp.asof === "window";

  let rows: SendRow[] = [];
  let missing = false;
  if (!demo) {
    const { data, error } = await createServiceClient()
      .from("lifecycle_sends")
      .select("step,status,opened_at,clicked_at")
      .order("sent_at", { ascending: false })
      .limit(20_000)
      .returns<SendRow[]>();
    missing = Boolean(error);
    rows = data ?? [];
  }
  const funnel = STEPS.map((s) => {
    const r = rows.filter((x) => x.step === s);
    const sent = r.filter((x) => x.status === "sent");
    return {
      step: s,
      sent: sent.length,
      skipped: r.filter((x) => x.status === "skipped").length,
      failed: r.filter((x) => x.status === "failed" || x.status === "sending").length,
      opened: sent.filter((x) => x.opened_at).length,
      clicked: sent.filter((x) => x.clicked_at).length,
    };
  });
  const tracked = funnel.some((f) => f.opened || f.clicked);

  let stalled: StalledRow[] = [];
  let stalledError: string | null = null;
  if (!demo) ({ rows: stalled, error: stalledError } = await listStalledSignups());
  const stalls = stallCounts(stalled.map((r) => r.stage));

  let dry: RunReport | null = null;
  // "asof=window": as if the cron ran at the next 13:00 Eastern weekday, so quiet hours and weekends don't hide who would get what.
  const dryNow = atWindow ? nextSendWindow(new Date()) : undefined;
  if (sp.dry === "1" && !demo && !missing) dry = await runLifecycle({ dry: true, now: dryNow });

  return (
    <>
      <PageHeader
        title="Lifecycle emails"
        description="Onboarding rescue → welcome → badge → trial → upgrade sequence for trade accounts. One email a day at most, 9:00–17:00 weekdays in the member's time zone (the +2h rescue and the pending-review note may go 8:00–20:00 Mon–Thu), stops on upgrade, unsubscribe, bounce or complaint."
      />
      {demo && <DemoBanner />}
      <p className={`mb-4 rounded-md px-3 py-2 text-sm ${enabled ? "bg-teal-50 text-teal-900" : "bg-amber-50 text-amber-900"}`}>
        {enabled
          ? "LIFECYCLE_EMAILS_ENABLED is on: the hourly cron (/api/cron/lifecycle) sends."
          : "LIFECYCLE_EMAILS_ENABLED is off: nothing sends. Set it to 1 in Vercel (and redeploy) to turn it on. Use the dry run below first."}
      </p>
      <ul className="mb-4 space-y-1 rounded-md border border-border bg-card px-3 py-2 text-sm">
        <li>
          <strong>Go-live cutoff (LIFECYCLE_START_AT):</strong>{" "}
          {startAt.kind === "on"
            ? `${startAt.at.toISOString()}. Companies that joined before it get no welcome / market / … catch-up, only one welcome-back email (once approved) and the badge thanks; the full sequence is for companies that join or are approved after it.`
            : startAt.kind === "invalid"
              ? `"${startAt.raw}" is not a date: every run refuses to go until it is fixed (use 2026-10-23 or 2026-10-23T09:00:00-04:00).`
              : "not set. The sequence runs as before: companies inside each step's window get it, older ones don't."}
        </li>
        <li>
          <strong>Daily ceiling (LIFECYCLE_MAX_PER_DAY):</strong> {maxPerDay ? `${maxPerDay} lifecycle emails in any rolling 24 hours.` : "not set: no ceiling beyond 150 sends per hourly run."}
        </li>
        <li>
          <strong>Badge reward (BADGE_REWARD_ENABLED):</strong>{" "}
          {rewardFlag
            ? "on. A company whose badge is detected on its own website gets +14 days of Trade Pro, once. The badge emails mention it."
            : "off. Nobody is granted anything and the badge emails don't mention a reward."}
        </li>
      </ul>
      {missing && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The lifecycle_sends table is missing. Run supabase/migrations/20261016000020_lifecycle_emails.sql, then 20261017000060_onboarding_rescue.sql, then 20261022000200_badge_lifecycle.sql.
        </p>
      )}

      <h2 className="mb-2 mt-6 text-base font-semibold">Stalled sign-ups (last 30 days)</h2>
      <p className="mb-2 text-xs text-muted-foreground">
        Accounts that never finished onboarding (no company yet). Trades get the rescue emails (+2h, +1 day, +3 days, then nothing);
        property managers and suppliers are listed for a personal note only. &quot;Copy email&quot; copies a short note to send yourself from info@.
        Internal and test addresses are hidden.
      </p>
      {stalledError ? (
        <p className="mb-2 text-sm text-amber-900">Couldn&apos;t load: {stalledError}</p>
      ) : !stalled.length ? (
        <p className="mb-2 text-sm text-muted-foreground">{demo ? "Demo mode: no data." : "Nobody stalled in the last 30 days."}</p>
      ) : (
        <>
          <p className="mb-2 text-sm">
            <strong>Where they stopped:</strong> {stalls.map((c) => `${STAGE_LABEL[c.stage]}: ${c.count}`).join(" · ")}
          </p>
          <AdminTable columns={["Email", "Name / company", "Role", "Age", "Last step reached", "Rescue sent", "Next", ""]}>
            {stalled.map((r) => (
              <TableRow key={r.userId}>
                <TableCell className="text-xs">{r.email}</TableCell>
                <TableCell className="text-xs">{[r.name, r.company].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell className="text-xs">{r.role}{r.provider === "google" ? " (Google)" : ""}</TableCell>
                <TableCell className="text-xs">{age(r.ageHours)}</TableCell>
                <TableCell className="text-xs">{r.stageLabel}{r.stageDetail ? ` (${r.stageDetail})` : ""}</TableCell>
                <TableCell className="text-xs">{r.rescueSent.join(", ") || "none"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.next}</TableCell>
                <TableCell className="text-xs"><CopyTextButton text={r.manual.text} /></TableCell>
              </TableRow>
            ))}
          </AdminTable>
        </>
      )}

      <h2 className="mb-2 mt-6 text-base font-semibold">Funnel</h2>
      <p className="mb-2 text-xs text-muted-foreground">
        {tracked
          ? "Opens and clicks come from Resend's tracking webhooks (email.opened / email.clicked)."
          : "No opens or clicks recorded: they only appear if open/click tracking is on in Resend and the webhook sends those events."}
      </p>
      <AdminTable columns={["Step", "Sent", "Skipped", "Failed", "Opened", "Clicked"]}>
        {funnel.map((f) => (
          <TableRow key={f.step}>
            <TableCell className="text-xs font-medium">{STEP_LABEL[f.step]}</TableCell>
            <TableCell className="text-xs">{f.sent}</TableCell>
            <TableCell className="text-xs">{f.skipped}</TableCell>
            <TableCell className="text-xs">{f.failed}</TableCell>
            <TableCell className="text-xs">{f.opened} ({pct(f.opened, f.sent)})</TableCell>
            <TableCell className="text-xs">{f.clicked} ({pct(f.clicked, f.sent)})</TableCell>
          </TableRow>
        ))}
      </AdminTable>

      <h2 className="mb-2 mt-8 text-base font-semibold">Dry run</h2>
      {!dry ? (
        <p className="text-sm">
          <a href={qs({ dry: "1" })} className="font-semibold underline">Run a dry run now</a>{" "}
          <span className="text-muted-foreground">(who the next cron run would email, and what; sends and writes nothing)</span>
          {" · "}
          <a href={qs({ dry: "1", asof: "window" })} className="font-semibold underline">As of the next send window</a>{" "}
          <span className="text-muted-foreground">(13:00 Eastern on a weekday: shows who would get what once quiet hours and weekends are out of the way)</span>
        </p>
      ) : dry.skipped ? (
        <p className="text-sm text-amber-900">Dry run stopped: {dry.skipped}</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p>
            {dry.considered} members considered (+ {dry.rescue.considered} unfinished sign-ups on the rescue track) · {dry.sends.length} would get an email now · {dry.skips.length} steps would be skipped.
            {" "}Waiting: {Object.entries(dry.waits).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.
            {" "}Stopped: {Object.entries(dry.stops).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.
            {" "}Rescue waiting: {Object.entries(dry.rescue.waits).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}; stopped: {Object.entries(dry.rescue.stops).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.
          </p>
          <p className="text-xs text-muted-foreground">
            {dryNow ? `Simulated at ${dryNow.toISOString()} (next send window).` : "As of right now."}{" "}
            {dry.startAt.kind === "on" ? `Go-live cutoff ${dry.startAt.at}.` : "No go-live cutoff set."}
            {dry.cap ? ` Daily ceiling ${dry.cap.max}, ${dry.cap.sentLast24h} sent in the last 24 hours.` : ""}
          </p>
          {dry.members && dry.members.length > 0 && <WhoGetsWhat members={dry.members} />}
          {dry.sends.length > 0 && (
            <AdminTable columns={["Email", "Company", "Step", "Lang", "Country", "Subject", "Words"]}>
              {dry.sends.slice(0, 200).map((s) => (
                <TableRow key={`${s.userId}${s.step}`}>
                  <TableCell className="text-xs">{s.email}</TableCell>
                  <TableCell className="text-xs">{s.org}</TableCell>
                  <TableCell className="text-xs">{s.step}</TableCell>
                  <TableCell className="text-xs">{s.lang}</TableCell>
                  <TableCell className="text-xs">{s.country}</TableCell>
                  <TableCell className="text-xs">{s.subject}</TableCell>
                  <TableCell className="text-xs">{s.words}</TableCell>
                </TableRow>
              ))}
            </AdminTable>
          )}
        </div>
      )}

      <h2 className="mb-2 mt-8 text-base font-semibold">Preview (sample data)</h2>
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {STEPS.map((s) => (
          <a key={s} href={qs({ step: s })} className={s === step ? "font-semibold underline" : "text-muted-foreground hover:underline"}>
            {STEP_LABEL[s]}
          </a>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs">
        <span>
          {(["en", "fr", "es"] as const).map((l) => (
            <a key={l} href={qs({ lang: l })} className={`mr-2 ${l === lang ? "font-semibold underline" : "text-muted-foreground hover:underline"}`}>{l}</a>
          ))}
        </span>
        <span>
          {(["CA", "US"] as const).map((c) => (
            <a key={c} href={qs({ country: c })} className={`mr-2 ${c === country ? "font-semibold underline" : "text-muted-foreground hover:underline"}`}>{c}</a>
          ))}
        </span>
        <span>
          {PERSONAS.map((p) => (
            <a key={p} href={qs({ persona: p })} className={`mr-2 ${p === persona ? "font-semibold underline" : "text-muted-foreground hover:underline"}`}>{p}</a>
          ))}
        </span>
        {isBadgeStep(step) && (
          <span>
            reward line:{" "}
            {([["1", "shown"], ["0", "hidden"]] as const).map(([v, label]) => (
              <a key={v} href={qs({ reward: v })} className={`mr-2 ${(v === "1") === rewardShown ? "font-semibold underline" : "text-muted-foreground hover:underline"}`}>{label}</a>
            ))}
            · website on profile:{" "}
            {([["1", "yes"], ["0", "no"]] as const).map(([v, label]) => (
              <a key={v} href={qs({ website: v })} className={`mr-2 ${(v === "1") === hasWebsite ? "font-semibold underline" : "text-muted-foreground hover:underline"}`}>{label}</a>
            ))}
          </span>
        )}
      </div>
      <p className="mb-1 text-sm"><strong>Subject:</strong> {preview.subject} <span className="text-muted-foreground">· {preview.words} words before the footer</span></p>
      <p className="mb-3 text-xs text-muted-foreground">From: R. Talkar · PMRFP &lt;info@pmrfp.com&gt; · Real sends use the member&apos;s own counts, leads and benchmark; this preview uses sample numbers.</p>
      {sp.test && (
        <p className="mb-3 rounded-md bg-muted px-3 py-2 text-sm">
          {sp.test === "sent" ? "Test sent to your address." : sp.test === "demo" ? "Demo mode: nothing was sent." : "Test send failed (is RESEND_API_KEY set?)."}
        </p>
      )}
      <form action={sendLifecycleTestAction} className="mb-4">
        <input type="hidden" name="step" value={step} />
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="country" value={country} />
        <input type="hidden" name="persona" value={persona} />
        {sp.reward && <input type="hidden" name="reward" value={sp.reward} />}
        {sp.website && <input type="hidden" name="website" value={sp.website} />}
        <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
          Send this test to me (your admin address only)
        </button>
      </form>
      <div className="grid gap-4 lg:grid-cols-2">
        <iframe title="HTML preview" srcDoc={preview.html} sandbox="" className="h-[640px] w-full rounded-md border border-border bg-white" />
        <pre className="h-[640px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-card p-4 text-xs">{preview.text}</pre>
      </div>
    </>
  );
}

/**
 * "Who gets what": every company the run considered and what the planner
 * would do with it, with the total per email. Same planner as the cron.
 */
function WhoGetsWhat({ members }: { members: MemberPlan[] }) {
  const totals = new Map<string, number>();
  for (const m of members) if (m.step) totals.set(m.step, (totals.get(m.step) ?? 0) + 1);
  const nothing = members.filter((m) => !m.step).length;
  const order = new Map(STEPS.map((s, i) => [s as string, i]));
  const sorted = [...totals.entries()].sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99));
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Who gets what ({members.length} companies)</h3>
      <p className="text-xs">
        <strong>Emails now:</strong> {sorted.map(([s, n]) => `${STEP_LABEL[s as StepId] ?? s}: ${n}`).join(" · ") || "none"}
        {" · "}
        <strong>Nothing now:</strong> {nothing}
      </p>
      <AdminTable columns={["Company", "Email", "Joined", "Country", "Lang", "What happens next", "Skipped first"]}>
        {members.map((m) => (
          <TableRow key={m.userId}>
            <TableCell className="text-xs font-medium">{m.org}</TableCell>
            <TableCell className="text-xs">{m.email}</TableCell>
            <TableCell className="text-xs">{m.cohort === "catch_up" ? "before go-live" : "regular"}</TableCell>
            <TableCell className="text-xs">{m.country}</TableCell>
            <TableCell className="text-xs">{m.lang}</TableCell>
            <TableCell className={`text-xs ${m.step ? "font-semibold" : "text-muted-foreground"}`}>{m.summary}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{m.skipped.join(", ") || "—"}</TableCell>
          </TableRow>
        ))}
      </AdminTable>
    </div>
  );
}

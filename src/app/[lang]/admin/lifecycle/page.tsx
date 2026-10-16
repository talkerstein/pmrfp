import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { setLangFrom } from "@/i18n/server";
import { isEnabledLocale, type Locale } from "@/i18n/config";
import { STEPS, STEP_LABEL, isStepId, lifecycleEnabled, type StepId } from "@/lib/lifecycle/config";
import { previewEmail, runLifecycle, type RunReport } from "@/lib/lifecycle/server";
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
  const preview = previewEmail(step, lang, country, "preview-user", persona);
  const qs = (o: Record<string, string>) => `?${new URLSearchParams({ step, lang, country, persona, ...o }).toString()}`;

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

  let dry: RunReport | null = null;
  if (sp.dry === "1" && !demo && !missing) dry = await runLifecycle({ dry: true });

  return (
    <>
      <PageHeader
        title="Lifecycle emails"
        description="Onboarding → trial → upgrade sequence for free trade companies. One email a day at most, 9:00–17:00 weekdays in the member's time zone, stops on upgrade, unsubscribe, bounce or complaint."
      />
      {demo && <DemoBanner />}
      <p className={`mb-4 rounded-md px-3 py-2 text-sm ${enabled ? "bg-teal-50 text-teal-900" : "bg-amber-50 text-amber-900"}`}>
        {enabled
          ? "LIFECYCLE_EMAILS_ENABLED is on: the hourly cron (/api/cron/lifecycle) sends."
          : "LIFECYCLE_EMAILS_ENABLED is off: nothing sends. Set it to 1 in Vercel (and redeploy) to turn it on. Use the dry run below first."}
      </p>
      {missing && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The lifecycle_sends table is missing. Run supabase/migrations/20261016000020_lifecycle_emails.sql.
        </p>
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
        </p>
      ) : dry.skipped ? (
        <p className="text-sm text-amber-900">Dry run stopped: {dry.skipped}</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p>
            {dry.considered} members considered · {dry.sends.length} would get an email now · {dry.skips.length} steps would be skipped.
            {" "}Waiting: {Object.entries(dry.waits).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.
            {" "}Stopped: {Object.entries(dry.stops).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.
          </p>
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

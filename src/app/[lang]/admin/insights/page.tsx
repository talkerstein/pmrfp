import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { setLangFrom } from "@/i18n/server";
import { isEnabledLocale, type Locale } from "@/i18n/config";
import { CA_PROVINCES, US_STATE_NAMES } from "@/lib/geo";
import { previewInsights, runInsightsBrief, type BriefRun } from "@/lib/insights/server";
import { insightsEmailEnabled } from "@/lib/insights/email";
import { insightsLlmEnabled } from "@/lib/insights/writer";
import { gapText } from "@/lib/insights/copy";
import type { Entitlements } from "@/lib/insights/gating";
import type { Persona } from "@/lib/insights/types";

export const metadata: Metadata = { title: "Insights · Admin · PMRFP" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | undefined>>;

const PERSONAS: Persona[] = ["recurring", "specialty", "subtrade"];
const TIERS: Record<string, Entitlements> = {
  free: { pro: false, intel: false },
  pro: { pro: true, intel: false },
  intel: { pro: false, intel: true },
  "pro+intel": { pro: true, intel: true },
};

interface RejectionRow {
  id: number;
  created_at: string;
  source: string;
  fact_id: string;
  kind: string;
  lang: string;
  reason: string;
  template: string;
  output: string;
}

/**
 * Admin: what the insights engine says for any member or sample profile,
 * as each tier would see it (dashboard card + weekly brief), the AI
 * validator's rejection log, and a dry run of the next weekly brief (who
 * would get what; sends and writes nothing).
 */
export default async function InsightsAdminPage({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const sp = await searchParams;
  const demo = isDemoMode() || !isServiceConfigured();

  const lang: Locale = isEnabledLocale(sp.lang) ? sp.lang : "en";
  const country = sp.country === "US" ? "US" : "CA";
  const province = sp.province && [...CA_PROVINCES, ...US_STATE_NAMES].includes(sp.province as never) ? sp.province : country === "US" ? "Texas" : "Ontario";
  const trades = (sp.trades ?? "painting").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);
  const persona = PERSONAS.find((p) => p === sp.persona) ?? null;
  const tierKey = sp.tier && sp.tier in TIERS ? sp.tier : "pro";
  const polish = sp.polish === "1";
  const orgId = sp.org?.trim() || null;

  const preview = await previewInsights({
    orgId,
    sample: orgId ? undefined : { country, province, tradeSlugs: trades },
    persona,
    lang,
    ent: TIERS[tierKey],
    polish,
  }).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));

  let rejections: RejectionRow[] = [];
  let rejectionsMissing = false;
  if (!demo) {
    const { data, error } = await createServiceClient()
      .from("insight_rejections")
      .select("id,created_at,source,fact_id,kind,lang,reason,template,output")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<RejectionRow[]>();
    rejectionsMissing = Boolean(error);
    rejections = data ?? [];
  }
  let dry: BriefRun | null = null;
  if (sp.dry === "1" && !demo) dry = await runInsightsBrief({ dry: true });

  const keep = { lang, country, province, trades: trades.join(","), persona: persona ?? "", tier: tierKey, polish: polish ? "1" : "", org: orgId ?? "" };
  const qs = (o: Record<string, string>) => `?${new URLSearchParams(Object.fromEntries(Object.entries({ ...keep, ...o }).filter(([, v]) => v))).toString()}`;
  const ok = !("error" in preview && preview.error) && "run" in preview;

  return (
    <>
      <PageHeader
        title="Insights"
        description="Plain-language facts from PMRFP's own data (tenders, award notices, benchmarks, projects, the renewal radar). Template sentences; an optional AI polish is kept only when the validator finds nothing new in it."
      />
      {demo && <DemoBanner />}
      <p className={`mb-2 rounded-md px-3 py-2 text-sm ${insightsEmailEnabled() ? "bg-teal-50 text-teal-900" : "bg-amber-50 text-amber-900"}`}>
        {insightsEmailEnabled()
          ? "INSIGHTS_EMAIL_ENABLED is on: the Monday cron (/api/cron/insights-brief) sends the weekly brief, and weekly-cadence members stop getting a separate lead alert."
          : "INSIGHTS_EMAIL_ENABLED is off: no brief is sent and lead alerts are unchanged. Use the dry run below first."}
      </p>
      <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm">
        INSIGHTS_LLM is {insightsLlmEnabled() ? "on" : "off"} (AI polish in the brief). Preview with polish: add <code>polish=1</code> (needs GEMINI_API_KEY).
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">Preview</h2>
      <form className="mb-4 flex flex-wrap items-end gap-3 text-xs" method="get">
        <label className="flex flex-col gap-1">Organization id (optional)<input name="org" defaultValue={orgId ?? ""} className="w-72 rounded border border-border px-2 py-1" /></label>
        <label className="flex flex-col gap-1">Trades (slugs)<input name="trades" defaultValue={trades.join(",")} className="w-56 rounded border border-border px-2 py-1" /></label>
        <label className="flex flex-col gap-1">Country<select name="country" defaultValue={country} className="rounded border border-border px-2 py-1"><option>CA</option><option>US</option></select></label>
        <label className="flex flex-col gap-1">Province / state<select name="province" defaultValue={province} className="rounded border border-border px-2 py-1">{(country === "US" ? US_STATE_NAMES : CA_PROVINCES).map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="flex flex-col gap-1">Persona<select name="persona" defaultValue={persona ?? ""} className="rounded border border-border px-2 py-1"><option value="">from trades</option>{PERSONAS.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="flex flex-col gap-1">Viewer<select name="tier" defaultValue={tierKey} className="rounded border border-border px-2 py-1">{Object.keys(TIERS).map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="flex flex-col gap-1">Language<select name="lang" defaultValue={lang} className="rounded border border-border px-2 py-1"><option>en</option><option>fr</option><option>es</option></select></label>
        <label className="flex items-center gap-1"><input type="checkbox" name="polish" value="1" defaultChecked={polish} /> AI polish</label>
        <button type="submit" className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted">Show</button>
      </form>

      {!ok ? (
        <p className="text-sm text-amber-900">{"error" in preview ? preview.error : "Preview unavailable."}</p>
      ) : (
        <>
          <p className="mb-2 text-sm">
            {preview.orgName ? <strong>{preview.orgName}</strong> : "Sample profile"} · persona <strong>{preview.run.persona}</strong> · {preview.run.facts.length} facts, {preview.run.gaps.length} gaps ·
            polish: {preview.composed.polishSkipped ?? `${preview.composed.polished} kept, ${preview.composed.rejections.length} rejected (${preview.composed.model})`}
          </p>
          <h3 className="mb-1 mt-4 text-sm font-semibold">Dashboard card as this viewer sees it</h3>
          <ul className="mb-4 space-y-2 text-sm">
            {preview.card.map((i) => (
              <li key={i.id} className={`rounded border p-3 ${i.locked ? "border-dashed bg-muted/30" : "border-border"}`}>
                <strong>{i.title}</strong> {i.locked && <span className="text-xs text-muted-foreground">[locked: {i.unlock}]</span>}
                <br />
                {i.text}
                {i.items.length > 0 && <ul className="ml-4 list-disc text-xs">{i.items.map((it) => <li key={it.href + it.label}>{it.label} · {it.meta}</li>)}</ul>}
                {i.basis && <div className="text-xs text-muted-foreground">{i.basis}</div>}
              </li>
            ))}
          </ul>

          <h3 className="mb-1 mt-4 text-sm font-semibold">Every fact (ranked)</h3>
          <AdminTable columns={["Kind", "Tier", "Region", "Trade", "Score", "Sample", "Confidence", "Id"]}>
            {preview.run.ranked.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="text-xs font-medium">{f.kind}</TableCell>
                <TableCell className="text-xs">{f.tier}</TableCell>
                <TableCell className="text-xs">{f.region ?? `${f.country} (all)`}</TableCell>
                <TableCell className="text-xs">{f.trade?.slug ?? "—"}</TableCell>
                <TableCell className="text-xs">{Math.round(f.score)}</TableCell>
                <TableCell className="text-xs">{f.sample.n} (min {f.sample.min})</TableCell>
                <TableCell className="text-xs">{f.confidence}</TableCell>
                <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">{f.id}</TableCell>
              </TableRow>
            ))}
          </AdminTable>
          {preview.run.gaps.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-sm font-semibold">Gaps (what the engine refused to say)</h3>
              <ul className="mb-4 list-disc pl-5 text-xs text-muted-foreground">
                {preview.run.gaps.slice(0, 40).map((g, i) => <li key={`${g.kind}${g.region}${g.trade?.slug}${i}`}>{g.kind}: {gapText(g, "en")} [{g.reason}]</li>)}
              </ul>
            </>
          )}
          {preview.composed.rejections.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-sm font-semibold">Validator rejections in this preview</h3>
              <ul className="mb-4 space-y-1 text-xs">
                {preview.composed.rejections.map((r) => <li key={r.factId}><strong>{r.kind}</strong>: {r.reason}<br /><span className="text-muted-foreground">AI: {r.output}</span></li>)}
              </ul>
            </>
          )}

          <h3 className="mb-1 mt-4 text-sm font-semibold">Weekly brief: {preview.composed.brief.subject}</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <iframe title="Brief HTML preview" srcDoc={preview.html} sandbox="" className="h-[640px] w-full rounded-md border border-border bg-white" />
            <pre className="h-[640px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-card p-4 text-xs">{preview.composed.brief.text}</pre>
          </div>
        </>
      )}

      <h2 className="mb-2 mt-8 text-base font-semibold">Weekly brief dry run</h2>
      {!dry ? (
        <p className="text-sm">
          <a href={qs({ dry: "1" })} className="font-semibold underline">Run a dry run now</a>{" "}
          <span className="text-muted-foreground">(who Monday&apos;s cron would email and what; sends and writes nothing)</span>
        </p>
      ) : dry.skipped && !dry.sends.length ? (
        <p className="text-sm text-amber-900">Dry run stopped: {dry.skipped}</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p>
            Week {dry.week} · {dry.considered} members considered · {dry.sends.length} would get a brief · skipped: {Object.entries(dry.skips).map(([k, v]) => `${k} ${v}`).join(", ") || "none"} · AI rejections: {dry.rejections.length}
          </p>
          {dry.sends.length > 0 && (
            <AdminTable columns={["Email", "Company", "Lang", "Country", "Persona", "Insights", "Leads", "Subject"]}>
              {dry.sends.slice(0, 200).map((s) => (
                <TableRow key={s.userId}>
                  <TableCell className="text-xs">{s.email}</TableCell>
                  <TableCell className="text-xs">{s.org}</TableCell>
                  <TableCell className="text-xs">{s.lang}</TableCell>
                  <TableCell className="text-xs">{s.country}</TableCell>
                  <TableCell className="text-xs">{s.persona}</TableCell>
                  <TableCell className="text-xs">{s.insights}</TableCell>
                  <TableCell className="text-xs">{s.leads}</TableCell>
                  <TableCell className="text-xs">{s.subject}</TableCell>
                </TableRow>
              ))}
            </AdminTable>
          )}
        </div>
      )}

      <h2 className="mb-2 mt-8 text-base font-semibold">Validator rejections (latest 50)</h2>
      {rejectionsMissing ? (
        <p className="text-sm text-amber-900">The insight_rejections table is missing. Run supabase/migrations/20261017000030_insights.sql.</p>
      ) : rejections.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet{insightsLlmEnabled() ? "" : " (AI polish is off, so nothing to reject)"}.</p>
      ) : (
        <AdminTable columns={["When", "Source", "Kind", "Lang", "Reason", "Template", "AI output"]}>
          {rejections.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{r.created_at.slice(0, 16).replace("T", " ")}</TableCell>
              <TableCell className="text-xs">{r.source}</TableCell>
              <TableCell className="text-xs">{r.kind}</TableCell>
              <TableCell className="text-xs">{r.lang}</TableCell>
              <TableCell className="max-w-[220px] text-xs">{r.reason}</TableCell>
              <TableCell className="max-w-[320px] text-xs text-muted-foreground">{r.template}</TableCell>
              <TableCell className="max-w-[320px] text-xs">{r.output}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}

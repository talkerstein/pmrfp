import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "@/i18n/link";
import { ArrowLeft } from "lucide-react";
import { getSession, isDemoMode } from "@/lib/access/access";
import { isServiceConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { PrintButton } from "@/components/towns/jobs/sealed-forms";
import { money } from "@/components/towns/jobs/part-c-cards";
import { canManageTownJob, todayToronto } from "@/lib/town-jobs/rules";
import { loadTownJob } from "@/lib/town-jobs/server";
import { loadResults, townBrand } from "@/lib/town-jobs/results-server";
import { closingLabel, momentLabel } from "@/lib/town-jobs/sealed-email-copy";
import { townTimeZone } from "@/lib/town-jobs/sealed";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { fmt, formatDate, formatNumber } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").townResults.summary.title, robots: { index: false, follow: false } };
}

/**
 * The council summary (PMRFP for Towns, Part C): one clean page for the
 * council report, with the town's name and logo. "Print or save as PDF"
 * uses the browser's own print (no PDF library); "Download CSV" gives the
 * table. Outside the dashboard shell so it prints cleanly. The town (or an
 * admin) only, once results are ready.
 */
export default async function CouncilSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("townResults");
  const s = t.summary;
  const r = t.results;
  const { id } = await params;
  if (isDemoMode() || !isServiceConfigured()) notFound();
  const session = await getSession();
  if (!session) redirect(localizePath(`/sign-in?next=${encodeURIComponent(localizePath(`/council-summary/${id}`, lang))}`, lang));
  const db = createServiceClient();
  const job = await loadTownJob(db, id);
  if (!job || !canManageTownJob(job, { userId: session.userId, organizationId: session.organization?.id ?? null, role: session.profile.primary_role })) notFound();
  const [results, brand] = await Promise.all([loadResults(db, job, session.userId), townBrand(db, job.posted_by_organization_id)]);
  const tz = townTimeZone(job.buyer_key);
  const day = (d: string | null | undefined) => (d ? formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang, { month: "long", day: "numeric", year: "numeric" }) : "—");
  const sum = results.summary;
  const saved = results.saved;
  const op = results.sealed?.opening ?? null;
  const recommended = sum?.rows.find((x) => x.id === saved?.recommended_interest_id) ?? null;
  const townName = brand.name ?? job.buyer_name ?? "";

  return (
    <main className="mx-auto max-w-4xl bg-white px-6 py-8 text-[15px] leading-relaxed text-neutral-900 print:max-w-none print:px-0 print:py-0" data-page="council-summary">
      <style>{`@media print { @page { margin: 16mm; } body { background: #fff !important; } }`}</style>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/buyer-dashboard/jobs/${job.id}`} className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900">
          <ArrowLeft className="size-4" /> {s.back}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {sum && <a href={`/api/town-jobs/${job.id}/summary-csv?lang=${lang}`} className="text-sm font-medium text-teal-700 underline">{s.csv}</a>}
          {sum && <PrintButton />}
        </div>
      </div>

      <header className="flex items-start justify-between gap-6 border-b-2 border-neutral-900 pb-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-neutral-600">{townName}</p>
          <h1 className="mt-1 text-2xl font-bold">{s.title}</h1>
          <p className="text-neutral-600">{s.subtitle}</p>
        </div>
        {/* The town's own logo (its managed page). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {brand.logoUrl && <img src={brand.logoUrl} alt={townName} className="max-h-20 max-w-[180px] object-contain" />}
      </header>

      <dl className="mt-5 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5">
        <dt className="font-semibold">{s.job}</dt>
        <dd>{job.title}</dd>
        <dt className="font-semibold">{s.reference}</dt>
        <dd>{job.slug}</dd>
        <dt className="font-semibold">{s.closed}</dt>
        <dd>{closingLabel(results.closesAt, tz, lang)}</dd>
        {op?.status === "opened" && (
          <>
            <dt className="font-semibold">{s.opened}</dt>
            <dd>
              {momentLabel(op.opened_at, tz, lang)}.{" "}
              {op.confirmed_method === "witness"
                ? fmt(s.witnessedBy, { asked: op.requested_by_name ?? "—", witness: op.witness_confirmed_name ?? op.witness_name ?? "—" })
                : fmt(s.openedBy, { asked: op.requested_by_name ?? "—", confirmed: op.confirmed_by_name ?? "—" })}
            </dd>
          </>
        )}
      </dl>
      {job.sealed && op?.status === "opened" && <p className="mt-2 text-sm text-neutral-600">{s.sealedNote}</p>}

      {!sum ? (
        <p className="mt-8 rounded-md border border-neutral-300 p-4" data-summary="not-ready">{s.notReady}</p>
      ) : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Box k={s.received} v={formatNumber(sum.received, lang)} />
            <Box k={s.lowest} v={sum.lowestCompliant ? money(sum.lowestCompliant.amount, lang) : "—"} sub={sum.lowestCompliant?.company} />
            <Box k={s.average} v={money(sum.average, lang)} />
            <Box k={s.invites} v={formatNumber(sum.invitesSent, lang)} sub={fmt(r.invitesBody, { sent: formatNumber(sum.invitesSent, lang), responded: formatNumber(sum.invitedResponded, lang) })} />
          </section>

          <h2 className="mt-8 border-b border-neutral-300 pb-1 text-lg font-semibold">{s.table}</h2>
          {sum.rows.length === 0 ? (
            <p className="mt-2">{r.none}</p>
          ) : (
            <table className="mt-2 w-full border-collapse text-sm" data-list="summary">
              <thead>
                <tr className="bg-neutral-100 text-left">
                  <th className="border border-neutral-300 px-2 py-1">{r.cols.company}</th>
                  <th className="border border-neutral-300 px-2 py-1">{r.cols.amount}</th>
                  <th className="border border-neutral-300 px-2 py-1">{r.cols.kind}</th>
                  <th className="border border-neutral-300 px-2 py-1">{r.cols.start}</th>
                  <th className="border border-neutral-300 px-2 py-1">{r.cols.notes}</th>
                  <th className="border border-neutral-300 px-2 py-1">{r.cols.profile}</th>
                </tr>
              </thead>
              <tbody>
                {sum.rows.map((x) => (
                  <tr key={x.id} className="align-top">
                    <td className="border border-neutral-300 px-2 py-1">
                      <b>{x.company}</b>
                      {x.id === recommended?.id ? " ★" : ""}
                      <div className="text-xs text-neutral-600">{r.statuses[x.status] ?? x.status}</div>
                    </td>
                    <td className="border border-neutral-300 px-2 py-1 whitespace-nowrap">{x.amount != null ? money(x.amount, lang) : r.noPrice}</td>
                    <td className="border border-neutral-300 px-2 py-1">{x.kind === "firm" ? r.firm : x.kind === "estimate" ? r.estimate : "—"}</td>
                    <td className="border border-neutral-300 px-2 py-1 whitespace-nowrap">{day(x.startDate)}</td>
                    <td className="border border-neutral-300 px-2 py-1 whitespace-pre-line">{x.notes ?? ""}</td>
                    <td className="border border-neutral-300 px-2 py-1 text-xs">
                      {r.profile[x.profileStatus ?? ""] ?? x.profileStatus ?? "—"}
                      {x.verified ? ` · ${r.verified}` : ""}
                      <br />
                      {r.insurance}: {x.insurance ?? r.notOnFile}
                      <br />
                      {r.wsib}: {x.wsib ?? r.notOnFile}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-neutral-600">{r.compliantNote} {s.note}</p>

          <h2 className="mt-8 border-b border-neutral-300 pb-1 text-lg font-semibold">{s.recommendation}</h2>
          {recommended ? (
            <div className="mt-2" data-recommendation={recommended.id}>
              <p>
                <b>{recommended.company}</b>
                {recommended.amount != null ? ` · ${money(recommended.amount, lang)}` : ""}
                {recommended.kind ? ` (${recommended.kind === "firm" ? r.firm : r.estimate})` : ""}
              </p>
              {saved?.rationale && (
                <p className="mt-1 whitespace-pre-line">
                  <span className="font-semibold">{s.rationale}: </span>
                  {saved.rationale}
                </p>
              )}
              {results.recommendedByName && saved?.recommended_at && <p className="mt-1 text-xs text-neutral-600">{fmt(r.recommend.by, { name: results.recommendedByName, date: day(saved.recommended_at) })}</p>}
            </div>
          ) : (
            <p className="mt-2 text-neutral-600">{s.noRecommendation}</p>
          )}

          {saved?.award_published_at && (
            <>
              <h2 className="mt-8 border-b border-neutral-300 pb-1 text-lg font-semibold">{s.award}</h2>
              <p className="mt-2">
                {fmt(r.award.published, { date: day(saved.award_published_at), winner: saved.award_winner_name ?? "" })}{" "}
                {saved.award_amount != null ? (saved.award_amount_public ? fmt(r.award.amountShown, { amount: money(saved.award_amount, lang) }) : `${money(saved.award_amount, lang)} · ${r.award.amountHidden}`) : ""}
              </p>
            </>
          )}
        </>
      )}

      <footer className="mt-10 border-t border-neutral-300 pt-3 text-xs text-neutral-600">{fmt(s.prepared, { date: day(todayToronto()) })}</footer>
    </main>
  );
}

function Box({ k, v, sub }: { k: string; v: string; sub?: string | null }) {
  return (
    <div className="rounded-md border border-neutral-300 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{k}</div>
      <div className="mt-0.5 text-lg font-bold">{v}</div>
      {sub && <div className="text-xs text-neutral-600">{sub}</div>}
    </div>
  );
}

import Link from "@/i18n/link";
import { BarChart3, FileArchive, FileText, Lock, Trophy } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AwardForm, OpenQuotesForm, OpeningButton, RecommendForm } from "@/components/towns/jobs/sealed-forms";
import { closingLabel, momentLabel } from "@/lib/town-jobs/sealed-email-copy";
import { openingMode, openingStep, townSealedEmailsEnabled, townTimeZone, type SealedState } from "@/lib/town-jobs/sealed";
import type { TownResults } from "@/lib/town-jobs/results-server";
import type { MonthRollup, PostReach } from "@/lib/town-jobs/reach";
import type { TownJob } from "@/lib/town-jobs/server";
import { todayToronto } from "@/lib/town-jobs/rules";
import { getLang, getT } from "@/i18n/server";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";

/**
 * PMRFP for Towns, Part C, on the town's dashboard: the sealed box (count
 * and the two-person opening), results (table, lowest compliant, average,
 * invitations, recommendation, council summary, award), the reach report
 * and the records export. The monthly roll-up and the date-range export sit
 * on /buyer-dashboard.
 */

function Card({ id, icon, title, intro, children }: { id?: string; icon: React.ReactNode; title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-border bg-card p-5" data-card={id}>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground">{icon}</span>
        {title}
      </h2>
      {intro && <p className="mt-1 mb-4 text-sm text-muted-foreground">{intro}</p>}
      <div className="space-y-3 text-sm">{children}</div>
    </section>
  );
}

export const money = (n: number | null | undefined, lang: Locale) =>
  n == null ? "—" : Number(n).toLocaleString(lang === "fr" ? "fr-CA" : lang === "es" ? "es-US" : "en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });

/** The sealed box: the count, the closing time, and where the opening stands. */
export function SealedBoxCard({ job, state, me }: { job: TownJob; state: SealedState; me: string }) {
  const lang = getLang();
  const t = getT("townResults").sealed;
  const tz = state.time_zone || townTimeZone(job.buyer_key);
  const when = (d: string | null | undefined) => momentLabel(d, tz, lang);
  const step = openingStep(state, me);
  const op = state.opening;
  const witness = openingMode(state.members) === "witness";
  return (
    <Card id="sealed" icon={<Lock className="size-4" />} title={t.title} intro={t.intro}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-secondary/50 px-4 py-3">
        <p className="text-lg font-semibold" data-sealed-count={state.received}>{plural(state.received, t.count, { n: formatNumber(state.received, lang) })}</p>
        <p className="text-xs text-muted-foreground">{state.closed ? fmt(t.closedAt, { date: closingLabel(state.closes_at, tz, lang) }) : fmt(t.closes, { date: closingLabel(state.closes_at, tz, lang) })}</p>
      </div>
      {step === "sealed" && <p className="text-muted-foreground" data-step="sealed">{t.before}</p>}
      {step === "open" && (
        <div className="space-y-3" data-step="open">
          {op?.status === "expired" && <p className="text-amber-800">{fmt(t.expired, { date: when(op.expires_at) })}</p>}
          <p>{witness ? t.openWitness : t.openColleague}</p>
          {witness && <p className="text-xs text-muted-foreground">{t.addColleague}</p>}
          <OpenQuotesForm rfpId={job.id} witness={witness} />
        </div>
      )}
      {step === "waiting" && op && (
        <div className="space-y-3" data-step="waiting">
          <p>{fmt(t.waiting, { date: when(op.requested_at), who: op.witness_name ? fmt(t.waitingWitness, { name: op.witness_name }) : t.waitingColleague, expires: when(op.expires_at) })}</p>
          {!townSealedEmailsEnabled() && <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900" data-emails="off">{op.witness_email ? t.witnessEmailsOff : t.emailsOff}</p>}
          <div className="flex flex-wrap gap-2">
            {op.witness_email && <OpeningButton rfpId={job.id} kind="resend" />}
            <OpeningButton rfpId={job.id} kind="cancel" />
          </div>
        </div>
      )}
      {step === "confirm" && op && (
        <div className="space-y-3 rounded-md border border-teal-300 bg-teal-50 p-4" data-step="confirm">
          <p className="font-medium">{fmt(t.confirmTitle, { name: op.requested_by_name ?? "", date: when(op.requested_at) })}</p>
          <p>{t.confirmBody}</p>
          <div className="flex flex-wrap gap-2">
            <OpeningButton rfpId={job.id} kind="confirm" />
            <OpeningButton rfpId={job.id} kind="cancel" />
          </div>
        </div>
      )}
      {step === "opened" && op && (
        <p className="text-teal-800" data-step="opened">
          {op.confirmed_method === "witness"
            ? fmt(t.openedWitness, { date: when(op.opened_at), asked: op.requested_by_name ?? "—", witness: op.witness_confirmed_name ?? op.witness_name ?? "—" })
            : fmt(t.opened, { date: when(op.opened_at), asked: op.requested_by_name ?? "—", confirmed: op.confirmed_by_name ?? "—" })}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t.timeNote}</p>
    </Card>
  );
}

/** Results: the table, the numbers, the recommendation, the council summary and the award. */
export function ResultsCard({ job, results }: { job: TownJob; results: TownResults }) {
  const lang = getLang();
  const tr = getT("townResults");
  const t = tr.results;
  const tz = townTimeZone(job.buyer_key);
  if (!results.ready || !results.summary) {
    return (
      <Card id="results" icon={<FileText className="size-4" />} title={t.title}>
        <p className="text-muted-foreground" data-results="not-ready">{job.sealed ? t.notYetSealed : fmt(t.notYet, { date: closingLabel(results.closesAt, tz, lang) })}</p>
      </Card>
    );
  }
  const s = results.summary;
  const saved = results.saved;
  const recommended = s.rows.find((r) => r.id === saved?.recommended_interest_id) ?? null;
  const day = (d: string | null | undefined) => (d ? formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang) : "—");
  const picked = results.picked;
  const published = Boolean(saved?.award_published_at);
  return (
    <Card id="results" icon={<FileText className="size-4" />} title={t.title}>
      <dl className="grid gap-3 sm:grid-cols-4" data-summary>
        <Stat k={t.received} v={formatNumber(s.received, lang)} />
        <Stat k={t.lowest} v={s.lowestCompliant ? `${money(s.lowestCompliant.amount, lang)} · ${s.lowestCompliant.company}` : "—"} />
        <Stat k={t.average} v={money(s.average, lang)} />
        <Stat k={t.invites} v={fmt(t.invitesBody, { sent: formatNumber(s.invitesSent, lang), responded: formatNumber(s.invitedResponded, lang) })} />
      </dl>
      {s.rows.length === 0 ? (
        <p className="text-muted-foreground">{t.none}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm" data-list="results">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">{t.cols.company}</th>
                <th className="py-2 pr-3">{t.cols.amount}</th>
                <th className="py-2 pr-3">{t.cols.kind}</th>
                <th className="py-2 pr-3">{t.cols.start}</th>
                <th className="py-2 pr-3">{t.cols.notes}</th>
                <th className="py-2">{t.cols.profile}</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.id} className={cn("border-b border-border/60 align-top", r.status === "declined" && "text-muted-foreground line-through decoration-1")} data-status={r.status}>
                  <td className="py-2 pr-3 font-medium">{r.company}<div className="text-xs font-normal text-muted-foreground no-underline">{t.statuses[r.status] ?? r.status}</div></td>
                  <td className="py-2 pr-3">{r.amount != null ? money(r.amount, lang) : t.noPrice}</td>
                  <td className="py-2 pr-3">{r.kind === "firm" ? t.firm : r.kind === "estimate" ? t.estimate : "—"}</td>
                  <td className="py-2 pr-3">{day(r.startDate)}</td>
                  <td className="py-2 pr-3 whitespace-pre-line">{r.notes ?? ""}</td>
                  <td className="py-2 text-xs">
                    <div>{t.profile[r.profileStatus ?? ""] ?? r.profileStatus ?? "—"}{r.verified ? ` · ${t.verified}` : ""}</div>
                    <div>{t.insurance}: {r.insurance ?? t.notOnFile}</div>
                    <div>{t.wsib}: {r.wsib ?? t.notOnFile}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t.compliantNote}</p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/council-summary/${job.id}`} className={cn(buttonVariants({ size: "sm" }))} data-link="council-summary">{t.summary}</Link>
        <a href={`/api/town-jobs/${job.id}/summary-csv?lang=${lang}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))} data-link="summary-csv">{t.csv}</a>
        <Link href={`/buyer-dashboard/jobs/${job.id}/responses`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>{t.seeResponses}</Link>
      </div>

      {s.rows.length > 0 && (
        <div className="border-t border-border pt-4">
          <h3 className="font-semibold">{t.recommend.title}</h3>
          <p className="mb-3 text-muted-foreground">{t.recommend.intro}</p>
          {recommended && (
            <p className="mb-3" data-recommended={recommended.id}>
              <b>{fmt(t.recommend.current, { company: recommended.company })}</b>
              {results.recommendedByName && saved?.recommended_at ? <span className="text-xs text-muted-foreground"> · {fmt(t.recommend.by, { name: results.recommendedByName, date: day(saved.recommended_at) })}</span> : null}
            </p>
          )}
          <RecommendForm
            rfpId={job.id}
            options={s.rows.filter((r) => r.status !== "declined").map((r) => ({ id: r.id, label: `${r.company}${r.amount != null ? ` · ${money(r.amount, lang)}` : ""}` }))}
            current={saved?.recommended_interest_id ?? null}
            rationale={saved?.rationale ?? null}
          />
        </div>
      )}

      <div className="border-t border-border pt-4" id="award">
        <h3 className="flex items-center gap-2 font-semibold"><Trophy className="size-4" /> {t.award.title}</h3>
        {published && saved ? (
          <p className="my-2 text-teal-800" data-award="published">
            {fmt(t.award.published, { date: day(saved.award_published_at), winner: saved.award_winner_name ?? "" })}{" "}
            {saved.award_amount != null && saved.award_amount_public ? fmt(t.award.amountShown, { amount: money(saved.award_amount, lang) }) : t.award.amountHidden} {t.award.history}
          </p>
        ) : null}
        {picked ? (
          <AwardForm
            rfpId={job.id}
            winner={saved?.award_winner_name ?? picked.company}
            amount={saved?.award_amount ?? picked.amount}
            amountPublic={saved ? saved.award_amount_public || !published : true}
            date={saved?.award_date ?? todayToronto()}
            today={todayToronto()}
            published={published}
          />
        ) : (
          <p className="text-muted-foreground" data-award="needs-pick">{t.award.needsPick}</p>
        )}
      </div>
    </Card>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-secondary/40 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className="mt-1 font-semibold">{v}</dd>
    </div>
  );
}

const monthName = (month: string, lang: Locale) => formatDate(`${month}-15T12:00:00Z`, lang, { month: "long", year: "numeric" });

/** One post's reach (counts only). */
export function ReachCard({ reach }: { reach: PostReach }) {
  const lang = getLang();
  const t = getT("townResults").reach;
  const n = (x: number) => formatNumber(x, lang);
  return (
    <Card id="reach" icon={<BarChart3 className="size-4" />} title={t.title} intro={t.intro}>
      <dl className="grid grid-cols-2 gap-3" data-reach>
        <Stat k={t.views} v={n(reach.views)} />
        <Stat k={t.followers} v={n(reach.followersAtPosting)} />
        <Stat k={t.invites} v={n(reach.invites)} />
        <Stat k={t.alerted} v={n(reach.alerted)} />
        <Stat k={t.questions} v={n(reach.questions)} />
        <Stat k={t.quotes} v={n(reach.quotes)} />
      </dl>
      <p className="text-muted-foreground" data-last-year={reach.lastYear ? "yes" : "no"}>
        {reach.lastYear ? fmt(t.lastYear, { month: monthName(reach.lastYear.month, lang), posts: n(reach.lastYear.posts), avg: formatNumber(reach.lastYear.avgQuotes ?? 0, lang) }) : t.noLastYear}
      </p>
      <p className="text-xs text-muted-foreground">{t.viewsNote}</p>
    </Card>
  );
}

/** One post's records, as a ZIP (CSV + HTML), with the retention note. */
export function RecordsCard({ rfpId }: { rfpId: string }) {
  const lang = getLang();
  const t = getT("townResults").records;
  return (
    <Card id="records" icon={<FileArchive className="size-4" />} title={t.title} intro={t.body}>
      <a href={`/api/town-jobs/export?rfp=${rfpId}&lang=${lang}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))} data-link="records-zip">{t.download}</a>
      <p className="text-xs text-muted-foreground">{t.retention}</p>
    </Card>
  );
}

/** The dashboard's monthly roll-up (this month vs the same month last year) and the date-range export. */
export function MonthlyReachCard({ current, lastYear }: { current: MonthRollup; lastYear: MonthRollup }) {
  const lang = getLang();
  const t = getT("townResults").monthly;
  const n = (x: number) => formatNumber(x, lang);
  const rows: [string, number, number][] = [
    [t.posts, current.posts, lastYear.posts],
    [t.views, current.views, lastYear.views],
    [t.quotes, current.quotes, lastYear.quotes],
    [t.invites, current.invites, lastYear.invites],
    [t.questions, current.questions, lastYear.questions],
    [t.alerted, current.alerted, lastYear.alerted],
  ];
  return (
    <Card id="monthly" icon={<BarChart3 className="size-4" />} title={t.title} intro={t.intro}>
      {current.posts === 0 && <p className="text-muted-foreground">{t.none}</p>}
      <table className="w-full text-sm" data-list="monthly">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-1" />
            <th className="py-1">{t.thisMonth} ({monthName(current.month, lang)})</th>
            <th className="py-1">{t.lastYear} ({monthName(lastYear.month, lang)})</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, a, b]) => (
            <tr key={k} className="border-t border-border/60">
              <td className="py-1.5 pr-3">{k}</td>
              <td className="py-1.5 font-semibold">{n(a)}</td>
              <td className="py-1.5 text-muted-foreground">{n(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function RecordsRangeCard() {
  const lang = getLang();
  const t = getT("townResults").records;
  const today = todayToronto();
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  return (
    <Card id="records" icon={<FileArchive className="size-4" />} title={t.rangeTitle} intro={t.rangeBody}>
      <form method="get" action="/api/town-jobs/export" className="flex flex-wrap items-end gap-3" data-form="records-range">
        <input type="hidden" name="lang" value={lang} />
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t.from}</span>
          <input type="date" name="from" defaultValue={yearAgo} max={today} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t.to}</span>
          <input type="date" name="to" defaultValue={today} max={today} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" />
        </label>
        <button type="submit" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>{t.rangeButton}</button>
      </form>
      <p className="text-xs text-muted-foreground">{t.retention}</p>
    </Card>
  );
}

/** The localized link to a post's council summary (for buttons elsewhere). */
export const councilSummaryHref = (rfpId: string, lang: Locale) => localizePath(`/council-summary/${rfpId}`, lang);

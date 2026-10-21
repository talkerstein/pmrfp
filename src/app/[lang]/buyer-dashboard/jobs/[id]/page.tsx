import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "@/i18n/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AddendumForm, AnswerForm, InviteByEmailForm, InviteTradesButton, QuestionDeadlineForm } from "@/components/towns/jobs/manage-forms";
import { PartCComingSoon } from "@/components/towns/jobs/part-c";
import { isServiceConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { INVITE_DAILY_MAX, todayToronto } from "@/lib/town-jobs/rules";
import { loadTownJob, previewTradeInvites, townJobDetail, type InvitePreview } from "@/lib/town-jobs/server";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").townJobs.manage.title };
}

const day = (d: string | null | undefined, lang: Locale) => (d ? formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang) : "—");
const when = (d: string, lang: Locale) => formatDate(d, lang, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" });

type Search = { posted?: string; alerts?: string; n?: string };

/**
 * One of the town's posts: its status and dates, questions to answer (once,
 * published without the asker), addenda (and closing-date changes), the
 * question deadline, invitations (matching trades with the list shown
 * before sending, or a contractor by email) and the append-only record.
 * Responses are handled on the PM job flow's own page (./responses).
 */
export default async function TownJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Search> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("townJobs");
  const m = t.manage;
  const session = await requireRole(["public_buyer"]);
  const demo = isDemoMode();
  if (!demo && !session.organization) redirect(localizePath("/onboarding", lang));
  if (demo || !isServiceConfigured()) {
    return (
      <div>
        <DemoBanner />
        <PageHeader title={m.title} />
      </div>
    );
  }
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const db = createServiceClient();
  const job = await loadTownJob(db, id);
  // Only the posting organization manages its post here.
  if (!job || !session.organization || job.posted_by_organization_id !== session.organization.id) notFound();
  const mirror = job.post_kind === "tender_mirror";
  const live = job.status === "published";
  const [detail, preview] = await Promise.all([
    townJobDetail(db, job),
    live ? previewTradeInvites(db, job).catch(() => null) : Promise.resolve<InvitePreview | null>(null),
  ]);
  const today = todayToronto();
  const n = Number(sp.n) || 0;
  const alerts = sp.alerts as keyof typeof m.flash.alerts | undefined;

  return (
    <div className="max-w-5xl">
      <Link href="/buyer-dashboard/jobs" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {m.back}
      </Link>
      <PageHeader
        title={job.title}
        description={mirror ? t.list.kind.tender_mirror : t.list.kind.quote_request}
        action={
          <div className="flex flex-wrap gap-2">
            {live && (
              <Link href={`/rfps/${job.slug}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
                {m.viewListing} <ExternalLink className="size-3.5" />
              </Link>
            )}
            {!mirror && (
              <Link href={`/buyer-dashboard/jobs/${job.id}/responses`} className={cn(buttonVariants({ size: "sm" }))}>
                {m.responses} ({detail.responses})
              </Link>
            )}
          </div>
        }
      />

      {sp.posted && (
        <div className={cn("mb-6 rounded-lg border p-4 text-sm", sp.posted === "live" ? "border-teal-300 bg-teal-50 text-teal-900" : "border-amber-200 bg-amber-50 text-amber-900")} data-flash={sp.posted}>
          <p className="font-medium">{sp.posted === "live" ? m.flash.live : m.flash.review}</p>
          {sp.posted === "live" && alerts && alerts in m.flash.alerts && <p className="mt-1">{fmt(m.flash.alerts[alerts], { n })}</p>}
        </div>
      )}

      <dl className="mb-8 grid gap-3 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Fact k={m.facts.status} v={<StatusBadge status={job.status} />} />
        <Fact k={m.facts.closes} v={day(job.deadline, lang)} />
        {!mirror && <Fact k={m.facts.questionsBy} v={job.question_deadline ? day(job.question_deadline, lang) : m.noQuestionDeadline} />}
        <Fact k={m.facts.posted} v={day(job.published_at ?? job.created_at ?? null, lang)} />
        {mirror ? (
          <Fact k={m.facts.official} v={job.official_url ? <a href={job.official_url} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline">{job.official_portal || new URL(job.official_url).host}</a> : "—"} />
        ) : (
          <Fact k={m.facts.responses} v={String(detail.responses)} />
        )}
      </dl>
      {mirror && <p className="-mt-5 mb-8 text-sm text-muted-foreground">{m.responsesMirror}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {/* Questions */}
          <Card id="questions" title={m.questions.title} intro={mirror ? m.questions.mirror : m.questions.intro}>
            {!mirror &&
              (detail.questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{m.questions.none}</p>
              ) : (
                <ul className="space-y-4">
                  {detail.questions.map((q) => (
                    <li key={q.id} className="rounded-md border border-border p-4" data-question={q.status}>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{q.status === "answered" ? fmt(m.questions.answered, { date: day(q.answered_at, lang) }) : <b className="text-amber-700">{m.questions.waiting}</b>}</span>
                        <span>{fmt(m.questions.asked, { date: day(q.created_at, lang) })}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm">{q.question}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{q.askerCompany ? fmt(m.questions.askedBy, { company: q.askerCompany }) : m.questions.askedByMember}</p>
                      {q.status === "answered" ? (
                        <div className="mt-3 rounded-md bg-secondary/50 p-3 text-sm">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.questions.published}</p>
                          <p className="mt-1 whitespace-pre-line">{q.public_question ?? q.question}</p>
                          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.questions.answer}</p>
                          <p className="mt-1 whitespace-pre-line">{q.answer}</p>
                        </div>
                      ) : (
                        <AnswerForm rfpId={job.id} questionId={q.id} question={q.question} />
                      )}
                    </li>
                  ))}
                </ul>
              ))}
          </Card>

          {/* Addenda */}
          <Card id="addenda" title={m.addenda.title} intro={m.addenda.intro}>
            {detail.addenda.length === 0 ? (
              <p className="mb-4 text-sm text-muted-foreground">{m.addenda.none}</p>
            ) : (
              <ul className="mb-5 space-y-3">
                {detail.addenda.map((a) => (
                  <li key={a.number} className="rounded-md border border-border p-3 text-sm" data-addendum={a.number}>
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                      <b className="text-foreground">{fmt(m.addenda.number, { n: a.number })}</b>
                      <span>{fmt(m.addenda.issued, { date: when(a.created_at, lang) })}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-line">{a.body}</p>
                    {a.old_deadline && a.new_deadline && <p className="mt-1 text-xs font-medium text-amber-800">{fmt(m.addenda.moved, { from: day(a.old_deadline, lang), to: day(a.new_deadline, lang) })}</p>}
                    {a.official_url && (
                      <a href={a.official_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-teal-700 underline">{m.addenda.document} ↗</a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {(live || job.status === "closed") && <AddendumForm rfpId={job.id} minDate={today} live={live} />}
          </Card>

          {/* Invites */}
          {live && (
            <Card id="invites" title={m.invites.title} intro={m.invites.intro}>
              {preview && (
                <div className="space-y-3">
                  <p className="text-sm">{fmt(m.invites.matching, { n: preview.matching })}</p>
                  {preview.plan.send.length > 0 ? (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.invites.list}</p>
                      <ul className="max-h-60 list-disc overflow-y-auto pl-5 text-sm text-muted-foreground" data-list="invite-preview">
                        {preview.plan.send.map((x) => (
                          <li key={x.orgId}>{x.orgName}{x.city ? ` (${x.city})` : ""}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{m.invites.none}</p>
                  )}
                  {(preview.plan.skipped.already + preview.plan.skipped.unsubscribed + preview.plan.skipped.noEmail > 0) && (
                    <p className="text-xs text-muted-foreground">{fmt(m.invites.skipped, preview.plan.skipped)}</p>
                  )}
                  {preview.plan.overLimit.length > 0 && <p className="text-xs text-amber-800">{fmt(m.invites.overLimit, { n: preview.plan.overLimit.length })}</p>}
                  <p className="text-xs text-muted-foreground">{fmt(m.invites.today, { sent: preview.sentToday, max: INVITE_DAILY_MAX })}</p>
                  {!preview.enabled && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900" data-invites="off">{fmt(m.invites.off, { n: preview.plan.send.length })}</p>}
                  <InviteTradesButton rfpId={job.id} count={preview.plan.send.length} />
                </div>
              )}
              <div className="mt-6 border-t border-border pt-5">
                <InviteByEmailForm rfpId={job.id} />
              </div>
              <div className="mt-6 border-t border-border pt-5">
                <p className="text-sm font-medium">{m.invites.history}</p>
                {detail.invites.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">{m.invites.historyNone}</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm" data-list="invites">
                    {detail.invites.map((i) => (
                      <li key={i.id} className="flex flex-wrap justify-between gap-2">
                        <span>{i.company ?? i.email_key}</span>
                        <span className="text-xs text-muted-foreground">{i.kind === "email" ? m.invites.kindEmail : m.invites.kindTrade} · {when(i.created_at, lang)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          )}

          {/* The record */}
          <Card id="record" title={m.log.title} intro={m.log.intro}>
            {detail.log.length === 0 ? (
              <p className="text-sm text-muted-foreground">{m.log.none}</p>
            ) : (
              <ol className="space-y-1.5 text-sm" data-list="log">
                {detail.log.map((l) => (
                  <li key={l.id} className="flex flex-wrap justify-between gap-2 border-b border-border/60 pb-1.5 last:border-0">
                    <span>
                      {m.log.events[l.event] ?? l.event}
                      {logDetail(l.event, l.detail, m.log.detail, lang)}
                    </span>
                    <time className="text-xs text-muted-foreground" dateTime={l.created_at}>{when(l.created_at, lang)}</time>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          {!mirror && (
            <Card title={m.deadline.title} intro={m.deadline.intro}>
              <p className="mb-3 text-sm">{job.question_deadline ? fmt(m.deadline.current, { date: day(job.question_deadline, lang) }) : m.deadline.none}</p>
              {live && <QuestionDeadlineForm rfpId={job.id} value={job.question_deadline} min={today} max={job.deadline} />}
            </Card>
          )}
          <PartCComingSoon />
        </aside>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className="mt-1">{v}</dd>
    </div>
  );
}

function Card({ id, title, intro, children }: { id?: string; title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {intro && <p className="mt-1 mb-4 text-sm text-muted-foreground">{intro}</p>}
      {children}
    </section>
  );
}

/** A short, plain note after a record entry ("12 notified · 3 emailed"). */
function logDetail(event: string, d: Record<string, unknown>, t: Record<string, string>, lang: Locale): string {
  const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : null);
  const parts: string[] = [];
  if (event === "published" && d.auto) parts.push(t.auto);
  if (event === "broadcast") {
    if (num("notified") != null) parts.push(fmt(t.notified, { n: num("notified")! }));
    if (d.emails_on) parts.push(fmt(t.emailed, { n: num("emailed") ?? 0 }));
    else if (num("would_email")) parts.push(fmt(t.wouldEmail, { n: num("would_email")! }));
  }
  if (event === "invites_sent" && num("sent") != null) parts.push(fmt(t.sent, { n: num("sent")! }));
  if (event === "invites_off" && num("would_send") != null) parts.push(fmt(t.wouldSend, { n: num("would_send")! }));
  if ((event === "addendum_issued" || event === "deadline_changed") && num("number") != null) parts.push(fmt(t.number, { n: num("number")! }));
  if (event === "deadline_changed" && typeof d.from === "string" && typeof d.to === "string") {
    parts.push(fmt(t.moved, { from: formatDate(`${d.from}T12:00:00Z`, lang), to: formatDate(`${d.to}T12:00:00Z`, lang) }));
  }
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

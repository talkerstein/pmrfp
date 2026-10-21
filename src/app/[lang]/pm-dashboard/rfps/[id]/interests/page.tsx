import Link from "@/i18n/link";
import { ArrowLeft, BadgeCheck, ExternalLink } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { CloseRfpButton } from "@/components/dashboard/close-rfp-button";
import { BidButtons } from "@/components/pm-jobs/bid-buttons";
import type { Metadata } from "next";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { fmt, formatDate, plural } from "@/i18n/format";
import { regionName } from "@/i18n/terms";
import { isUsState } from "@/lib/geo";
import { attachedProjectsFor, type AttachedProject } from "@/lib/projects/attach";
import { isSchemaMissing } from "@/lib/projects/compat";
import { canPickOn, isOpenResponse, pmSeesTradeContact, tradeContactCard } from "@/lib/pm-jobs/rules";
import { formatQuote } from "@/lib/pm-jobs/email-copy";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").pm.interests.metaTitle };
}

interface InterestRow {
  id: string;
  status: string;
  message: string | null;
  relevant_experience: string | null;
  availability: string | null;
  created_at: string;
  contact_revealed: boolean;
  trade_organization_id: string;
  submitted_by_user_id: string | null;
  case_study_ids?: string[] | null;
  quote_amount?: number | null;
  quote_kind?: "estimate" | "firm" | null;
  quote_notes?: string | null;
  start_date?: string | null;
  pm_contact_shared?: boolean | null;
  decision_note?: string | null;
}

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  province: string | null;
  verified: boolean | null;
  years_in_business: number | null;
  insurance_status: string | null;
  wsib_status: string | null;
  short_description: string | null;
  public_contact_visibility: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  profile_status: string | null;
}

interface JobInfo {
  id: string;
  title: string;
  slug: string;
  status: string;
  province: string | null;
}

const BASE_COLS = "id,status,message,relevant_experience,availability,created_at,contact_revealed,trade_organization_id,submitted_by_user_id";
const FLOW_COLS = "quote_amount,quote_kind,quote_notes,start_date,pm_contact_shared,decision_note";

/** Picked first, then the shortlist, then the rest newest first; decided ones last. */
const RANK: Record<string, number> = { picked: 0, shortlisted: 1, submitted: 2, viewed: 2, contact_revealed: 2, declined: 3, not_selected: 3, closed: 3 };

export default async function RfpInterestsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await setLangFrom(params);
  const t = getT("pm").interests;
  const r = getT("pmJobs").responses;
  const tp = getT("portfolio").interests;
  const lang = getLang();
  await requireRole(["property_manager", "real_estate_agent"]);
  const { id } = await params;

  let interests: InterestRow[] = [];
  let job: JobInfo | null = null;
  let flowReady = true;
  let attached = new Map<string, AttachedProject[]>();
  const orgs = new Map<string, OrgInfo>();
  const people = new Map<string, { full_name: string | null; email: string | null; phone: string | null }>();
  if (!isDemoMode()) {
    const supabase = await createClient();
    // Read as the poster: row level security returns this job's responses only to its poster (and admins).
    const readInterests = (cols: string) => supabase.from("rfp_interests").select(cols).eq("rfp_id", id).order("created_at", { ascending: false });
    const [first, { data: rfp }] = await Promise.all([
      readInterests(`${BASE_COLS},case_study_ids,${FLOW_COLS}`),
      supabase.from("rfp_posts").select("id,title,slug,status,province").eq("id", id).maybeSingle<JobInfo>(),
    ]);
    job = rfp ?? null;
    let ints = first.data as unknown as InterestRow[] | null;
    if (isSchemaMissing(first.error)) {
      // Before migration 20261021000020 (no quote or decision columns), or before the portfolio one.
      flowReady = false;
      const legacy = await readInterests(`${BASE_COLS},case_study_ids`);
      ints = (isSchemaMissing(legacy.error) ? (await readInterests(BASE_COLS)).data : legacy.data) as unknown as InterestRow[] | null;
    }
    interests = (ints ?? []).sort((a, b) => (RANK[a.status] ?? 2) - (RANK[b.status] ?? 2));
    // Company details and contacts for the responses this poster can read (rows above).
    if (interests.length && isServiceConfigured()) {
      const db = createServiceClient();
      const submitters = [...new Set(interests.map((i) => i.submitted_by_user_id).filter((x): x is string => Boolean(x)))];
      const [{ data: orgRows }, { data: peopleRows }] = await Promise.all([
        db
          .from("organizations")
          .select("id,name,slug,city,province,verified,years_in_business,insurance_status,wsib_status,short_description,public_contact_visibility,email,phone,website,profile_status")
          .in("id", [...new Set(interests.map((i) => i.trade_organization_id))]),
        submitters.length ? db.from("users_profile").select("id,full_name,email,phone").in("id", submitters) : Promise.resolve({ data: [] }),
      ]);
      for (const o of (orgRows ?? []) as OrgInfo[]) orgs.set(o.id, o);
      for (const p of (peopleRows ?? []) as { id: string; full_name: string | null; email: string | null; phone: string | null }[]) people.set(p.id, p);
    }
    attached = await attachedProjectsFor(
      interests.map((i) => ({ id: i.id, organizationId: i.trade_organization_id, caseStudyIds: i.case_study_ids ?? [] })),
    );
  }

  const status = job?.status ?? null;
  const closed = status === "awarded" || status === "closed" || status === "expired" || status === "archived";
  const pickedRow = interests.find((i) => i.status === "picked");
  const anyPicked = Boolean(pickedRow);
  const currency = isUsState(job?.province) ? "USD" : "CAD";
  const shortlisted = interests.filter((i) => i.status === "shortlisted").length;

  return (
    <div>
      <Link href="/pm-dashboard/rfps" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {r.back}
      </Link>
      <PageHeader
        title={job?.title ?? t.title}
        description={r.description}
        action={
          job?.slug ? (
            <Link href={`/rfps/${job.slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-ink hover:underline">
              {r.viewListing} <ExternalLink className="size-3.5" />
            </Link>
          ) : undefined
        }
      />

      {interests.length > 0 && (
        <p className="-mt-2 mb-4 text-sm text-muted-foreground">
          {plural(interests.length, r.count)}
          {shortlisted > 0 && <> · {plural(shortlisted, r.shortlistCount)}</>}
        </p>
      )}

      {pickedRow && (
        <div className="mb-6 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success" data-state="awarded">
          {fmt(r.awarded, { company: orgs.get(pickedRow.trade_organization_id)?.name ?? "" })}
        </div>
      )}
      {!flowReady && <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{r.schemaMissing}</p>}
      {closed && !anyPicked && status !== "awarded" && interests.length > 0 && <p className="mb-6 text-sm text-muted-foreground">{r.closed}</p>}

      {!isDemoMode() && !anyPicked && (
        <div className="mb-6">
          <CloseRfpButton rfpId={id} alreadyClosed={closed} />
        </div>
      )}

      {interests.length === 0 ? (
        <EmptyState title={r.emptyTitle} description={r.emptyDescription} />
      ) : (
        <ul className="space-y-4">
          {interests.map((it) => {
            const org = orgs.get(it.trade_organization_id);
            const person = it.submitted_by_user_id ? people.get(it.submitted_by_user_id) : undefined;
            const seeContact = pmSeesTradeContact({ status: it.status, contactRevealed: it.contact_revealed, tradeVisibility: org?.public_contact_visibility });
            const contact = org ? tradeContactCard({ org, submitter: person }) : null;
            const open = isOpenResponse(it.status);
            const projects = attached.get(it.id) ?? [];
            return (
              <li key={it.id} className="rounded-lg border border-border bg-card p-5" data-status={it.status}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {org?.slug && org.profile_status === "approved" ? (
                        <Link href={`/directory/${org.slug}`} className="text-base font-semibold hover:text-teal-700">
                          {org.name}
                        </Link>
                      ) : (
                        <span className="text-base font-semibold">{org?.name ?? "—"}</span>
                      )}
                      {org?.verified && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-ink">
                          <BadgeCheck className="size-3.5" /> {r.verified}
                        </span>
                      )}
                      <StatusBadge status={it.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[org?.city, org?.province && regionName(org.province, lang)].filter(Boolean).join(", ")}
                      {org?.city || org?.province ? " · " : ""}
                      {fmt(r.responded, { date: formatDate(it.created_at, lang) })}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{r.price}</div>
                    <div className="text-lg font-semibold">
                      {it.quote_amount != null ? (
                        <>
                          {formatQuote(Number(it.quote_amount), currency, lang)}{" "}
                          {it.quote_kind && <span className="text-xs font-medium text-muted-foreground">({it.quote_kind === "firm" ? r.firm : r.estimate})</span>}
                        </>
                      ) : (
                        <span className="text-sm font-normal text-muted-foreground">{r.noPrice}</span>
                      )}
                    </div>
                    {it.start_date && <div className="text-xs text-muted-foreground">{fmt(r.start, { date: formatDate(it.start_date, lang) })}</div>}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_16rem]">
                  <div className="space-y-3 text-sm">
                    <Section label={r.message} body={it.message} />
                    <Section label={r.priceIncludes} body={it.quote_notes ?? null} />
                    <Section label={r.availability} body={it.availability} />
                    <Section label={r.experience} body={it.relevant_experience} />
                    {projects.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-foreground">{tp.attached}</div>
                        {projects.map((p) => (
                          <Link key={p.id} href={p.href} className="mt-0.5 block text-sm font-medium text-teal-ink hover:underline" target="_blank">
                            {p.title}
                          </Link>
                        ))}
                      </div>
                    )}
                    {it.status === "declined" && it.decision_note && <p className="text-xs text-muted-foreground">{fmt(r.yourNote, { note: it.decision_note })}</p>}
                  </div>
                  <aside className="space-y-2 rounded-md bg-secondary/40 p-3 text-xs">
                    {org?.short_description && <p className="text-muted-foreground">{org.short_description}</p>}
                    {org?.years_in_business ? <p>{fmt(r.years, { n: org.years_in_business })}</p> : null}
                    {org?.insurance_status && <p><b>{r.insurance}:</b> {org.insurance_status}</p>}
                    {org?.wsib_status && <p><b>{r.wsib}:</b> {org.wsib_status}</p>}
                    <div className="border-t border-border pt-2">
                      <div className="font-semibold">{r.contact}</div>
                      {seeContact && contact ? (
                        <ContactLines contact={contact} website={org?.website ?? null} />
                      ) : (
                        <p className="text-muted-foreground">{r.contactHidden}</p>
                      )}
                    </div>
                    {it.pm_contact_shared && it.status !== "picked" && <p className="text-teal-ink">{r.sharedYou}</p>}
                    {org?.slug && org.profile_status === "approved" && (
                      <Link href={`/directory/${org.slug}`} className="inline-block font-medium text-teal-ink hover:underline">
                        {r.profile} →
                      </Link>
                    )}
                  </aside>
                </div>

                {flowReady && open && !anyPicked && !isDemoMode() && (
                  <div className="mt-4 border-t border-border pt-4">
                    <BidButtons
                      rfpId={id}
                      interestId={it.id}
                      company={org?.name ?? ""}
                      shortlisted={it.status === "shortlisted"}
                      canPick={Boolean(status && canPickOn(status))}
                      contactShared={Boolean(it.pm_contact_shared)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Section({ label, body }: { label: string; body: string | null }) {
  if (!body) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-foreground">{label}</div>
      <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{body}</p>
    </div>
  );
}

function ContactLines({ contact, website }: { contact: { name: string | null; email: string | null; phone: string | null }; website: string | null }) {
  return (
    <div className="mt-1 space-y-0.5">
      {contact.name && <p>{contact.name}</p>}
      {contact.email && (
        <p>
          <a href={`mailto:${contact.email}`} className="text-teal-ink hover:underline">{contact.email}</a>
        </p>
      )}
      {contact.phone && (
        <p>
          <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="text-teal-ink hover:underline">{contact.phone}</a>
        </p>
      )}
      {website && (
        <p>
          <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noopener noreferrer" className="text-teal-ink hover:underline">
            {website.replace(/^https?:\/\//, "")}
          </a>
        </p>
      )}
    </div>
  );
}


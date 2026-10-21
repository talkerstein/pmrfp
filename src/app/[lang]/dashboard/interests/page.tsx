import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { fmt, formatDate } from "@/i18n/format";
import type { Metadata } from "next";
import { getDictionary, type Messages } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { isUsState } from "@/lib/geo";
import { isSchemaMissing } from "@/lib/projects/compat";
import { responseAllowance, tradeSeesPmContact, type ContactCard } from "@/lib/pm-jobs/rules";
import { formatQuote } from "@/lib/pm-jobs/email-copy";
import { freeResponsesUsed } from "@/lib/pm-jobs/server";
import { JOB_DECISION_COLS, posterContact, type JobForDecision } from "@/lib/pm-jobs/decisions";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").dash.meta.interests };
}

interface InterestRow {
  id: string;
  rfp_id: string;
  status: string;
  message: string | null;
  created_at: string;
  quote_amount?: number | null;
  quote_kind?: string | null;
  pm_contact_shared?: boolean | null;
  decision_note?: string | null;
}

export default async function InterestsPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("dash").interests;
  const o = getT("pmJobs").outcome;
  const session = await requireRole(["trade", "supplier"]);

  let interests: InterestRow[] = [];
  const jobs = new Map<string, JobForDecision>();
  const contacts = new Map<string, ContactCard>();
  let used: number | null = null;
  if (!isDemoMode() && session.organization) {
    const supabase = await createClient();
    // Read as the member: row level security returns this company's own responses only.
    const read = (cols: string) =>
      supabase.from("rfp_interests").select(cols).eq("trade_organization_id", session.organization!.id).order("created_at", { ascending: false });
    const first = await read("id,rfp_id,status,message,created_at,quote_amount,quote_kind,pm_contact_shared,decision_note");
    const data = isSchemaMissing(first.error) ? (await read("id,rfp_id,status,message,created_at")).data : first.data;
    interests = (data as unknown as InterestRow[] | null) ?? [];
    if (isServiceConfigured()) {
      const db = createServiceClient();
      // A free account can't read full listings, so titles (and, once the poster chose this company, their contact) come server-side.
      if (interests.length) {
        const { data: rows } = await db.from("rfp_posts").select(JOB_DECISION_COLS).in("id", [...new Set(interests.map((i) => i.rfp_id))]);
        for (const j of (rows ?? []) as JobForDecision[]) jobs.set(j.id, j);
        await Promise.all(
          interests
            .filter((i) => tradeSeesPmContact({ status: i.status, pmContactShared: i.pm_contact_shared }) && jobs.has(i.rfp_id))
            .map(async (i) => contacts.set(i.id, await posterContact(db, jobs.get(i.rfp_id)!))),
        );
      }
      if (!session.hasTradeAccess) used = await freeResponsesUsed(db, session.organization.id);
    }
  }
  const allowance = session.hasTradeAccess ? responseAllowance({ pro: true, usedThisMonth: 0 }) : used === null ? null : responseAllowance({ pro: false, usedThisMonth: used });

  return (
    <div>
      <PageHeader
        title={t.title}
        description={t.description}
      />

      {allowance && (
        <p className="mb-4 rounded-md border border-teal-300/60 bg-teal-50/60 px-3 py-2 text-sm" data-allowance={allowance.unlimited ? "unlimited" : allowance.left}>
          {allowance.unlimited
            ? o.allowanceUnlimited
            : allowance.left > 0
              ? fmt(o.allowanceLeft, { left: allowance.left, limit: allowance.limit })
              : fmt(o.allowanceNone, { limit: allowance.limit })}
          {!allowance.unlimited && (
            <>
              {" "}
              <Link href="/dashboard/billing?plan=pro&interval=monthly" className="font-semibold text-teal-ink underline">
                {o.upgrade}
              </Link>
            </>
          )}
        </p>
      )}

      {interests.length === 0 ? (
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyBody}
        >
          <Link href="/dashboard/rfps" className={buttonVariants()}>
            {t.viewFeed}
          </Link>
        </EmptyState>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.colRfp}</TableHead>
                <TableHead>{t.colSubmitted}</TableHead>
                <TableHead>{t.colStatus}</TableHead>
                <TableHead>{o.colOutcome}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interests.map((it) => {
                const rfp = jobs.get(it.rfp_id);
                const contact = contacts.get(it.id);
                const currency = isUsState(rfp?.province) ? "USD" : "CAD";
                return (
                  <TableRow key={it.id} data-status={it.status}>
                    <TableCell className="font-medium">
                      {rfp ? (
                        <Link href={`/rfps/${rfp.slug}`} className="hover:text-teal-700">
                          {rfp.title}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {it.quote_amount != null && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {fmt(o.yourPrice, { amount: formatQuote(Number(it.quote_amount), currency, lang) })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(it.created_at, lang)}</TableCell>
                    <TableCell>
                      <StatusBadge status={it.status} />
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-normal text-sm">
                      <Outcome status={it.status} note={it.decision_note ?? null} contact={contact ?? null} o={o} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Outcome({ status, note, contact, o }: { status: string; note: string | null; contact: ContactCard | null; o: Messages["pmJobs"]["outcome"] }) {
  if (contact) {
    return (
      <div data-contact="revealed">
        <p className="font-medium text-success">{status === "picked" ? o.picked : o.shared}</p>
        <p className="mt-1 text-muted-foreground">
          {[contact.name, contact.company].filter(Boolean).join(" · ")}
          {contact.email && (
            <>
              <br />
              {o.email}: <a href={`mailto:${contact.email}`} className="text-teal-ink hover:underline">{contact.email}</a>
            </>
          )}
          {contact.phone && (
            <>
              <br />
              {o.phone}: <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="text-teal-ink hover:underline">{contact.phone}</a>
            </>
          )}
        </p>
      </div>
    );
  }
  if (status === "declined") {
    return (
      <p className="text-muted-foreground">
        {o.declined}
        {note && (
          <>
            <br />
            {fmt(o.declinedNote, { note })}
          </>
        )}
      </p>
    );
  }
  if (status === "not_selected") return <p className="text-muted-foreground">{o.notSelected}</p>;
  if (status === "shortlisted") return <p className="text-teal-ink">{o.shortlisted}</p>;
  return <p className="text-muted-foreground">{o.waiting}</p>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, MapPin, FileText, Building2, DollarSign } from "lucide-react";
import { Container } from "@/components/container";
import { Badge } from "@/components/ui/badge";
import { LockedContentPanel } from "@/components/public/locked-content-panel";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { SaveButton } from "@/components/dashboard/save-button";
import { ExpressInterestDialog } from "@/components/forms/express-interest-dialog";
import { getFullRfp, getRfpTeaser } from "@/lib/data/rfps";
import { getSession, hasActiveTradeAccess } from "@/lib/access/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const rfp = await getRfpTeaser(slug);
  if (!rfp) return { title: "Opportunity not found" };
  return {
    title: `${rfp.title} — RFP Opportunity`,
    description: rfp.summary ?? "Commercial property RFP opportunity on PMRFP.",
  };
}

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }) : "—";
}

export default async function RfpDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const teaser = await getRfpTeaser(slug);
  if (!teaser) notFound();

  const configured = isSupabaseConfigured();
  const session = await getSession();
  const access = await hasActiveTradeAccess();
  const forceLocked = sp.view === "locked";
  const showFull = configured ? access : !forceLocked;
  const full = showFull ? await getFullRfp(slug) : null;

  return (
    <Container className="py-10">
      <Link href="/rfps" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to opportunities
      </Link>

      {!configured && (
        <div className="mt-4 rounded-lg border border-dashed border-teal-300 bg-teal-50/50 p-3 text-sm text-muted-foreground">
          <strong className="text-foreground">Demo preview.</strong>{" "}
          {showFull ? (
            <>You&apos;re seeing the full Trade Pro member view.{" "}
              <Link href={`/rfps/${slug}?view=locked`} className="text-teal-700 underline">See the visitor (locked) view</Link>.</>
          ) : (
            <>You&apos;re seeing the visitor (locked) view.{" "}
              <Link href={`/rfps/${slug}`} className="text-teal-700 underline">See the full member view</Link>.</>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {teaser.categories.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
            {teaser.propertyTypeName && <Badge variant="outline">{teaser.propertyTypeName}</Badge>}
            {teaser.isDemo && <Badge variant="outline" className="border-dashed">Sample</Badge>}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{teaser.title}</h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {teaser.regionName && <span className="flex items-center gap-1.5"><MapPin className="size-4" /> {teaser.regionName}</span>}
            <span className="flex items-center gap-1.5"><CalendarClock className="size-4" /> Closes {fmt(teaser.deadline)}</span>
          </div>

          {teaser.summary && <p className="mt-6 text-lg leading-relaxed text-foreground/90">{teaser.summary}</p>}

          {showFull && full ? (
            <div className="mt-8 space-y-8">
              <Block title="Project scope" body={full.scope} />
              <Block title="Requirements" body={full.requirements} />
              {(full.budgetPublic && (full.budgetMin || full.budgetMax)) && (
                <Section2 title="Budget range" icon={<DollarSign className="size-4" />}>
                  ${full.budgetMin?.toLocaleString() ?? "—"} – ${full.budgetMax?.toLocaleString() ?? "—"} CAD
                </Section2>
              )}
              <Block title="Submission instructions" body={full.submissionInstructions} />
              <Section2 title="Contact" icon={<Building2 className="size-4" />}>
                {full.contactVisibility === "public_contact" ? (
                  <span>{[full.contactName, full.contactEmail, full.contactPhone].filter(Boolean).join(" · ") || "Provided after sign-in"}</span>
                ) : full.contactVisibility === "anonymous_until_interest_approved" ? (
                  <span>Contact details are revealed after the property manager approves your interest.</span>
                ) : (
                  <span>This opportunity is mediated by PMRFP — express interest to connect.</span>
                )}
              </Section2>
              <TrustDisclaimer />
            </div>
          ) : (
            <div className="mt-8">
              <LockedContentPanel signedIn={Boolean(session)} />
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <Meta label="Region" value={teaser.regionName ?? "—"} />
            <Meta label="Property type" value={teaser.propertyTypeName ?? "—"} />
            <Meta label="Closes" value={fmt(teaser.deadline)} />
            {showFull && full ? (
              <div className="flex flex-col gap-2 pt-2">
                <ExpressInterestDialog rfpId={full.id} rfpTitle={full.title} />
                <SaveButton rfpId={full.id} />
              </div>
            ) : (
              <div className="pt-2">
                <FileText className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Full details, documents, and the ability to express interest are available to Trade
                  Pro members.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </Container>
  );
}

function Block({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 whitespace-pre-line leading-relaxed text-foreground/90">{body}</p>
    </div>
  );
}

function Section2({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">{icon} {title}</h2>
      <div className="mt-2 leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

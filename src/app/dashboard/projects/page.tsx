import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, CheckCircle2, Clock, ImageIcon } from "lucide-react";
import { isDemoMode, requireRole } from "@/lib/access/access";
import { listMyInvites, listMyProjects, projectsReady, type MyInvite } from "@/lib/projects/server";
import { canAddProject } from "@/lib/projects/limits";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { ReviewRequestForm } from "@/components/projects/review-request-form";

export const metadata: Metadata = { title: "Projects · PMRFP" };

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

/**
 * The company's projects (photo captures and typed case studies alike),
 * with "Ask for a review" on each published one. Review requests are a
 * Trade Pro feature; free plans see the upgrade link instead.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ published?: string; submitted?: string }>;
}) {
  const session = await requireRole(["trade", "supplier"]);
  const org = session.organization;
  if (!org) redirect("/onboarding");
  const demo = isDemoMode();
  const paid = session.hasTradeAccess;
  const { published, submitted } = await searchParams;

  const [projects, invites, ready] = demo
    ? ([[], [], false] as const)
    : await Promise.all([listMyProjects(org.id), listMyInvites(org.id), projectsReady()]);

  const activeCount = projects.filter((p) => p.status !== "rejected" && p.status !== "archived").length;
  const canAdd = canAddProject(paid, activeCount);
  const invitesFor = (id: string) => invites.filter((i) => i.caseStudyId === id);

  return (
    <>
      {demo && <DemoBanner />}
      <PageHeader
        title="Projects"
        description="Real jobs with real photos. They show on your profile and help property managers pick you."
        action={
          ready && canAdd ? (
            <Link href="/dashboard/projects/new" className={buttonVariants({ size: "lg" })}>
              <Camera /> Add a project
            </Link>
          ) : undefined
        }
      />

      {published && (
        <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-300 bg-teal-50 p-4 text-sm">
          <span className="flex items-center gap-2 font-medium text-teal-ink">
            <CheckCircle2 className="size-4" /> Your project is live.
          </span>
          <Link href={`/case-studies/${encodeURIComponent(published)}`} className="font-medium text-teal-ink underline">
            See it
          </Link>
        </div>
      )}
      {submitted && (
        <div role="status" className="mb-6 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <Clock className="size-4" /> Sent for review. We usually check projects within a day.
        </div>
      )}

      {!ready && !demo && (
        <p className="mb-6 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Photo projects are switching on soon. Until then you can{" "}
          <Link href="/dashboard/case-studies/new" className="font-medium text-teal-ink hover:underline">
            write up a project as a case study
          </Link>
          .
        </p>
      )}

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Camera className="mx-auto size-8 text-teal-600" />
          <h2 className="mt-3 text-lg font-semibold">Show a job you&apos;re proud of</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Before and after photos plus a few lines. Property managers trust a finished job more than
            any sales pitch.
          </p>
          {ready && (
            <Link href="/dashboard/projects/new" className={buttonVariants({ size: "lg", className: "mt-5" })}>
              Add your first project
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {projects.map((p) => (
            <li key={p.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex gap-4">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-secondary sm:size-24">
                  {p.heroUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- dashboard thumbnail
                    <img src={p.heroUrl} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <ImageIcon className="absolute inset-0 m-auto size-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={p.status} />
                    <span className="text-xs text-muted-foreground">{fmtDate(p.createdAt)}</span>
                  </div>
                  <h2 className="mt-1 font-semibold leading-snug">{p.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {[p.city, p.province].filter(Boolean).join(", ")}
                    {p.status === "published" && (
                      <>
                        {p.city || p.province ? " · " : ""}
                        <Link href={`/case-studies/${p.slug}`} className="font-medium text-teal-ink hover:underline">
                          View
                        </Link>
                      </>
                    )}
                  </p>
                  {p.status === "pending_review" && (
                    <p className="mt-2 text-xs text-muted-foreground">We&apos;re checking it. Usually within a day.</p>
                  )}
                  {p.status === "rejected" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Not published. <Link href="/contact" className="text-teal-ink hover:underline">Ask us why</Link>.
                    </p>
                  )}
                </div>
              </div>

              {p.status === "published" && ready && (
                <div className="mt-4 border-t border-border pt-4">
                  <h3 className="text-sm font-semibold">Ask the client for a review</h3>
                  {paid ? (
                    <>
                      <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
                        We email them a one-time link. Every review is checked before it shows, good or bad.
                      </p>
                      <ReviewRequestForm caseStudyId={p.id} />
                      <InviteList invites={invitesFor(p.id)} />
                    </>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Reviews from your clients show on your profile and this project.{" "}
                      <Link href="/pricing" className="font-medium text-teal-ink hover:underline">
                        Upgrade to Trade Pro
                      </Link>{" "}
                      to ask for them.
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {projects.some((p) => p.status === "published") && (
        <p className="mt-6 text-sm text-muted-foreground">
          Bidding on a job?{" "}
          <Link href="/dashboard/projects/reference-sheet" className="font-medium text-teal-ink hover:underline">
            Print a reference sheet
          </Link>{" "}
          with your published projects and the clients who agreed to be references.
        </p>
      )}

      {ready && !canAdd && (
        <p className="mt-6 text-sm text-muted-foreground">
          The free plan includes one project.{" "}
          <Link href="/pricing" className="font-medium text-teal-ink hover:underline">Trade Pro</Link> adds more
          projects, more photos, and client reviews.
        </p>
      )}
    </>
  );
}

function InviteList({ invites }: { invites: MyInvite[] }) {
  if (invites.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
      {invites.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium text-foreground">{i.clientName}</span>
          <span>{i.clientEmail}</span>
          <span>·</span>
          {i.usedAt ? (
            <span className="text-teal-ink">Reviewed {fmtDate(i.usedAt)}</span>
          ) : (
            <span>Asked {fmtDate(i.createdAt)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

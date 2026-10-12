import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/stat-card";
import { SponsorForm } from "@/components/admin/sponsor-form";
import { SponsorCard } from "@/components/sponsors/sponsor-card";
import { setSponsorStatusAction } from "@/lib/sponsors/actions";
import { loadAdminSponsor } from "@/lib/sponsors/admin";
import { COPY_PROBLEM_TEXT, checkSponsorCopy } from "@/lib/sponsors/model";
import { sponsorHref } from "@/lib/sponsors/registry";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Sponsor · Admin · PMRFP" };

const NEXT: Record<string, { to: string; label: string; primary?: boolean }[]> = {
  draft: [{ to: "pending", label: "Mark paid / ready for review" }, { to: "approved", label: "Approve and go live", primary: true }, { to: "rejected", label: "Reject" }],
  pending: [{ to: "approved", label: "Approve and go live", primary: true }, { to: "rejected", label: "Reject" }, { to: "draft", label: "Back to draft (frees the slot)" }],
  approved: [{ to: "paused", label: "Pause (keeps the slot)" }, { to: "ended", label: "End today" }],
  paused: [{ to: "approved", label: "Resume", primary: true }, { to: "ended", label: "End today" }],
  ended: [{ to: "draft", label: "Reopen as draft" }],
  rejected: [{ to: "draft", label: "Reopen as draft" }],
};

/** Edit one sponsor, preview its card, and move it through review. "new" creates one. */
export default async function AdminSponsorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  if (!isNew && (isDemoMode() || !/^[0-9a-f-]{36}$/i.test(id))) notFound();
  const row = isNew ? null : await loadAdminSponsor(await createClient(), id);
  if (!isNew && !row) notFound();

  const problems = row
    ? checkSponsorCopy({
        name: row.name,
        url: row.url,
        headline: row.headline,
        message: row.message,
        cta: row.cta,
        headlineFr: row.headline_fr,
        messageFr: row.message_fr,
        ctaFr: row.cta_fr,
        regions: row.regions ?? [],
      })
    : [];

  return (
    <>
      <PageHeader
        title={row ? row.name : "New sponsor"}
        description={row ? `${row.status} · ${row.tier} · ${row.country}${row.stripe_subscription_id ? " · paid by card (Stripe)" : ""}` : "Create the sponsorship, then approve it when the copy is final."}
      />
      <p className="mb-4 text-sm">
        <Link href="/admin/sponsors" className="text-teal-ink underline">← All sponsors</Link>
        {row && <> · <Link href={`/admin/sponsors/${row.id}/report`} className="text-teal-ink underline">Monthly report</Link></>}
      </p>
      {sp.saved && <p className="mb-4 rounded-md border border-teal-300 bg-teal-50 p-3 text-sm">Saved.</p>}
      {sp.error && <p className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{sp.error}</p>}

      {row && (
        <section className="mb-8 grid max-w-3xl gap-6 md:grid-cols-[1fr_1fr]">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Preview</h2>
            {row.headline && row.message && row.cta ? (
              <SponsorCard
                label="Sponsored"
                unit={{
                  id: row.slug,
                  name: row.name,
                  logo: row.logo_url,
                  label: "Sponsored",
                  headline: row.headline,
                  body: row.message,
                  cta: row.cta,
                  href: sponsorHref(row.slug, "rfp_detail", row.trades?.[0] ?? null),
                  paid: true,
                  placement: "rfp_detail",
                  trade: row.trades?.[0] ?? "",
                  region: "",
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Add a headline, message and button text to preview the card.</p>
            )}
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Review</h2>
            {problems.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-red-800">
                {problems.map((p) => <li key={p}>{COPY_PROBLEM_TEXT[p]}</li>)}
              </ul>
            ) : (
              <p className="text-sm text-teal-800">Copy passes the rules. Slot exclusivity is checked when you approve.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {(NEXT[row.status] ?? []).map((n) => (
                <form key={n.to} action={setSponsorStatusAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="to" value={n.to} />
                  <button
                    className={
                      n.primary
                        ? "rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                        : "rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-secondary"
                    }
                  >
                    {n.label}
                  </button>
                </form>
              ))}
            </div>
            {row.contact_email && <p className="mt-4 text-sm text-muted-foreground">Contact: {row.contact_name ? `${row.contact_name}, ` : ""}{row.contact_email}</p>}
          </div>
        </section>
      )}

      <SponsorForm row={row} />
    </>
  );
}

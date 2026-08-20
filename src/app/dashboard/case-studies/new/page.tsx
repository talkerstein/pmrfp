import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/access/access";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { submitCaseStudyAction } from "@/lib/case-studies/actions";
import { PageHeader } from "@/components/dashboard/stat-card";

export const metadata: Metadata = { title: "Submit a Case Study · PMRFP" };

/**
 * Guided case-study submission. The structure IS the help: challenge →
 * approach → outcome with concrete prompts, so a busy contractor produces a
 * substantive write-up instead of a two-line testimonial. Published studies
 * deepen their profile, the /case-studies index, and their trade×city page.
 */
export default async function NewCaseStudyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!session.organization) redirect("/onboarding");
  const { error } = await searchParams;

  const [categories, regions] = await Promise.all([getCategories(), getRegions()]);

  const field =
    "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  const label = "block text-sm font-medium";
  const hint = "mt-1 text-xs text-muted-foreground";

  return (
    <>
      <PageHeader
        title="Submit a case study"
        description="Write up one real, completed project. We review before it publishes — no marketing fluff, just what happened and how it went."
      />

      {error && (
        <div className="mb-4 rounded-md border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {decodeURIComponent(error)}
        </div>
      )}

      <form action={submitCaseStudyAction} className="max-w-2xl space-y-5">
        <div>
          <label htmlFor="title" className={label}>Project title *</label>
          <input id="title" name="title" required className={field}
            placeholder="Flat roof replacement — 40,000 sq ft retail plaza, Mississauga" />
          <p className={hint}>Name the work, the building type, and the place — that&rsquo;s what people search for.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="categorySlug" className={label}>Trade category</label>
            <select id="categorySlug" name="categorySlug" className={field} defaultValue="">
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="regionSlug" className={label}>Region</label>
            <select id="regionSlug" name="regionSlug" className={field} defaultValue="">
              <option value="">Select…</option>
              {regions.map((r) => (
                <option key={r.slug} value={r.slug}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="city" className={label}>City</label>
            <input id="city" name="city" className={field} placeholder="Mississauga" />
          </div>
          <div>
            <label htmlFor="province" className={label}>Province</label>
            <input id="province" name="province" className={field} placeholder="Ontario" />
          </div>
          <div>
            <label htmlFor="propertyType" className={label}>Property type</label>
            <input id="propertyType" name="propertyType" className={field} placeholder="Retail plaza" />
          </div>
        </div>

        <div>
          <label htmlFor="challenge" className={label}>The challenge *</label>
          <textarea id="challenge" name="challenge" required rows={4} className={field}
            placeholder="What was wrong with the building, and what made it hard? Age, access, tenants in place, weather window, code issues…" />
          <p className={hint}>What did the property manager actually need solved? A few sentences minimum.</p>
        </div>

        <div>
          <label htmlFor="approach" className={label}>Your approach *</label>
          <textarea id="approach" name="approach" required rows={4} className={field}
            placeholder="How you scoped it, what you chose and why, how you worked around the constraints…" />
          <p className={hint}>The decisions, not the sales pitch. This is what makes it credible.</p>
        </div>

        <div>
          <label htmlFor="outcome" className={label}>The outcome *</label>
          <textarea id="outcome" name="outcome" required rows={4} className={field}
            placeholder="What was delivered, on what timeline, and what changed for the building…" />
          <p className={hint}>Concrete results. Numbers where you have them, honesty where you don&rsquo;t.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="timeline" className={label}>Timeline</label>
            <input id="timeline" name="timeline" className={field} placeholder="6 weeks, May–June 2026" />
          </div>
          <div>
            <label htmlFor="budgetBand" className={label}>Budget band (optional)</label>
            <input id="budgetBand" name="budgetBand" className={field} placeholder="$100k–$250k" />
            <p className={hint}>A range is fine — never publish a client&rsquo;s exact number without their OK.</p>
          </div>
        </div>

        <button
          type="submit"
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Submit for review
        </button>
        <p className="text-xs text-muted-foreground">
          Reviewed before publishing. Don&rsquo;t include a client&rsquo;s name or address unless you have
          their written permission.
        </p>
      </form>
    </>
  );
}

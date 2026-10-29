import type { Metadata } from "next";
import Link from "@/i18n/link";
import { redirect } from "next/navigation";
import { HardHat } from "lucide-react";
import { Container } from "@/components/container";
import { JobPostForm } from "@/components/jobs/job-forms";
import { JobWizard } from "@/components/jobs/job-wizard";
import { getSession } from "@/lib/access/access";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { FREE_JOB_LIMIT, JOB_DAYS } from "@/lib/jobs/rules";
import { gcFormPath } from "@/lib/gc/packages";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: getDictionary(hasLocale(lang) ? lang : "en").jobs.post.metaTitle,
    robots: { index: false, follow: false },
  };
}

export default async function PostJobPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("jobs").post;
  const session = await getSession();
  // Cold visitors sign up first (as a GC/PM by default: the usual employer
  // who isn't already a trade member) and land back here.
  if (!session) redirect(localizePath(`/sign-up?role=property_manager&next=${encodeURIComponent("/jobs/post")}`, lang));
  if (!session.organization) redirect(localizePath(`/onboarding?next=${encodeURIComponent("/jobs/post")}`, lang));
  const [trades, regions] = await Promise.all([getCategories(), getRegions()]);
  const approved = session.organization.profile_status === "approved";

  return (
    <Container size="narrow" className="py-10">
      <Link href="/jobs/manage" className="text-sm text-muted-foreground hover:text-foreground">
        {t.back}
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{t.metaTitle}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        {fmt(t.intro, { org: session.organization.name, days: JOB_DAYS, limit: FREE_JOB_LIMIT })}{" "}
        {session.hasTradeAccess ? t.introPro : t.introFree}
      </p>

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-4 text-sm">
        <HardHat className="mt-0.5 size-4 shrink-0 text-teal-700" />
        <p className="text-muted-foreground">
          <strong className="text-foreground">{t.subTitle}</strong> {t.subBody}{" "}
          <Link href={gcFormPath()} className="font-medium text-teal-700 hover:underline">
            {t.subLink}
          </Link>
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6 sm:p-8">
        {approved ? (
          // The guided wizard is English for now; French and Spanish keep the plain form.
          lang === "en" ? (
            <JobWizard
              trades={trades.map((c) => ({ slug: c.slug, name: tradeName(c.name, lang) }))}
              regions={regions.map((r) => ({ slug: r.slug, name: regionName(r.name, lang) }))}
            />
          ) : (
            <JobPostForm
              trades={trades.map((c) => ({ slug: c.slug, name: tradeName(c.name, lang) }))}
              regions={regions.map((r) => ({ slug: r.slug, name: regionName(r.name, lang) }))}
            />
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            {t.pending}{" "}
            <Link href="/contact" className="font-medium text-teal-700 hover:underline">
              {t.contact}
            </Link>{" "}
            {t.pendingAfter}
          </p>
        )}
      </div>
    </Container>
  );
}

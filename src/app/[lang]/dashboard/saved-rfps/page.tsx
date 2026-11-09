import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { loadSavedRfpTitles } from "@/lib/d1/saved-page";
import { PageHeader } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { getT, setLangFrom } from "@/i18n/server";
import type { Metadata } from "next";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").dash.meta.saved };
}

export default async function SavedRfpsPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("dash").saved;
  // Saving is free (lib/access/free-actions): trade and supplier accounts.
  const session = await requireRole(["trade", "supplier"]);

  const saved = isDemoMode() ? [] : await loadSavedRfpTitles(session.userId);

  return (
    <div>
      <PageHeader
        title={t.title}
        description={t.description}
      />

      {saved.length === 0 ? (
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyBody}
        >
          <Link href="/rfps" className={buttonVariants()}>
            {t.browse}
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((r) => (
            <Link
              key={r.slug}
              href={`/rfps/${r.slug}`}
              className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-teal-400"
            >
              <h3 className="text-base font-semibold leading-snug">{r.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t.view}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

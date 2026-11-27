import Link from "@/i18n/link";
import { requireRole } from "@/lib/access/access";
import { PageHeader } from "@/components/dashboard/stat-card";
import { getT, setLangFrom } from "@/i18n/server";
import type { Metadata } from "next";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").dash.meta.settings };
}

const NOTIFICATIONS = [
  { id: "new-rfps", key: "newRfps", defaultChecked: true },
  { id: "interest-updates", key: "interestUpdates", defaultChecked: true },
  { id: "intro-requests", key: "introRequests", defaultChecked: true },
  { id: "product", key: "product", defaultChecked: false },
] as const;

export default async function SettingsPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("dash").settings;
  const session = await requireRole(["trade", "supplier"]);
  const { profile } = session;

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-base font-semibold">{t.account}</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="eyebrow text-muted-foreground">{t.name}</dt>
            <dd className="mt-1 text-sm">{profile.full_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="eyebrow text-muted-foreground">{t.email}</dt>
            <dd className="mt-1 text-sm">{profile.email}</dd>
          </div>
        </dl>
        <p className="mt-5 text-sm text-muted-foreground">
          {t.passwordQ}{" "}
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            {t.reset}
          </Link>
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-base font-semibold">{t.notifications}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.notificationsHint}</p>
        <div className="mt-4 space-y-3">
          {NOTIFICATIONS.map((n) => (
            <label key={n.id} className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" defaultChecked={n.defaultChecked} className="size-4" />
              {t.options[n.key]}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { dash } from "@/lib/admin/queries";
import type { PlatformSettings } from "@/types/db";

export const metadata: Metadata = { title: "Settings · Admin · PMRFP" };

type SettingsView = Pick<
  PlatformSettings,
  "site_name" | "pricing_amount" | "support_email" | "admin_notification_email"
>;

const DEFAULTS: SettingsView = {
  site_name: "PMRFP",
  pricing_amount: 249,
  support_email: "info@pmrfp.com",
  admin_notification_email: "info@pmrfp.com",
};

export default async function AdminSettingsPage() {
  await requireRole(["admin", "super_admin"]);

  let settings = DEFAULTS;
  if (!isDemoMode()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("platform_settings")
      .select("site_name, pricing_amount, support_email, admin_notification_email")
      .maybeSingle<SettingsView>();
    settings = data ?? DEFAULTS;
  }

  const fields: { label: string; value: string }[] = [
    { label: "Site name", value: dash(settings.site_name) },
    { label: "Pricing (annual)", value: `$${(settings.pricing_amount ?? 249).toLocaleString("en-CA")} CAD` },
    { label: "Support email", value: dash(settings.support_email) },
    { label: "Admin notification email", value: dash(settings.admin_notification_email) },
  ];

  return (
    <>
      <PageHeader title="Platform Settings" description="Global configuration for PMRFP." />
      {isDemoMode() && <DemoBanner />}

      <div className="max-w-2xl rounded-lg border border-border bg-card p-6">
        <p className="mb-5 text-xs text-muted-foreground">
          Read-only view. Editing platform settings is handled via configuration.
        </p>
        <dl className="divide-y divide-border">
          {fields.map((f) => (
            <div key={f.label} className="flex items-center justify-between py-3">
              <dt className="text-sm text-muted-foreground">{f.label}</dt>
              <dd className="text-sm font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}

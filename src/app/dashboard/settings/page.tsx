import Link from "next/link";
import { requireRole } from "@/lib/access/access";
import { PageHeader } from "@/components/dashboard/stat-card";

export const metadata = { title: "Settings" };

const NOTIFICATIONS = [
  { id: "new-rfps", label: "New RFPs matching my categories and regions", defaultChecked: true },
  { id: "interest-updates", label: "Updates on RFPs I've expressed interest in", defaultChecked: true },
  { id: "intro-requests", label: "When a property manager requests an introduction", defaultChecked: true },
  { id: "product", label: "Product news and platform updates", defaultChecked: false },
];

export default async function SettingsPage() {
  const session = await requireRole(["trade"]);
  const { profile } = session;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your account and notification preferences." />

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Account</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="eyebrow text-muted-foreground">Name</dt>
            <dd className="mt-1 text-sm">{profile.full_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="eyebrow text-muted-foreground">Email</dt>
            <dd className="mt-1 text-sm">{profile.email}</dd>
          </div>
        </dl>
        <p className="mt-5 text-sm text-muted-foreground">
          Want to change your password?{" "}
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            Reset password
          </Link>
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Email notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose what we email you about.</p>
        <div className="mt-4 space-y-3">
          {NOTIFICATIONS.map((n) => (
            <label key={n.id} className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" defaultChecked={n.defaultChecked} className="size-4" />
              {n.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

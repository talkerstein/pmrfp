import Link from "next/link";
import { isDemoMode } from "@/lib/access/access";

/** Shown on auth pages in demo mode: explains accounts need Supabase, and
 * offers direct links to preview the authenticated areas. */
export function DemoNotice() {
  if (!isDemoMode()) return null;
  return (
    <div className="mt-6 rounded-lg border border-dashed border-teal-300 bg-teal-50/60 p-4 text-sm">
      <p className="font-medium text-foreground">Demo mode</p>
      <p className="mt-1 text-muted-foreground">
        Accounts require a connected Supabase project. You can still preview the dashboards:
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-teal-700">
        <Link href="/dashboard" className="hover:underline">Trade dashboard →</Link>
        <Link href="/pm-dashboard" className="hover:underline">PM dashboard →</Link>
        <Link href="/admin" className="hover:underline">Admin →</Link>
      </div>
    </div>
  );
}

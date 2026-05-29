import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PM_NAV } from "@/lib/site";

export default function PmDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell nav={PM_NAV} area="Property Manager">
      {children}
    </DashboardShell>
  );
}

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { TRADE_NAV } from "@/lib/site";

export default function TradeDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell nav={TRADE_NAV} area="Trade Dashboard">
      {children}
    </DashboardShell>
  );
}

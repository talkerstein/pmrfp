import "server-only";
import type { SessionContext } from "@/lib/access/access";
import { UUID, type D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";

interface BillingAccount {
  status: string;
  current_period_end: string | null;
  amount: number | null;
  currency: string | null;
  stripe_price_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export async function readVpsBillingAccount(
  session: SessionContext, product: "subscription" | "intel", db: D1Binding = vpsAppDatabase(),
): Promise<BillingAccount | null> {
  const { organization, userId } = session;
  if (!organization || !UUID.test(organization.id) || !UUID.test(userId)) return null;
  const table = product === "intel" ? "intel_access" : "subscriptions";
  return await db.prepare(`SELECT a.stripe_customer_id,a.stripe_subscription_id,
    a.status,a.current_period_end,CAST(a.amount AS REAL) AS amount,a.currency,a.stripe_price_id FROM ${table} a
    WHERE a.organization_id=? AND EXISTS (SELECT 1 FROM organization_members m
      JOIN users_profile u ON u.id=m.user_id
      WHERE m.organization_id=a.organization_id AND u.id=? AND u.status='active')`)
    .bind(organization.id, userId).first<BillingAccount>();
}

"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { inboundConfig } from "./inbound";
import { rotateInbox } from "./inbound-server";

const ROLES = ["property_manager", "real_estate_agent"];

export type RotateResult = { ok: true; address: string } | { ok: false; error: "failed" | "unavailable" };

/** Replace the signed-in user's forwarding address: the old one stops working at once. */
export async function rotateInboxAction(): Promise<RotateResult> {
  const cfg = inboundConfig();
  if (!cfg || !isServiceConfigured()) return { ok: false, error: "unavailable" };
  const session = await getSession();
  if (!session || !session.organization || !ROLES.includes(session.profile.primary_role)) return { ok: false, error: "failed" };
  const inbox = await rotateInbox(createServiceClient(), cfg, session.organization.id, session.userId);
  if (!inbox) return { ok: false, error: "failed" };
  revalidatePath("/pm-dashboard/report-to-quotes");
  return { ok: true, address: inbox.address };
}

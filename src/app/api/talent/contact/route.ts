import { NextResponse } from "next/server";
import { getSession } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sendTalentContact } from "@/lib/email/send";
import { contactsThisMonth } from "@/lib/talent/data";
import { FREE_CONTACTS_PER_MONTH, canContactTalent, talentContactSchema } from "@/lib/talent/rules";
import { isVpsLiveCustomerAuth, matchesCustomerOrigin } from "@/lib/d1/staging-config";
import { beginVpsTalentContact } from "@/lib/d1/vps-talent";
import { readD1Json } from "@/lib/d1/contracts";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

/**
 * An approved company messages a worker through PMRFP. The server sends it
 * (Reply-To the employer), so the worker's email is never shown. Free
 * companies get FREE_CONTACTS_PER_MONTH a month; Trade Pro is unlimited.
 */
export async function POST(request: Request) {
  const native = isVpsLiveCustomerAuth();
  if (native && !matchesCustomerOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const limited = await checkRateLimit(request, "contact");
  if (limited) return rateLimitResponse(limited);

  const parsed = talentContactSchema.safeParse(await (native ? readD1Json(request, 16_384) : request.json()).catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the message." }, { status: 422 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to contact workers." }, { status: 401 });
  const org = session.organization;
  if (!org || org.profile_status !== "approved" || org.status !== "active") {
    return NextResponse.json({ error: "Your company profile needs to be approved before you can contact workers." }, { status: 403 });
  }
  if (native) {
    try {
      const result = await beginVpsTalentContact({ userId: session.userId, orgId: org.id, pro: session.hasTradeAccess }, parsed.data.handle);
      if (result.status === "missing") return NextResponse.json({ error: "That profile isn't available." }, { status: 404 });
      if (result.status === "self") return NextResponse.json({ error: "That's your own profile." }, { status: 400 });
      if (result.status === "undeliverable") {
        return NextResponse.json({ error: "We couldn't reach this person. Try another profile." }, { status: 409 });
      }
      if (result.status === "limit") return contactLimitResponse();
      if (result.status === "recorded") {
        await sendTalentContact({
          to: result.person.email,
          workerName: result.person.display_name,
          profileUrl: `https://pmrfp.com/talent/${result.person.handle}`,
          company: org.name,
          sender: { name: session.profile.full_name || org.name, email: session.profile.email },
          message: parsed.data.message,
          smtpOnly: true,
        });
        return NextResponse.json({ ok: true, left: result.left });
      }
      return NextResponse.json({ error: "Could not send your message." }, { status: 503 });
    } catch {
      return NextResponse.json({ error: "Could not confirm delivery of your message." }, { status: 503 });
    }
  }
  if (!isServiceConfigured()) return NextResponse.json({ error: "This isn't available right now." }, { status: 503 });

  const admin = createServiceClient();
  const { data: t } = await admin
    .from("talent_profiles")
    .select("user_id,handle,display_name,published")
    .eq("handle", parsed.data.handle)
    .maybeSingle<{ user_id: string; handle: string; display_name: string; published: boolean }>();
  if (!t || !t.published) return NextResponse.json({ error: "That profile isn't available." }, { status: 404 });
  if (t.user_id === session.userId) return NextResponse.json({ error: "That's your own profile." }, { status: 400 });

  const sent = await contactsThisMonth(org.id);
  if (!canContactTalent(sent, session.hasTradeAccess)) return contactLimitResponse();

  const { data: worker } = await admin.from("users_profile").select("email").eq("id", t.user_id).maybeSingle<{ email: string | null }>();
  if (!worker?.email) return NextResponse.json({ error: "We couldn't reach this person. Try another profile." }, { status: 409 });

  const { error } = await admin.from("talent_contacts").insert({ talent_user_id: t.user_id, organization_id: org.id, sender_id: session.userId });
  if (error) return NextResponse.json({ error: "Could not send your message. Please try again." }, { status: 500 });

  await sendTalentContact({
    to: worker.email,
    workerName: t.display_name,
    profileUrl: `${BASE}/talent/${t.handle}`,
    company: org.name,
    sender: { name: session.profile.full_name || org.name, email: session.profile.email },
    message: parsed.data.message,
  });
  return NextResponse.json({ ok: true, left: session.hasTradeAccess ? null : Math.max(0, FREE_CONTACTS_PER_MONTH - sent - 1) });
}

function contactLimitResponse() {
  return NextResponse.json(
    { error: `Free accounts can contact ${FREE_CONTACTS_PER_MONTH} workers a month. Upgrade to Trade Pro to contact as many as you need.`, upgrade: true },
    { status: 402 },
  );
}

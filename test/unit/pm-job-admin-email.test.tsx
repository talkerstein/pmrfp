import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { sendAdminNewRfp, sendPmJobAlert } from "@/lib/email/send";
import { signupRoleFromLink } from "@/lib/auth/signup-link";
import { SignupRolePicker } from "@/components/home-v3/signup-role-picker";
import { getDictionary } from "@/i18n/dictionaries";

/**
 * PM job flow: the admin heads-up for a new pending post goes to
 * ADMIN_NOTIFICATION_EMAIL, else info@pmrfp.com (no email is sent in tests:
 * without RESEND_API_KEY, send() only logs the recipient). And
 * /sign-up?role=property_manager / ?role=landlord start with that role picked.
 */

afterEach(() => {
  delete process.env.ADMIN_NOTIFICATION_EMAIL;
  vi.restoreAllMocks();
});

function recipients(log: ReturnType<typeof vi.spyOn>): string[] {
  return log.mock.calls.map((c: unknown[]) => String(c[0]).match(/to=(\S+)/)?.[1] ?? "");
}

describe("new pending post: admin email", () => {
  it("goes to info@pmrfp.com while ADMIN_NOTIFICATION_EMAIL is unset (as in Vercel today)", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendAdminNewRfp({ title: "Roof repair", postedBy: "Maple", pending: 2 });
    expect(recipients(log)).toEqual(["info@pmrfp.com"]);
    expect(String(log.mock.calls[0][0])).toContain("2 waiting");
  });

  it("goes to ADMIN_NOTIFICATION_EMAIL once it's set", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.ADMIN_NOTIFICATION_EMAIL = "ops@pmrfp.com";
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendAdminNewRfp({ title: "Roof repair" });
    expect(recipients(log)).toEqual(["ops@pmrfp.com"]);
  });

  it("the job alert goes to the trade with a localized subject", async () => {
    delete process.env.RESEND_API_KEY;
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendPmJobAlert("t@x.com", {
      lang: "fr",
      title: "Réparation de toiture",
      slug: "s",
      trade: "Toiture",
      place: "Toronto, Ontario",
      deadline: null,
      summary: null,
      pro: false,
      freeLimit: 3,
      unsubscribeUrl: "https://pmrfp.com/api/email/unsubscribe?u=1&t=2",
      mailingAddress: "123 Example St",
    });
    expect(String(log.mock.calls[0][0])).toContain('subject="Nouvel appel d\'offres en Toiture à Toronto, Ontario : Réparation de toiture"');
  });
});

describe("sign-up links preselect the poster role", () => {
  it("maps ?role= (and &kind=) to the role the form starts on", () => {
    expect(signupRoleFromLink("property_manager")).toBe("property_manager");
    expect(signupRoleFromLink("landlord")).toBe("landlord");
    expect(signupRoleFromLink("property_manager", "landlord")).toBe("landlord");
    expect(signupRoleFromLink("property_manager", "gc")).toBe("general_contractor");
    expect(signupRoleFromLink("real_estate_agent")).toBe("real_estate_agent");
    expect(signupRoleFromLink("visitor")).toBeUndefined();
    expect(signupRoleFromLink("admin")).toBeUndefined();
    expect(signupRoleFromLink(undefined)).toBeUndefined();
  });

  for (const role of ["property_manager", "landlord"] as const) {
    it(`?role=${role}: the picker opens on "hire" with ${role} checked`, () => {
      const html = renderToStaticMarkup(
        <SignupRolePicker t={getDictionary("en").v3Pages.signup} role={signupRoleFromLink(role)!} onRole={() => {}} onLooking={() => {}} />,
      );
      expect(html).toMatch(new RegExp(`aria-checked="true"[^>]*data-role="${role}"|data-role="${role}"[^>]*aria-checked="true"`));
      expect(html).toMatch(/aria-checked="true"[^>]*data-group="hire"|data-group="hire"[^>]*aria-checked="true"/);
    });
  }
});

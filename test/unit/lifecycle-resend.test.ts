import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STEPS } from "@/lib/lifecycle/config";
import { renderStep, sampleCopyData } from "@/lib/lifecycle/copy";
import { lifecycleUnsubscribeUrl } from "@/lib/email/unsubscribe";

/**
 * The lifecycle sequence sends through Resend (never the Hostinger mailbox),
 * and every send carries the CASL / CAN-SPAM footer, a signed one-click
 * unsubscribe link and the List-Unsubscribe + List-Unsubscribe-Post headers.
 */

const resendSend = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

beforeEach(() => {
  resendSend.mockReset();
  resendSend.mockResolvedValue({ data: { id: "re_123" }, error: null });
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
});

describe("lifecycle email goes out through Resend with one-click unsubscribe", () => {
  it("every step: Resend, from R. Talkar <info@pmrfp.com>, reply-to info@, List-Unsubscribe (+ one-click post), a tag per step", async () => {
    const { sendLifecycleEmail } = await import("@/lib/email/send");
    const base = "https://pmrfp.com";
    for (const step of STEPS) {
      resendSend.mockClear();
      const unsub = lifecycleUnsubscribeUrl(base, "user-1");
      expect(unsub, step).toContain("/api/email/lifecycle-unsubscribe?u=user-1&t=");
      const email = renderStep(step, sampleCopyData(step, "en", "CA"), { base, unsubscribeUrl: unsub });
      const res = await sendLifecycleEmail({
        to: "sam@northline.ca",
        from: '"R. Talkar · PMRFP" <info@pmrfp.com>',
        replyTo: "info@pmrfp.com",
        subject: email.subject,
        text: email.text,
        html: email.html,
        unsubscribeUrl: unsub,
        step,
      });
      expect(res, step).toEqual({ ok: true, id: "re_123" });
      expect(resendSend, step).toHaveBeenCalledTimes(1);
      const sent = resendSend.mock.calls[0][0];
      expect(sent.from, step).toBe('"R. Talkar · PMRFP" <info@pmrfp.com>');
      expect(sent.replyTo, step).toBe("info@pmrfp.com");
      expect(sent.headers["List-Unsubscribe"], step).toBe(`<${unsub}>, <mailto:info@pmrfp.com?subject=unsubscribe>`);
      expect(sent.headers["List-Unsubscribe-Post"], step).toBe("List-Unsubscribe=One-Click");
      expect(sent.tags, step).toContainEqual({ name: "category", value: "lifecycle" });
      expect(sent.tags, step).toContainEqual({ name: "step", value: step });
      // the CASL / CAN-SPAM footer: why they got it, the unsubscribe link, the sender and a postal address
      for (const body of [sent.text, sent.html]) {
        expect(body, step).toContain("Talkerstein Consulting Group");
        expect(body, step).toContain("5050 Dufferin St., Toronto, ON M3H 5T5");
        expect(body, step).toContain("lifecycle-unsubscribe");
      }
      expect(sent.text, step).toContain("You're getting this because");
    }
  });

  it("without a Resend key nothing goes out and the caller is told", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendLifecycleEmail } = await import("@/lib/email/send");
    const res = await sendLifecycleEmail({ to: "a@b.ca", from: "x", replyTo: "y", subject: "s", text: "t", html: "h", unsubscribeUrl: null, step: "badge" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/RESEND_API_KEY/);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("the lifecycle code has no other way to send: no Hostinger / SMTP / IMAP mailbox", () => {
    const dir = join(process.cwd(), "src/lib/lifecycle");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, file).not.toMatch(/nodemailer|imapflow|smtp|hostinger/i);
    }
    const cron = readFileSync(join(process.cwd(), "src/app/api/cron/lifecycle/route.ts"), "utf8");
    expect(cron).not.toMatch(/nodemailer|imapflow|smtp|hostinger/i);
    // ...and the one send function builds its client from the Resend SDK.
    const send = readFileSync(join(process.cwd(), "src/lib/email/send.ts"), "utf8");
    expect(send).toMatch(/import \{ Resend \} from "resend"/);
    const fn = send.slice(send.indexOf("export async function sendLifecycleEmail"));
    expect(fn).toContain("resend.emails.send");
    expect(fn).not.toMatch(/nodemailer|createTransport/);
  });
});

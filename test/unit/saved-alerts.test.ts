import { describe, expect, it } from "vitest";
import { alertFor, buildSavedAlerts, savedAlertSubject, type SavedRfp } from "@/lib/alerts/saved";

const today = "2026-10-06";
const rfp = (o: Partial<SavedRfp>): SavedRfp => ({
  id: "r1",
  slug: "roof-repair",
  title: "Roof repair",
  status: "published",
  deadline: "2026-10-09",
  ...o,
});

describe("saved tender alerts", () => {
  it("reminds within 3 days of closing, not before or after", () => {
    expect(alertFor(rfp({ deadline: "2026-10-09" }), today)?.kind).toBe("closing");
    expect(alertFor(rfp({ deadline: "2026-10-06" }), today)?.kind).toBe("closing");
    expect(alertFor(rfp({ deadline: "2026-10-10" }), today)).toBeNull();
    expect(alertFor(rfp({ deadline: "2026-10-05" }), today)).toBeNull();
    expect(alertFor(rfp({ deadline: null }), today)).toBeNull();
  });

  it("flags status changes with a per-status dedupe key", () => {
    const a = alertFor(rfp({ status: "awarded" }), today);
    expect(a?.kind).toBe("status");
    expect(a?.type).toBe("saved_status:awarded");
    expect(alertFor(rfp({ status: "draft" }), today)).toBeNull();
  });

  it("groups per user, skips opted-out users and already-sent alerts", () => {
    const rfps = new Map([
      ["r1", rfp({})],
      ["r2", rfp({ id: "r2", slug: "hvac", title: "HVAC", status: "awarded" })],
    ]);
    const digests = buildSavedAlerts({
      saved: [
        { user_id: "u1", rfp_id: "r1" },
        { user_id: "u1", rfp_id: "r2" },
        { user_id: "u2", rfp_id: "r1" },
        { user_id: "u3", rfp_id: "r1" },
      ],
      rfps,
      today,
      emailByUser: new Map([
        ["u1", "a@x.com"],
        ["u2", "b@x.com"],
        ["u3", "c@x.com"],
      ]),
      optedOut: new Set(["u3"]),
      alreadySent: new Set(["u2|saved_closing|/rfps/roof-repair"]),
    });
    expect(digests).toHaveLength(1);
    expect(digests[0].userId).toBe("u1");
    expect(digests[0].items).toHaveLength(2);
    expect(savedAlertSubject(digests[0])).toBe("2 updates on your saved tenders");
  });
});

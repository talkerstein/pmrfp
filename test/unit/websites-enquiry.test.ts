import { describe, expect, it } from "vitest";
import { ENQUIRY_TYPE, enquiryMessage } from "@/lib/websites/config";
import { contactRequestSchema } from "@/lib/validations";
import websites from "@/i18n/messages/websites";

describe("website enquiries", () => {
  it("tags the stored message with the door and the current site", () => {
    expect(enquiryMessage("pm", " example.com ", " 120 doors ")).toBe(
      "[Website enquiry: property manager]\nCurrent site: example.com\n\n120 doors",
    );
    expect(enquiryMessage("trade", "", "Roofing, Barrie")).toBe("[Website enquiry: trade]\n\nRoofing, Barrie");
  });

  it("stays inside what /api/contact accepts", () => {
    const message = enquiryMessage("trade", "x".repeat(200), "y".repeat(5000));
    expect(message.length).toBe(3000);
    for (const kind of ["pm", "trade"] as const) {
      const parsed = contactRequestSchema.safeParse({ requestType: ENQUIRY_TYPE[kind], name: "A", email: "a@example.com", message });
      expect(parsed.success).toBe(true);
    }
  });

  it("keeps the price placeholders in both languages", () => {
    for (const copy of [websites.en, websites.fr]) {
      expect(copy.doors.pm.price).toContain("{pmFrom}");
      expect(copy.doors.trade.price).toContain("{tradeMonthly}");
      expect(copy.doors.pm.points).toHaveLength(4);
      expect(copy.doors.trade.points).toHaveLength(4);
    }
  });
});

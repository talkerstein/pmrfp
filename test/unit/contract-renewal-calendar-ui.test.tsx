import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Contract Renewal Calendar dashboard component: renders the list, the
 * country's re-tender wording and link, the re-tendered RFP, the starters
 * for an empty calendar, and the timeline, in each language.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  useParams: () => ({}),
  usePathname: () => "/pm-dashboard/contracts",
}));
vi.mock("@/lib/contracts/actions", () => ({
  addStartersAction: async () => ({}),
  deleteContractAction: async () => ({}),
  importContractsAction: async () => ({}),
  renewContractAction: async () => ({}),
  saveContractAction: async () => ({}),
}));

import { RenewalCalendar, type CalendarRow } from "@/components/contracts/renewal-calendar";
import { I18nProvider } from "@/i18n/provider";
import { clientMessages } from "@/i18n/dictionaries";
import { timelineRange } from "@/lib/contracts/rules";
import type { Locale } from "@/i18n/config";

const TODAY = "2026-11-01";

const row = (over: Partial<CalendarRow> = {}): CalendarRow => ({
  id: "11111111-1111-4111-8111-111111111111",
  building: "Maple Court",
  address: null,
  tradeSlug: "snow-removal",
  service: "Snow Removal",
  detail: "Lot and walkways",
  vendorName: "Northline",
  vendorEmail: null,
  linked: null,
  startDate: "2026-01-01",
  endDate: "2026-12-15",
  termStart: "2026-01-01",
  termEnd: "2026-12-15",
  rolled: false,
  annualValue: 18000,
  currency: "CAD",
  noticeDays: 60,
  autoRenews: false,
  notes: null,
  sourceRfp: null,
  retenderRfp: null,
  hasFile: false,
  fileName: null,
  status: "window",
  days: 44,
  windowOpens: "2026-10-16",
  nextTerm: { start: "2027-01-01", end: "2027-12-15" },
  ...over,
});

function render(lang: Locale, props: Partial<Parameters<typeof RenewalCalendar>[0]> = {}) {
  return renderToStaticMarkup(
    <I18nProvider lang={lang} messages={clientMessages(lang)}>
      <RenewalCalendar
        rows={[row()]}
        country="CA"
        trades={[{ slug: "snow-removal", name: "Snow Removal" }]}
        rfps={[]}
        starters={[]}
        timeline={timelineRange(TODAY)}
        today={TODAY}
        {...props}
      />
    </I18nProvider>,
  );
}

describe("renewal calendar UI", () => {
  it("lists a contract with its chip, value in CAD and the pre-filled re-tender link", () => {
    const html = render("en");
    expect(html).toContain("Snow Removal");
    expect(html).toContain("Maple Court");
    expect(html).toContain("Renewal window");
    expect(html).toContain("44 days left");
    expect(html).toContain("$18,000");
    expect(html).toContain("Re-tender on PMRFP");
    expect(html).toContain('href="/pm-dashboard/rfps/new?contract=11111111-1111-4111-8111-111111111111"');
  });

  it("says Rebid for a U.S. company and shows USD", () => {
    const html = render("en", { country: "US", rows: [row({ currency: "USD" })] });
    expect(html).toContain("Rebid on PMRFP");
    expect(html).not.toContain("Re-tender on PMRFP");
    expect(html).toContain("US$18,000");
  });

  it("shows the RFP a contract was re-tendered with", () => {
    const html = render("en", { rows: [row({ retenderRfp: { id: "r1", title: "Snow 2027", status: "published" } })] });
    expect(html).toContain("Re-tendered: Snow 2027");
    expect(html).toContain("/pm-dashboard/rfps/r1/interests");
    expect(html).toContain("Re-tender again");
  });

  it("offers the starters on an empty calendar, without prices", () => {
    const html = render("en", { rows: [], starters: ["snow_removal", "landscaping"] });
    expect(html).toContain("No contracts yet");
    expect(html).toContain("Winter season");
    expect(html).toContain("Add all");
    expect(html).not.toMatch(/\$\d/);
  });

  it("renders in French and Spanish", () => {
    expect(render("fr")).toContain("Relancer l&#x27;appel d&#x27;offres sur PMRFP");
    expect(render("es")).toContain("Volver a licitar en PMRFP");
  });
});

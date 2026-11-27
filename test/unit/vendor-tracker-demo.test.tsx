import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The tracker landing page's try-it box: the sample always shows all four
 * statuses, a pasted list reads with the tracker's own rules, every company
 * in the sample is labelled as an example, and each language reads its header.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  useParams: () => ({}),
  usePathname: () => "/vendor-insurance-tracker",
}));

import { TrackerDemo } from "@/components/vendor-certs/tracker-demo";
import { I18nProvider } from "@/i18n/provider";
import { clientMessages, getDictionary } from "@/i18n/dictionaries";
import { checkVendorList, sampleVendorList } from "@/lib/vendor-certs/rules";
import type { Locale } from "@/i18n/config";

const TODAY = "2026-11-04";
const LANGS: Locale[] = ["en", "fr", "es"];

function render(lang: Locale) {
  return renderToStaticMarkup(
    <I18nProvider lang={lang} messages={clientMessages(lang)}>
      <TrackerDemo t={getDictionary(lang).certs.demo} country="CA" today={TODAY} ctaHref="/sign-up?role=property_manager" />
    </I18nProvider>,
  );
}

describe("checkVendorList", () => {
  it("puts the worst first and counts who needs attention", () => {
    const csv = "Vendor,Trade,Expiry\nGood Co,Roofing,2027-06-30\nSoon Co,Snow,2026-11-16\nNone Co,HVAC,\nLapsed Co,Plumbing,2026-10-15";
    const r = checkVendorList(csv, "CA", TODAY);
    expect(r.vendors.map((v) => [v.name, v.status])).toEqual([
      ["Lapsed Co", "expired"],
      ["Soon Co", "expiring"],
      ["None Co", "missing"],
      ["Good Co", "valid"],
    ]);
    expect(r.attention).toBe(3);
    expect(r.vendors[0].days).toBe(-20);
    expect(r.vendors[2].days).toBeNull();
  });

  it("reads a bare list of names as missing dates", () => {
    const r = checkVendorList("Northline Roofing\nMaple Plumbing", "CA", TODAY);
    expect(r.vendors.map((v) => v.status)).toEqual(["missing", "missing"]);
    expect(r.attention).toBe(2);
  });

  it("reads a tab-separated paste from a spreadsheet", () => {
    const r = checkVendorList("Vendor\tExpiry\nNorthline Roofing\t2027-06-30", "CA", TODAY);
    expect(r.vendors).toHaveLength(1);
    expect(r.vendors[0].status).toBe("valid");
  });

  it("names the lines it could not read and keeps the rest", () => {
    const r = checkVendorList("Vendor,Expiry\nNorthline Roofing,not a date\nMaple Plumbing,2027-06-30", "CA", TODAY);
    expect(r.skipped).toEqual([2]);
    expect(r.vendors.map((v) => v.name)).toEqual(["Maple Plumbing"]);
  });

  it("is empty for an empty box", () => {
    const r = checkVendorList("", "CA", TODAY);
    expect(r.vendors).toEqual([]);
    expect(r.attention).toBe(0);
  });
});

describe("the sample list", () => {
  it.each(LANGS)("shows all four statuses in %s, whatever the date", (lang) => {
    const d = getDictionary(lang).certs.demo;
    for (const today of [TODAY, "2027-02-28", "2028-12-31"]) {
      const r = checkVendorList(sampleVendorList(d.sampleHeader, d.sampleRows, today), "CA", today);
      expect(r.skipped).toEqual([]);
      expect(r.vendors.map((v) => v.status).sort()).toEqual(["expired", "expiring", "missing", "valid"]);
    }
  });

  it.each(LANGS)("labels every company as an example in %s", (lang) => {
    const word = { en: "Example", fr: "Exemple", es: "Ejemplo" }[lang];
    for (const row of getDictionary(lang).certs.demo.sampleRows) expect(row.name.startsWith(`${word} `)).toBe(true);
  });
});

describe("TrackerDemo", () => {
  it.each(LANGS)("renders the sample's results in %s before anyone touches it", (lang) => {
    const d = getDictionary(lang).certs.demo;
    const html = render(lang);
    for (const row of d.sampleRows) expect(html).toContain(row.name);
    for (const label of Object.values(d.status)) expect(html).toContain(label);
    expect(html).toContain(d.sampleNote.replaceAll("'", "&#x27;"));
    expect(html).toContain("/sign-up?role=property_manager");
  });
});

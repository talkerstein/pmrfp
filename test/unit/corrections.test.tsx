import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { businessDaysSince, correctionSchema, resolutionSchema, toCorrectionRow, PAGE_KINDS } from "@/lib/corrections/rules";
import correctionsClient from "@/i18n/messages/correctionsClient";
import forumClient from "@/i18n/messages/forumClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => "/forum/x/y", useParams: () => ({ lang: "en" }) }));
vi.mock("@/lib/forum/actions", () => new Proxy({}, { get: () => async () => ({}) }));

const valid = { pageKind: "rfp", pagePath: "/rfps/snow-cb-1", reason: "wrong_info", details: "The closing date is wrong.", contactEmail: "Pat@Example.com" };

describe("correction requests: validation", () => {
  it("accepts a normal request and lower-cases the email", () => {
    const p = correctionSchema.parse(valid);
    expect(toCorrectionRow(p, null)).toMatchObject({ page_kind: "rfp", contact_email: "pat@example.com", status: "new", lang: "en" });
  });

  it("refuses full URLs, protocol-relative paths, short details and bad emails", () => {
    expect(correctionSchema.safeParse({ ...valid, pagePath: "https://evil.example/x" }).success).toBe(false);
    expect(correctionSchema.safeParse({ ...valid, pagePath: "//evil.example/x" }).success).toBe(false);
    expect(correctionSchema.safeParse({ ...valid, details: "bad" }).success).toBe(false);
    expect(correctionSchema.safeParse({ ...valid, contactEmail: "nope" }).success).toBe(false);
    expect(correctionSchema.safeParse({ ...valid, pageKind: "elsewhere" }).success).toBe(false);
  });

  it("matches the database's page kinds", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261017000050_correction_requests.sql"), "utf8");
    for (const k of PAGE_KINDS) expect(sql).toContain(`'${k}'`);
  });

  it("closing a request needs a resolution note", () => {
    const id = "9b2b7a3e-6f1d-4c55-9a59-7b0c1c7a1a11";
    expect(resolutionSchema.safeParse({ id, status: "corrected" }).success).toBe(false);
    expect(resolutionSchema.safeParse({ id, status: "corrected", resolution: "Fixed the date." }).success).toBe(true);
    expect(resolutionSchema.safeParse({ id, status: "in_review" }).success).toBe(true);
  });

  it("counts business days, skipping weekends", () => {
    expect(businessDaysSince("2026-10-16T12:00:00Z", new Date("2026-10-19T09:00:00Z"))).toBe(1); // Fri → Mon
    expect(businessDaysSince("2026-10-12T12:00:00Z", new Date("2026-10-26T09:00:00Z"))).toBe(10);
  });

  it("has the form in English, French and Spanish", () => {
    for (const lang of ["fr", "es"] as const) {
      expect(correctionsClient[lang].link).not.toBe(correctionsClient.en.link);
      for (const k of Object.keys(correctionsClient.en.reasons) as (keyof typeof correctionsClient.en.reasons)[]) {
        expect(correctionsClient[lang].reasons[k]).not.toBe(correctionsClient.en.reasons[k]);
      }
    }
  });
});

describe("report links are visible", () => {
  async function render(node: React.ReactNode) {
    const { I18nProvider } = await import("@/i18n/provider");
    const { clientMessages } = await import("@/i18n/dictionaries");
    return renderToStaticMarkup(<I18nProvider lang="en" messages={clientMessages("en")}>{node}</I18nProvider>);
  }

  it("every forum post shows Report: members get the moderator flag, visitors the correction form", async () => {
    const { PostControls } = await import("@/components/forum/forms");
    const base = { postId: "p1", upvotes: 0, voted: false, canVote: false, canAccept: false, accepted: false, isMod: false };
    const member = await render(<PostControls {...base} canReport />);
    expect(member).toContain("data-report-post");
    expect(member).toContain(forumClient.en.actions.report);
    const visitor = await render(<PostControls {...base} canReport={false} />);
    expect(visitor).toContain("data-report-error");
    expect(visitor).toContain(forumClient.en.actions.report);
    const own = await render(<PostControls {...base} canReport={false} own />);
    expect(own).not.toContain("data-report");
  });

  it("threads show Report to visitors too", async () => {
    const { ThreadReportPublic } = await import("@/components/forum/forms");
    expect(await render(<ThreadReportPublic threadId="t1" />)).toContain(forumClient.en.actions.report);
  });

  it("record pages get the 'Report an error or request removal' link and translated credits", async () => {
    const { RecordFooter } = await import("@/components/public/record-footer");
    const html = await render(<RecordFooter credits={["Contains information licensed under the Open Government Licence – Canada."]} lang="fr" kind="intel_company" path="/intel/companies/acme" />);
    expect(html).toContain("Licence du gouvernement ouvert – Canada");
    expect(html).toContain(correctionsClient.en.link);
  });

  it("the composer links the forum rules", async () => {
    const { RulesNote } = await import("@/components/forum/forms");
    const html = await render(<RulesNote />);
    expect(html).toContain('href="/forum/rules"');
  });

  it("each record page renders the footer", () => {
    const pages = [
      "src/app/[lang]/(v3)/rfps/[slug]/page.tsx",
      "src/app/[lang]/(v3)/contract-winners/[slug]/page.tsx",
      "src/app/[lang]/(v3)/intel/companies/[slug]/page.tsx",
      "src/app/[lang]/(v3)/intel/buyers/[slug]/page.tsx",
      "src/app/[lang]/(v3)/intel/awards/[id]/page.tsx",
      "src/app/[lang]/(v3)/major-projects/[slug]/page.tsx",
      "src/app/[lang]/(v3)/benchmarks/[trade]/[province]/page.tsx",
    ];
    for (const p of pages) expect(readFileSync(join(process.cwd(), p), "utf8"), p).toContain("<RecordFooter");
  });
});

import { describe, expect, it } from "vitest";
import { FREE_JOB_LIMIT, canPostJob, jobPostingJsonLd, jobSchema, jobSlug, payLabel } from "@/lib/jobs/rules";
import { jsonLdString } from "@/lib/seo/jsonld";

describe("jobs", () => {
  it("writes pay the way a job ad would", () => {
    expect(payLabel(32, 40, "hour")).toBe("$32–$40 an hour");
    expect(payLabel(65000, null, "year")).toBe("From $65,000 a year");
    expect(payLabel(null, 28.5, "hour")).toBe("Up to $28.50 an hour");
    expect(payLabel(30, 30, "hour")).toBe("$30 an hour");
    expect(payLabel(null, null, null)).toBe("");
  });

  it("caps free companies and lets Trade Pro post unlimited jobs", () => {
    expect(canPostJob(FREE_JOB_LIMIT - 1, false)).toBe(true);
    expect(canPostJob(FREE_JOB_LIMIT, false)).toBe(false);
    expect(canPostJob(50, true)).toBe(true);
  });

  it("makes readable, unique slugs that fit the database check", () => {
    const a = jobSlug("Licensed Electrician (309A)", "Vaughan");
    expect(a).toMatch(/^licensed-electrician-309a-vaughan-[a-z0-9]{2,4}$/);
    expect(a).toMatch(/^[a-z0-9-]{3,90}$/);
    expect(jobSlug("Électricien", "Montréal")).toMatch(/^electricien-montreal-/);
  });

  it("rejects a pay range that runs backwards", () => {
    const base = { title: "Labourer", category: "general-contracting", region: "toronto", city: "Toronto", employmentType: "full_time", description: "x".repeat(50) };
    expect(jobSchema.safeParse({ ...base, payMin: 30, payMax: 20 }).success).toBe(false);
    expect(jobSchema.safeParse({ ...base, payMin: 20, payMax: 30 }).success).toBe(true);
  });

  it("builds Google for Jobs markup with escaped text and pay", () => {
    const ld = jobPostingJsonLd({
      title: "HVAC Technician",
      description: "Service <rooftop> units\nacross the GTA",
      requirements: "G2 gas licence",
      createdAt: "2026-09-25T14:00:00Z",
      expiresAt: "2026-10-25",
      employmentType: "full_time",
      city: "Vaughan",
      province: "Ontario",
      country: "CA",
      payMin: 32,
      payMax: 40,
      payUnit: "hour",
      company: { name: "Riaboy Mechanical", url: "https://example.com", logo: null },
      url: "https://pmrfp.com/jobs/hvac-technician-vaughan-ab12",
    });
    expect(ld["@type"]).toBe("JobPosting");
    expect(ld.datePosted).toBe("2026-09-25");
    expect(ld.validThrough).toBe("2026-10-25T23:59:59");
    expect(ld.employmentType).toEqual(["FULL_TIME"]);
    expect(String(ld.description)).toContain("&lt;rooftop&gt;");
    expect(ld.baseSalary).toMatchObject({ currency: "CAD", value: { minValue: 32, maxValue: 40, unitText: "HOUR" } });
  });

  it("can't be broken out of by a </script> in user text", () => {
    const out = jsonLdString({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});

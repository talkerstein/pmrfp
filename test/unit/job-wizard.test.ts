import { describe, expect, it } from "vitest";
import { ROLE_TEMPLATES, composeJob, jobQuality, pickTrade, type JobDraft } from "@/lib/jobs/templates";
import { jobSchema } from "@/lib/jobs/rules";

const base: JobDraft = {
  title: "Licensed Plumber",
  employmentType: "full_time",
  city: "North York",
  payMin: "38",
  payMax: "52",
  schedule: "Weekdays, days",
  startDate: "Immediately",
  intro: "x".repeat(120),
  duties: "Install fixtures\nRepair leaks\nRead drawings",
  licences: ["306A Plumber"],
  experience: "3-5",
  requirementsExtra: "",
  benefits: ["Company vehicle"],
  howToApply: "Apply below.",
};

describe("job wizard", () => {
  it("composes plain-text sections the job page can show", () => {
    const { description, requirements } = composeJob(base);
    expect(description).toContain("What you will do\n• Install fixtures");
    expect(description).toContain("Schedule: Weekdays, days");
    expect(description).toContain("What we offer\n• Company vehicle");
    expect(requirements).toContain("Licences and tickets\n• 306A Plumber");
    expect(requirements).toContain("Experience: 3 to 5 years");
  });

  it("every template composes into something the server schema accepts", () => {
    for (const t of ROLE_TEMPLATES.filter((x) => x.id !== "custom")) {
      const d: JobDraft = { ...base, title: t.title, intro: t.intro, duties: t.duties.join("\n"), licences: t.licences, requirementsExtra: t.requirementsExtra };
      const c = composeJob(d);
      const r = jobSchema.safeParse({ title: t.title, category: "x", region: "y", city: "Toronto", employmentType: t.employmentType, description: c.description, requirements: c.requirements || undefined });
      expect(r.success, t.id).toBe(true);
    }
  });

  it("scores a full post 7/7 and an empty one low, with tips for the gaps", () => {
    expect(jobQuality(base).score).toBe(7);
    const empty = jobQuality({ ...base, title: "", payMin: "", payMax: "", intro: "", duties: "", licences: [], experience: "", benefits: [], schedule: "", startDate: "" });
    expect(empty.score).toBe(0);
    expect(empty.checks.every((c) => c.tip.length > 10)).toBe(true);
  });

  it("matches a template's trade to the directory", () => {
    const trades = [{ slug: "plumbing", name: "Plumbing" }, { slug: "electrical", name: "Electrical" }];
    expect(pickTrade("plumb", trades)).toBe("plumbing");
    expect(pickTrade("", trades)).toBe("");
    expect(pickTrade("roof", trades)).toBe("");
  });
});

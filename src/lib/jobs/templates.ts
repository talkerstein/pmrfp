import type { EmploymentType } from "./rules";

/**
 * The job wizard's brains: role starters, licence and perk lists, how the
 * answers become the plain-text description the job page shows, and a quality
 * score that tells an employer what would make the post stronger. Pure and
 * unit-tested; the form is components/jobs/job-wizard.
 */

export interface RoleTemplate {
  id: string;
  label: string;
  /** Lowercase words to find the matching trade in the directory ("plumb" matches "Plumbing"). */
  tradeHint: string;
  title: string;
  employmentType: EmploymentType;
  intro: string;
  duties: string[];
  licences: string[];
  requirementsExtra: string;
}

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    id: "plumber",
    label: "Plumber",
    tradeHint: "plumb",
    title: "Licensed Plumber",
    employmentType: "full_time",
    intro:
      "We are hiring a licensed plumber to join our service and install crews. You will work on residential and commercial jobs with a team that values clean work, honest quotes and showing up on time.",
    duties: [
      "Install, repair and replace water, drain and gas-adjacent piping and fixtures",
      "Diagnose leaks, blockages and failed equipment on service calls",
      "Read drawings and follow the Ontario Plumbing Code",
      "Keep the customer informed and leave the site clean",
    ],
    licences: ["306A Plumber", "Red Seal", "WHMIS", "Working at Heights", "Valid driver's licence"],
    requirementsExtra: "Experience on both new construction and service work is an asset.",
  },
  {
    id: "plumber-apprentice",
    label: "Plumber apprentice",
    tradeHint: "plumb",
    title: "Plumber Apprentice",
    employmentType: "apprenticeship",
    intro:
      "We are looking for an apprentice who wants a real career in plumbing. You will learn on live jobs next to journeyperson plumbers, with hours counted toward your apprenticeship.",
    duties: [
      "Assist journeypersons with installs, repairs and rough-ins",
      "Prepare, carry and organize materials and tools on site",
      "Learn to read drawings and follow code requirements",
      "Keep the work area safe and clean",
    ],
    licences: ["Registered apprentice (or willing to register)", "WHMIS", "Working at Heights", "Valid driver's licence"],
    requirementsExtra: "No experience required if you are reliable and eager to learn. Some trade school or pre-apprenticeship is an asset.",
  },
  {
    id: "electrician",
    label: "Electrician",
    tradeHint: "electric",
    title: "Licensed Electrician",
    employmentType: "full_time",
    intro:
      "We are hiring a licensed electrician for residential and commercial work. Steady hours, a supportive crew and projects that range from service calls to full builds.",
    duties: [
      "Install and service wiring, panels, lighting and devices",
      "Troubleshoot faults and bring systems back to code",
      "Read drawings and follow the Ontario Electrical Safety Code",
      "Work safely and keep the site tidy",
    ],
    licences: ["309A Electrician", "Red Seal", "WHMIS", "Working at Heights", "Valid driver's licence"],
    requirementsExtra: "Commercial or EV charger experience is an asset.",
  },
  {
    id: "hvac",
    label: "HVAC technician",
    tradeHint: "hvac",
    title: "HVAC Service Technician",
    employmentType: "full_time",
    intro:
      "We need an HVAC technician to service and install heating and cooling equipment for homes and commercial properties. You will have a van, a schedule and the backing of a team that answers the phone.",
    duties: [
      "Install, maintain and repair furnaces, air conditioners and heat pumps",
      "Run preventive maintenance on commercial rooftop and split systems",
      "Diagnose faults and explain options clearly to customers",
      "Complete service reports accurately",
    ],
    licences: ["Gas Technician G2 (TSSA)", "ODP / refrigerant handling", "WHMIS", "Working at Heights", "Valid driver's licence"],
    requirementsExtra: "Commercial HVAC experience is an asset.",
  },
  {
    id: "commercial-tech",
    label: "Commercial technician",
    tradeHint: "hvac",
    title: "Commercial Service Technician",
    employmentType: "full_time",
    intro:
      "We are growing our commercial division and need a technician who can handle service and maintenance on commercial buildings. Property managers rely on us to show up and fix it right the first time.",
    duties: [
      "Service and maintain commercial mechanical and electrical equipment",
      "Respond to service calls and emergency requests",
      "Document work and communicate with property managers",
      "Follow site safety rules and building access procedures",
    ],
    licences: ["Trade certification in your discipline", "WHMIS", "Working at Heights", "Valid driver's licence"],
    requirementsExtra: "Experience in occupied commercial buildings is an asset.",
  },
  {
    id: "carpenter",
    label: "Carpenter",
    tradeHint: "carpent",
    title: "Carpenter",
    employmentType: "full_time",
    intro:
      "We are hiring a carpenter for renovation and building work. You will work with a small crew on projects where craftsmanship is noticed.",
    duties: [
      "Frame, finish and install trim, doors, stairs and cabinetry",
      "Read plans and take accurate measurements",
      "Work with the crew lead to hit schedules",
      "Maintain tools and keep the site safe and clean",
    ],
    licences: ["Red Seal", "WHMIS", "Working at Heights", "Own tools", "Valid driver's licence"],
    requirementsExtra: "",
  },
  {
    id: "painter",
    label: "Painter",
    tradeHint: "paint",
    title: "Commercial Painter",
    employmentType: "full_time",
    intro:
      "We are hiring painters for commercial and multi-unit work. Occupied buildings, tight turnovers and a team that takes pride in clean lines.",
    duties: [
      "Prep surfaces: patch, sand, mask and prime",
      "Brush, roll and spray interior and exterior finishes",
      "Work to schedule, including unit turnovers",
      "Protect floors, fixtures and neighbouring work",
    ],
    licences: ["WHMIS", "Working at Heights", "Own tools", "Valid driver's licence"],
    requirementsExtra: "Spray experience is an asset.",
  },
  {
    id: "roofer",
    label: "Roofer",
    tradeHint: "roof",
    title: "Roofer",
    employmentType: "seasonal",
    intro:
      "We are hiring roofers for the busy season. Steady work on commercial flat roofs and residential shingle roofs with a crew that puts safety first.",
    duties: [
      "Tear off, repair and install roofing systems",
      "Work safely at height using fall protection",
      "Load, stage and clean up materials",
      "Follow the foreman's direction and the schedule",
    ],
    licences: ["Working at Heights", "WHMIS", "Fall protection training", "Valid driver's licence"],
    requirementsExtra: "Flat roof (torch-on, TPO, EPDM) experience is an asset.",
  },
  {
    id: "cleaner",
    label: "Cleaner / janitor",
    tradeHint: "clean",
    title: "Commercial Cleaner",
    employmentType: "part_time",
    intro:
      "We are hiring reliable cleaners for commercial buildings. Consistent shifts, a supervisor who answers the phone and a team that treats the work with care.",
    duties: [
      "Clean offices, common areas, washrooms and floors to our checklist",
      "Restock supplies and report maintenance issues",
      "Follow building access and safety rules",
      "Work the agreed schedule, including evenings if needed",
    ],
    licences: ["WHMIS", "Police check", "Eligible to work in Canada"],
    requirementsExtra: "Previous janitorial experience is an asset but not required.",
  },
  {
    id: "labourer",
    label: "General labourer",
    tradeHint: "general",
    title: "General Labourer",
    employmentType: "full_time",
    intro:
      "We are hiring general labourers to support our crews on site. Good entry point into the trades with a team that trains.",
    duties: [
      "Move materials and keep sites clean and organized",
      "Assist tradespeople with demolition, prep and installs",
      "Use hand and power tools safely",
      "Follow site safety rules and supervisor direction",
    ],
    licences: ["WHMIS", "Working at Heights", "Steel-toe boots and PPE", "Valid driver's licence"],
    requirementsExtra: "",
  },
  {
    id: "project-manager",
    label: "Project manager",
    tradeHint: "general",
    title: "Construction Project Manager",
    employmentType: "full_time",
    intro:
      "We are hiring a project manager to run residential and commercial projects from award to closeout. You will own schedule, budget and the client relationship.",
    duties: [
      "Manage trades, suppliers and schedules",
      "Track budgets, change orders and invoicing",
      "Run site meetings and keep owners and property managers informed",
      "Ensure quality and safety standards are met",
    ],
    licences: ["PMP or equivalent (asset)", "Valid driver's licence"],
    requirementsExtra: "3+ years managing construction projects. Estimating experience is an asset.",
  },
  {
    id: "estimator",
    label: "Estimator",
    tradeHint: "general",
    title: "Estimator",
    employmentType: "full_time",
    intro:
      "We are hiring an estimator to price bids and RFPs. You will turn drawings and scopes into accurate, competitive proposals.",
    duties: [
      "Review RFPs, drawings and specs",
      "Take off quantities and price labour, materials and subs",
      "Prepare and submit bids on time",
      "Support the project team after award",
    ],
    licences: ["Estimating software experience (e.g. Bluebeam, PlanSwift)"],
    requirementsExtra: "Trade background is an asset.",
  },
  {
    id: "custom",
    label: "Something else",
    tradeHint: "",
    title: "",
    employmentType: "full_time",
    intro: "",
    duties: ["", "", ""],
    licences: [],
    requirementsExtra: "",
  },
];

export const LICENCE_OPTIONS = [
  "306A Plumber",
  "309A Electrician",
  "Red Seal",
  "Ontario Certificate of Qualification",
  "Registered apprentice (or willing to register)",
  "Gas Technician G2 (TSSA)",
  "Gas Technician G3 (TSSA)",
  "ODP / refrigerant handling",
  "WHMIS",
  "Working at Heights",
  "Fall protection training",
  "First Aid / CPR",
  "Valid driver's licence",
  "Own vehicle",
  "Own tools",
  "Steel-toe boots and PPE",
  "Police check",
  "Eligible to work in Canada",
] as const;

export const BENEFIT_OPTIONS = [
  "Company vehicle",
  "Health and dental",
  "Paid training and tickets",
  "Tool allowance",
  "Overtime available",
  "Year-round work",
  "Weekends off",
  "Path to lead hand or foreman",
  "Uniform provided",
  "Paid vacation",
  "Signing bonus",
  "Referral bonus",
] as const;

export const EXPERIENCE_LEVELS = [
  { value: "", label: "Not specified" },
  { value: "entry", label: "Entry level, will train" },
  { value: "1-2", label: "1 to 2 years" },
  { value: "3-5", label: "3 to 5 years" },
  { value: "5+", label: "5+ years" },
] as const;

export const SCHEDULE_OPTIONS = ["Weekdays, days", "Weekdays, some evenings", "Shift work", "Includes weekends", "On call rotation", "Flexible"] as const;

export interface JobDraft {
  title: string;
  employmentType: EmploymentType;
  city: string;
  payMin: string;
  payMax: string;
  schedule: string;
  startDate: string;
  intro: string;
  duties: string;
  licences: string[];
  experience: string;
  requirementsExtra: string;
  benefits: string[];
  /** How the company wants to hear from applicants, shown as a closing line. */
  howToApply: string;
}

const bullets = (lines: string[]) => lines.map((l) => `• ${l}`).join("\n");
const clean = (s: string) => s.split("\n").map((l) => l.replace(/^[•\-\*\s]+/, "").trim()).filter(Boolean);

export function experienceLabel(value: string): string {
  return EXPERIENCE_LEVELS.find((e) => e.value === value)?.label ?? "";
}

/** The job page shows plain text with line breaks, so sections are labelled lines and bullets. */
export function composeJob(d: JobDraft): { description: string; requirements: string } {
  const parts: string[] = [];
  if (d.intro.trim()) parts.push(d.intro.trim());
  const duties = clean(d.duties);
  if (duties.length) parts.push(`What you will do\n${bullets(duties)}`);
  const logistics: string[] = [];
  if (d.schedule) logistics.push(`Schedule: ${d.schedule}`);
  if (d.startDate.trim()) logistics.push(`Start date: ${d.startDate.trim()}`);
  if (logistics.length) parts.push(logistics.join("\n"));
  if (d.benefits.length) parts.push(`What we offer\n${bullets(d.benefits)}`);
  if (d.howToApply.trim()) parts.push(d.howToApply.trim());

  const req: string[] = [];
  if (d.licences.length) req.push(`Licences and tickets\n${bullets(d.licences)}`);
  const exp = experienceLabel(d.experience);
  if (exp && d.experience) req.push(`Experience: ${exp}`);
  if (d.requirementsExtra.trim()) req.push(d.requirementsExtra.trim());

  return { description: parts.join("\n\n").slice(0, 5000), requirements: req.join("\n\n").slice(0, 3000) };
}

export interface QualityCheck {
  id: string;
  ok: boolean;
  label: string;
  tip: string;
}

/** What makes a trades posting get applications. Honest, simple, no fake precision. */
export function jobQuality(d: JobDraft): { score: number; max: number; checks: QualityCheck[] } {
  const duties = clean(d.duties);
  const hasPay = d.payMin.trim() !== "" || d.payMax.trim() !== "";
  const checks: QualityCheck[] = [
    { id: "title", ok: d.title.trim().length >= 8, label: "Clear job title", tip: "Use the title people search for, like “Licensed Plumber”." },
    { id: "pay", ok: hasPay, label: "Pay shown", tip: "Postings with pay get far more applications. Even a range helps." },
    { id: "intro", ok: d.intro.trim().length >= 100, label: "A real introduction", tip: "Two or three sentences on who you are and who you want." },
    { id: "duties", ok: duties.length >= 3, label: "At least 3 duties", tip: "List what the day actually looks like." },
    { id: "licences", ok: d.licences.length > 0 || d.experience !== "", label: "Licences or experience stated", tip: "Say which ticket or experience is required, so the right people apply." },
    { id: "benefits", ok: d.benefits.length > 0, label: "Something you offer", tip: "Vehicle, training, hours or growth. Tradespeople compare." },
    { id: "logistics", ok: d.schedule !== "" || d.startDate.trim() !== "", label: "Schedule or start date", tip: "People want to know the hours and when you need them." },
  ];
  return { score: checks.filter((c) => c.ok).length, max: checks.length, checks };
}

export function pickTrade(hint: string, trades: { slug: string; name: string }[]): string {
  if (!hint) return "";
  const h = hint.toLowerCase();
  return trades.find((t) => t.name.toLowerCase().includes(h) || t.slug.toLowerCase().includes(h))?.slug ?? "";
}

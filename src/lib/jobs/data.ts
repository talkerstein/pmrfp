import { createClient } from "@/lib/supabase/server";
import { createReadClient } from "@/lib/supabase/read";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import type { EmploymentType, PayUnit } from "./rules";

export interface Job {
  id: string;
  slug: string;
  title: string;
  trade: string | null;
  tradeSlug: string | null;
  region: string | null;
  regionSlug: string | null;
  province: string | null;
  country: "CA" | "US";
  city: string;
  employmentType: EmploymentType;
  payMin: number | null;
  payMax: number | null;
  payUnit: PayUnit | null;
  description: string;
  requirements: string | null;
  status: "open" | "closed";
  expiresAt: string;
  createdAt: string;
  company: { id: string; name: string; slug: string; logoUrl: string | null; website: string | null; type: string };
  /** The company is on Trade Pro: shown first, with a badge. */
  pro: boolean;
}

const COLS =
  "id,slug,title,city,employment_type,pay_min,pay_max,pay_unit,description,requirements,status,expires_at,created_at," +
  "trade_categories(name,slug),regions(name,slug,province,country)," +
  "organizations!inner(id,name,slug,logo_url,website,organization_type,profile_status,status)";

interface Row {
  id: string;
  slug: string;
  title: string;
  city: string;
  employment_type: EmploymentType;
  pay_min: number | null;
  pay_max: number | null;
  pay_unit: PayUnit | null;
  description: string;
  requirements: string | null;
  status: "open" | "closed";
  expires_at: string;
  created_at: string;
  trade_categories: { name: string; slug: string } | null;
  regions: { name: string; slug: string; province: string | null; country: string } | null;
  organizations: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    website: string | null;
    organization_type: string;
    profile_status: string;
    status: string;
  };
}

function toJob(r: Row, proOrgs: Set<string>): Job {
  const us = r.regions?.country === "USA";
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    trade: r.trade_categories?.name ?? null,
    tradeSlug: r.trade_categories?.slug ?? null,
    region: r.regions?.name ?? null,
    regionSlug: r.regions?.slug ?? null,
    // U.S. regions are states: the region name is the state.
    province: r.regions?.province ?? (us ? r.regions?.name ?? null : null),
    country: us ? "US" : "CA",
    city: r.city,
    employmentType: r.employment_type,
    payMin: r.pay_min != null ? Number(r.pay_min) : null,
    payMax: r.pay_max != null ? Number(r.pay_max) : null,
    payUnit: r.pay_unit,
    description: r.description,
    requirements: r.requirements,
    status: r.status,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    company: {
      id: r.organizations.id,
      name: r.organizations.name,
      slug: r.organizations.slug,
      logoUrl: r.organizations.logo_url,
      website: r.organizations.website,
      type: r.organizations.organization_type,
    },
    pro: proOrgs.has(r.organizations.id),
  };
}

/** Organizations on an active Trade Pro/Featured plan (service client: visitors can't read subscriptions). */
async function proOrgIds(orgIds: string[]): Promise<Set<string>> {
  if (!orgIds.length || !isServiceConfigured()) return new Set();
  const { data } = await createServiceClient()
    .from("subscriptions")
    .select("organization_id,status,tier")
    .in("organization_id", orgIds);
  return new Set(
    ((data as { organization_id: string; status: string; tier: string | null }[] | null) ?? [])
      .filter((s) => (s.status === "active" || s.status === "comped") && (s.tier ?? "pro") !== "realtor" && s.tier !== "seo")
      .map((s) => s.organization_id),
  );
}

export interface JobFilters {
  trade?: string;
  region?: string;
  type?: string;
}

/** Open jobs, Pro companies first, then newest. `ready: false` = migration not applied yet. */
export async function listOpenJobs(filters: JobFilters = {}): Promise<{ ready: boolean; jobs: Job[] }> {
  if (!isSupabaseConfigured()) return { ready: false, jobs: [] };
  const supabase = createReadClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("job_posts")
    .select(COLS)
    .eq("status", "open")
    .gte("expires_at", today)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return { ready: false, jobs: [] };
  const rows = (data as unknown as Row[]) ?? [];
  const pro = await proOrgIds([...new Set(rows.map((r) => r.organizations.id))]);
  let jobs = rows.map((r) => toJob(r, pro));
  if (filters.trade) jobs = jobs.filter((j) => j.tradeSlug === filters.trade);
  if (filters.region) jobs = jobs.filter((j) => j.regionSlug === filters.region);
  if (filters.type) jobs = jobs.filter((j) => j.employmentType === filters.type);
  return { ready: true, jobs: jobs.sort((a, b) => Number(b.pro) - Number(a.pro)) };
}

/** One job by slug (open or not; the page decides what to show). */
export async function getJob(slug: string): Promise<Job | null> {
  if (!isSupabaseConfigured()) return null;
  // Service client so a closed job still resolves to a "no longer open" page
  // instead of a 404 for people following an old link.
  const supabase = isServiceConfigured() ? createServiceClient() : createReadClient();
  const { data, error } = await supabase.from("job_posts").select(COLS).eq("slug", slug).maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as Row;
  // A suspended or unapproved company's jobs aren't public.
  if (r.organizations.profile_status !== "approved" || r.organizations.status !== "active") return null;
  return toJob(r, await proOrgIds([r.organizations.id]));
}

export interface EmployerJob extends Job {
  applications: number;
}

export interface Application {
  id: string;
  jobId: string;
  name: string;
  email: string;
  phone: string | null;
  experienceYears: number | null;
  certifications: string | null;
  message: string | null;
  createdAt: string;
}

/** The signed-in employer's jobs (all statuses) with their applicants. RLS scopes both to their company. */
export async function getEmployerJobs(
  organizationId: string,
): Promise<{ ready: boolean; jobs: EmployerJob[]; applications: Application[] }> {
  if (!isSupabaseConfigured()) return { ready: false, jobs: [], applications: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_posts")
    .select(COLS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { ready: false, jobs: [], applications: [] };
  const rows = (data as unknown as Row[]) ?? [];
  const ids = rows.map((r) => r.id);
  const { data: apps } = ids.length
    ? await supabase
        .from("job_applications")
        .select("id,job_id,name,email,phone,experience_years,certifications,message,created_at")
        .in("job_id", ids)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [] };
  const applications: Application[] = (
    (apps as {
      id: string;
      job_id: string;
      name: string;
      email: string;
      phone: string | null;
      experience_years: number | null;
      certifications: string | null;
      message: string | null;
      created_at: string;
    }[] | null) ?? []
  ).map((a) => ({
    id: a.id,
    jobId: a.job_id,
    name: a.name,
    email: a.email,
    phone: a.phone,
    experienceYears: a.experience_years,
    certifications: a.certifications,
    message: a.message,
    createdAt: a.created_at,
  }));
  const pro = await proOrgIds([organizationId]);
  const jobs = rows.map((r) => ({
    ...toJob(r, pro),
    applications: applications.filter((a) => a.jobId === r.id).length,
  }));
  return { ready: true, jobs, applications };
}

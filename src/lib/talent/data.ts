import { createClient } from "@/lib/supabase/server";
import { createReadClient } from "@/lib/supabase/read";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import type { EmploymentType } from "@/lib/jobs/rules";
import { monthStart, type Availability } from "./rules";
import { getSession, getSessionUserId } from "@/lib/access/access";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { approvedTalentEmployer } from "@/lib/d1/vps-talent";

export interface TalentProfile {
  userId: string;
  handle: string;
  displayName: string;
  headline: string | null;
  trade: string | null;
  tradeSlug: string | null;
  otherTrades: { slug: string; name: string }[];
  region: string | null;
  regionSlug: string | null;
  province: string | null;
  country: "CA" | "US";
  city: string | null;
  yearsExperience: number | null;
  certifications: string[];
  availability: Availability;
  employmentTypes: EmploymentType[];
  payExpectation: string | null;
  bio: string | null;
  published: boolean;
  contactVisible: boolean;
  updatedAt: string;
}

export interface Endorsement {
  id: string;
  note: string;
  createdAt: string;
  company: { name: string; slug: string; listed: boolean };
}

const COLS =
  "user_id,handle,display_name,headline,other_trade_ids,city,years_experience,certifications,availability,employment_types," +
  "pay_expectation,bio,published,contact_visible,updated_at," +
  "trade_categories(name,slug),regions(name,slug,province,country)";

interface Row {
  user_id: string;
  handle: string;
  display_name: string;
  headline: string | null;
  other_trade_ids: string[] | null;
  city: string | null;
  years_experience: number | null;
  certifications: string[] | null;
  availability: Availability;
  employment_types: EmploymentType[] | null;
  pay_expectation: string | null;
  bio: string | null;
  published: boolean;
  contact_visible: boolean;
  updated_at: string;
  trade_categories: { name: string; slug: string } | null;
  regions: { name: string; slug: string; province: string | null; country: string } | null;
}

type TradeIndex = Map<string, { slug: string; name: string }>;

async function tradeIndex(): Promise<TradeIndex> {
  if (isVpsLiveCustomerAuth()) {
    const { results } = await vpsAppDatabase().prepare("SELECT id,slug,name FROM trade_categories")
      .all<{ id: string; slug: string; name: string }>();
    return new Map(results.map(t => [t.id, { slug: t.slug, name: t.name }]));
  }
  const { data } = await createReadClient().from("trade_categories").select("id,slug,name");
  return new Map(((data as { id: string; slug: string; name: string }[] | null) ?? []).map((t) => [t.id, { slug: t.slug, name: t.name }]));
}

type NativeRow = Omit<Row, "other_trade_ids" | "certifications" | "employment_types" | "published" | "contact_visible" | "trade_categories" | "regions"> & {
  other_trade_ids: string; certifications: string; employment_types: string; published: number; contact_visible: number;
  trade_categories: string | null; regions: string | null;
};
const nativeTalentProjection = `SELECT p.user_id,p.handle,p.display_name,p.headline,p.other_trade_ids,p.city,
  p.years_experience,p.certifications,p.availability,p.employment_types,p.pay_expectation,p.bio,
  p.published,p.contact_visible,p.updated_at,
  CASE WHEN t.id IS NOT NULL THEN json_object('name',t.name,'slug',t.slug) END AS trade_categories,
  CASE WHEN r.id IS NOT NULL THEN json_object('name',r.name,'slug',r.slug,'province',r.province,'country',r.country) END AS regions
  FROM talent_profiles p JOIN users_profile u ON u.id=p.user_id AND u.status='active'
  LEFT JOIN trade_categories t ON t.id=p.primary_trade_id LEFT JOIN regions r ON r.id=p.region_id`;

function toNativeProfile(row: NativeRow, trades: TradeIndex) {
  return toProfile({ ...row, other_trade_ids: JSON.parse(row.other_trade_ids), certifications: JSON.parse(row.certifications),
    employment_types: JSON.parse(row.employment_types), published: Boolean(row.published), contact_visible: Boolean(row.contact_visible),
    trade_categories: row.trade_categories ? JSON.parse(row.trade_categories) : null,
    regions: row.regions ? JSON.parse(row.regions) : null,
  }, trades);
}

function toProfile(r: Row, trades: TradeIndex): TalentProfile {
  const us = r.regions?.country === "USA";
  return {
    userId: r.user_id,
    handle: r.handle,
    displayName: r.display_name,
    headline: r.headline,
    trade: r.trade_categories?.name ?? null,
    tradeSlug: r.trade_categories?.slug ?? null,
    otherTrades: (r.other_trade_ids ?? []).map((id) => trades.get(id)).filter((t): t is { slug: string; name: string } => Boolean(t)),
    region: r.regions?.name ?? null,
    regionSlug: r.regions?.slug ?? null,
    province: r.regions?.province ?? (us ? r.regions?.name ?? null : null),
    country: us ? "US" : "CA",
    city: r.city,
    yearsExperience: r.years_experience,
    certifications: r.certifications ?? [],
    availability: r.availability,
    employmentTypes: r.employment_types ?? [],
    payExpectation: r.pay_expectation,
    bio: r.bio,
    published: r.published,
    contactVisible: r.contact_visible,
    updatedAt: r.updated_at,
  };
}

export interface TalentFilters {
  trade?: string;
  region?: string;
  availability?: string;
}

const AVAIL_ORDER: Record<Availability, number> = { available_now: 0, open_to_offers: 1, not_looking: 2 };

/** Published profiles, available-now first, then most recently updated. `ready: false` = migration not applied yet. */
export async function listTalent(filters: TalentFilters = {}): Promise<{ ready: boolean; people: TalentProfile[] }> {
  let people: TalentProfile[];
  if (isVpsLiveCustomerAuth()) {
    try {
      const [rows, trades] = await Promise.all([
        vpsAppDatabase().prepare(`${nativeTalentProjection} WHERE p.published=1 AND ${customerAppAuthority}
          ORDER BY p.updated_at DESC LIMIT 500`).all<NativeRow>(), tradeIndex(),
      ]);
      people = rows.results.map(row => toNativeProfile(row, trades));
    } catch {
      return { ready: false, people: [] };
    }
  } else {
    if (!isSupabaseConfigured()) return { ready: false, people: [] };
    const { data, error } = await createReadClient()
      .from("talent_profiles").select(COLS).eq("published", true).order("updated_at", { ascending: false }).limit(500);
    if (error) return { ready: false, people: [] };
    const trades = await tradeIndex();
    people = ((data as unknown as Row[]) ?? []).map(r => toProfile(r, trades));
  }
  if (filters.trade) {
    people = people.filter((p) => p.tradeSlug === filters.trade || p.otherTrades.some((t) => t.slug === filters.trade));
  }
  if (filters.region) people = people.filter((p) => p.regionSlug === filters.region);
  if (filters.availability) people = people.filter((p) => p.availability === filters.availability);
  return { ready: true, people: people.sort((a, b) => AVAIL_ORDER[a.availability] - AVAIL_ORDER[b.availability]) };
}

/**
 * One profile by handle. Unpublished profiles only resolve for their owner
 * (RLS decides: the signed-in client sees published rows plus its own).
 */
export async function getTalent(handle: string): Promise<TalentProfile | null> {
  if (isVpsLiveCustomerAuth()) {
    const userId = await getSessionUserId();
    const row = await vpsAppDatabase().prepare(`${nativeTalentProjection}
      WHERE p.handle=? AND (p.published=1 OR p.user_id=?) AND ${customerAppAuthority}`).bind(handle, userId).first<NativeRow>();
    return row ? toNativeProfile(row, await tradeIndex()) : null;
  }
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("talent_profiles").select(COLS).eq("handle", handle).maybeSingle();
  if (error || !data) return null;
  return toProfile(data as unknown as Row, await tradeIndex());
}

/** The signed-in person's own profile (any state), plus their private phone. */
export async function getOwnTalent(userId: string): Promise<{ profile: TalentProfile | null; phone: string | null }> {
  if (isVpsLiveCustomerAuth()) {
    if (await getSessionUserId() !== userId) return { profile: null, phone: null };
    const db = vpsAppDatabase();
    const [row, privateRow] = await Promise.all([
      db.prepare(`${nativeTalentProjection} WHERE p.user_id=? AND ${customerAppAuthority}`).bind(userId).first<NativeRow>(),
      db.prepare(`SELECT phone FROM talent_private WHERE user_id=? AND ${customerAppAuthority}`).bind(userId).first<{ phone: string | null }>(),
    ]);
    return { profile: row ? toNativeProfile(row, await tradeIndex()) : null, phone: privateRow?.phone ?? null };
  }
  if (!isSupabaseConfigured()) return { profile: null, phone: null };
  const supabase = await createClient();
  const [{ data }, { data: priv }] = await Promise.all([
    supabase.from("talent_profiles").select(COLS).eq("user_id", userId).maybeSingle(),
    supabase.from("talent_private").select("phone").eq("user_id", userId).maybeSingle<{ phone: string | null }>(),
  ]);
  return { profile: data ? toProfile(data as unknown as Row, await tradeIndex()) : null, phone: priv?.phone ?? null };
}

export async function getEndorsements(talentUserId: string): Promise<Endorsement[]> {
  if (isVpsLiveCustomerAuth()) {
    const userId = await getSessionUserId();
    const result = await vpsAppDatabase().prepare(`SELECT e.id,e.note,e.created_at AS createdAt,
      o.name,o.slug,o.organization_type AS type FROM talent_endorsements e
      JOIN talent_profiles p ON p.user_id=e.talent_user_id JOIN organizations o ON o.id=e.organization_id
      WHERE p.user_id=? AND (p.published=1 OR p.user_id=?) AND ${customerAppAuthority}
      ORDER BY e.created_at DESC LIMIT 50`).bind(talentUserId, userId).all<{
      id: string; note: string; createdAt: string; name: string; slug: string; type: string;
    }>();
    return result.results.map(({ id, note, createdAt, name, slug, type }) => ({
      id, note, createdAt, company: { name, slug, listed: type === "trade_company" || type === "supplier" },
    }));
  }
  if (!isSupabaseConfigured()) return [];
  const { data } = await createReadClient()
    .from("talent_endorsements")
    .select("id,note,created_at,organizations(name,slug,organization_type)")
    .eq("talent_user_id", talentUserId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (
    (data as unknown as {
      id: string;
      note: string;
      created_at: string;
      organizations: { name: string; slug: string; organization_type: string } | null;
    }[] | null) ?? []
  )
    .filter((e) => e.organizations)
    .map((e) => ({
      id: e.id,
      note: e.note,
      createdAt: e.created_at,
      company: {
        name: e.organizations!.name,
        slug: e.organizations!.slug,
        listed: e.organizations!.organization_type === "trade_company" || e.organizations!.organization_type === "supplier",
      },
    }));
}

/** Messages this company has sent to workers since the 1st of the month. */
export async function contactsThisMonth(organizationId: string): Promise<number> {
  if (isVpsLiveCustomerAuth()) {
    const session = await getSession();
    if (!session || session.organization?.id !== organizationId) return 0;
    const result = await vpsAppDatabase().prepare(`SELECT count(*) AS n FROM talent_contacts
      WHERE organization_id=? AND created_at>=? AND ${approvedTalentEmployer} AND ${customerAppAuthority}`)
      .bind(organizationId, monthStart(), organizationId, session.userId).first<{ n: number }>();
    return result?.n ?? 0;
  }
  if (!isServiceConfigured()) return 0;
  const { count } = await createServiceClient()
    .from("talent_contacts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("created_at", monthStart());
  return count ?? 0;
}

/** Contact details for an employer, only when the worker chose to show them. Server-side only. */
export async function getVisibleContact(userId: string): Promise<{ email: string | null; phone: string | null }> {
  if (isVpsLiveCustomerAuth()) {
    const session = await getSession();
    if (!session?.organization) return { email: null, phone: null };
    const result = await vpsAppDatabase().prepare(`SELECT u.email,t.phone FROM talent_profiles p
      JOIN users_profile u ON u.id=p.user_id LEFT JOIN talent_private t ON t.user_id=p.user_id
      WHERE p.user_id=? AND p.published=1 AND p.contact_visible=1 AND u.status='active'
      AND ${approvedTalentEmployer} AND ${customerAppAuthority}`)
      .bind(userId, session.organization.id, session.userId).first<{ email: string | null; phone: string | null }>();
    return result ?? { email: null, phone: null };
  }
  if (!isServiceConfigured()) return { email: null, phone: null };
  const admin = createServiceClient();
  const [{ data: t }, { data: u }, { data: p }] = await Promise.all([
    admin.from("talent_profiles").select("contact_visible").eq("user_id", userId).maybeSingle<{ contact_visible: boolean }>(),
    admin.from("users_profile").select("email").eq("id", userId).maybeSingle<{ email: string | null }>(),
    admin.from("talent_private").select("phone").eq("user_id", userId).maybeSingle<{ phone: string | null }>(),
  ]);
  if (!t?.contact_visible) return { email: null, phone: null };
  return { email: u?.email ?? null, phone: p?.phone ?? null };
}

/** A published talent profile URL path for this email, if they have one. Server-side only. */
export async function talentPathForEmail(email: string): Promise<string | null> {
  if (isVpsLiveCustomerAuth()) {
    const result = await vpsAppDatabase().prepare(`SELECT t.handle FROM talent_profiles t
      JOIN users_profile u ON u.id=t.user_id WHERE u.email=? COLLATE NOCASE AND u.status='active'
      AND t.published=1 AND ${customerAppAuthority} ORDER BY t.user_id LIMIT 1`).bind(email).first<{ handle: string }>();
    return result ? `/talent/${result.handle}` : null;
  }
  if (!isServiceConfigured()) return null;
  const admin = createServiceClient();
  const { data: u } = await admin.from("users_profile").select("id").ilike("email", email.replace(/[\\%_]/g, (m) => `\\${m}`)).limit(1).maybeSingle<{ id: string }>();
  if (!u) return null;
  const { data: t } = await admin
    .from("talent_profiles")
    .select("handle")
    .eq("user_id", u.id)
    .eq("published", true)
    .maybeSingle<{ handle: string }>();
  return t ? `/talent/${t.handle}` : null;
}

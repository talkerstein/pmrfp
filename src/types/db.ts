/**
 * Hand-authored row + enum types mirroring supabase/migrations.
 * Used to type query results (`.returns<T>()`) and component props.
 * Kept in sync with the SQL schema (Phase 2).
 */

export type UserRole = "trade" | "property_manager" | "admin" | "super_admin" | "visitor" | "supplier" | "real_estate_agent";
export type UserStatus = "active" | "suspended" | "deleted";
export type OrgType = "trade_company" | "property_manager" | "builder" | "owner" | "admin" | "supplier";
export type ProfileStatus = "draft" | "pending_review" | "approved" | "rejected" | "suspended";
export type ContactVisibility = "show_contact" | "request_intro" | "hide_contact";
export type RfpStatus =
  | "draft" | "pending_review" | "published" | "closed" | "awarded" | "archived" | "rejected";
export type RfpContactVisibility =
  | "public_contact" | "pmrfp_mediated" | "anonymous_until_interest_approved";
export type RfpSourceType =
  | "property_manager_direct" | "admin_seeded" | "public_source" | "partner_referral" | "gc_package";
export type DocVisibility = "public" | "paid_users" | "admin_only";
export type InterestStatus =
  | "submitted" | "viewed" | "contact_revealed" | "shortlisted" | "declined" | "closed";
export type SubscriptionStatus =
  | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "comped" | "inactive";
export type ContactRequestType =
  | "directory_intro" | "property_manager_help" | "general_contact" | "vendor_question";
export type ContactRequestStatus = "new" | "contacted" | "closed" | "spam";
export type ResourceStatus = "draft" | "published" | "archived";
export type MemberRole = "owner" | "admin" | "member";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  primary_role: UserRole;
  onboarding_completed: boolean;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  organization_type: OrgType;
  website: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string;
  short_description: string | null;
  full_description: string | null;
  years_in_business: number | null;
  employee_count_range: string | null;
  insurance_status: string | null;
  wsib_status: string | null;
  emergency_service: boolean;
  verified: boolean;
  featured: boolean;
  is_demo: boolean;
  profile_status: ProfileStatus;
  profile_completion_score: number;
  public_contact_visibility: ContactVisibility;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface TradeCategory {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  description: string | null;
  icon: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Region {
  id: string;
  name: string;
  slug: string;
  province: string | null;
  country: string;
  parent_id: string | null;
  active: boolean;
  sort_order: number;
}

export interface PropertyType {
  id: string;
  name: string;
  slug: string;
  active: boolean;
}

export interface RfpPost {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  scope: string | null;
  requirements: string | null;
  property_type_id: string | null;
  city: string | null;
  province: string | null;
  region_id: string | null;
  exact_address: string | null;
  show_exact_address: boolean;
  budget_min: number | null;
  budget_max: number | null;
  budget_public: boolean;
  desired_start_date: string | null;
  deadline: string | null;
  site_visit_date: string | null;
  submission_instructions: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_visibility: RfpContactVisibility;
  posted_by_user_id: string | null;
  posted_by_organization_id: string | null;
  source_type: RfpSourceType;
  source_url: string | null;
  source_notes: string | null;
  /** GC sub-trade packages (migration 20260924000002) — absent before it runs. */
  awarded_rfp_id?: string | null;
  gc_project_name?: string | null;
  status: RfpStatus;
  is_demo: boolean;
  published_at: string | null;
  closed_at: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Public teaser projection (rfp_public view). Safe columns only. */
export interface RfpTeaser {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  property_type_id: string | null;
  region_id: string | null;
  city: string | null;
  province: string | null;
  deadline: string | null;
  desired_start_date: string | null;
  source_type: RfpSourceType;
  is_demo: boolean;
  published_at: string | null;
  created_at: string;
  /** GC sub-trade packages (migration 20260924000002) — absent before it runs. */
  gc_project_name?: string | null;
  awarded_rfp_id?: string | null;
}

export interface RfpDocument {
  id: string;
  rfp_id: string;
  file_url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  visibility: DocVisibility;
  created_at: string;
}

export interface RfpInterest {
  id: string;
  rfp_id: string;
  trade_organization_id: string;
  submitted_by_user_id: string | null;
  message: string | null;
  relevant_experience: string | null;
  availability: string | null;
  attachment_url: string | null;
  status: InterestStatus;
  contact_revealed: boolean;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactRequest {
  id: string;
  request_type: ContactRequestType;
  requester_name: string | null;
  requester_email: string | null;
  requester_phone: string | null;
  requester_organization: string | null;
  target_organization_id: string | null;
  message: string | null;
  status: ContactRequestStatus;
  created_at: string;
}

export interface Subscription {
  id: string;
  organization_id: string;
  user_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  amount: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface ResourceArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  seo_title: string | null;
  meta_description: string | null;
  status: ResourceStatus;
  is_demo: boolean;
  published_at: string | null;
  author_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string | null;
  title: string | null;
  message: string | null;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface PlatformSettings {
  id: boolean;
  site_name: string;
  pricing_amount: number;
  stripe_price_id: string | null;
  default_disclaimer: string | null;
  admin_notification_email: string | null;
  support_email: string | null;
  featured_categories: unknown;
  homepage_stats: unknown;
  updated_at: string;
}

-- ════════════════════════════════════════════════════════════════════
-- After-Hours Vendor Roster (free PM tool): "who do we call at 2am"
-- ════════════════════════════════════════════════════════════════════
-- A property manager's company keeps one emergency roster per building:
-- the on-call staff contact, where the utility shut-offs are, the
-- emergency and non-emergency numbers, and one row per emergency trade
-- (plumbing, electrical, HVAC/heating, locksmith, restoration, glass and
-- board-up, elevator, fire/life safety and alarm monitoring, roofing,
-- snow and ice, pest, towing, plus the PM's own custom rows) with a
-- primary and a backup vendor, a 24/7 flag and notes.
--
-- The standard rows are virtual until the PM fills one in (the app shows
-- every category; a row only exists here once something is saved). There
-- is no shared properties table on purpose: the building is plain text
-- on the roster row.
--
--   emergency_rosters         RLS: members of the owning PM organization
--   emergency_roster_entries  read and write their own rows only. Entries
--                             carry the roster's organization_id, pinned
--                             by a composite foreign key, so a row can
--                             never point at another company's roster.
--   emergency_roster_links    Read-only share links (/on-call/<token>) for
--                             on-call staff and superintendents without a
--                             PMRFP account. Members read their own links
--                             (to copy them again) and can revoke them;
--                             only the server creates them (it picks the
--                             random token) and resolves them (service
--                             role). Same shape as case_study_share_links.
--   emergency_roster_invites  "Invite your current vendor to PMRFP": one
--                             referral email per vendor address per PM
--                             company, ever (CASL's referral exemption
--                             covers one message). Members see what was
--                             sent; only the server writes.
--
-- Safe to re-run. The app ships before this runs: every read catches the
-- missing-table error and shows "not switched on yet".

-- ── Rosters (one per building) ───────────────────────────────────────
create table if not exists public.emergency_rosters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.users_profile(id) on delete set null,
  building_name text not null check (char_length(building_name) between 1 and 160),
  address text check (address is null or char_length(address) <= 240),
  city text check (city is null or char_length(city) <= 80),
  province text check (province is null or char_length(province) <= 60),
  -- Who the after-hours call goes to first (the PM's own on-call person or service).
  on_call_name text check (on_call_name is null or char_length(on_call_name) <= 120),
  on_call_phone text check (on_call_phone is null or char_length(on_call_phone) <= 40),
  on_call_notes text check (on_call_notes is null or char_length(on_call_notes) <= 300),
  -- Where the shut-offs are ("Basement mechanical room, north wall").
  shutoff_water text check (shutoff_water is null or char_length(shutoff_water) <= 300),
  shutoff_gas text check (shutoff_gas is null or char_length(shutoff_gas) <= 300),
  shutoff_electric text check (shutoff_electric is null or char_length(shutoff_electric) <= 300),
  shutoff_notes text check (shutoff_notes is null or char_length(shutoff_notes) <= 600),
  -- Free text: the PM types their local numbers.
  emergency_line text not null default '911' check (char_length(emergency_line) between 1 and 40),
  non_emergency_line text check (non_emergency_line is null or char_length(non_emergency_line) <= 40),
  other_numbers text check (other_numbers is null or char_length(other_numbers) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target of the entries' and links' composite foreign keys.
  unique (id, organization_id)
);

create index if not exists emergency_rosters_org_idx on public.emergency_rosters (organization_id, building_name);

drop trigger if exists emergency_rosters_set_updated on public.emergency_rosters;
create trigger emergency_rosters_set_updated before update on public.emergency_rosters
  for each row execute function public.set_updated_at();

-- ── Rows (one per emergency trade, plus custom rows) ─────────────────
create table if not exists public.emergency_roster_entries (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid not null,
  organization_id uuid not null,
  foreign key (roster_id, organization_id) references public.emergency_rosters (id, organization_id) on delete cascade,
  category text not null
    check (category in ('plumbing', 'electrical', 'hvac', 'locksmith', 'restoration', 'glass', 'elevator', 'fire_safety', 'roofing', 'snow', 'pest', 'towing', 'custom')),
  custom_label text check (custom_label is null or char_length(custom_label) between 1 and 80),
  -- A custom row's PMRFP trade (trade_categories.slug), for "Find a 24/7 ..."; standard rows map in the app.
  trade_slug text check (trade_slug is null or trade_slug ~ '^[a-z0-9-]{1,60}$'),
  -- "This building doesn't need it" (no elevator, no snow): no gap chips.
  not_needed boolean not null default false,
  primary_name text check (primary_name is null or char_length(primary_name) <= 160),
  primary_phone text check (primary_phone is null or char_length(primary_phone) <= 40),
  primary_email text check (primary_email is null or char_length(primary_email) between 3 and 254),
  primary_org_id uuid references public.organizations(id) on delete set null,
  backup_name text check (backup_name is null or char_length(backup_name) <= 160),
  backup_phone text check (backup_phone is null or char_length(backup_phone) <= 40),
  backup_email text check (backup_email is null or char_length(backup_email) between 3 and 254),
  backup_org_id uuid references public.organizations(id) on delete set null,
  available_24_7 boolean not null default false,
  -- Account number, after-hours code, gate code...
  notes text check (notes is null or char_length(notes) <= 500),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint emergency_roster_entries_custom_label check (category <> 'custom' or custom_label is not null)
);

-- One stored row per standard category per building (custom rows repeat).
create unique index if not exists emergency_roster_entries_category_uidx
  on public.emergency_roster_entries (roster_id, category) where category <> 'custom';
create index if not exists emergency_roster_entries_org_idx on public.emergency_roster_entries (organization_id);

drop trigger if exists emergency_roster_entries_set_updated on public.emergency_roster_entries;
create trigger emergency_roster_entries_set_updated before update on public.emergency_roster_entries
  for each row execute function public.set_updated_at();

-- ── Share links (read-only, revocable) ───────────────────────────────
create table if not exists public.emergency_roster_links (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid not null,
  organization_id uuid not null,
  foreign key (roster_id, organization_id) references public.emergency_rosters (id, organization_id) on delete cascade,
  token text unique not null check (token ~ '^[A-Za-z0-9_-]{32}$'),
  label text check (label is null or char_length(label) <= 80),
  created_by uuid references public.users_profile(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0 check (view_count >= 0)
);

create index if not exists emergency_roster_links_roster_idx on public.emergency_roster_links (roster_id, created_at desc);

-- ── Vendor invites (one referral email per address per PM company) ───
create table if not exists public.emergency_roster_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entry_id uuid references public.emergency_roster_entries(id) on delete set null,
  email_key text not null check (email_key = lower(email_key) and char_length(email_key) between 6 and 254),
  vendor_name text check (vendor_name is null or char_length(vendor_name) <= 160),
  sent_by uuid references public.users_profile(id) on delete set null,
  lang text check (lang is null or lang in ('en', 'fr', 'es')),
  sent_at timestamptz not null default now(),
  unique (organization_id, email_key)
);

create index if not exists emergency_roster_invites_email_idx on public.emergency_roster_invites (email_key, sent_at desc);
create index if not exists emergency_roster_invites_org_idx on public.emergency_roster_invites (organization_id, sent_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────
alter table public.emergency_rosters enable row level security;
alter table public.emergency_roster_entries enable row level security;
alter table public.emergency_roster_links enable row level security;
alter table public.emergency_roster_invites enable row level security;

drop policy if exists "rosters member read" on public.emergency_rosters;
create policy "rosters member read" on public.emergency_rosters
  for select to authenticated using (public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid()));

drop policy if exists "rosters member insert" on public.emergency_rosters;
create policy "rosters member insert" on public.emergency_rosters
  for insert to authenticated with check (public.is_org_member(auth.uid(), organization_id) and created_by = auth.uid());

drop policy if exists "rosters member update" on public.emergency_rosters;
create policy "rosters member update" on public.emergency_rosters
  for update to authenticated using (public.is_org_member(auth.uid(), organization_id))
  with check (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "rosters member delete" on public.emergency_rosters;
create policy "rosters member delete" on public.emergency_rosters
  for delete to authenticated using (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "roster entries member read" on public.emergency_roster_entries;
create policy "roster entries member read" on public.emergency_roster_entries
  for select to authenticated using (public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid()));

drop policy if exists "roster entries member insert" on public.emergency_roster_entries;
create policy "roster entries member insert" on public.emergency_roster_entries
  for insert to authenticated with check (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "roster entries member update" on public.emergency_roster_entries;
create policy "roster entries member update" on public.emergency_roster_entries
  for update to authenticated using (public.is_org_member(auth.uid(), organization_id))
  with check (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "roster entries member delete" on public.emergency_roster_entries;
create policy "roster entries member delete" on public.emergency_roster_entries
  for delete to authenticated using (public.is_org_member(auth.uid(), organization_id));

drop policy if exists "roster links member read" on public.emergency_roster_links;
create policy "roster links member read" on public.emergency_roster_links
  for select to authenticated using (public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid()));

-- Members can only turn a link off (a revoked link stays revoked; make a new one instead).
drop policy if exists "roster links member revoke" on public.emergency_roster_links;
create policy "roster links member revoke" on public.emergency_roster_links
  for update to authenticated using (public.is_org_member(auth.uid(), organization_id) and revoked_at is null)
  with check (public.is_org_member(auth.uid(), organization_id) and revoked_at is not null);

drop policy if exists "roster invites member read" on public.emergency_roster_invites;
create policy "roster invites member read" on public.emergency_roster_invites
  for select to authenticated using (public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid()));

-- ── Explicit Data API access: grants and RLS are separate requirements ──
-- Clients write only what a PM types. The building's company, the rows'
-- roster and company, share tokens, view counts and invites are the
-- server's alone.
revoke all on public.emergency_rosters from anon;
revoke all on public.emergency_rosters from authenticated;
grant select, insert, update, delete on public.emergency_rosters to service_role;
grant select, delete on public.emergency_rosters to authenticated;
grant insert (organization_id, created_by, building_name, address, city, province, on_call_name, on_call_phone, on_call_notes,
              shutoff_water, shutoff_gas, shutoff_electric, shutoff_notes, emergency_line, non_emergency_line, other_numbers)
  on public.emergency_rosters to authenticated;
grant update (building_name, address, city, province, on_call_name, on_call_phone, on_call_notes,
              shutoff_water, shutoff_gas, shutoff_electric, shutoff_notes, emergency_line, non_emergency_line, other_numbers)
  on public.emergency_rosters to authenticated;

revoke all on public.emergency_roster_entries from anon;
revoke all on public.emergency_roster_entries from authenticated;
grant select, insert, update, delete on public.emergency_roster_entries to service_role;
grant select, delete on public.emergency_roster_entries to authenticated;
grant insert (roster_id, organization_id, category, custom_label, trade_slug, not_needed,
              primary_name, primary_phone, primary_email, primary_org_id,
              backup_name, backup_phone, backup_email, backup_org_id,
              available_24_7, notes, sort_order)
  on public.emergency_roster_entries to authenticated;
grant update (custom_label, trade_slug, not_needed,
              primary_name, primary_phone, primary_email, primary_org_id,
              backup_name, backup_phone, backup_email, backup_org_id,
              available_24_7, notes, sort_order)
  on public.emergency_roster_entries to authenticated;

revoke all on public.emergency_roster_links from anon;
revoke all on public.emergency_roster_links from authenticated;
grant select, insert, update, delete on public.emergency_roster_links to service_role;
grant select (id, roster_id, organization_id, token, label, created_by, created_at, revoked_at, last_viewed_at, view_count)
  on public.emergency_roster_links to authenticated;
grant update (revoked_at) on public.emergency_roster_links to authenticated;

revoke all on public.emergency_roster_invites from anon;
revoke all on public.emergency_roster_invites from authenticated;
grant select, insert, update, delete on public.emergency_roster_invites to service_role;
grant select (id, organization_id, entry_id, email_key, vendor_name, sent_by, lang, sent_at)
  on public.emergency_roster_invites to authenticated;

-- Verify:
-- select count(*) from public.emergency_rosters;          → 0
-- select count(*) from public.emergency_roster_entries;   → 0
-- select count(*) from public.emergency_roster_links;     → 0
-- select count(*) from public.emergency_roster_invites;   → 0

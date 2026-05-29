-- ════════════════════════════════════════════════════════════════════
-- PMRFP — Row Level Security (Phase 2) · spec §12
--
-- Model:
--   • RFP gating is the core monetization gate, enforced at the DB:
--       - rfp_posts FULL rows readable only by paid trades, the owning PM,
--         or admin.
--       - A postgres-owned `rfp_public` VIEW exposes TEASER columns of
--         published RFPs to everyone (bypasses base-table RLS by design).
--   • service_role (Stripe webhook / trusted jobs) bypasses RLS entirely.
--   • Org contact-field privacy (show/hide email+phone) is applied in the
--     app layer based on public_contact_visibility (rows themselves are
--     joinable so company names render everywhere).
-- ════════════════════════════════════════════════════════════════════

-- ── users_profile ───────────────────────────────────────────────────
alter table public.users_profile enable row level security;
create policy "profile self read" on public.users_profile
  for select to authenticated using (id = auth.uid() or public.is_admin(auth.uid()));
create policy "profile self insert" on public.users_profile
  for insert to authenticated with check (id = auth.uid());
create policy "profile self update" on public.users_profile
  for update to authenticated using (id = auth.uid() or public.is_admin(auth.uid()))
  with check (id = auth.uid() or public.is_admin(auth.uid()));

-- ── organizations ───────────────────────────────────────────────────
alter table public.organizations enable row level security;
create policy "org public read approved" on public.organizations
  for select to anon, authenticated using (
    (profile_status = 'approved' and status <> 'suspended')
    or public.is_org_member(auth.uid(), id)
    or public.is_admin(auth.uid())
  );
create policy "org insert by authenticated" on public.organizations
  for insert to authenticated with check (true);
create policy "org update by member or admin" on public.organizations
  for update to authenticated using (
    public.is_org_member(auth.uid(), id) or public.is_admin(auth.uid())
  ) with check (
    public.is_org_member(auth.uid(), id) or public.is_admin(auth.uid())
  );
create policy "org delete by admin" on public.organizations
  for delete to authenticated using (public.is_admin(auth.uid()));

-- ── organization_members ────────────────────────────────────────────
alter table public.organization_members enable row level security;
create policy "members read own or admin" on public.organization_members
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_org_member(auth.uid(), organization_id)
    or public.is_admin(auth.uid())
  );
create policy "members self insert" on public.organization_members
  for insert to authenticated with check (
    user_id = auth.uid() or public.is_admin(auth.uid())
  );
create policy "members admin update" on public.organization_members
  for update to authenticated using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy "members delete own or admin" on public.organization_members
  for delete to authenticated using (
    user_id = auth.uid() or public.is_admin(auth.uid())
  );

-- ── taxonomy: trade_categories / regions / property_types ───────────
alter table public.trade_categories enable row level security;
create policy "categories public read" on public.trade_categories
  for select to anon, authenticated using (active or public.is_admin(auth.uid()));
create policy "categories admin write" on public.trade_categories
  for all to authenticated using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

alter table public.regions enable row level security;
create policy "regions public read" on public.regions
  for select to anon, authenticated using (active or public.is_admin(auth.uid()));
create policy "regions admin write" on public.regions
  for all to authenticated using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

alter table public.property_types enable row level security;
create policy "property_types public read" on public.property_types
  for select to anon, authenticated using (active or public.is_admin(auth.uid()));
create policy "property_types admin write" on public.property_types
  for all to authenticated using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ── org ↔ taxonomy joins (public-readable; managed by member/admin) ──
alter table public.organization_categories enable row level security;
create policy "org_categories public read" on public.organization_categories
  for select to anon, authenticated using (true);
create policy "org_categories member write" on public.organization_categories
  for all to authenticated using (
    public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid())
  ) with check (
    public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid())
  );

alter table public.organization_regions enable row level security;
create policy "org_regions public read" on public.organization_regions
  for select to anon, authenticated using (true);
create policy "org_regions member write" on public.organization_regions
  for all to authenticated using (
    public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid())
  ) with check (
    public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid())
  );

alter table public.organization_property_types enable row level security;
create policy "org_proptypes public read" on public.organization_property_types
  for select to anon, authenticated using (true);
create policy "org_proptypes member write" on public.organization_property_types
  for all to authenticated using (
    public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid())
  ) with check (
    public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid())
  );

-- ── rfp_posts (FULL rows gated; teaser via rfp_public view) ─────────
alter table public.rfp_posts enable row level security;
create policy "rfp full read paid/owner/admin" on public.rfp_posts
  for select to authenticated using (
    (status = 'published' and public.has_active_trade_access(auth.uid()))
    or posted_by_user_id = auth.uid()
    or public.is_org_member(auth.uid(), posted_by_organization_id)
    or public.is_admin(auth.uid())
  );
create policy "rfp insert by pm or admin" on public.rfp_posts
  for insert to authenticated with check (
    posted_by_user_id = auth.uid() or public.is_admin(auth.uid())
  );
create policy "rfp update by owner or admin" on public.rfp_posts
  for update to authenticated using (
    posted_by_user_id = auth.uid()
    or public.is_org_member(auth.uid(), posted_by_organization_id)
    or public.is_admin(auth.uid())
  ) with check (
    posted_by_user_id = auth.uid()
    or public.is_org_member(auth.uid(), posted_by_organization_id)
    or public.is_admin(auth.uid())
  );
create policy "rfp delete by admin" on public.rfp_posts
  for delete to authenticated using (public.is_admin(auth.uid()));

-- Public TEASER projection of published RFPs. Owned by postgres → bypasses
-- rfp_posts RLS, but exposes ONLY non-sensitive teaser columns (no scope,
-- requirements, contact, exact address, budget, submission instructions).
create or replace view public.rfp_public as
  select
    id, title, slug, summary,
    property_type_id, region_id, city, province,
    deadline, desired_start_date,
    source_type, is_demo, published_at, created_at
  from public.rfp_posts
  where status = 'published';
grant select on public.rfp_public to anon, authenticated;

-- ── rfp_categories (teaser cards need category names for published) ──
alter table public.rfp_categories enable row level security;
create policy "rfp_categories public read published" on public.rfp_categories
  for select to anon, authenticated using (
    exists (select 1 from public.rfp_posts r where r.id = rfp_id and r.status = 'published')
    or exists (select 1 from public.rfp_posts r where r.id = rfp_id
               and (r.posted_by_user_id = auth.uid()
                    or public.is_org_member(auth.uid(), r.posted_by_organization_id)))
    or public.is_admin(auth.uid())
  );
create policy "rfp_categories write owner/admin" on public.rfp_categories
  for all to authenticated using (
    exists (select 1 from public.rfp_posts r where r.id = rfp_id
            and (r.posted_by_user_id = auth.uid() or public.is_admin(auth.uid())))
  ) with check (
    exists (select 1 from public.rfp_posts r where r.id = rfp_id
            and (r.posted_by_user_id = auth.uid() or public.is_admin(auth.uid())))
  );

-- ── rfp_documents (gated by visibility + access) ────────────────────
alter table public.rfp_documents enable row level security;
create policy "rfp_documents read" on public.rfp_documents
  for select to anon, authenticated using (
    (visibility = 'public'
      and exists (select 1 from public.rfp_posts r where r.id = rfp_id and r.status = 'published'))
    or (visibility = 'paid_users'
      and public.has_active_trade_access(auth.uid())
      and exists (select 1 from public.rfp_posts r where r.id = rfp_id and r.status = 'published'))
    or exists (select 1 from public.rfp_posts r where r.id = rfp_id
               and (r.posted_by_user_id = auth.uid()
                    or public.is_org_member(auth.uid(), r.posted_by_organization_id)))
    or public.is_admin(auth.uid())
  );
create policy "rfp_documents write owner/admin" on public.rfp_documents
  for all to authenticated using (
    exists (select 1 from public.rfp_posts r where r.id = rfp_id
            and (r.posted_by_user_id = auth.uid() or public.is_admin(auth.uid())))
  ) with check (
    exists (select 1 from public.rfp_posts r where r.id = rfp_id
            and (r.posted_by_user_id = auth.uid() or public.is_admin(auth.uid())))
  );

-- ── saved_rfps (paid trades only) ───────────────────────────────────
alter table public.saved_rfps enable row level security;
create policy "saved read own/admin" on public.saved_rfps
  for select to authenticated using (
    user_id = auth.uid() or public.is_admin(auth.uid())
  );
create policy "saved insert paid" on public.saved_rfps
  for insert to authenticated with check (
    user_id = auth.uid() and public.has_active_trade_access(auth.uid())
  );
create policy "saved delete own" on public.saved_rfps
  for delete to authenticated using (user_id = auth.uid());

-- ── rfp_interests ───────────────────────────────────────────────────
alter table public.rfp_interests enable row level security;
create policy "interest insert paid member" on public.rfp_interests
  for insert to authenticated with check (
    submitted_by_user_id = auth.uid()
    and public.has_active_trade_access(auth.uid())
    and public.is_org_member(auth.uid(), trade_organization_id)
  );
create policy "interest read involved" on public.rfp_interests
  for select to authenticated using (
    public.is_org_member(auth.uid(), trade_organization_id)
    or exists (select 1 from public.rfp_posts r where r.id = rfp_id
               and (r.posted_by_user_id = auth.uid()
                    or public.is_org_member(auth.uid(), r.posted_by_organization_id)))
    or public.is_admin(auth.uid())
  );
create policy "interest update owner/admin" on public.rfp_interests
  for update to authenticated using (
    public.is_admin(auth.uid())
    or exists (select 1 from public.rfp_posts r where r.id = rfp_id and r.posted_by_user_id = auth.uid())
  ) with check (
    public.is_admin(auth.uid())
    or exists (select 1 from public.rfp_posts r where r.id = rfp_id and r.posted_by_user_id = auth.uid())
  );

-- ── contact_requests (public can submit; admin reads) ───────────────
alter table public.contact_requests enable row level security;
create policy "contact insert public" on public.contact_requests
  for insert to anon, authenticated with check (true);
create policy "contact read admin" on public.contact_requests
  for select to authenticated using (public.is_admin(auth.uid()));
create policy "contact update admin" on public.contact_requests
  for update to authenticated using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ── subscriptions (member reads; admin manages; webhook = service) ──
alter table public.subscriptions enable row level security;
create policy "subs read member/admin" on public.subscriptions
  for select to authenticated using (
    public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid())
  );
create policy "subs admin insert" on public.subscriptions
  for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "subs admin update" on public.subscriptions
  for update to authenticated using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ── profile_views / rfp_views (anyone records; org/admin reads) ─────
alter table public.profile_views enable row level security;
create policy "profile_views insert any" on public.profile_views
  for insert to anon, authenticated with check (true);
create policy "profile_views read org/admin" on public.profile_views
  for select to authenticated using (
    public.is_org_member(auth.uid(), organization_id) or public.is_admin(auth.uid())
  );

alter table public.rfp_views enable row level security;
create policy "rfp_views insert any" on public.rfp_views
  for insert to anon, authenticated with check (true);
create policy "rfp_views read admin" on public.rfp_views
  for select to authenticated using (public.is_admin(auth.uid()));

-- ── resources (public reads published; admin manages) ──────────────
alter table public.resources enable row level security;
create policy "resources public read published" on public.resources
  for select to anon, authenticated using (
    status = 'published' or public.is_admin(auth.uid())
  );
create policy "resources admin write" on public.resources
  for all to authenticated using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ── notifications (own read/update; admin/service create) ───────────
alter table public.notifications enable row level security;
create policy "notifications own read" on public.notifications
  for select to authenticated using (
    user_id = auth.uid() or public.is_admin(auth.uid())
  );
create policy "notifications own update" on public.notifications
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "notifications admin insert" on public.notifications
  for insert to authenticated with check (public.is_admin(auth.uid()));

-- ── audit_logs (admin reads; admin/service writes) ──────────────────
alter table public.audit_logs enable row level security;
create policy "audit read admin" on public.audit_logs
  for select to authenticated using (public.is_admin(auth.uid()));
create policy "audit insert admin" on public.audit_logs
  for insert to authenticated with check (public.is_admin(auth.uid()));

-- ── platform_settings (public reads; admin updates) ────────────────
alter table public.platform_settings enable row level security;
create policy "settings public read" on public.platform_settings
  for select to anon, authenticated using (true);
create policy "settings admin update" on public.platform_settings
  for update to authenticated using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

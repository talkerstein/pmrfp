-- ════════════════════════════════════════════════════════════════════
-- PMRFP — Real Estate Agent / Professional role (Phase 3)
--
-- Adds `real_estate_agent` to the users_profile.primary_role check.
-- Real estate professionals (realtors, brokerage agents, listing agents)
-- post RFPs for pre-listing repairs, turnovers, and portfolio maintenance
-- on behalf of their clients. They share the PM-side surface (RFP posting
-- flow + /pm-dashboard) but get their own role for messaging + analytics
-- segmentation later.
--
-- Their organization stays org_type='property_manager' for now so existing
-- PM-side queries Just Work. A future migration may introduce a dedicated
-- `real_estate_brokerage` org_type when we have enough REA volume to
-- justify a tailored dashboard.
-- ════════════════════════════════════════════════════════════════════

alter table public.users_profile drop constraint users_profile_primary_role_check;
alter table public.users_profile add constraint users_profile_primary_role_check
  check (primary_role in ('trade','property_manager','admin','super_admin','visitor','supplier','real_estate_agent'));

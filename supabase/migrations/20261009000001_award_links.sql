-- ════════════════════════════════════════════════════════════════════
-- Official notice links for past public contracts (award notices).
--
-- Pages built from award data (/gc-hub, /contract-winners/<slug>) must link
-- each award to its official notice. rfp_public deliberately has no
-- source_url (on an OPEN tender that link is where you bid — a Trade Pro
-- feature), so this view exposes source_url for AWARD NOTICES ONLY,
-- recognised by the importer slug suffixes in src/lib/tenders/sources.ts:
--   -cba-  CanadaBuys awards     -qca-  Quebec SEAO awards
--   -tora- City of Toronto awards -nsa-  Nova Scotia awards
-- plus the importers' award summary ("Awarded <date> to <winner> — …") and
-- an award date that has passed. Open tenders never match.
--
-- The app works without this view (it links the official portal instead,
-- labelled as such); with it, SEAO awards link their own notice.
-- Idempotent. Read-only.
-- ════════════════════════════════════════════════════════════════════

create or replace view public.rfp_award_links as
  select slug, source_url
  from public.rfp_posts
  where status = 'published'
    and source_type = 'public_source'
    and source_url is not null
    and slug ~ '-(cba|qca|tora|nsa)-[a-z0-9-]+$'
    and summary like 'Awarded %'
    and deadline <= current_date;

grant select on public.rfp_award_links to anon, authenticated;

-- Verify: expect several hundred rows (one per published award notice).
select count(*) as award_links from public.rfp_award_links;

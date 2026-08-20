-- ════════════════════════════════════════════════════════════════════
-- Property services & staffing categories
-- ════════════════════════════════════════════════════════════════════
-- Our 41 categories were all construction and maintenance trades. A
-- Montreal inbound (Valet Prestige, 2026-07-26) asked whether we covered
-- parking management, valet, concierge, porter, security personnel and
-- temporary workforce before subscribing — and the honest answer was no.
-- The closest we had were Access Control and Security Systems, which are
-- the *equipment*, and Parking Lot Maintenance, which is paving.
--
-- Property managers buy these services for every tower they run, so this
-- is a genuine gap rather than a one-off accommodation: the work is
-- recurring, contracted, and sits with the same buyer who posts our
-- trade RFPs.
--
-- Descriptions are written for the generated /trades/[slug] pages, so
-- they need to read as real copy rather than placeholders.
-- Idempotent — safe to re-run.

insert into public.trade_categories (name, slug, icon, description, sort_order) values
  (
    'Parking & Valet Services',
    'parking-valet-services',
    'CircleParking',
    'Parking facility management, valet operations, and attendant staffing for commercial, residential, and institutional properties. Covers garage and surface-lot operations, permit and visitor management, and event or seasonal valet coverage — the running of the facility rather than the paving of it.',
    420
  ),
  (
    'Concierge & Porter Services',
    'concierge-porter-services',
    'ConciergeBell',
    'Front-desk concierge, porter, and building-attendant staffing for residential towers, office buildings, and mixed-use properties. Covers resident and visitor reception, package and amenity management, day porter coverage, and common-area upkeep between scheduled cleans.',
    430
  ),
  (
    'Security Personnel',
    'security-personnel',
    'ShieldCheck',
    'Licensed security guards, access-control staff, mobile patrol, and construction-site attendants for commercial and residential properties. This is staffed coverage — for cameras, alarms, and card readers, see Security Systems and Access Control.',
    440
  ),
  (
    'Temporary Workforce',
    'temporary-workforce',
    'Users',
    'Temporary and contract labour for property operations — site attendants, general labourers, seasonal coverage, and short-term staffing for turnovers, move-ins, and construction support. For a licensed trade on a defined scope, post to that trade''s category instead.',
    450
  )
on conflict (slug) do nothing;

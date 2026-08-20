-- ════════════════════════════════════════════════════════════════════
-- device_push_tokens — Expo push tokens for the mobile app
-- ════════════════════════════════════════════════════════════════════
-- Backs the "a matching RFP was just posted" alert. The existing
-- /api/cron/rfp-alerts job emails matching trades; once devices are
-- registered here it can push to them as well.
--
-- One row per device token. A user can have several (phone + tablet), and
-- a token can move between users if a device is handed over, so the token
-- itself is the natural key rather than (user, platform).

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users_profile(id) on delete cascade,
  token text unique not null,
  platform text not null check (platform in ('ios','android','web')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_idx
  on public.device_push_tokens(user_id);

alter table public.device_push_tokens enable row level security;

-- A user may only ever see or touch their own device tokens. Knowing another
-- user's token would let you address push at their device.
create policy "push tokens self read" on public.device_push_tokens
  for select to authenticated using (user_id = auth.uid());

create policy "push tokens self insert" on public.device_push_tokens
  for insert to authenticated with check (user_id = auth.uid());

create policy "push tokens self update" on public.device_push_tokens
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "push tokens self delete" on public.device_push_tokens
  for delete to authenticated using (user_id = auth.uid());

-- The alerts cron runs with the service-role key, which bypasses RLS, so it
-- needs no policy of its own to read every token.

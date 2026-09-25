-- ════════════════════════════════════════════════════════════════════
-- Sponsor click counts (per day, sponsor, placement)
-- ════════════════════════════════════════════════════════════════════
-- /go/<sponsor> bumps a counter before redirecting, so sponsors get a
-- monthly click report from our own data. Written only through
-- record_sponsor_click() with the service role; admins read it in /admin.
-- Safe to re-run.

create table if not exists public.sponsor_clicks (
  day date not null default (now() at time zone 'America/Toronto')::date,
  sponsor text not null check (char_length(sponsor) <= 40),
  placement text not null check (char_length(placement) <= 40),
  trade text not null default '' check (char_length(trade) <= 60),
  clicks integer not null default 0,
  primary key (day, sponsor, placement, trade)
);

alter table public.sponsor_clicks enable row level security;

drop policy if exists "sponsor clicks admin read" on public.sponsor_clicks;
create policy "sponsor clicks admin read" on public.sponsor_clicks
  for select to authenticated using (public.is_admin(auth.uid()));

create or replace function public.record_sponsor_click(p_sponsor text, p_placement text, p_trade text default '')
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.sponsor_clicks (sponsor, placement, trade, clicks)
  values (left(p_sponsor, 40), left(p_placement, 40), left(coalesce(p_trade, ''), 60), 1)
  on conflict (day, sponsor, placement, trade)
  do update set clicks = public.sponsor_clicks.clicks + 1;
$$;

revoke all on function public.record_sponsor_click(text, text, text) from public;
revoke all on function public.record_sponsor_click(text, text, text) from anon, authenticated;
grant execute on function public.record_sponsor_click(text, text, text) to service_role;

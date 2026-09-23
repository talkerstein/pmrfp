-- Rate limiting without Upstash: a fixed-window counter in Postgres.
-- src/lib/rate-limit.ts uses Upstash when it's configured and falls back to
-- this function otherwise (via the service role). Keys are sha256 hashes of
-- "<bucket>:<ip>", so no raw IP addresses are stored.

create table if not exists public.rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

-- RLS on, no policies: only the security-definer function below touches it.
alter table public.rate_limit_hits enable row level security;

create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_limit integer)
returns table (allowed boolean, hits integer, reset_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limit_hits as r (key, window_start, hits)
  values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into n;

  -- Opportunistic cleanup (~1% of calls): drop windows older than a day.
  if random() < 0.01 then
    delete from public.rate_limit_hits where window_start < now() - interval '1 day';
  end if;

  return query select n <= p_limit, n, w + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

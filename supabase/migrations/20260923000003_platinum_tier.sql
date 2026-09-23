-- Platinum: the top paid directory tier, above Featured. A Platinum listing
-- sorts first, shows a Platinum badge and always counts as featured. The app
-- reads it in a separate query, so it degrades gracefully if this column is
-- missing.
alter table public.organizations
  add column if not exists platinum boolean not null default false;

create index if not exists organizations_platinum_idx
  on public.organizations(platinum) where platinum;

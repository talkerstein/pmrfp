-- District Municipality of Muskoka said yes on 2026-11-05 to listing its
-- facilities tenders (title, closing date, link back to its bids&tenders page).
-- Same shape as the Nanaimo row: a "yes" with no method yet, so nothing is
-- imported; the buyer page shows the "Listed with permission" card.
-- No new table, so no new grants: buyer_permissions keeps the grants from
-- 20261021000010_buyer_sources.sql.
insert into public.buyer_permissions (buyer_slug, buyer_name, province_code, scope, hosts, status, method, granted_on, contact, reply_quote, notes) values
  ('district-municipality-of-muskoka', 'District Municipality of Muskoka', 'ON', 'buyer', '{}', 'yes', null, '2026-11-05',
   'Rose Jackson, Manager, Procurement',
   'Yes, you can list our facilities tenders as the title, closing date and link back to our bids&tenders page.',
   'Reply to our Nov 4 request to list public facilities tenders. Its earlier reply pointed to its Bid Opportunities page and muskoka.bidsandtenders.ca and suggested subscribing to notifications. Biddingo and bids&tenders are never read automatically, so nothing is imported.')
on conflict (buyer_slug) do nothing;

# November 2 verification

Production remains on Supabase. This verifies the pinned, read-only Cloudflare
preview; it does not authorize production cutover or copied-data application writes.

## Source tracking and copied data

After explicit approval, the guarded source proposal installed 108 table
registrations and 216 enabled capture triggers. The existing reader has zero
application-table write grants, no direct capture-function execution, private
queue reads and bounded acknowledgement only. RLS is enabled on queue tables;
PUBLIC and app roles cannot use its schema. Expiry remains November 5 at
10:00 UTC. Normal application changes produced events without synthetic
customer writes.

A repeatable-read bootstrap includes 79,341 source records and 11 pending
receipt IDs observed in the same transaction. The approved rebuild contains
79,179 records with every authoritative field preserved. Source schema metadata
matched the reviewed catalog before capture installation; event-trigger function
qualification differences normalize to the same definitions.

The 14,272-change journal passed local and native forward/reverse/reapply:
71,316 -> 79,179 -> 71,316 -> 79,179. Every native stage checks exact schema,
all row fields and foreign keys. Actual native baseline and final readback
backups were restored and validated. The final dataset SHA is
`96913c89ae72fc68ba73cc8bad3d59727ce6480f9927f77f8a5a4ee5e5c8ce2b`.

The initial large 412-statement REST request repeatedly failed with generic
Cloudflare internal-error code 7500, without changing the checkpoint. Its 207
before-image checks passed in smaller read-only requests. Private payload staging
resolved the observed failure while retaining one atomic 413-statement data
transaction. A synthetic native canary separately proves intentional failure
rollback, forward/reverse replay and exact-schema cleanup.

## API and access checks

Live comparison against the captured source matched every public field of
1,795 published RFPs, 45 categories, 88 regions and 21 property types. All three
public photo metadata records matched across all published parents. Bad gateway
access and photo writes were denied. Photo objects still reside in Supabase Storage.

Worker version `da41cb6b-fc97-4f5f-a606-1796b34d2a48` adds a private-detail
revision gate. It checks live source RLS using the real user's token and reads
only `id,updated_at` from the source. The audited source BEFORE UPDATE trigger
maintains the revision. A different copied revision fails closed with 409;
UTC formatting is normalized while preserving microseconds. Revision metadata
is excluded from the returned detail projection. This gate concerns the RFP row;
it does not implement general synchronization or freshness-gated writes.

After a second explicit approval, the existing synthetic account's private demo
company received a 15-minute trial. Current private detail fields matched the
captured source. A temporary timestamp change in the D1 preview caused immediate
409 denial; the exact original timestamp was restored and the same details worked
again. The trial was revoked early and the same Auth session immediately lost
access. No source customer records, subscriptions, charges, Stripe objects or
credentials changed. The test trial is expired again.

Relevant Worker contracts: 141 passing tests. Offline migration suite: 67
passing tests. Typecheck and targeted lint pass. Earlier dated application build
and UI evidence remain historical; no new browser UI verification is claimed here.

## Remaining gates

After another complete native validation following the temporary preview test,
all 11 bootstrap receipts were acknowledged successfully. Newer source receipts
remain pending. Reversing this acknowledged checkpoint requires a new full
source bootstrap.
Low-egress current-row extraction, replay scheduling, durable consumer receipts,
freshness-gated writes and broader app conversion remain unfinished. Auth and
Storage still use Supabase, and production cutover remains blocked.

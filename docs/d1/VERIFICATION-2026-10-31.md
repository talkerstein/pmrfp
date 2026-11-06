# Verification: refreshed read-only D1 preview

**Story:** opening a public RFP renders its board/taxonomy/photo metadata through
fixed gateway-protected D1 reads; the browser retains the existing public image
URL. Paid/admin documents and unpublished-parent images remain excluded.

| Boundary | Evidence |
| --- | --- |
| Source → copy | 71,467 source records; approved rebuild 71,316; authoritative fields unchanged |
| Native replay | 16,057 changes, 381 statements; forward/reverse/final reapply verified |
| Recovery | Baseline and final actual readback backups restored and fully validated |
| Public board/taxonomy | Every projected field matches 1,802 published listings, 45 categories, 88 regions and 21 property types |
| Public photo API | All 1,802 parent IDs compared; all three public photo URLs/order match; invalid gateway and POST denied |
| Response → browser | French RFP page returned 200; expected image loaded at 800 × 452; region page returned 200 |
| Worker | Version 9c41f94a-154f-4b6f-ab6c-1433162c2cc8; copied staging binding; writes remain disabled |
| Environment | Local D1 dataset pin 284d7fd4f74516a2dc238cb69abc945b448d38cdfcd1f25de0a3255869bc3941; production D1 selection remains blocked |

The first build attempts exposed a Next.js integration bug: broad client catches
converted framework control-flow exceptions from `fetch(...,{cache:'no-store'})`
into gateway failures. Server adapters now pass Next's documented
`unstable_rethrow` handler; standalone clients stay independent of Next and
ordinary transport errors remain sanitized. Regression tests use a real Next
redirect exception. After the fix, the production build completes all 785 pages.
The live database and direct public API checks stayed valid during diagnosis.

This is a staging/read-preview milestone. Image objects, Auth, private/owner
photo reads, other application operations and jobs remain Supabase-backed.
Continuous synchronization and production cutover are not complete. The
private source change-capture setup is tested locally and awaits approval;
see CHANGE-CAPTURE.md.

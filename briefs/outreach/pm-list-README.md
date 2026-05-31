# Ontario Property Management List — README

**Built:** 2026-05-31
**Cost:** $0 (free public-source research, no paid APIs)
**Files:**
- `pm-list-ontario.xlsx` — polished 3-sheet workbook (Summary + All Firms + Tier A only)
- `pm-list-ontario.csv` — same data, CSV format (Excel-openable)
- `pm-list-ontario-tier-A.csv` — Tier A only, CSV
- `pm-list-work/` — raw harvest JSONs + merge/tag scripts (kept for re-runs every 6 months)

---

## What's in here

**1,126 unique Ontario property management firms**, deduped across 13 parallel public-source harvests.

| Tier | Count | PMRFP Fit | Use it for |
|---|---|---|---|
| **A** | 142 | Yes — priority | Dial Monday. Mid-market condo/mixed PM in GTA/Ottawa/Hamilton/London/KW. Has contact + association/license signal. |
| **B** | 196 | Yes | Week 2-3. Commercial mid-size, or condo PM outside major metros, or rental PM with award/CCI signal. |
| **C** | 420 | Maybe | Drip / nurture. Residential rental or small condo. Has phone+website but minimal qualifying signal. |
| **D** | 281 | Unlikely | Park. Sparse data, unknown type — mostly YP listings without classification. Revisit after enrichment. |
| **Skip** | 87 | No (REIT-scale) | Brookfield/QuadReal/Morguard/CAPREIT class. Have procurement teams. Wrong for $249/yr self-serve. |

**Data coverage:**
- 979 have phone (87%)
- 578 have website (51%)
- 83 have email (7%) — **this is the biggest gap; an enrichment pass against website contact pages will lift this to ~60-70%**

---

## Tier scoring logic

Each firm gets a score from positive signals:

- **Contact:** has email (+2), phone (+1), website (+1)
- **Type:** condo (+3), commercial/mixed (+2), residential (+1)
- **Regulatory/association:** CMRAO licensed (+3), ACMO member (+2), CCI member (+2), BOMA member (+2), FRPO member (+2), REALPAC member (+1)
- **Awards:** FRPO MAC Awards finalist/winner (+3)
- **Activity:** actively hiring (+2), LinkedIn profile (+1)
- **Size:** 11-200 employees (+2), 5-50 buildings (+2)
- **Geography:** GTA city (+2), Ottawa/Hamilton/London/KW (+1)

Buckets: A ≥ 9, B = 6-8, C = 3-5, D = 1-2, Skip = anti-target.

---

## 13 sources harvested (parallel agents)

1. **CMRAO** — Condominium Management Regulatory Authority of Ontario (mandatory licensing registry)
2. **ACMO** — Association of Condominium Managers of Ontario
3. **CCI** — Canadian Condominium Institute, 7 ON chapters (Toronto, Ottawa, Huronia, Golden Horseshoe, Grand River, London, Windsor)
4. **FRPO MAC Awards** — 2023/2024/2025 finalists + winners (signal-dense)
5. **REALPAC** — Real Property Association of Canada members
6. **FRPO + LPMA Boards** — rental-association leadership
7. **BOMA Toronto public lists** (rest login-walled)
8. **Yellow Pages — GTA** (8 cities, ~370 rows)
9. **Yellow Pages — ON primary** (11 cities, ~315 rows)
10. **Yellow Pages — ON secondary** (25 cities, ~379 rows)
11. **Job boards** — Indeed + LinkedIn Jobs + Glassdoor (74 firms currently hiring = freshness signal)
12. **LinkedIn + Google long-tail** (130 firms via Google snippets of LinkedIn company pages)
13. **Bing + DDG diversification + City vendor registries** (68 firms — surfaced student-housing, non-profit, industrial niches)

---

## Known gaps (full disclosure)

1. **Email coverage is 7%.** Run an enrichment pass against contact pages of the 578 firms-with-websites to lift this to 60-70%. ~3-4 hours of agent runtime.
2. **CMRAO yielded only 117 firms** (vs. expected 600-800) — the full public-registry search sits behind reCAPTCHA v2 which is not automatable. The 117 are the firms who actively declared service regions. Cross-checked against ACMO/CCI: most CMRAO firms are already in those lists.
3. **BOMA Ottawa, REIC, IREM directories are login-walled.** Recovered partial via Wayback / Google cache / awards lists (still running as of build time).
4. **GTAA, EOLO, HDAA, WRAMA directories are members-only.** Substituted with FRPO board + rental-listing aggregator scrape.
5. **464 firms are tagged `type_hint: unknown`** — mostly YP rows where the directory didn't classify. Enrichment will fix this from the firm's own website copy.

---

## Anti-target list (87 REIT-scale firms — Skip tier)

These have in-house procurement, won't use $249/yr self-serve. Pre-flagged so they don't pollute outreach.

Examples: Brookfield, QuadReal, Bentall Green Oak, Oxford Properties, Cadillac Fairview, Ivanhoe Cambridge, Colliers, JLL, Cushman Wakefield, CBRE, Avison Young, Morguard, CAPREIT, Killam REIT, Boardwalk REIT, Tricon Residential, Minto Apartment REIT, Hazelview, Skyline Group, Starlight, InterRent, GWL Realty Advisors, Concert, Northview, Dream, RioCan, Choice Properties, KingSett, SmartCentres, FirstService Residential, Realstar, Medallion, Timbercreek, Larlyn, MetCap, Triovest.

---

## How to refresh (every 6 months)

```bash
cd D:\Claude\pmrfp\briefs\outreach\pm-list-work
# Re-run the 13 harvest agents (see commit history for prompts)
node merge.js
node tag-and-export.js
python build-xlsx.py
```

The whole pipeline runs in ~1 hour of agent time + a few seconds of local merge/tag/export.

---

## Recommended next steps

1. **Open `pm-list-ontario.xlsx`** → Summary sheet first for context, then Tier A sheet to start outreach.
2. **Enrich emails before mass-emailing** — current 7% will burn cycles. Either dispatch the enrichment agent (free, ~4 hr) or accept that v1 outreach is phone-first.
3. **Cross-reference against existing PMRFP signups** before contacting — don't re-pitch anyone already in the funnel.
4. **Sister cohort**: the trade-side recruit at `briefs/outreach/` (electricians) targets supply. This list targets demand. Don't blend the outreach copy.

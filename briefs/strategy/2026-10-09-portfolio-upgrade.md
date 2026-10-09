# Portfolio and case studies: what works, what doesn't, and the plan

*2026-10-09. Numbers come from the public (anon) Supabase API and the live pmrfp.com pages on 2026-10-09. Nothing private was queried and no account was created.*

## The short version

The project tools are good and nobody uses them. **Zero projects have ever been published** (`case_studies` published: 0; first-party reviews: 0), across **35 approved trade profiles**. The photo capture flow (before/during/after photos, AI writes the draft, privacy check on the photos) is genuinely well built. What's missing is the reason to bother:

1. **Everything is public or nothing.** A trade can't add a job for a client who doesn't want it on the internet, and that's most commercial work. So the job never goes in.
2. **A project does nothing after it's posted.** It sits on the profile. It can't be attached to a bid, it can't be handed to a buyer for prequalification, and it can't be edited (once published, the trade can't touch it).
3. **"Case study" is a thin word here.** Challenge, approach, outcome. No "who was it for", no scope, no figures, no dates. A property manager reading it can't tell if the job matches theirs.
4. **Nobody sees them.** The `/case-studies` page is an old-design list that has been empty since launch (its empty state says "first case studies are in review", which isn't true). The directory profile shows projects only once they exist.

So the plan was: make a project useful to the trade *in a bid*, not only on the profile; give them control over who sees it; make the write-up a real case study without inventing anything; and put the public ones where buyers browse.

## What works today (before this PR)

| Piece | Where | State |
|---|---|---|
| Photo capture | `/dashboard/projects/new` | Works well. Phone-first, photos shrunk in the browser, EXIF/GPS stripped on the server, AI "Write it for me" from notes + photos, privacy flags (faces, plates, addresses, client names) that must be ticked off. |
| Typed case study | `/dashboard/case-studies/new` | Works. Longer form. **Skipped the free-plan limit** (a free trade could add unlimited typed studies). |
| Moderation | `/admin/case-studies` | Works. Trade Pro + approved profile auto-publishes; everyone else waits for review. |
| Review requests | Projects page, Trade Pro | Works. One-time emailed link, hashed token, consent flags for name/company and "OK to be a reference". |
| Reference sheet | `/dashboard/projects/reference-sheet` | Works. Printable list of published projects plus consenting references. Buried in a sentence under the list. |
| Profile portfolio | `/directory/<slug>` (v3) | Works. A project "deck" of up to 4 plus a list. Hidden when there are none. |
| Public page | `/case-studies/<slug>` | Works, old marketing design, Article markup. |
| Index | `/case-studies` | Old design. Empty. No filters. |
| Mobile app | `mobile/app/projects/*` | Capture + list via `/api/projects`. |
| Migration `20260924000001` | projects columns + reviews | **Has run** in production (the `photos` column is readable). |

### What's broken or clunky

- **No visibility control.** Every published project is public, indexed, in the sitemap.
- **No edit after publish.** RLS lets members update only draft/pending rows, and there was no edit screen at all.
- **Thin structure.** No client type, scope, figures, start/finish dates; budget is free text.
- **No use in a bid.** Expressing interest in an RFP or GC package had a message box and nothing else; the PM never saw the trade's work.
- **Free limit loophole** on the typed form (above).
- **Dishonest empty state** on `/case-studies` ("first case studies are in review").
- **"Add a project" tile on every profile**, shown to every visitor, not just the owner (it's an ISR page so it can't know who's looking). Left as is; noted below.

I clicked through the public pages on pmrfp.com (case studies index, a directory profile with no projects). The signed-in dashboard flows were reviewed in code and spot-checked in demo mode locally; I didn't create a real trade account on production to test them.

## The ranked plan

1. **Visibility per project: Public, Unlisted, Private.** Public = profile, gallery, search. Unlisted = link only, noindexed, listed nowhere. Private = the company only, plus private links it hands out. *Why first: it removes the reason most jobs never get added.*
2. **Private share links** for bids and prequalification: one link per buyer, view count, turn off any time. *Turns a project into something the trade uses this week.*
3. **Attach projects to an expression of interest** (RFPs and GC packages, same flow). The PM sees them next to the message; private ones arrive as a private link. *This is the moment a portfolio wins work.*
4. **Case study builder** that turns an existing project into a real case study: client type, scope, challenge/approach/result, up to 4 figures, before/after photos and cover, trade/place/dates, optional value range, the project's reviews, and visibility. Edits a live project (the first way to edit at all). Optional "Tidy my wording" AI that only re-words what the trade typed, with a guard that throws away any AI field adding a number or a name the trade didn't write, and a required "I've read it" tick.
5. **Capability sheet**: the reference sheet grown up. Pick the projects, company credentials on file, figures, client type, value range, references, private links. Print or save as PDF.
6. **Public `/projects` gallery** filterable by trade and region (public projects only), linking to company profiles. Thin filtered views noindexed. Replaces the empty `/case-studies` index (301).
7. **Case study page in the v3 design** with richer structured data (Article authored by the company, about the Service, place, dates).
8. **Nudges and payoff**: dashboard home suggests the next step (build the case study, or print the sheet); the projects page explains what projects do before listing them; the profile links to all of a company's projects.

Items 1 to 8 are in this PR.

## Free vs Trade Pro

| | Free | Trade Pro ($249 CAD/yr) |
|---|---|---|
| Projects | 1 (now also enforced on the typed form) | Unlimited |
| Photos per project | 3 | 24 |
| Public / Unlisted | Yes | Yes |
| Private projects + private share links | No | Yes |
| Case study builder + "Tidy my wording" | Yes, on the one project | Yes |
| Capability sheet (print/PDF) | Yes | Yes |
| Attach projects to an interest | (Interest itself is Pro) | Yes, up to 3 |
| Client review requests | No | Yes |
| Publishes without waiting for review | No | Yes, once the profile is approved |

Why the builder and sheet stay free: the free plan already stops at one project, and a thin free profile makes the gallery and directory worse for the paying members. The free trade gets a taste of a complete case study; Pro sells volume, privacy and bids. If a Pro plan lapses, private projects stay private (never flipped public) and existing links keep working; the trade just can't make new private projects or links.

## What's left for a follow-up

- **Photos of private projects are still files in the public bucket.** Their URLs are random and never listed, but anyone holding a photo URL can open it. Moving private photos to signed URLs is the next privacy step.
- **Mobile app parity**: the app lists projects and their visibility (the API now returns it) but has no builder, visibility switch or share links.
- **Server error messages are English** in French and Spanish (same as the existing capture flow).
- **Translations of the old "content" strings** for the retired `/case-studies` index can be deleted.
- **The profile "Add a project" tile** shows to every visitor; consider moving it behind a client-side check of the signed-in company.
- **Attach after the fact**: a trade can attach projects only when first expressing interest, not to an interest already sent.
- **Revalidation in other languages**: this PR purges `/en`, `/fr` and `/es` copies when a project changes; the rest of the site only purges the unprefixed path.

---

## Technical appendix

**Migration (Dev must run):** `supabase/migrations/20261009000002_portfolio.sql`. Idempotent. Until it runs, the app behaves exactly as before (every query that names a new column checks for error 42703 / PGRST204 and falls back; the builder, visibility and links show "switching on soon").

- `case_studies`: `visibility` (`public|unlisted|private`, default public), `client_type` (fixed list), `scope`, `results` jsonb (≤4), `started_on`, `completed_on`, `ai_assisted`. Partial index on public published rows.
- RLS: "case studies public read published" now = `status='published' and visibility in ('public','unlisted')` OR member OR admin. Private rows never reach anon. Member update policy unchanged (draft/pending only); all edits of live rows go through the service role after an ownership check.
- `vendor_reviews_public` view: excludes reviews tied to a private project.
- `case_study_share_links`: token (32-char base64url, checked), label, revoked_at, view_count; member read only, no insert/update policies (service role).
- `rfp_interests.case_study_ids uuid[]` (≤3). The PM page re-checks each id belongs to the interested company before resolving it.

**Code**
- Rules (pure, tested): `src/lib/projects/visibility.ts`, `case-study.ts` (schema, steps, progress, `contentChanged`, `nextStatus`), `polish.ts` (AI + fact guard), `gallery.ts`, `compat.ts`.
- Server: `src/lib/projects/manage.ts` (load, save, visibility, share links), `share.ts` (`/shared/<token>` loader, service role, view counter), `attach.ts` (interest attachments), `schema.ts` (JSON-LD), `server.ts` (`listMyProjects` progress, capability sheet).
- Routes/pages: `/dashboard/projects` (visibility, progress, links), `/dashboard/projects/[id]/case-study` (builder), `/dashboard/projects/capability-sheet` (reference-sheet redirects there), `/case-studies/[slug]` moved to the `(v3)` group, `/shared/[token]`, `/projects` gallery, `/api/projects/polish`. `/case-studies` 301 → `/projects` (next.config).
- Status on save: auto-publishers stay/go live (except after an admin rejection); others stay live on settings-only edits, and go back to review when words, figures or photos change.
- Strings: new namespaces `portfolio` (server) and `portfolioClient` (client), en/fr/es.
- Tests: `test/db/portfolio.test.ts` (RLS + constraints against the real SQL in PGlite), `test/unit/portfolio.test.ts` (visibility, builder schema/progress/status, AI fact guard, gallery).

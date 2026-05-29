# PMRFP — Design Handoff Brief

> For the design pass ("Claude design"). The product is **built, tested, and live** in demo mode at **https://pmrfp.vercel.app** (repo: github.com/talkerstein/pmrfp). This brief gives you everything to restyle it without breaking logic, and a clean path to **amalgamate** the design work back into the functional build.

---

## 1. What you're styling

PMRFP is a Canada-first, two-sided B2B platform: **trade companies** (electricians, HVAC, roofers…) pay $249 CAD/yr to get listed + see commercial-property RFPs; **property managers/builders/owners** post RFPs free. It's an **SEO play** — 144 pages, programmatic hubs, comparison + vertical pages. The current visual layer is a deliberate **placeholder** (navy/gold + Inter). Your job is the real brand.

**Required mood (non-negotiable, from the product spec §6):** serious · commercial · trustworthy · real-estate / procurement-portal · clean. **NOT** playful, NOT startup-cute, NOT a classifieds/Kijiji look. Think B2B SaaS dashboard × commercial-real-estate marketplace × procurement portal. Large editorial headings.

---

## 2. The current design system (so your output drops in)

**Stack — read before designing in code:**
- **Tailwind CSS v4** — CSS-first. There is **no `tailwind.config.js`**. All theme tokens live in `src/app/globals.css` inside `:root` and `@theme`.
- **shadcn/ui on Base UI** (NOT Radix). Components in `src/components/ui/`. **Gotchas that will bite you:**
  - Buttons: **no `asChild`**. For link-styled buttons use `buttonVariants()` on a `<Link>`, e.g. `<Link className={buttonVariants({ size: "lg", variant: "outline" })}>`. For composition use Base UI's `render` prop.
  - `Accordion`: no `type`/`collapsible` props (single-open is default).
  - `Select`: `onValueChange` passes `string | null`.
  - `Dialog`/`Checkbox`/`DialogTrigger`: Base UI APIs (`render` prop, `onCheckedChange(boolean)`).
- Fonts via `next/font` in `src/app/layout.tsx`: **Inter** (`--font-inter`, sans) + **JetBrains Mono** (`--font-mono-jb`).

**Design tokens (the master lever) — `src/app/globals.css`:**
- Semantic shadcn tokens in `:root`: `--background #F8FAFC`, `--foreground #0B1220`, `--card`, `--primary #0B1220` (navy), `--secondary`, `--muted`, `--accent`, `--border #E2E8F0`, `--ring #B7791F` (gold), `--radius 0.5rem`, plus `--sidebar*` (navy sidebar, gold active).
- Brand scales in `@theme`: `--color-gold-50…800` (accent ramp around #B7791F), `--color-navy`, `--color-slate-ink #1E293B`, `--color-success #15803D`, `--color-warning #D97706`, `--color-error #B91C1C`. These generate utilities like `bg-gold-500`, `text-gold-700`, `text-success`.
- A `.dark` block exists but **no theme toggle is wired** (light-only for now — your call whether to add dark).
- Custom utility: `.eyebrow` (uppercase mono label), `.text-balance`.

**→ Changing the palette/type for the whole app = editing `globals.css` tokens + the fonts in `layout.tsx`.** That alone re-skins everything.

---

## 3. The integration seam — design-owned vs logic-owned

**This is the contract that makes amalgamation painless.** Restyle the left column freely; do **not** change the behavior/props/data in the right column.

| ✅ DESIGN-OWNED (restyle, replace, add) | 🚫 LOGIC-OWNED (do not break) |
|---|---|
| `src/app/globals.css` (tokens, utilities) | `src/lib/**` (access, data, stripe, email, validations, seo data, supabase clients) |
| `src/components/ui/**` (shadcn primitives — variants, styles) | `src/app/api/**` (route handlers) |
| `src/components/public/**` (hero, cards, sections, filter-bar, locked-panel, category-grid, markdown, etc.) | `supabase/**` (schema, RLS, seed) |
| `src/components/container.tsx`, `site-header.tsx`, `site-footer.tsx` | `src/proxy.ts`, `middleware` session logic |
| `src/components/dashboard/**`, `src/components/admin/**` (shells, stat-card, tables — visual) | Server actions in `src/lib/*/actions.ts` |
| Fonts + visual metadata in `src/app/layout.tsx` | Form field `name=` attrs + `action={...}` wiring |
| Page **markup/layout** in `src/app/(marketing)/**` and dashboards | The **data calls + props** inside those pages (`await listRfps()`, `requireRole(...)`, `isDemoMode()`, `params`/`searchParams` awaits, gating logic) |
| A real **logo** component (replace the "PM" text tile) | `lib/seo/jsonld.tsx` output shape (keep schema valid) |

**Rules of engagement when editing pages:**
1. Keep every `import` from `@/lib/**` and every data/await call exactly as-is.
2. Keep form `name=` and `action=` attributes (forms post to server actions / APIs by field name).
3. Keep the Base UI patterns in §2 (no `asChild`, etc.) or the build fails.
4. Preserve the **no-fake-guarantees** copy — the disclaimer blocks in `src/lib/site.ts` (`COPY.*`) are legally required (spec §18); restyle, don't reword.
5. Keep pages server components unless they already say `"use client"`.

**Verification gate (must stay green after your changes):**
```bash
npm run typecheck   # tsc --noEmit
npm run build       # 144 routes must build
npm run test        # 30 tests (RLS + unit) must pass
```

---

## 4. What to design — template inventory (priority order)

There are 144 routes but only ~15 unique templates. Design these:

**Tier 1 — the storefront (highest visibility):**
1. **Brand core**: logo + wordmark, color refinement, type scale, button/badge/card/elevation styles, iconography. (Editing tokens + `ui/` cascades everywhere.)
2. **Homepage** `/` — hero, stats strip, problem, solution cards, audience split, category grid, pricing preview, CTA (`src/app/(marketing)/page.tsx` + `components/public/section.tsx`).
3. **Site chrome** — header (`site-header.tsx`) + footer mesh (`site-footer.tsx`).
4. **Directory** list + **vendor profile** (`directory/`, `components/public/directory-card.tsx`).
5. **RFP** board + **RFP detail** incl. the **locked/teaser panel** (`rfps/`, `rfp-card.tsx`, `locked-content-panel.tsx`) — the monetization moment; make the locked state desirable, not annoying.
6. **Pricing** (`pricing/page.tsx`).

**Tier 2 — the SEO surface (the growth engine):**
7. **Comparison** `/vs/[competitor]` (table + strengths/weaknesses).
8. **Vertical** `/for/[vertical]` (value-prop layout).
9. **Trade/region hubs** `/trades/[category]`, `/regions/[slug]`.
10. **Resources** list + **article** (markdown renderer `components/public/markdown.tsx`).

**Tier 3 — app surfaces:**
11. **Auth** (sign-in/up, onboarding multi-section form).
12. **Dashboard shell** + stat cards + data tables + forms (trade + PM).
13. **Admin** shell + tables.
14. **System states**: empty (`empty-state.tsx`), loading skeletons, toasts (sonner), status badges (`status-badge.tsx`).

---

## 5. Brand decisions to make (and a key question)

- **Logo / wordmark** — currently a navy "PM" tile + "PMRFP" text. Needs a real mark.
- **Palette** — keep navy + gold, or evolve? Gold is currently muted (#B7791F); could go richer brass or a different trust-accent. Status colors are set.
- **Typography** — Inter is safe but generic. Consider a **display face for editorial headings** (the sister site PermitClub pairs Instrument Serif + Geist). A serif display + Inter body would read more premium/institutional.
- **Hero visual** — abstract, a product/dashboard mock, or real Canadian commercial-building imagery? (Avoid generic stock.)
- **Imagery / illustration** strategy, **motion** (subtle only), **trust signals** (logos, stats, verified badges).
- **⭐ Sister-brand question (decide explicitly):** PMRFP is "from the team behind **PermitClub**" (bordeaux + antique-gold, Instrument Serif, premium-institutional). Should PMRFP **visually echo** PermitClub for family resemblance, or **deliberately differentiate** (different country/market)? This single decision shapes the whole palette/type direction. PermitClub's kit is in its repo (`talkerstein/Permit-Club`, `BRAND-KIT.md`) for reference.

---

## 6. Assets needed from Rishon

- Logo files (or "design one")
- Any locked brand colors / fonts (or "you choose")
- Imagery direction or a few visual references you like
- Decision on the PermitClub family-resemblance question (§5)
- The 4 persona decks as **PDF** (Builder/Tradesman/Salesman/Investor) if you want their exact language reflected — Google Slides links weren't machine-readable.

---

## 7. Hard constraints

- **Accessibility**: WCAG AA contrast, focus-visible states (gold ring token exists), semantic headings, labels on inputs.
- **Responsive**: mobile-first; everything works at 360px → desktop. Tables wrap in `overflow-x-auto`.
- **Performance**: keep it light — many pages are statically generated + ISR; don't add heavy client JS to server components. Avoid large hero videos.
- **Copy**: no fake guarantees anywhere; keep the §18 disclaimers (restyle only).

---

## 8. Amalgamation workflow

1. A **`design` branch** has been pushed from current `master` — start there (or cherry-pick).
2. Because design-owned and logic-owned files barely overlap (§3), merges are low-conflict. The only shared surface is **page markup** — when you touch a page, change classes/structure but keep imports + data calls + form attrs.
3. When ready: open a PR `design → master`. The owner (or I) review for the §3 rules, run the §3 verification gate, resolve any page-level conflicts, and merge. Vercel auto-deploys on merge to `master`.
4. If you prefer, work directly on `master` in your session and I'll reconcile — but the branch keeps the functional build safe while you iterate.

**Live reference:** https://pmrfp.vercel.app · **Repo:** github.com/talkerstein/pmrfp · **Tokens:** `src/app/globals.css` · **Components:** `src/components/`

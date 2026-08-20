# RFP Harvest — Concierge Emails to Fill the Board

> Built 2026-07-26. Goal: take the board from **7 RFPs → 30+ real projects** in 30 days.
> Honest claims only. Free to post. $249/yr CAD is the trade side — PMs never pay.

## The one idea

**Do not ask a property manager to sign up.** Signing up is work, and work is where
warm leads die. Ask them one question they can answer from memory in ten seconds:

> **"What's coming up in the next 90 days?"**

Then *you* post it for them. They do nothing. You get a real RFP on the board.

Every email below is built around that single ask. The account, the login, the
profile — all of that comes later, after they've seen a trade express interest.

## Why this is the whole ballgame

Trades pay $249/yr to see work. Seven projects is not worth $249. Thirty real,
current projects is. **The RFP board is the product** — the directory, the SEO, the
referral lanes all sit on top of it. Supply first.

## Rules for every email

- **Never** open with "I built a platform." Open with their problem or your relationship.
- The ask is a **question**, not a signup link.
- Offer to do the work: *"send me the details and I'll post it for you."*
- Be honest that it's early. It buys more trust than it costs.
- Their name and building stay private until they choose to reveal — say so, it's a real feature.
- Subject lines under 55 chars. Send Tue–Thu, 7–9am or 4–6pm.
- One follow-up. Then stop.

---

## EMAIL 1 — Warm PM (your Montreal friend, and anyone you actually know)

**Subject:** What've you got coming up?

Hi {First},

Quick one, and it's a favour rather than a pitch.

I've built **PMRFP** — property managers post a project once, and qualified trades
come to them instead of the other way around. Free to post, always.

I'm not going to ask you to sign up for anything. I want to ask you one question:

**What work have you got coming up in the next 90 days?** Roof, HVAC, paving,
painting, common-area reno — whatever's on the list.

Send me the rough details in a reply — building type, city, what needs doing, rough
timing — and **I'll post it for you.** Takes me five minutes, takes you one. Your name
and the building stay private until you decide otherwise.

I'll tell you honestly: we're early, so I'm not promising you twenty bids. What I am
promising is that I'll personally put it in front of the right trades and send you
whoever's genuinely interested.

Worth a reply?

— Rishon
pmrfp.com

---

## EMAIL 2 — Semi-cold PM (the Ontario list)

**Subject:** Quick question about your upcoming projects

Hi {First},

You manage {property type / portfolio} in {city} — so you already know the drill on
sourcing trades: email four companies, two reply, one shows up, and the quote comes in
three weeks late.

I built **PMRFP** to fix the front half of that. You post the project once. Qualified
trades in your region see it and express interest. You shortlist. Free to post — the
trades pay for access, never you.

**One question:** have you got anything coming up in the next 90 days?

Reply with the basics — city, property type, scope, rough timing — and **I'll post it
for you.** No account needed on your end. Your company name and building stay hidden
until you choose to share them.

Straight with you: we're early, and I'd rather under-promise. I'm not sending you
twenty bids next week. I'll put it in front of the trades we have and send you anyone
genuinely interested. If that's useful, great. If not, you've lost one reply.

— Rishon
pmrfp.com

---

## EMAIL 3 — Condo board / property management firm

**Subject:** Getting three quotes without the phone tag

Hi {First},

If you're on a condo board or managing the corporation, you already know the pain:
the board wants three comparable quotes, and getting them means six weeks of phone tag
with contractors who half-answer.

**PMRFP** turns that into one post. You describe the project once, qualified trades in
your region express interest, and you take a clean shortlist back to the board. Free
to post — trades pay for access, the corporation never does.

**What's on your list for the next 90 days?** Garage membrane, roof section, corridor
refresh, boiler, balcony work — whatever the reserve study is pushing.

Reply with the details and **I'll post it for you.** The corporation's name and address
stay private until you decide to share them — which matters when you don't want every
contractor in the city knowing your reserve fund just got approved.

Honest note: we're early in most regions. I'll tell you straight what interest we can
realistically generate before you invest any time.

— Rishon
pmrfp.com

---

## EMAIL 4 — Follow-up (one only, 4 days later, all segments)

**Subject:** Re: {original subject}

Hi {First},

Bumping this once, then I'll leave you alone.

Even if you've got nothing coming up — if you tell me *"nothing until spring,"* that's
a genuinely useful answer and I'll check back then instead of bothering you.

And if you'd rather I never email again, just reply "no" and I'll take care of it.

— Rishon

---

## EMAIL 5 — After a trade expresses interest (the conversion moment)

> **This is the most important email in the file.** It's the moment the thing becomes
> real for them. Send it the second a trade bites. Screenshot it.

**Subject:** Someone's interested in your {project type}

Hi {First},

{Trade company} just expressed interest in the {project} you sent me — they do
{trade} work in {region} and they're a good fit.

Want me to connect you directly, or would you rather see a couple more first?

Also — now that it's live and working, it takes about four minutes to set up your own
account so you can post the next one yourself and see interest as it comes in. Happy to
do it with you on a quick call, or leave you to it.

Either way, this one's moving. 🙂

— Rishon

---

## The list, in priority order

| # | Segment | Why first | Count |
|---|---|---|---|
| 1 | **Your Montreal PM friend** | Warmest. Pair with Elie's trades = a live Montreal market | 1 |
| 2 | **Toronto Jewish business community PMs** | High trust, GTA beachhead, referral-native | ~10–20 |
| 3 | **Crystal Ball's PM contacts** | They bid to PMs daily — ask for the intro | ~5 |
| 4 | **St. Louis PMs** | Ask for *Canadian* intros, not US postings | ~5 |
| 5 | **Ontario PM list** (`pm-list-ontario.csv`, 1,126 contacts) | Volume. Run in batches of 50 | 1,126 |

⚠️ The Ontario list is **PII and gitignored — never commit it.** Batch 50/day max,
seeded from the tier-A cut first.

## What "good" looks like

- 20 warm emails → 6–10 replies → **4–8 real RFPs**
- 200 semi-cold → 10–20 replies → **6–12 real RFPs**
- Both runs together: **10–20 real projects in 30 days.** That plus the existing 7 puts
  the board near 30 — the point where $249/yr stops being a leap of faith.

## Track it

One row per PM: **Name · Firm · City · Segment · Sent · Replied · Project? · Posted? · Next.**
Add a "RFP Harvest" tab next to the Warm Network tab in the same sheet.

## Before you send

- [ ] Confirm the reply-to inbox is monitored (`scripts/check-replies.mjs` exists — use it)
- [ ] Have `/admin/rfps/new` open — post within 24h of a reply or the moment dies
- [ ] When you post on their behalf, set `source_type = 'property_manager_direct'` and
      put the PM's name in `internal_notes` so attribution stays clean

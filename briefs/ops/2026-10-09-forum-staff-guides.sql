-- ════════════════════════════════════════════════════════════════════
-- Forum staff guides: 55 reference posts by the PMRFP Team staff account.
-- Generated from src/lib/forum/staff-guides-content.ts (2026-10-09); do not edit by hand.
-- Same keys and short ids as the "Import staff guides" button on /admin/forum,
-- so running both never duplicates anything. Safe to re-run:
--   * the PMRFP Team profile is looked up first and only created when missing
--     (a sign-in-banned auth user with no password, like the PMRFP Board);
--   * every thread insert is ON CONFLICT (auto_source_key) DO NOTHING;
--   * created_at is the database's now(): the real time you run this.
-- Needs supabase/migrations/20261006000002_forum.sql (and the auto_source_key
-- column from 20261008000001_forum_auto_threads.sql, re-declared below).
-- ════════════════════════════════════════════════════════════════════

begin;

alter table public.forum_threads add column if not exists auto_source_key text;
create unique index if not exists forum_threads_auto_source_key_idx
  on public.forum_threads(auto_source_key) where auto_source_key is not null;

-- 1. The PMRFP Team staff account (lookup, create only if missing).
do $$
declare
  team uuid;
  em constant text := 'forum-team@pmrfp.com';
begin
  select user_id into team from public.forum_profiles where handle = 'pmrfp_team';
  if team is null then
    select id into team from auth.users where lower(email) = em limit 1;
    if team is null then
      team := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, banned_until,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', team, 'authenticated', 'authenticated', em, '', now(), now() + interval '100 years',
        '{"provider":"email","providers":["email"],"system":"forum-team"}'::jsonb,
        '{"full_name":"PMRFP Team","primary_role":"visitor","system":"forum-team"}'::jsonb,
        now(), now(), '', '', '', ''
      );
    end if;
    insert into public.forum_profiles (user_id, handle, display_name, bio, is_staff)
    values (team, 'pmrfp_team', 'PMRFP Team', 'The PMRFP staff account. Reference guides written and checked by the PMRFP team, each with links to the official sources. Not a member persona.', true)
    on conflict (user_id) do update set is_staff = true;
  else
    update public.forum_profiles set is_staff = true where user_id = team;
  end if;
end $$;

-- 2. The guides.
insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gc081b6439', c.id, p.user_id, 'discussion', $guide$It was behind the wall: concealed conditions in standard contracts and what to put in your quote$guide$, 'it-was-behind-the-wall-concealed-conditions-in-standard-contracts-and',
  $guide$"It was behind the wall" is one of the most common reasons a job goes over. This covers how standard Canadian contracts deal with concealed or unknown conditions, and what to put in your quote so you aren't absorbing the cost.

**What the standard contract says**
- CCDC 2 2020 is the standard prime contract between owner and prime contractor for a stipulated (fixed) price (ccdc.org).
- It has a specific clause for this: GC 6.4 Concealed or Unknown Conditions. It sits in Part 6 Changes in the Work, next to GC 6.2 Change Order, GC 6.3 Change Directive, GC 6.5 Delays and GC 6.6 Claims for a Change in Contract Price.
- That placement tells you how to treat a discovery: as a possible change, with notice, a price and a time effect. The exact notice steps and test are in the clause wording. CCDC forms are sold, not free, so read the clause in your copy of the contract.
- Owners often change the standard general conditions with supplementary conditions. For example, the City of Waterloo publishes supplementary conditions to CCDC 2-2020 that amend GC 6.2, 6.3, 6.5 and 6.6. Read those before you price, because they can change notice periods and what you can claim.
- On smaller jobs with no standard form, your quote and terms are the contract. If they say nothing, you are arguing from scratch.

**Ontario: designated substances**
Under the Occupational Health and Safety Act, the owner must find out which designated substances are on a project site and list them before the project starts. If the work is tendered, the list goes in the tender package, and constructors must pass it to subs before they sign. An owner who leaves off a substance it ought reasonably to have known about is liable to contractors and subs for resulting losses (s. 30). Ask for the list on every Ontario bid.

**What to write into your quote**
- What you relied on: list the drawings, reports and surveys you priced from, by name and date.
- Clear assumptions: for example, "framing and substrate assumed sound" or "no buried obstructions below X depth."
- Exclusions: name the usual suspects for your trade, such as hazardous materials, rot, mould, undocumented services, or contaminated soil.
- A stop-and-notify clause: if you find a condition that differs from the documents, you stop the affected work, notify in writing with photos within a set number of days, and price the change before you continue.
- Unit rates or allowances for likely unknowns, so a discovery becomes a calculation, not a negotiation.
- Exploratory openings as their own line item where it's realistic.

**On site when it happens**
- Stop the affected work. Don't cover it up.
- Photograph with date and location, and measure.
- Notify in writing right away, within any contract notice period.
- Get a written direction before going ahead, and track those costs separately.
- Keep working on unaffected areas and record any delay day by day.

**Residential consumers in Ontario**
If your quote to a homeowner is an estimate, the Consumer Protection Act, 2002 caps what you can charge at 10% above it unless the consumer agrees to amend it for additional or different work (s. 10). A concealed-condition clause plus a signed change order is how you stay on the right side of that.

**Sources** (checked October 9, 2026)
- CCDC 2 2020 Stipulated Price Contract (ccdc.org): https://www.ccdc.org/document/ccdc-2/
- CCDC 2 table of contents: https://www.ccdc.org/wp-content/uploads/2023/01/TOCccdc2e.pdf
- City of Waterloo supplementary conditions to CCDC 2-2020: https://www.waterloo.ca/media/4vhdtwz1/supplementary-conditions-to-ccdc-2-2020-stipulated-price-contract.pdf
- Occupational Health and Safety Act, s. 30 (e-Laws): https://www.ontario.ca/laws/statute/90o01
- Consumer Protection Act, 2002 (e-Laws): https://www.ontario.ca/laws/statute/02c30

General information, not legal advice. Rules change; confirm with the source or a lawyer before you rely on it. Questions or corrections? Reply below.$guide$,
  673, 'approved', true, true, 'guide:A9'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'job-site-stories' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gb427cc064', c.id, p.user_id, 'discussion', $guide$Change orders that hold up: a written process, plus Ontario's 10% estimate rule for consumers$guide$, 'change-orders-that-hold-up-a-written-process-plus-ontario-s-10-estimat',
  $guide$This is a practical written process for change orders that hold up when the invoice goes out, plus the Ontario consumer rule on going over an estimate.

**The process**
1. Flag it before you do it. When you spot work outside the scope, stop that part and tell the client in writing the same day. Exceptions are real emergencies, and even then, notify right after.
2. Write a change notice. Say what changed, why, who asked for it, and which drawing, spec section or site condition it ties to. Attach photos.
3. Price it. Break out labour, materials, equipment, subtrade costs and markup. State the schedule effect in days, even if it's zero.
4. Get a signature before you start. The signer must be someone with authority under the contract. A site super's verbal OK is not a change order.
5. If the client wants the work done before the price is agreed, get a written direction to proceed that says how the price will be set, such as unit rates, time and materials with tickets, or a cap. Standard forms plan for this. CCDC 2 separates a Change Order (agreed price and time, GC 6.2) from a Change Directive (proceed now, settle value later, GC 6.3).
6. Log it. Keep a numbered change log showing status (pending, approved, disputed), value and days.
7. Bill it promptly. Put approved changes on the next regular invoice with the change number. In Ontario, a proper invoice must identify the contract or authorization the work was supplied under (Construction Act s. 6.1).

**Ontario consumers: the 10% estimate rule**
- Under the Consumer Protection Act, 2002, if a consumer agreement includes an estimate, you can't charge more than 10% above it (s. 10(1)).
- If you do, the consumer can require you to do the work at the estimated price (s. 10(2)).
- You and the consumer can agree to amend the estimate or price if the consumer asks for additional or different goods or services (s. 10(3)). That is a change order. Get it in writing before the work.
- This only applies to "consumers": individuals acting for personal, family or household purposes. It does not cover someone acting for business purposes (s. 1). Commercial clients, corporations and condo corporations are generally outside it, though your contract and common law still apply. Edge cases, like an individual renovating a rental unit, are worth a call to a lawyer.
- The 2002 Act is still the law on e-Laws (current to October 6, 2026), but it is set to be repealed and replaced by a 2023 Act on a date still to be proclaimed. Check which one is in force when you sign.

**Common mistakes**
- Holding all changes for the final invoice, then fighting over them with no leverage.
- Pricing the change but not the time. Delay costs are usually where the money is.
- Change orders signed by the wrong person.
- Letting a "we'll sort it out later" email stand in for a written direction with a pricing method.
- On residential jobs in Ontario, quoting a tight estimate with no written process for extras.

**Template lines for your quote**
- "Work not shown on the listed drawings is extra and requires a signed change order before it starts."
- "Changes requested without an agreed price will be billed at the attached rates, with daily tickets for signature."

**Sources** (checked October 9, 2026)
- Consumer Protection Act, 2002 (e-Laws): https://www.ontario.ca/laws/statute/02c30
- Ontario Construction Act (e-Laws): https://www.ontario.ca/laws/statute/90c30
- CCDC 2 2020 table of contents: https://www.ccdc.org/wp-content/uploads/2023/01/TOCccdc2e.pdf

General information, not legal advice. Rules change; confirm with the source or a lawyer before you rely on it. Questions or corrections? Reply below.$guide$,
  645, 'approved', true, true, 'guide:A8'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'client-talk' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g3a6df4e41', c.id, p.user_id, 'discussion', $guide$When your price is higher: walking a client through a line-by-line scope comparison$guide$, 'when-your-price-is-higher-walking-a-client-through-a-line-by-line-scop',
  $guide$What this covers: a short method for explaining why your quote is higher than another bid, without trashing the competitor. This is practice-based; the one legal point is cited.

**Start with one table**
Put both quotes side by side, or yours against the client's budget. Rows:
- scope line items and quantities
- materials: brand, grade, spec
- exclusions
- allowances, and what happens if actual cost exceeds them
- warranty: length, coverage, who stands behind it
- insurance and WSIB
- schedule: start date, duration, working hours
- payment terms
- permits, disposal, cleanup, lifts and access equipment

**Walk the gaps, not the totals**
- Read each row with the client. Most price gaps are scope gaps.
- Put your own number on each gap: "If this excluded item comes up, it is about this much."
- Do not say the other bid is wrong. Point to what it does not say.

**Exclusions and allowances**
- An exclusion is work the client still pays for later, to someone. Ask: who does it, and when?
- A low allowance makes a bid look cheap. Compare each allowance to a realistic cost.

**Warranty**
Compare length and what is covered. A longer warranty only helps if the company is around to honour it.

**Insurance and WSIB (Ontario)**
- Ask every bidder for a certificate of insurance.
- A WSIB clearance shows a business is registered with the WSIB and up to date, including premium payments and reporting. It is valid for up to 90 days, and the WSIB lets anyone look up clearances without logging in. Hand yours over before you are asked.

**Schedule**
Faster is not cheaper if it relies on overtime or a crew that is not available. Slower can cost the client in disruption or vacancy. Show both sides.

**Close the conversation**
- Offer options: a value-engineered version, or phasing.
- Do not cut price without cutting scope. Say exactly what changes.
- Confirm what was agreed in writing the same day.

**Common mistakes**
- Defending your total instead of comparing rows.
- Dropping your price on the spot, which tells the client your first number was padded.
- Burying exclusions in small print, then fighting about extras.

**Sources** (checked October 9, 2026)
- WSIB, Clearances: https://www.wsib.ca/en/clearances
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  396, 'approved', true, true, 'guide:D18'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'client-talk' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gf7654b634', c.id, p.user_id, 'discussion', $guide$Getting paid on commercial work: contract terms vs what prompt payment law guarantees (ON, AB, federal)$guide$, 'getting-paid-on-commercial-work-contract-terms-vs-what-prompt-payment',
  $guide$This explains the gap between the payment terms in your contract and what prompt payment law actually guarantees on Ontario, Alberta and federal jobs, plus what an Ontario "proper invoice" must contain.

**What the law guarantees, and what it doesn't**
- A deadline. The owner must pay a proper invoice within 28 days of receiving it in Ontario (Construction Act s. 6.4) and Alberta (PPCLA s. 32.2). On federal projects, the federal payer has 28 days from receipt (federal Act s. 9(2)).
- A process for disputes. The payer can still refuse some or all of an invoice if it gives a written notice on time: 14 days in Ontario and Alberta, 21 days on federal jobs. The law does not guarantee you get paid on disputed amounts. It guarantees you find out why, early, and can take the dispute to adjudication.
- Flow-down. Once the contractor is paid, subs must be paid within 7 days in Ontario and Alberta. Federally, subs are paid by day 35 counted from when the federal payer received the invoice.
- You can't contract out. In Ontario, an agreement that the Act doesn't apply to you is void and contracts are deemed amended to conform (s. 4 and s. 5). Alberta's Act also voids agreements that it does not apply (s. 5(1)). A "net 60" clause doesn't stretch a 28-day statutory deadline.
- Holdback still comes off. Payment under prompt payment is subject to holdback in Ontario (s. 6.2) and Alberta (s. 32.1(2)). Federally, holdback is limited to what provincial law would allow (s. 12).

**Ontario proper invoice checklist (s. 6.1)**
- Your name and address.
- Invoice date, and the period, milestone or other payment entitlement it covers.
- Contract number, line item or PO number, or whatever identifies the authorization.
- Description of services or materials supplied, with quantity where it makes sense.
- Amount payable and payment terms.
- Name, title, mailing address and phone number of the person or office to be paid.
- Any other information the owner reasonably asks for its accounts payable system, and anything the contract adds.
If the owner doesn't flag a missing item in writing within 7 days, the invoice is deemed proper (s. 6.1(2)).

In Alberta, also add a statement that the invoice is intended to be a proper invoice (s. 32.1(1)(g)).

**Interest on late payment**
- Ontario: the Courts of Justice Act prejudgment interest rate, or your contract rate if higher (s. 6.9).
- Alberta: the prescribed rates set by regulation (s. 32.6).
- Federal: simple interest at the average bank rate plus 3% a year, or the contract rate if higher (Act s. 14; regulations s. 4).
Put an interest rate in your contract anyway. Where the law uses "the higher of", your rate can only help.

**Practical setup**
- Invoice on the same day each month. Get written proof of the date the owner received it.
- Diary the dispute-notice deadline (day 7, then 14 or 21) and the payment day.
- Read any notice of non-payment closely. Reasons are required, and they tell you what to fix or what to adjudicate.
- Federal subs can ask the contractor for the date the federal payer received the invoice (s. 9(5)).
- Check your province. BC's prompt payment law is passed but not in force yet, and Quebec public contracts use their own regime.

**Common mistakes**
- Treating the payment terms in a PO as the only rule.
- Sending invoices with no contract or PO reference.
- Sitting on a deficiency notice. Fix the invoice fast. In Ontario you can revise an invoice without changing its date only if the owner agrees in advance (s. 6.3(5)).

**Sources** (checked October 9, 2026)
- Ontario Construction Act (e-Laws): https://www.ontario.ca/laws/statute/90c30
- Alberta Prompt Payment and Construction Lien Act (King's Printer): https://kings-printer.alberta.ca/documents/Acts/P26P4.pdf
- Federal Prompt Payment for Construction Work Act: https://laws-lois.justice.gc.ca/eng/acts/F-7.7/FullText.html
- Federal regulations SOR/2023-269: https://laws-lois.justice.gc.ca/eng/regulations/SOR-2023-269/FullText.html
- BC prompt payment legislation page: https://www2.gov.bc.ca/gov/content/governments/infrastructure/prompt-payment-legislation

General information, not legal advice. Rules change; confirm with the source or a lawyer before you rely on it. Questions or corrections? Reply below.$guide$,
  731, 'approved', true, true, 'guide:A7'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'business-pricing' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g4798ded43', c.id, p.user_id, 'discussion', $guide$Pricing after-hours and emergency calls in Ontario: overtime basics and common rate structures$guide$, 'pricing-after-hours-and-emergency-calls-in-ontario-overtime-basics-and',
  $guide$What this covers: how Ontario's overtime rules feed into your labour cost for after-hours work, and the pricing structures trades commonly use. There are no suggested rates here. Your costs set your numbers.

**Ontario overtime basics (ESA guide)**
- For most employees, overtime starts after 44 hours in a work week, at 1.5 times the regular rate.
- Overtime is calculated weekly (or over an averaging period), not daily, unless a contract or collective agreement says otherwise. So a 10 p.m. call is not automatically overtime under the ESA. It depends on the week's hours.
- Employers and employees can agree in writing or electronically to average hours over two to four weeks.
- With an agreement, employees can take 1.5 hours of paid time off for each overtime hour instead of overtime pay, within set time limits.
- Managers and supervisors are exempt when their work is managerial or supervisory.

**Special rules for some construction work**
Ontario's special rules tool lists different overtime thresholds for some categories, for example:
- road construction and road maintenance, including snow ploughing: overtime after 55 hours a week for streets, highways and parking lots, and after 50 hours for road structures such as bridges and tunnels
- sewer and watermain construction: overtime after 50 hours
Several construction categories are also exempt from other standards, such as hours-of-work limits. Check the tool for your exact job category, and check any collective agreement that covers your crew.

**Build your after-hours cost (common practice)**
- Wages, plus the overtime premium when the call pushes weekly hours over the threshold, plus any premium your own policy or agreement promises.
- Paid travel time to and from the call.
- Vehicle and fuel.
- On-call coordination: who answers the phone at 2 a.m., and what you pay them.
- Lost productivity the next day.

**Common pricing structures (common practice)**
- Call-out or minimum charge that covers a first block of time plus travel.
- After-hours rate for evenings, weekends and holidays, stated as a separate rate or a multiplier.
- Emergency response fee for a guaranteed response time.
- On-call retainer for property managers who want priority, either credited against work or not.
- Materials at cost plus markup, with any after-hours supply surcharges passed through.

**Put it in writing**
- Define after hours (times and days) and which holidays count.
- Who can authorize an after-hours call.
- Billing increments after the first block.
- Response time commitments and what happens if you miss them.

**Common mistakes**
- Assuming every night call costs you time and a half. Under the ESA it depends on weekly hours, though your own policy may pay more.
- No minimum charge, so a short reset call loses money.
- No written definition of "emergency".

**Sources** (checked October 9, 2026)
- Ontario, Your guide to the ESA: Overtime pay: https://www.ontario.ca/document/your-guide-employment-standards-act-0/overtime-pay
- Ontario, Industries and jobs with exemptions or special rules: Manufacturing, construction and mining: https://www.ontario.ca/document/industries-and-jobs-exemptions-or-special-rules/manufacturing-construction-and-mining
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  519, 'approved', true, true, 'guide:D17'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'business-pricing' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g71e1876fa', c.id, p.user_id, 'discussion', $guide$Checking a tradesperson's ticket: compulsory trades, the STO public register and Red Seal$guide$, 'checking-a-tradesperson-s-ticket-compulsory-trades-the-sto-public-regi',
  $guide$What this covers: how to check that a tradesperson can legally do the work you are hiring them for, with a focus on Ontario, plus what a Red Seal does and does not prove.

**Compulsory vs non-compulsory trades (Ontario)**
Ontario has 144 prescribed trades. 23 are compulsory. In a compulsory trade, an individual can only practise the trade if they are a registered apprentice with an active training agreement, hold a Certificate of Qualification (C of Q) or provisional C of Q, or are exempt by regulation. The same Act says no person shall employ or otherwise engage someone to do that work unless they meet one of those conditions. That applies to whoever hires, not only to employers.

Compulsory trades most relevant to building work, from O. Reg. 876/21:
- Electrician, construction and maintenance
- Electrician, domestic and rural
- Plumber
- Refrigeration and air conditioning systems mechanic
- Residential air conditioning systems mechanic
- Sheet metal worker and residential (low rise) sheet metal installer
- Sprinkler and fire protection installer
- Steamfitter
- Hoisting engineer (mobile crane operator 1 and 2, tower crane operator)

In a non-compulsory trade (for example, many carpentry and finishing trades), a certificate is not legally required to work. It is still useful evidence of training.

**How to verify in Ontario**
1. Ask for the worker's full name and Skilled Trades Ontario ID or account number.
2. Search the Skilled Trades Ontario public register. It confirms whether someone can legally work in a compulsory trade.
3. Match the trade. A C of Q in one compulsory trade does not cover another.
4. Note that some exempt people may not appear in the register. Ontario lists the exemptions in O. Reg. 877/21.
5. Keep a screenshot or note with the date in your vendor file.

Ontario says workers must carry proof of authorization and show it to an inspector on request. Inspectors can issue compliance orders and notices of contravention with administrative penalties.

**What a Red Seal means**
A Red Seal endorsement on a provincial or territorial certificate shows the holder passed the Red Seal exam for that trade. The Red Seal Program says the endorsement supports labour mobility but does not by itself permit someone to practise a trade. To verify a Red Seal, contact the provincial or territorial apprenticeship authority that issued the certificate.

**Other provinces**
Each province keeps its own list. Alberta's Tradesecrets site lists its compulsory certification trades, including electrician, plumber, gasfitter, refrigeration and air conditioning mechanic, sheet metal worker and steamfitter-pipefitter. Check the list for the province where the work happens.

**Common mistakes**
- Treating a Red Seal or an out-of-province certificate as automatic permission to work in Ontario.
- Checking the company but not the individuals on site.
- Accepting a photo of a card instead of searching the register.
- Forgetting that apprentices must be registered and supervised under their training agreement.

**Sources** (checked October 9, 2026)
- Building Opportunities in the Skilled Trades Act, 2021, ss. 6, 7, 47 (e-Laws): https://www.ontario.ca/laws/statute/21b28
- O. Reg. 876/21, Prescribed Trades and Related Matters, s. 2 (e-Laws): https://www.ontario.ca/laws/regulation/210876
- Ontario, Compulsory trades and enforcement: https://ontario.ca/page/compulsory-trades-and-enforcement
- Skilled Trades Ontario, Public Register: https://www.skilledtradesontario.ca/public-register/
- Red Seal Program: https://red-seal.ca/eng/about/program.shtml
- Alberta Tradesecrets, Compulsory Certification Trades: https://tradesecrets.alberta.ca/trades-in-alberta/compulsory-certification-trades

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  592, 'approved', true, true, 'guide:C3'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'jobs-hiring' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'ga8a23d31b', c.id, p.user_id, 'discussion', $guide$Writing off tools, equipment and trucks: the CRA capital cost allowance classes trades use most$guide$, 'writing-off-tools-equipment-and-trucks-the-cra-capital-cost-allowance',
  $guide$What this covers: the capital cost allowance (CCA) classes most trades businesses run into, with rates and rules from the Canada Revenue Agency. Your tax result depends on your situation. Use this to have a better conversation with your accountant, not to replace one.

**Small tools: Class 12 (100%)**
- Tools, medical or dental instruments and kitchen utensils that cost less than $500, acquired on or after May 2, 2006.
- CRA says most small tools in Class 12 are not subject to the half-year rule, so they are fully deductible in the year you buy them.
- Tools costing $500 or more go in Class 8.

**Equipment: Class 8 (20%)**
- Property not included in another class, such as furniture, appliances, machinery and refrigeration equipment. Larger tools and shop equipment usually end up here.

**Vehicles: Class 10 and 10.1 (30%)**
- Motor vehicles, and passenger vehicles that do not meet the Class 10.1 conditions, go in Class 10.
- A passenger vehicle that costs more than CRA's limit goes in Class 10.1, listed separately, with its capital cost capped. For vehicles bought in 2025, CRA's threshold was $38,000 before tax.
- Whether your pickup or van counts as a "passenger vehicle" depends on CRA's definitions. Ask your accountant before you buy.

**Heavy trucks: Class 16 (40%)**
- Includes freight trucks rated above 11,788 kg, along with taxis and daily rental vehicles.

**Zero-emission vehicles: Class 54 (30%) and Class 55 (40%)**
- Class 54: zero-emission vehicles acquired after March 18, 2019 that would otherwise be in Class 10 or 10.1. For passenger ZEVs acquired after December 31, 2022, the cost limit is $61,000 plus taxes.
- Class 55: zero-emission vehicles that would otherwise be in Class 16.
- These classes have had an enhanced first-year deduction that changes by year of purchase, and CRA's page also describes proposed changes. Check the page for the year you buy.

**Computers: Class 50 (55%)**
- General-purpose electronic data processing equipment and systems software acquired after March 18, 2007.

**Records to keep (common practice)**
- The invoice for each asset and the date it went into use.
- A vehicle logbook for business-use percentage.
- Sale or trade-in values when you dispose of an asset.

**Questions to bring to your accountant**
- How the half-year rule and any first-year incentives apply to this purchase.
- Whether a vehicle is a passenger vehicle or a motor vehicle for CCA.
- Whether leasing or buying makes more sense for your cash flow.

**Common mistakes**
- Expensing a tool over $500 as a small tool.
- Buying a truck in late December assuming a full write-off this year without checking the first-year rules.
- No vehicle logbook.

**Sources** (checked October 9, 2026)
- CRA, Classes of depreciable property: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/claiming-capital-cost-allowance/classes-depreciable-property.html
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  499, 'approved', true, true, 'guide:D14'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'tools-gear' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gddb390221', c.id, p.user_id, 'discussion', $guide$How to read a public tender before you price it: a 9-point pre-bid checklist$guide$, 'how-to-read-a-public-tender-before-you-price-it-a-9-point-pre-bid-chec',
  $guide$This is a checklist for reading a public tender or RFP before you spend hours pricing it. Read the whole package once, start to finish, before you open your estimate.

**1. Closing date, time and delivery method**
- Write down the exact closing date, time and time zone.
- Check how the bid must be delivered. CanadaBuys says each tender notice states the delivery method you must use.
- Treat late as dead. Alberta's guidance says late bids are automatically rejected. One federal solicitation we checked rejects electronic bids received after closing, even if they were sent before.
- In Ontario, broader public sector buyers must set closing on a normal working day.

**2. Mandatory site meeting**
If the site visit is mandatory, missing it can end your bid. One federal solicitation on CanadaBuys says bidders who miss it get no alternate appointment and their bid is declared non-responsive. Check whether you must pre-register, and sign the attendance sheet before you leave.

**3. Question deadline**
Most documents set a cut-off for questions. In that same federal solicitation it was 10 calendar days before closing. Send questions only to the contact named in the document. Federal guidance says the contracting officer compiles the questions and answers and issues them as an amendment so every bidder has the same information.

**4. Addenda and amendments**
Addenda change the documents. Keep checking until you submit. The City of Toronto extends closing by at least three days when an addendum comes out close to the deadline. On BC Bid, an amendment means bids already submitted are rejected, so you must submit again.

**5. Mandatory requirements**
Federal guidance says mandatory criteria are usually pass or fail, and a bid that fails one is non-responsive. Alberta says failing a mandatory requirement means automatic disqualification. List every form, signature, licence, certificate and reference you must include, and tick them off.

**6. Bid security and contract security**
Check whether a bid bond or deposit is required and what bonds you must give if you win. The federal bid bond form, for example, is 10% of the bid amount (capped at $2,000,000) and requires a performance bond and a labour and material payment bond of 50% of the contract price each. Send the documents to your surety early.

**7. Insurance and workers' compensation**
Price the insurance limits the contract asks for. In Ontario, construction work needs a valid WSIB clearance certificate before work starts and for the whole job. Alberta tells bidders to include certifications such as WCB coverage.

**8. How you will be evaluated**
Federal guidance describes the main methods:
- Lowest price: compliant bids are ranked by price.
- Best overall value: usually the lowest compliant cost per technical point.
- Highest technical score within a fixed budget.
If it is point-rated, answer each criterion in the order it is listed.

**9. Bid validity**
Your price must hold for the bid validity period. Federal awards must happen before the bid validity expiry date. Know how long you are committing your price.

**Common mistakes**
- Pricing from the drawings before reading the instructions to bidders.
- Missing an addendum issued the day before closing.
- Uploading at the last minute.
- Not asking for a debrief after a loss. Federal bidders can request one after award, and Alberta allows a request within 10 days of the award decision.

PMRFP lists public tenders in one place at https://pmrfp.com/rfps.

**Sources** (checked October 9, 2026)
- CanadaBuys, How to bid on tender opportunities: https://canadabuys.canada.ca/en/getting-started/preparing-sell-government/how-bid-tender-opportunities
- CanadaBuys, Checklist for preparing a bid: https://canadabuys.canada.ca/en/support/checklist-preparing-bid
- CanadaBuys, Bidding and contract award: https://canadabuys.canada.ca/en/how-procurement-works/procurement-process/bidding-and-contract-award
- Example federal solicitation 23-58049 (NRC) on CanadaBuys: https://canadabuys.canada.ca/sites/default/files/webform/tender_notice/8134/23-58049_rfp_landscapinggroundsmaintenancesnowremoval.pdf
- Government of Alberta, Find and compete for government contracts: https://www.alberta.ca/find-and-compete-for-government-contracts
- City of Toronto, Bidding on solicitations: https://www.toronto.ca/business-economy/doing-business-with-the-city/searching-bidding-on-city-contracts/bidding-on-solicitations/
- BC Bid supplier guide, Amendments and addenda: https://www2.gov.bc.ca/gov/content/bc-procurement-resources/bc-bid-resources/bc-bid-for-suppliers/bc-bid-supplier-guide/step-4
- Ontario BPS Procurement Directive (effective April 13, 2026): https://www.ontario.ca/files/2026-03/bps-procurement-directive-en-2026-04-13.pdf
- PSPC Bid Bond form 504: https://www.canada.ca/en/public-services-procurement/services/acquisitions/forms/bid-bond-504.html
- WSIB policy, Clearance certificate in construction: https://www.wsib.ca/en/operational-policy-manual/clearance-certificate-construction

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  757, 'approved', true, true, 'guide:B1'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'marketplace-talk' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gd04e3a43e', c.id, p.user_id, 'discussion', $guide$Registering to bid on federal tenders: CanadaBuys, SAP Business Network and your business number$guide$, 'registering-to-bid-on-federal-tenders-canadabuys-sap-business-network',
  $guide$This covers how to set up to bid on Government of Canada tenders posted on CanadaBuys, and how to get the bid documents.

**How it fits together**
CanadaBuys is where federal tender notices are published. Public Services and Procurement Canada (PSPC) runs its tenders through SAP Business Network (built on SAP Ariba). You register there; CanadaBuys does not use a separate supplier account for this. CanadaBuys describes it as a free account.

**Step 1: Create your SAP Business Network account**
Start from the registration link on CanadaBuys. Enter your legal business name, head office address, your user details and at least one product or service category. Accept the terms, then activate the account from the email you receive. If your company already has an account, the system flags the duplicate after you submit. In that case, log in and finish the existing company profile instead.

**Step 2: Complete the Government of Canada questionnaire**
Log in, open Company Profile, go to the "Customer requested" tab and pick Government of Canada. You must answer questions 3 to 8 to submit a bid. Question 9 is required for full registration. You can save a draft and come back.

**Step 3: Get your CRA business number in early**
CanadaBuys says you do not need a business number to submit a bid, but you need one before contract award. It recommends completing full registration so award is not delayed. Businesses outside Canada apply for a non-resident CRA business number. The current CanadaBuys registration pages ask for the CRA business number and do not mention a separate procurement business number.

**Step 4: Find tenders**
Search the Tender opportunities page on CanadaBuys by keyword, category, closing date or UNSPSC code. You can set email alerts, bookmark searches or follow RSS. CanadaBuys says new notices and amendments are published daily.

**Step 5: Get the documents**
Open the notice and go to the Bidding details tab.
- Some federal notices are posted directly on CanadaBuys. For those, the Bidding details tab holds the downloadable documents.
- For PSPC tenders, click the link to log in to SAP Business Network, click "Respond", sign in, open the event details and accept the prerequisites. The documents then appear on the Submit Response page.
- If you only want to read documents and not bid, you still need a viewer account, and you still complete the Government of Canada questionnaire.

**Step 6: Ask questions and submit**
Questions go to the contracting officer named in the notice. In SAP Business Network you can use "Compose Message" on the response page. To submit, fill each section, attach files and click "Submit Entire Response". The site does not autosave, so save often. You can revise until the deadline with "Revise Response". Do not submit a second bid for the same opportunity.

**Common mistakes**
- Creating a new account when the company already has one.
- Skipping the Government of Canada questionnaire, then finding you cannot bid on closing day.
- Leaving the business number until you win.
- Contacting anyone other than the contracting officer during the tender.

PMRFP also lists federal and other public tenders at https://pmrfp.com/rfps.

**Sources** (checked October 9, 2026)
- CanadaBuys, How to register your business: https://canadabuys.canada.ca/en/getting-started/preparing-sell-government/how-register-your-business
- CanadaBuys, Registering on SAP Business Network: a guide for businesses: https://canadabuys.canada.ca/en/support/registering-sap-ariba-guide-businesses
- CanadaBuys, Registering for a viewer account: https://canadabuys.canada.ca/en/support/registering-sap-ariba-viewer
- CanadaBuys, How to find tender opportunities: https://canadabuys.canada.ca/en/getting-started/preparing-sell-government/how-find-tender-opportunities
- CanadaBuys, How to bid on tender opportunities: https://canadabuys.canada.ca/en/getting-started/preparing-sell-government/how-bid-tender-opportunities
- CanadaBuys, Responding to tender opportunities on SAP Business Network Discovery: https://canadabuys.canada.ca/en/support/responding-tender-opportunities-ariba-discovery
- CanadaBuys, Checklist for preparing a bid: https://canadabuys.canada.ca/en/support/checklist-preparing-bid

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  661, 'approved', true, true, 'guide:B2'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'marketplace-talk' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g77806fc48', c.id, p.user_id, 'discussion', $guide$Buying used equipment or a truck privately: search for registered liens first (Ontario, Alberta, BC)$guide$, 'buying-used-equipment-or-a-truck-privately-search-for-registered-liens',
  $guide$What this covers: how to check whether a lender or repairer has a registered claim against used equipment or a vehicle before you hand over money.

**Why it matters**
Ontario's guidance puts it plainly: a lender may still have rights in a used item if the seller or a previous owner borrowed against it. If you skip the search and the borrower later defaults, the lender could seize the item.

**Ontario: PPSR search through Access Now**
- The Personal Property Security Registration (PPSR) system records security interests (liens) on personal property such as cars, boats and furniture, and claims for lien by repairers and storers under the Repair and Storage Liens Act.
- Search online through Ontario's Access Now service. Ontario lists an online search response at $8 and a certificate response at $8.
- If a lien shows up, contact the lender to confirm whether the loan is still in effect. If it has been paid, insist the seller have the lender register a discharge before the sale closes. If it is still owing, walk away or require the seller to pay it off and arrange the discharge.

**Alberta: Personal Property Registry**
- Alberta recommends a personal property search before buying.
- Serial number searches cover motor vehicles, trailers, mobile homes, aircraft, boats, outboard motors and farm vehicles such as tractors and combines. You can also search individual or business debtor names.
- Submit the Search Request form at any Alberta registry agent. Results come back as exact, inexact, no match, or both exact and inexact. Check inexact matches further. Alberta's page does not list the fee, so ask the registry agent.

**British Columbia: Personal Property Registry**
- BC says to search for existing liens before buying personal property privately.
- Search in person at a Service BC location, through a third-party provider, or by mail to BC Registry Services. The online registry is for professionals with premium accounts.
- BC lists $7 per client search through the registry (plus a $1.50 operator fee and GST for electronic transactions outside a government office), $10 for a search done by government staff, and $10 by mail.

**Practical steps (common practice)**
- Read the serial number or VIN off the equipment itself, not from the ad.
- Search the seller's legal name as well as the serial number. In Alberta, only listed types of goods can be searched by serial number; for other equipment, the name search is what you have.
- If the equipment was financed or used in another province, ask about searching there too.
- Search as close as possible to the day you pay, and get a written bill of sale.

**Common mistakes**
- Searching by name only, or by serial number only.
- Paying a deposit before the search.
- Accepting "it's paid off" without seeing a registered discharge.

**Sources** (checked October 9, 2026)
- Ontario, Register a security interest or search for a lien on Access Now: https://www.ontario.ca/home-and-community/register-or-search-online-access-now
- Alberta, Personal property liens: find a registration: https://www.alberta.ca/find-personal-property-registration
- BC, Personal property liens and searches: https://www2.gov.bc.ca/gov/content/employment-business/business/managing-a-business/bc-registry-services-personal-property-registry
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  549, 'approved', true, true, 'guide:D15'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'marketplace-talk' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'ga0feebc4d', c.id, p.user_id, 'discussion', $guide$Who pulls the permit in Ontario: building permits vs ESA electrical notifications$guide$, 'who-pulls-the-permit-in-ontario-building-permits-vs-esa-electrical-not',
  $guide$What this covers: who applies for an Ontario building permit, who files the separate ESA electrical notification, and how to set this up in a contract.

**Building permit: the legal starting point**
The Building Code Act says no person shall construct or demolish a building, or cause it to be constructed or demolished, unless the chief building official has issued a permit. The Act says an application may be made by a person specified by regulation.

**Who can apply**
Ontario's provincial permit application form (effective February 16, 2026) asks whether the applicant is the owner or an authorized agent of the owner. The previous Building Code (O. Reg. 332/12) set out the same rule and defined "owner" to include the registered owner, a lessee and a mortgagee in possession.

In practice:
- The owner can apply directly.
- A contractor, designer or property manager can apply as the owner's authorized agent. Your municipality may ask for a written authorization from the owner. Check with your local building department.
- If the owner is a corporation, the person signing declares they have authority to bind it.

**When you need one**
Ontario's citizen's guide lists new buildings over 10 square metres, many renovations and additions, changes of use, excavation and foundation work, and on-site sewage systems. Apply to the municipal building department, not the province.

**After it is issued**
The guide says the permit holder must contact the municipality to request inspections at each required construction stage. Decide in writing who books inspections and who receives the inspection reports.

**Electrical work: a separate ESA notification**
- ESA says most electrical work needs a notification of work filed with ESA, whoever does the work.
- The person doing the work files it. If you hire a Licensed Electrical Contractor, the contractor files. ESA says never take out a notification for someone else.
- An ESA notification is not a building permit. You may need both.
- ESA issues a Certificate of Acceptance to the filer once the work passes. Make delivery of that certificate a closeout item.

**How to write it into your contract**
- Name who applies for the building permit and confirm they are authorized by the owner.
- Make the electrical contractor responsible for the ESA notification and inspections.
- Require copies of the permit, inspection records and the ESA Certificate of Acceptance before final payment.
- Make permit fees an explicit line item so bids are comparable.

**Common mistakes**
- Assuming the building permit covers the electrical work.
- A contractor applying without written authorization from the owner.
- Nobody booking the required inspections.
- An owner or manager pulling the ESA notification for a contractor.

**Sources** (checked October 9, 2026)
- Building Code Act, 1992, s. 8 (e-Laws): https://www.ontario.ca/laws/statute/92b23
- Ontario, Application for a Permit to Construct or Demolish (effective Feb 16, 2026): https://www.ontario.ca/files/2026-01/mmah-building-development-application-for-a-permit-to-construct-or-demolish-2026-en-2026-01-27.pdf
- O. Reg. 332/12 (previous Building Code), Div. C, 1.3.1.2 (e-Laws): https://www.ontario.ca/laws/regulation/120332
- Ontario Citizen's Guide to Land Use Planning: Building permits: https://www.ontario.ca/document/citizens-guide-land-use-planning/building-permits
- ESA, Notifications and inspections: https://esasafe.com/notifications-and-inspections/
- ESA, Property Owner and Manager Obligations: https://esasafe.com/business-and-property-owners/property-owner-obligations/

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  562, 'approved', true, true, 'guide:C13'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'codes-permits' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g3044245bd', c.id, p.user_id, 'discussion', $guide$Which building code applies where: NBC 2020 and the Ontario, BC, Alberta and Québec codes in force$guide$, 'which-building-code-applies-where-nbc-2020-and-the-ontario-bc-alberta',
  $guide$What this covers: how the national model code relates to the building codes actually enforced in Ontario, BC, Alberta and Québec, with the editions in force as we checked them.

**The national model code**
The National Building Code of Canada 2020 (NBC) sets technical requirements for the design and construction of new buildings, and also covers alteration, change of use and demolition of existing buildings. It is developed by the Canadian Commission on Building and Fire Codes and published by the National Research Council (NRC). Adoption and enforcement are provincial and territorial responsibilities, and NRC advises checking with your local authority to pick the right edition.

**Ontario: 2024 Ontario Building Code**
- In effect January 1, 2025. The regulation adopts NBC 2020 except where the Ontario Amendment Document changes it.
- Transition: the 2012 code could be used from January 1 to March 31, 2025 only if working drawings were substantially complete by December 31, 2024. From April 1, 2025, permit applications must use the 2024 code.
- Ontario says the full-length code is no longer on e-Laws. A digital compendium (NBC plus Ontario amendments) is available from Publications Ontario.

**British Columbia: BC Building Code 2024**
- Came into effect March 8, 2024, and applies to projects with building permits applied for after that date.
- Mostly based on NBC 2020, with BC-specific changes.
- The City of Vancouver has its own building by-law, so the BC Codes do not apply there.

**Alberta: National Building Code 2023 Alberta Edition**
- Alberta's codes-in-force page says the 1st printing was declared in force May 1, 2024, and a 2nd printing was published August 17, 2026.
- The National Energy Code of Canada for Buildings 2020 is also listed as in force from May 1, 2024.

**Québec: Construction Code, Chapter I, Building**
- The Régie du bâtiment du Québec (RBQ) says the current Chapter I consists of NBC 2015 with Québec amendments, in effect since January 8, 2022. It is based on the 2015 national code, not 2020.
- The separate energy efficiency chapter (Chapter I.1) uses the National Energy Code of Canada for Buildings 2020 and has been in force since July 13, 2024.

**How to use this on a bid (common practice)**
- Check the permit application date. In Ontario and BC, the transition rules tie the code edition to when the permit was applied for.
- Local by-laws (like Vancouver's) and fire codes can add requirements.
- If the drawings cite a different code edition than the permit, ask before pricing.

**Common mistakes**
- Pricing Ontario work off 2012 OBC references.
- Assuming Québec is on the 2020 national code.
- Assuming the BC Building Code applies in Vancouver.

**Sources** (checked October 9, 2026)
- NRC, National Building Code of Canada 2020: https://nrc.canada.ca/en/certifications-evaluations-standards/codes-canada/codes-canada-publications/national-building-code-canada-2020
- NRC, Model code adoption across Canada (archived): https://nrc.canada.ca/en/certifications-evaluations-standards/codes-canada/model-code-adoption-across-canada
- Ontario, The 2024 Ontario Building Code: https://www.ontario.ca/page/2024-ontario-building-code
- BC, 2024 BC Codes: https://www2.gov.bc.ca/gov/content/industry/construction-industry/building-codes-standards/bc-codes/2024-bc-codes
- Alberta, Building codes and standards (codes in force): https://www.alberta.ca/building-codes-and-standards
- RBQ, Construction Code: https://www.rbq.gouv.qc.ca/en/laws-regulations-and-codes/construction-code-and-safety-code/construction-code/
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  564, 'approved', true, true, 'guide:D16'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'codes-permits' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g48d1891e6', c.id, p.user_id, 'discussion', $guide$Electrical work in Ontario: LEC licence, Master Electrician and who files the ESA notification$guide$, 'electrical-work-in-ontario-lec-licence-master-electrician-and-who-file',
  $guide$What this covers: who needs an electrical contractor licence in Ontario, the Master Electrician requirement, who files the ESA notification, and how to look up a contractor.

**Who needs a Licensed Electrical Contractor (LEC) licence**
O. Reg. 570/05 says no person shall operate an electrical contracting business without an electrical contractor licence. If you hire a company to do electrical work in your building, ESA says it must be an LEC. If a general contractor is running the job, confirm a Licensed Electrical Contractor is doing the electrical portion.

The regulation lists situations it does not apply to. Two that matter to property managers:
- Work in an "industrial establishment" (the definition includes office buildings, shops and factories) done by the owner, operator or their employee.
- Maintenance or repair of plug-in equipment that does not alter the equipment or its wiring.
These exemptions are about the contractor licence. They do not remove the need to follow the Electrical Safety Code or file notifications.

**The Master Electrician requirement**
Every LEC must designate at least one licensed Master Electrician. The designated Master Electrician is responsible for planning and directly supervising the electrical work and for making sure it follows the law, including the Electrical Safety Code. A Master Electrician cannot be designated by more than one contractor at the same time and must be employed by the contractor that designates them.

Separately, the individuals doing the work need the right trade certificate. Electrician (construction and maintenance) and electrician (domestic and rural) are compulsory trades in Ontario.

**ESA notification (the "permit")**
- ESA says most electrical work needs a notification of work filed with ESA, whoever does the work and whatever the building type.
- The person doing the work files it. If you hire an LEC, the LEC files it. ESA says never take out a notification on someone else's behalf.
- ESA's property owner page says to file before, or within 48 hours of, the start of the work. Its notifications page says to file before starting. Confirm the timing with ESA for your job.
- ESA notes this applies even if you have an electrician on staff.
- An ESA notification is not a building permit. You may need both.
- When the work passes, ESA issues a Certificate of Acceptance to whoever filed. Ask the contractor for a copy for your building records.

**How to look up an LEC**
1. Ask for the ECRA/ESA licence number.
2. Search ESA's Contractor Locator Tool by contractor name or location. You can filter by licence status (valid, expired, suspended, closed, revoked). A warning icon flags a penalty or conviction.
3. Make sure the company name on your quote matches the licensed company.

**Common mistakes**
- Hiring an individual electrician directly instead of a licensed contracting business.
- Assuming in-house maintenance staff do not need to file notifications.
- Asking the owner or property manager to pull the ESA permit for the contractor.
- Closing out the job without the Certificate of Acceptance.

**Sources** (checked October 9, 2026)
- O. Reg. 570/05, Licensing of Electrical Contractors and Master Electricians (e-Laws): https://www.ontario.ca/laws/regulation/050570
- ESA, Property Owner and Manager Obligations: https://esasafe.com/business-and-property-owners/property-owner-obligations/
- ESA, Notifications and inspections: https://esasafe.com/notifications-and-inspections/
- ESA, Hiring a Licensed Electrical Contractor: https://esasafe.com/compliance/hiring-a-licensed-electrical-contractor/
- ESA, Contractor Locator Tool: https://licensing.esasafe.com/contractor-locator-tool/
- O. Reg. 876/21, compulsory trades (e-Laws): https://www.ontario.ca/laws/regulation/210876

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  603, 'approved', true, true, 'guide:C4'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'electrical' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gfff543160', c.id, p.user_id, 'discussion', $guide$EV chargers in Ontario condos: the owner application process under O. Reg. 48/01$guide$, 'ev-chargers-in-ontario-condos-the-owner-application-process-under-o-re',
  $guide$What this covers: how a unit owner in an Ontario condo applies to install an EV charger, what the board must do and by when, and who pays. Based on sections 24.2 to 24.7 of O. Reg. 48/01 under the Condominium Act, 1998.

**Step 1: The owner's application**
Under s. 24.5(2) the application must:
- be in writing and signed by the owner
- identify the owner and an address for service
- include drawings, specifications or information about the installation, including its location, that are relevant to any report the corporation could obtain
If the owner asks in writing for information or permission needed to prepare those drawings, the corporation must provide it as soon as reasonably possible (s. 24.5(4)).
Delivery: by prepaid mail, courier or mailbox to the corporation, its condo manager or management provider. Email or other electronic delivery only counts if the board has approved that method by resolution (s. 24.5(3)).

**Step 2: The board's response**
- Complete application: the board must respond in writing within 60 days, or another period agreed in writing (s. 24.5(5)).
- Application the board thinks is incomplete: the board must say why, as soon as reasonably possible (s. 24.5(6)).
- If the board misses the 60-day response, it is deemed not to have rejected the application and not to have required changes (s. 24.5(16)).

**When the board can say no**
Only if a report or opinion from a person whose profession lends credibility to it clearly states that the installation will (s. 24.5(8)):
- break a law, regulation or by-law made under an Act, including the Electrical Safety Code (the condo's own declaration, by-laws and rules do not count here)
- adversely affect the structural integrity of the property or assets
- pose a serious risk to someone's health and safety, or of damage to the property or assets
The rejection must include a copy of that report, subject to the Act's records limits (s. 24.5(10) and (11)).

**What the board can require instead**
The board can require a different manner or location if it does not cause the owner unreasonable extra cost and is needed so other owners' use and enjoyment is not materially reduced, or so the work does not conflict with the declaration, by-laws, rules or agreements. A provision that bans or unreasonably restricts EV chargers generally does not count (s. 24.5(12)). The response must explain why and include drawings showing the alternative (s. 24.5(13)).

**Step 3: The installation agreement**
After a non-rejection, both sides must take reasonable steps to sign a written agreement within 90 days or an agreed period (s. 24.6(1)). It must deal with how the work is done, cost allocation, responsibility for use, operation, repair, maintenance and insurance, ownership of the system, and what happens when use ends (s. 24.6(3)). The corporation registers it against the unit's title, and it does not take effect until registered (s. 24.6(5)).

**Who pays**
Unless the agreement says otherwise (s. 24.6(4)):
- owner or owner's contractor does the work: owner pays all installation costs
- corporation or its contractor does the work: owner pays all reasonable costs
Each side pays its own costs of the application steps unless the agreement allocates them (s. 24.5(17)).

**Disputes**
Disagreements go to mediation and arbitration (s. 24.7). An application is deemed abandoned if neither side submits the dispute within six months of a rejection, or of the 90-day agreement period ending without an agreement (s. 24.7(4)).

**Common mistakes**
- Emailing the application when the board has not approved email delivery.
- Starting work before the agreement is registered on title.
- Boards treating silence as a no. Missing the 60-day deadline counts as a non-rejection.
- Contractors pricing before the board has confirmed the location.

**Sources** (checked October 9, 2026)
- O. Reg. 48/01 (General), Condominium Act, 1998, ss. 24.2 to 24.7: https://www.ontario.ca/laws/regulation/010048
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  708, 'approved', true, true, 'guide:D1'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'electrical' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g0139b3d92', c.id, p.user_id, 'discussion', $guide$LED retrofits in Canada: what to do with old fluorescent ballasts (PCBs) and mercury lamps$guide$, 'led-retrofits-in-canada-what-to-do-with-old-fluorescent-ballasts-pcbs',
  $guide$What this covers: what to check before you pull ballasts and tubes on an LED retrofit, the federal PCB deadline for light ballasts, and who is responsible for disposal.

**Which ballasts may contain PCBs**
Environment and Climate Change Canada (ECCC) says light ballasts made before the 1980s usually contain high PCB concentrations, and its guidance for electrical contractors says ballasts made before 1980 typically contain PCBs. Clues: manufacture date, nameplate information, and older Environment Canada labels reading "Attention PCB" or similar. If unsure, ECCC says to check with knowledgeable sources such as the manufacturer before disposal.

**The deadline**
Under the PCB Regulations (SOR/2008-273), light ballasts with 50 mg/kg or more of PCBs that were in use on September 5, 2008 may be used only until December 31, 2026 (s. 16(2)(a)). Extensions of up to five years are possible only with Ministerial approval where ending use by that date is not technically or economically feasible (s. 17.1). Anyone still using these ballasts on January 1, 2026 had to notify the Minister within 120 days (s. 16(4)). For most buildings, remaining PCB ballasts need to come out before the end of 2026.

**Who is responsible**
- ECCC: owners of PCB equipment are legally responsible for proper handling and disposal, and ownership cannot be transferred.
- ECCC: electrical contractors, unless they are also authorized hazardous waste service providers, should not transport, store or dispose of PCBs.
- ECCC: typically only an authorized hazardous waste company may remove PCBs from the owner's property.

**After removal**
- ECCC's storage factsheet: once PCB products are no longer in use, the owner has 30 days to send them to an authorized destruction facility or put them into PCB storage.
- Storage-site requirements apply at set thresholds, such as 100 L of PCB liquids, 100 kg of PCB solids, or any amount containing 1 kg or more of pure PCBs. Check your quantities against the factsheet.
- ECCC says PCB ballasts should be kept separate from non-PCB ballasts during refits, and only ballasts that do not contain PCBs may be recycled without first being treated.

**Mercury lamps**
ECCC's Code of Practice for end-of-life lamps containing mercury, in effect since February 11, 2017, covers fluorescent tubes, CFLs, metal halide, mercury vapour and sodium vapour lamps, among others. It recommends best practices to prevent mercury releases during handling, collection, storage, transport and processing, tracking of lamps, and training workers on handling and spill cleanup. In practice: keep tubes whole, box them, and use a lamp recycler. Check provincial and municipal hazardous waste rules too.

**Retrofit checklist (common practice)**
- Before quoting: ask for building age and any past PCB inventory or survey.
- Before removal: inspect a sample of fixtures for date codes and labels.
- During removal: segregate PCB, non-PCB and unknown ballasts; keep lamps intact.
- After removal: hand PCB ballasts to the owner's authorized hazardous waste company; record counts and pickup dates.

**Common mistakes**
- Assuming old ballasts are PCB-free without checking.
- The contractor hauling PCB ballasts away to save the owner a trip.
- Breaking tubes into a dumpster.

**Sources** (checked October 9, 2026)
- ECCC, About PCBs (how the regulations apply): https://www.canada.ca/en/environment-climate-change/services/pollutants/pcb-in-environment/regulations-how-they-apply-to-you.html
- ECCC, Electrical contractors and PCB regulations: https://www.canada.ca/en/environment-climate-change/services/pollutants/pcb-in-environment/electrical-contractors-regulations.html
- ECCC, PCB storage: https://www.canada.ca/en/environment-climate-change/services/pollutants/pcb-in-environment/storage.html
- PCB Regulations, SOR/2008-273: https://laws-lois.justice.gc.ca/eng/regulations/SOR-2008-273/page-2.html
- ECCC, Lamps containing mercury: code of practice overview: https://www.canada.ca/en/environment-climate-change/services/pollution-prevention/environmental-risk-management-instruments/codes-of-practice/list/mercury-lamps-overview.html
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  634, 'approved', true, true, 'guide:D2'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'electrical' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g2db86270b', c.id, p.user_id, 'discussion', $guide$Gas work in Ontario: TSSA contractor registration and G1, G2, G3 certificates$guide$, 'gas-work-in-ontario-tssa-contractor-registration-and-g1-g2-g3-certific',
  $guide$What this covers: the two separate checks for gas work in Ontario (the company's TSSA registration and the technician's certificate), what G1, G2 and G3 holders can do, and how to verify.

**Two layers: company and person**
- **Company.** O. Reg. 212/01 says no person shall act as a contractor (a business that installs, removes, repairs, alters or services gas appliances) unless registered. A registration expires one year after it is issued.
- **Person.** The same regulation says no person shall install, alter, purge, activate, repair, service or remove gas appliances or equipment unless they hold a certificate for that purpose. There is a narrow exception for work done in the presence of a certificate holder.
TSSA says only TSSA-registered contractors and certified fuel technicians are legally allowed to install, service or maintain fuel-burning appliances such as furnaces, boilers and water heaters.

**G1, G2, G3 in plain English (O. Reg. 215/01)**
- **G1:** may install, inspect, alter, purge, activate, repair, service or remove natural gas or propane appliances of any BTU input.
- **G2:** the same work on appliances with an input of 400,000 Btuh or less. A G2 can do G1-level work only under the direct supervision of a G1.
- **G3:** a limited certificate. Under the general supervision of a G1, G2 or DA holder, a G3 can do listed tasks such as gas piping under 2.5 inches downstream of the meter, reactivating a previously installed appliance, cleaning and lubricating, and vent connector work, once their skills are signed off. A G3 cannot do the initial activation of a new or newly converted appliance.

For a commercial rooftop unit or central boiler, check the appliance input rating against the technician's certificate. Above 400,000 Btuh you need a G1, or a G2 working under a G1's direct supervision.

**How to verify**
1. Search TSSA's Registered Fuels Contractor lookup by company name, authorization number (format FS-R-#####), or city and postal code. Filter by fuel type.
2. Open the detail page and confirm the authorization status and expiry date.
3. Note that TSSA updates the tool at the start of each month, and a listing is not an endorsement.
4. For technicians, ask to see their TSSA certificate and match the certificate class to the job. TSSA's public tool covers contractors. If you need to confirm an individual's certificate, contact TSSA.
5. TSSA asks people to report suspected unregistered workers to fuels_technical_services@tssa.org.

**Owner duty**
O. Reg. 212/01 says the owner or user of a gas appliance must ensure it is maintained in a safe operating condition. Keep service records with the equipment file.

**Common mistakes**
- Checking the company registration but not the technician's certificate class.
- Letting a G2 work alone on equipment above 400,000 Btuh.
- Letting a G3 commission a new appliance.
- Relying on a registration that expired since last year's service.

**Sources** (checked October 9, 2026)
- O. Reg. 212/01, Gaseous Fuels (e-Laws): https://www.ontario.ca/laws/regulation/010212
- O. Reg. 215/01, Fuel Industry Certificates (e-Laws): https://www.ontario.ca/laws/regulation/010215
- TSSA, Registered Fuels Contractor lookup: https://www.tssa.org/fuels-contractor
- TSSA, Protecting Ontarians from fraudulent fuels workers: https://www.tssa.org/protecting-ontarians-fraudulent-fuels-workers

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  566, 'approved', true, true, 'guide:C6'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'hvac-mechanical' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g1ba44ed0a', c.id, p.user_id, 'discussion', $guide$Refrigerant work in Canada: federal halocarbon rules vs Ontario's ODP certificate$guide$, 'refrigerant-work-in-canada-federal-halocarbon-rules-vs-ontario-s-odp-c',
  $guide$What this covers: which refrigerant rules apply to a building, the federal rules for federal sites, Ontario's certificate requirement, and what to ask an HVAC contractor.

**First, a correction you may see in old specs**
The Federal Halocarbon Regulations, 2003 were repealed in 2022. The current federal rules are the Federal Halocarbon Regulations, 2022 (SOR/2022-110). If a tender still cites the 2003 version, ask the owner which rules they want followed.

**Federal rules: which buildings**
The 2022 federal regulations apply to air-conditioning, refrigeration and certain other halocarbon systems that are owned by the federal Crown, a federal board or agency, a Crown corporation or a federal work or undertaking, or that are located on federal lands or Aboriginal lands. A typical private office tower or condo is covered by provincial rules instead.

Key points for federal sites:
- Only a "certified person" may install, service or recover halocarbon from an air-conditioning or refrigeration system. That means someone holding a valid provincial certificate for an environmental awareness course on handling halocarbon refrigerants.
- Large systems (a circuit holding more than 10 kg) must be leak tested at least once every calendar year and no more than 15 months after the last test.
- Owners of systems over 10 kg keep an inventory and logs, and must keep documents for at least five years.
- Releases of 100 kg or more must be reported within 24 hours of detection, with a written report within 30 days. Smaller releases over 10 kg are reported twice a year.

**Ontario rules: most other buildings**
O. Reg. 463/10 says no person shall service or test refrigeration equipment that contains a refrigerant unless they are certified under the regulation and they (or their employer) own refrigerant recovery equipment or have a written contract giving immediate access to it.
- The certificate comes from a one-day, government-approved environmental awareness course, offered by HRAI and its delivery partners. Ontario calls it the Ozone Depletion Prevention (ODP) card.
- It is valid for five years.
- A technician who leak tests equipment must attach a notice showing the date, their name and their certificate number and expiry date.
- Ontario is clear that the ODP card alone does not let someone repair refrigeration equipment. That requires a Certificate of Qualification in a trade such as refrigeration and air conditioning systems mechanic, which is a compulsory trade in Ontario.

**What to ask before you award HVAC work**
- ODP certificate number and expiry date for each technician who will handle refrigerant.
- Trade certificate (C of Q) for the technicians doing the repair work.
- How they recover refrigerant: own equipment or a written access contract.
- For federal sites: who keeps the leak test records and logs the owner must hold.

**Other provinces**
Each province has its own ozone-depleting substance rules. Check the environment ministry in the province where the building sits.

**Common mistakes**
- Citing repealed 2003 regulations in a 2026 tender.
- Treating an ODP card as a trade licence.
- Not asking for leak test notices and service records at turnover.

**Sources** (checked October 9, 2026)
- Federal Halocarbon Regulations, 2022, SOR/2022-110: https://laws-lois.justice.gc.ca/eng/regulations/SOR-2022-110/FullText.html
- Federal Halocarbon Regulations, 2003 (repealed): https://laws-lois.justice.gc.ca/eng/regulations/SOR-2003-289/FullText.html
- O. Reg. 463/10, Ozone Depleting Substances and Other Halocarbons (e-Laws): https://www.ontario.ca/laws/regulation/100463
- Ontario, Certificate to handle refrigerants: https://www.ontario.ca/page/certificate-handle-refrigerants
- O. Reg. 876/21, compulsory trades (e-Laws): https://www.ontario.ca/laws/regulation/210876

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  612, 'approved', true, true, 'guide:C5'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'hvac-mechanical' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g7e759f845', c.id, p.user_id, 'discussion', $guide$Commercial HVAC maintenance contracts: using ASHRAE/ACCA Standard 180 to define the PM scope$guide$, 'commercial-hvac-maintenance-contracts-using-ashrae-acca-standard-180-t',
  $guide$What this covers: what ANSI/ASHRAE/ACCA Standard 180 is, what it asks for, and a practical checklist for writing or bidding a preventive maintenance (PM) scope.

**What Standard 180 is**
- Full title: Standard Practice for Inspection and Maintenance of Commercial Building HVAC Systems. Developed by ASHRAE and ACCA. ASHRAE's fact sheet describes the 2018 edition.
- ASHRAE says it was created to address inconsistent HVAC inspection and maintenance practices, and to maintain the whole system rather than each component on its own, so the system keeps delivering thermal comfort, energy efficiency and indoor air quality.
- It does not apply to single-family houses, multi-family buildings of three or fewer storeys above grade, or process HVAC. ASHRAE interpretation IC 180-2018-1 says it does apply to residential-type HVAC equipment in buildings over three storeys, which matters for mid- and high-rise condos.
- It is a voluntary standard unless a jurisdiction (or your contract) makes it mandatory.

**What it asks for (from the published sample pages of the 2012 edition)**
- The building owner is responsible and can contractually designate others to do the work.
- A maintenance program: an inventory of equipment plus a written maintenance plan.
- The plan sets performance objectives, condition indicators (measurements or observations that signal trouble), tasks, task frequencies and documentation, and names who does each task.
- Task tables by equipment type: air handlers, boilers, chillers, cooling towers, rooftop units, pumps, fans, terminal boxes, controls and more.
- If unacceptable conditions show up on two successive inspections, causes must be investigated. After three successive acceptable inspections, frequency may be reduced, with documentation.
- It does not supersede manufacturer instructions.
Buy the current edition for the exact task tables.

**How to use it in a contract**
- Reference the standard in the RFP and attach your equipment inventory, so every bidder prices the same tasks.
- Require the contractor to deliver and maintain the inventory, plan and task records, not just invoices.
- Make frequency changes a documented, approved change, never a silent cut.

**PM scope checklist (common practice, not from the standard)**
- Equipment list with make, model, serial, location and access notes (roof, ceiling, locked rooms).
- Filters: type, rating, size, quantity, change interval, who supplies them.
- Belts: inspect and adjust each visit; whether replacement belts are included.
- Coils: condenser and evaporator cleaning frequency and method; chemical cleaning included or extra.
- Refrigerant: leak checks and records; refrigerant itself usually billed separately.
- Condensate drains, pans and traps.
- Controls: sensor and setpoint checks, building automation alarm review.
- Water treatment for towers and closed loops: in or out of scope.
- Reporting: written report each visit, deficiency list with priced recommendations.
- Response times for emergency, urgent and routine calls, each defined.
- After-hours terms: rates, call-out minimums, what counts as after hours, who can authorize.
- Exclusions: parts, major repairs, lifts and cranes.

**Common mistakes**
- Tendering "quarterly PM" with no equipment list. The prices will not compare.
- No deficiency reporting format, so repairs never get approved.
- Leaving filters and belts unclear, then arguing about extras.

**Sources** (checked October 9, 2026)
- ASHRAE fact sheet, Standards 180 and 211: https://www.ashrae.org/file%20library/about/government%20affairs/public%20policy%20resources/standards-180_211-fact-sheet.pdf
- ASHRAE interpretation IC 180-2018-1: https://www.ashrae.org/file%20library/technical%20resources/standards%20and%20guidelines/standards%20intepretations/ic180-2018-1.pdf
- Standard 180-2012 sample pages (ICC store): https://shop.iccsafe.org/media/wysiwyg/material/8950P823-sample.pdf
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  589, 'approved', true, true, 'guide:D3'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'hvac-mechanical' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gdbc1b7cd5', c.id, p.user_id, 'discussion', $guide$Frozen or burst pipe in your building: the first 15 minutes for building staff$guide$, 'frozen-or-burst-pipe-in-your-building-the-first-15-minutes-for-buildin',
  $guide$What this covers: what front-line building staff should do, in order, when a pipe freezes or bursts. Print it and post it near your valve map.

**Before winter**
- Know where every main and zone shut-off is, label them, and make sure they turn. The City of Toronto says to know where your main shut-off is before you need it.
- Insulate exposed pipes near outside walls, in crawl spaces, attics and garages, and seal air leaks around pipes and openings (Toronto Water). Toronto Water also says commercial customers should wrap all exposed fire lines.
- Keep a contact sheet: plumber, electrician, restoration company, fire protection contractor, insurer claims line, all with after-hours numbers.

**Minutes 0 to 5: stop the water, protect people**
- Shut off the water feeding the break. Toronto Water says if a pipe breaks, shut off the water right away and keep it off until the pipe is repaired.
- Check for electrical hazards before anyone steps into water. The Electrical Safety Authority (ESA) says not to enter a flooded basement if water is above outlets, baseboard heaters or the furnace, or near the electrical panel, until the local utility has disconnected power.
- If water is reaching an electrical room or panel, keep people out and call the utility.

**Minutes 5 to 10: contain and notify (common practice)**
- Once the supply is off, open a low tap to drain the line.
- Move what you can out of the water path and set up containment.
- Check units below and beside the leak. Water travels.
- Call the plumber. If it is a sprinkler line, call your fire protection contractor and follow your building's fire safety procedures.

**Minutes 10 to 15: document for insurance**
- Photograph and video the break, the water and affected areas before cleanup. Insurance Bureau of Canada's recovery checklist says to keep taking photos of impacted areas, damaged items and any materials that must be discarded.
- IBC also says to save every receipt for cleanup and temporary repairs, keep notes of conversations, and confirm who a contractor works for before authorizing work on a claim.
- Start a written log: time found, who shut off what, who was called and when.

**Thawing a frozen pipe that has not burst**
- Toronto Water: open a tap, then warm the pipe or the air around it with a hair dryer, electric heating pad, space heater or warm towel. Thawing can take one to six hours.
- Never use a torch or any open flame. Do not use kerosene or propane heaters or charcoal stoves. Do not leave electrical heating devices unattended.
- Once thawed, turn the water on slowly and check for cracks and leaks.

**After the water is off**
- ESA says to have a licensed electrical contractor assess the electrical system before power is restored, and not to reuse products that have been in flood water.
- Start drying quickly and keep the log going.

**Common mistakes**
- Nobody on shift knows which valve feeds which riser.
- Staff wading into a flooded electrical room.
- Throwing out damaged materials before photographing them.
- Using a torch on a frozen line.

**Sources** (checked October 9, 2026)
- City of Toronto, Prevent or thaw frozen pipes: https://www.toronto.ca/services-payments/water-environment/your-water-pipes-meter/water-related-help-advice/prevent-or-thaw-frozen-pipes/
- Electrical Safety Authority, flooding electrical hazards advisory: https://esasafe.com/newsroom-2023/electrical-safety-authority-warns-of-electrical-hazards-posed-by-expected-flooding-in-northern-ontario/
- Insurance Bureau of Canada, flood recovery checklist (PDF): https://a.storyblok.com/f/339220/x/70aef04f94/ibc-flood-recovery-checklist.pdf
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  599, 'approved', true, true, 'guide:D5'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'plumbing' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gf8f1eed14', c.id, p.user_id, 'discussion', $guide$Plumbing is a compulsory trade in Ontario: who can legally do the work and how to check$guide$, 'plumbing-is-a-compulsory-trade-in-ontario-who-can-legally-do-the-work',
  $guide$What this covers: what it means that plumbing is a compulsory trade in Ontario, what work falls inside the plumber's scope, how to check a plumber, and a note on Alberta.

**Plumber is a compulsory trade**
O. Reg. 876/21 lists plumber among Ontario's compulsory trades. Under the Building Opportunities in the Skilled Trades Act, 2021, an individual may practise a compulsory trade only if they:
- are an apprentice in that trade working under a registered training agreement that is not suspended, or
- hold a Certificate of Qualification (C of Q) or provisional C of Q in that trade that is not suspended, or
- are exempted by regulation.
The Act also says no person shall employ or otherwise engage someone to do that work unless one of those applies. That covers anyone hiring, including owners and property managers.

**What is in the plumber's scope**
O. Reg. 875/21 says the plumber's scope includes:
- laying out, assembling, installing, maintaining or repairing piping, fixtures and appurtenances for water supply or for disposal of used water, in any structure, building or site
- connecting appliances that use or discharge water to piping
- installing piping for any process, including gas, and tubing for pneumatic or air-handling systems
- making joints in piping
- reading design drawings and manufacturers' installation literature
It excludes manufacturing or pre-assembling units off site, laying sewer, drain or water main pipe in trenches, and repairing and maintaining installations in an operating industrial plant.

**Gas piping is also TSSA work**
Even inside the plumber's scope, gas work has a second rule. O. Reg. 212/01 says no person shall install, alter, purge, activate, repair, service or remove gas appliances or equipment without a TSSA certificate for that purpose. Check both credentials for any gas line.

**How to check a plumber in Ontario**
1. Get the worker's full name and Skilled Trades Ontario ID.
2. Search the STO public register. It confirms whether someone can legally work in a compulsory trade.
3. Confirm the trade shown is plumber (trade code 306A at Skilled Trades Ontario), not a different piping trade.
4. For apprentices, confirm they appear on the register as plumbing apprentices.
Ontario says workers in compulsory trades must carry proof of authorization and show it to an inspector on request. Ministry of Labour inspectors can issue compliance orders and notices of contravention with administrative monetary penalties.

**Alberta**
Alberta's Tradesecrets site lists plumber as a compulsory certification trade. To perform the restricted activities, a person must be a registered apprentice working under a certified journeyperson, a certified journeyperson, or hold a recognized trade certificate.

**Other provinces**
Rules differ. Check the apprenticeship authority in the province where the work is done.

**Common mistakes**
- Hiring a "handyman" for work inside the plumber's scope.
- Assuming a steamfitter or general maintenance worker can do domestic water and drain work.
- Forgetting the TSSA certificate on gas piping.

**Sources** (checked October 9, 2026)
- O. Reg. 876/21, Prescribed Trades and Related Matters, s. 2 (e-Laws): https://www.ontario.ca/laws/regulation/210876
- O. Reg. 875/21, Scopes of Practice, s. 103 Plumber (e-Laws): https://www.ontario.ca/laws/regulation/210875
- Building Opportunities in the Skilled Trades Act, 2021, ss. 6 and 7 (e-Laws): https://www.ontario.ca/laws/statute/21b28
- Ontario, Compulsory trades and enforcement: https://ontario.ca/page/compulsory-trades-and-enforcement
- Skilled Trades Ontario, Public Register: https://www.skilledtradesontario.ca/public-register/
- Skilled Trades Ontario, Plumber (306A) trade report: https://www.skilledtradesontario.ca/wp-content/uploads/2025/05/plumber-306A_2024_en_TradeReport.html
- O. Reg. 212/01, Gaseous Fuels, s. 6 (e-Laws): https://www.ontario.ca/laws/regulation/010212
- Alberta Tradesecrets, Compulsory Certification Trades: https://tradesecrets.alberta.ca/trades-in-alberta/compulsory-certification-trades

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  644, 'approved', true, true, 'guide:C15'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'plumbing' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g66f1d78b2', c.id, p.user_id, 'discussion', $guide$Backflow preventer testing in Toronto: who must test, how often, who can test and how to file$guide$, 'backflow-preventer-testing-in-toronto-who-must-test-how-often-who-can',
  $guide$What this covers: Toronto's backflow prevention program under Municipal Code Chapter 851 (Water Supply By-law) and the CSA standards it points to. Other Ontario municipalities have their own by-laws, so check locally.

**Who must have a device**
Toronto's program page says installation is mandatory for industrial, commercial and institutional properties, Part 3 residential properties (as defined by the Ontario Building Code), and construction sites. The sector list is in Schedule 5 of the by-law. Devices isolate the building from the City's system and go right after the water meter and bypass piping. Chapter 851 exempts Part 9 residential buildings unless they have an auxiliary water supply or another law requires premise isolation.
Device types per the City: double check valve assembly for moderate hazard, reduced pressure principle (RP) assembly for severe hazard. RP devices cannot be installed below grade in a pit, chamber or vault.

**When testing is required**
Chapter 851 requires the owner to have each device inspected and tested:
- on installation
- immediately, and no later than 72 hours after it is cleaned, repaired, replaced, serviced or overhauled
- when relocated
- annually
- as required by the City
The by-law selects, installs, maintains and tests devices under the CSA B64 series, defined as B64.10 (selection and installation) and B64.10.1 (maintenance and field testing), and refers to AWWA test procedures.

**Who can test**
The City says plumbers, engineers and fire sprinkler fitters certified as Cross Connection Control Specialists, with full criteria in Schedule 6. Testers must register with the program before testing. The City lists documents such as CCC certification (OWWA, valid five years, or ASSE, valid three years), a test gauge calibration certificate (valid one year) and proof of licensing or good standing. Chapter 851 requires test equipment calibration at least every 12 months.

**Filing results**
- The tester submits the Backflow Prevention Device Test Report online. The tester and client get an email confirmation with the result.
- The by-law consolidation we reviewed requires the owner to submit the report within seven days of the test, and to repair or replace a failed device within 48 hours. Confirm against the current by-law.
- A tag on the device must show the address, device details, test date, and the tester's name, employer and certificate number.
- The City says to keep copies of records submitted on site for at least seven years.

**Surveys**
The City may ask for a backflow survey, due by the date in its letter or within 30 days, signed by an authorized surveyor and the owner. Surveys must be updated at least every five years, or within 30 days of a hazard increase.

**For property managers**
- Calendar the annual test for each device.
- Tell the City when tenant or operational changes raise the hazard level.
- A building permit is required for new installations and replacements; the City says the plumber typically gets it.

**Common mistakes**
- Repairing a device and skipping the 72-hour retest.
- Hiring a tester who has not registered with the City.
- Assuming another trade's annual inspection covered the backflow test.

**Sources** (checked October 9, 2026)
- City of Toronto, Backflow Prevention Program: https://www.toronto.ca/services-payments/water-environment/water-sewer-related-permits-and-bylaws/water-supply-by-law/backflow-prevention-program/
- Toronto Municipal Code Chapter 851, Water Supply (PDF consolidation): https://www.toronto.ca/legdocs/municode/1184_851.pdf
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  582, 'approved', true, true, 'guide:D4'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'plumbing' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g622553ff1', c.id, p.user_id, 'discussion', $guide$Working at heights training in Ontario: who needs it, the 3-year rule and how to verify it$guide$, 'working-at-heights-training-in-ontario-who-needs-it-the-3-year-rule-an',
  $guide$What this covers: who needs Ontario working at heights (WAH) training, how long it lasts, what proof to ask for, and the basic fall protection rule on construction projects.

**Who needs it**
Under O. Reg. 297/13, an employer must make sure a worker has valid WAH training if the worker may use any of these on a construction project under O. Reg. 213/91: a travel restraint system, fall restricting system, fall arrest system, safety net, work belt or safety belt. Ontario notes this is in addition to equipment-specific training. Workers whose workplaces are not covered by the construction regulation do not need this program.

The training must be a program approved by Ontario's Chief Prevention Officer (CPO), delivered by a CPO-approved training provider.

**How long it lasts**
WAH training is valid for three years from the date the worker successfully completed it. To keep it valid, the worker completes an approved refresher before it expires, which extends it for another three years. Ontario has an eligibility checker for refreshers on its training page.

**What proof to ask for**
- A proof of completion record issued by the CPO or an approved provider.
- With the worker's consent, employers can check training in the ministry's certification management system, linked from Ontario's training page, or confirm with the ministry.
- Employers must keep a training record with the worker's name, the approved provider, the completion date and the program name, or a copy of the CPO proof of completion. It must be available to an inspector on request.

**Watch for fake cards**
Ontario has warned that some unapproved trainers issue WAH cards with little or no real training, and that some fakes look like they come from approved providers. The ministry will not accept them. Check the provider is approved and check the worker's record in the ministry's system, not just the card.

**The fall protection rule behind it**
O. Reg. 213/91 applies its fall protection sections where a worker may fall more than 3 metres, more than 1.2 metres from a wheelbarrow path, into operating machinery, into water or another liquid, onto a hazardous substance or object, or through an opening in a work surface. A guardrail system comes first. If a guardrail is not practicable, use the highest ranked practicable method: travel restraint, then fall restricting, then fall arrest, then a safety net.

**For property managers and roofing buyers**
- Ask the contractor for a list of crew members who will work at heights, with WAH completion dates.
- Check that no one's three-year window ends during your job.
- Ask how they will protect edges and openings: guardrails first, then the system they will use.

**Common mistakes**
- Accepting a wallet card without checking the ministry record.
- Forgetting refreshers on long roofing seasons.
- Assuming WAH training replaces training on the specific harness or system used on site.

**Sources** (checked October 9, 2026)
- O. Reg. 297/13, Occupational Health and Safety Awareness and Training, ss. 6 to 10 (e-Laws): https://www.ontario.ca/laws/regulation/130297
- O. Reg. 213/91, Construction Projects, ss. 26 and 26.1 (e-Laws): https://www.ontario.ca/laws/regulation/910213
- Ontario, Training for working at heights: https://www.ontario.ca/page/training-working-heights
- Ontario, Alert: fraudulent working at heights training cards: https://www.ontario.ca/page/alert-fraudulent-working-heights-training-cards

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  586, 'approved', true, true, 'guide:C7'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'roofing-envelope' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g0a0d08839', c.id, p.user_id, 'discussion', $guide$Ice dams on townhouse and low-rise condo roofs: what causes them and which fixes last$guide$, 'ice-dams-on-townhouse-and-low-rise-condo-roofs-what-causes-them-and-wh',
  $guide$What this covers: why ice dams form, how to find the real cause, and which fixes solve the problem versus get you through one more winter. Based mainly on Natural Resources Canada's (NRCan) guide Keeping the Heat In. It is written for houses, but the same physics applies to townhouse blocks and low-rise sloped roofs.

**How ice dams form**
NRCan explains it this way: snow on a roof acts as an insulator. If the attic is above freezing, it warms the roof sheathing and melts the snow touching the roof. Melt water runs down to the overhang, and if the air and overhang are below freezing, it refreezes and builds the dam. Water then backs up under the shingles.
NRCan also notes:
- A well-sealed and insulated attic gives a cool roof and generally no ice dams.
- Roofs with many valleys and dormers, or large overhangs, get ice dams more often.
- Dark, sun-heated siding below the eave can drive warm air into the roof area.

**Find the cause first**
NRCan suggests looking at the roof after the first heavy frost or light snow and noting where it melts first, then finding what is under that spot. Common hot spots: roof-ducted exhaust fans, plumbing vents, skylights, leaky attic hatches, and lines where knee walls meet ceilings. On a multi-unit roof, check every unit's hatch and penetrations, not just the unit that reported the leak.

**Fixes that last**
- Air sealing. NRCan: the best prevention is to seal all attic air leaks and insulate thoroughly.
- Insulation at the eaves. NRCan notes that where a soffit baffle leaves only about 100 mm (4 in.) for insulation, snow melts just above the overhang. Insulation should run over the top of the exterior walls with no gaps at the perimeter.
- Ventilation as the second line. NRCan calls attic ventilation the second line of defence after air sealing; it keeps the attic colder.
- Cathedral ceilings are harder to reach. NRCan says these are usually best handled by an insulator experienced with dense-pack insulation, or at re-roofing time.

**Band-aids (useful, but not the cure)**
- Self-sealing membrane under the shingles. NRCan notes building codes require it on the lower part of the roof in new houses. It stops leaks into the building, not the dam itself, so shingles and gutters can still be damaged.
- Snow removal helps, but NRCan warns removing ice and snow is not always easy or safe.
- Chopping. NRCan says attacking ice dams every winter with an axe or ice pick damages the roof surface.

**Scoping a repair RFP (common practice)**
- Ask for an attic investigation first: air leakage points, insulation depth, ventilation paths, with photos.
- Split the scope: air sealing and insulation, ventilation, and roofing or membrane work, so you can compare bids.
- Ask for photos of each sealed penetration as a deliverable.
- Check the roof again after the first snow to confirm the melt pattern changed.

**Common mistakes**
- Adding roof vents without sealing the leaks first.
- Replacing shingles and calling the problem solved.
- Sending staff onto an icy roof without a fall protection plan.

**Sources** (checked October 9, 2026)
- NRCan, Keeping the Heat In (section 5.5, Ice dams): https://natural-resources.canada.ca/sites/www.nrcan.gc.ca/files/energy/pdf/housing/Keeping%20the%20Heat%20In_e%20.pdf
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  582, 'approved', true, true, 'guide:D6'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'roofing-envelope' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g384b682b8', c.id, p.user_id, 'discussion', $guide$Window and curtain wall leaks: ASTM E1105, AAMA 501.2 and how a leak diagnosis is scoped$guide$, 'window-and-curtain-wall-leaks-astm-e1105-aama-501-2-and-how-a-leak-dia',
  $guide$What this covers: the two field water tests you will see in specs and consultant reports, what each one is for, and how a leak diagnosis scope is usually put together.

**ASTM E1105**
Full title: Standard Test Method for Field Determination of Water Penetration of Installed Exterior Windows, Skylights, Doors, and Curtain Walls, by Uniform or Cyclic Static Air Pressure Difference. Current edition: E1105-15(2023).
- Water is applied to the outdoor face while the air pressure outside is held higher than inside. ASTM says it is generally more convenient to use an interior chamber that exhausts air, with a calibrated nozzle rack spraying the exterior.
- It is mainly for checking compliance with specified performance, and can also test the joints between the assembly and the adjacent wall.
- ASTM notes it can be done at installation, before interior finishes, when errors are cheapest to fix, or on an in-service building to see whether reported leaks are a failure at the specified pressure.
- Limits ASTM notes: in-service curtain walls may need interior finishes removed to observe; the test should not run if wind gusts push pressure more than 10% from the test pressure; it does not identify water you cannot see.
- The test pressure is set by whoever specifies the test. ASTM says pressure differences across envelopes vary greatly and should be considered fully before specifying.

**AAMA 501.2**
Title: Quality Assurance and Diagnostic Water Leakage Field Check of Installed Storefronts, Curtain Walls, and Sloped Glazing Systems. Published by FGIA, which lists 501.2-25 as the active edition.
- A hose check with no pressure chamber, used for quality assurance and diagnosis.
- FGIA says it is not intended to test rated or specified water performance (wind-driven rain). For field testing those systems for air leakage and water penetration resistance, FGIA points to AAMA 503.

**How a diagnosis scope is usually structured (common practice)**
1. Records review: drawings, shop drawings, leak log with dates and weather, past repairs.
2. Interior mapping: where water appears and under what conditions.
3. Exterior review: sealants, gaskets, flashings, weeps, transitions to adjacent walls and roofs.
4. Targeted water testing: isolate one component or joint at a time, starting low and working up, so you know which one leaked.
5. Opening up where needed, with the owner's approval, to confirm the path.
6. Report: photos, test locations, method and edition used, results, cause, repair options with budgets.

**Writing the RFP**
- Name the test method and edition, and who sets the E1105 test pressure.
- State how many test areas, where, and who provides interior access and removes finishes.
- Require a retest after repairs using the same method.

**Common mistakes**
- Using a hose check result to say a system meets its rated water performance.
- Wetting a whole elevation at once, so nobody knows which joint leaked.
- No retest after repair.

**Sources** (checked October 9, 2026)
- ASTM E1105-15(2023) product page: https://store.astm.org/e1105-15r23.html
- FGIA store, AAMA 501.2: https://store.fgiaonline.org/AAMA-501.2-03/
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  536, 'approved', true, true, 'guide:D7'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'roofing-envelope' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gc0a63b956', c.id, p.user_id, 'discussion', $guide$Lead paint in older buildings: what to check before sanding or stripping (Ontario)$guide$, 'lead-paint-in-older-buildings-what-to-check-before-sanding-or-strippin',
  $guide$What this covers: what to check before sanding, scraping or stripping paint in an older building, using Health Canada guidance and Ontario's lead on construction projects guideline.

**Step 1: assume it might be lead**
Health Canada says homes built before 1960 probably contain lead-based paint, and homes built between 1960 and 1990 may have it on the exterior. Older layers can sit under newer paint. Treat older commercial and residential buildings with the same caution until tested.

**Step 2: test before you price the job**
Health Canada describes two ways to test: send paint chip samples to a lab, or hire a contractor with X-ray equipment to check painted surfaces. Test the surfaces that will be disturbed, not just one sample per building.

**Step 3: owner's duty to disclose (Ontario)**
Lead is a designated substance. Under OHSA s. 30, the owner of a project must determine whether designated substances are present and list them before the project starts. The list goes into the tender and to the constructor before contract, and down to every contractor and subcontractor. Ontario's lead guideline says an owner or contractor who fails to do this is liable for losses if lead is later found.

**Step 4: pick the method, because the method sets the risk**
Ontario's guideline sorts lead work into Type 1, 2 and 3 operations by risk. Examples from the guideline:
- Power sanding or scraping with a HEPA dust collection system: Type 1.
- Chemical gel or paste removal with a fibrous laminated cloth wrap: Type 1.
- Manual sanding or scraping with hand tools: Type 2a.
- Power sanding or scraping without HEPA dust collection: Type 3a.
- Burning a lead-containing surface: Type 3a.
- Abrasive blasting: Type 3b.
Higher-risk methods call for stronger controls. Health Canada separately advises against sanders, heat guns or blowlamps on older paint because they create toxic dust and fumes.

**Step 5: controls and housekeeping**
Ontario's guideline groups controls into engineering controls, work and hygiene practices, protective clothing and equipment, and training. Examples include wet methods, dust collection on power tools, washing down or HEPA vacuuming, no compressed air or dry sweeping, and no eating, drinking or smoking in contaminated areas. Employers must still take every precaution reasonable in the circumstances under the OHSA.

**Step 6: waste**
Health Canada says to put scrapings and chips in a sealed container labelled "Hazardous Waste" and follow your municipality's disposal instructions.

**Bid checklist for painting contractors**
- Ask the owner for the designated substance survey.
- Price the removal method, not just the square footage.
- State the operation type and controls in your proposal.
- Plan occupant protection: Health Canada says keep children and pregnant women away from the work area.

**Common mistakes**
- Dry power sanding without HEPA dust collection.
- Using a heat gun to speed up stripping.
- Bidding a repaint without asking whether the existing paint has been tested.

**Sources** (checked October 9, 2026)
- Health Canada, Lead-based paint: https://www.canada.ca/en/health-canada/services/home-safety/lead-based-paint.html
- Ontario, Lead on construction projects: controlling the lead hazard: https://www.ontario.ca/document/lead-construction-projects/controlling-lead-hazard
- Ontario, Lead on construction projects: legal requirements: https://www.ontario.ca/document/lead-construction-projects/legal-requirements
- Ontario, Lead on construction projects: classification of work: https://www.ontario.ca/document/lead-construction-projects/classification-work
- Occupational Health and Safety Act, s. 30 (e-Laws): https://www.ontario.ca/laws/statute/90o01

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  585, 'approved', true, true, 'guide:C14'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'painting-finishes' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gda2e01e8e', c.id, p.user_id, 'discussion', $guide$VOC limits for architectural coatings in Canada (SOR/2009-264): what painters and buyers need to know$guide$, 'voc-limits-for-architectural-coatings-in-canada-sor-2009-264-what-pain',
  $guide$What this covers: the federal Volatile Organic Compound (VOC) Concentration Limits for Architectural Coatings Regulations, what they cover, what the label tells you, and what that means for products you buy and spec.

**What it covers**
- The coatings listed in the regulation's schedule, 53 categories, each with a maximum VOC concentration in grams per litre.
- No one may manufacture or import a listed coating over its limit, or sell or offer it for sale over its limit, unless the label requires dilution that brings it within the limit, or the product is covered by a permit (ss. 3 and 5).
- It does not apply to coatings applied to products in a factory or shop as part of manufacturing, or coatings for research, lab use or export (s. 2(1)). It also does not apply to adhesives, aerosol coatings and antifouling coatings, among others (s. 2(2)).

**Some limits from the schedule**
- Flat coatings not in another category (gloss under 15 on an 85 degree meter or under 5 on a 60 degree meter): 100 g/L
- Non-flat coatings not in another category: 150 g/L
- High-gloss coatings (70 or more on a 60 degree meter): 250 g/L
- Primers, sealers and undercoaters not in another category: 200 g/L
- Opaque floor coatings: 250 g/L
- Concrete curing compounds: 350 g/L
- Traffic marking coatings: 450 g/L, and coatings over 150 g/L cannot be used from May 1 to October 15 (s. 4)

**What the label must show (s. 17)**
- the manufacture date or a date code (label, lid or bottom)
- thinning instructions for solvents other than water, or a statement that the coating is applied without thinning
- category statements, for example "For industrial use only" or similar on industrial maintenance coatings, "For metal surfaces only" on rust preventive coatings, what a specialty primer is for (such as "For blocking stains"), the dry-hard time and "Quick dry" on quick-dry enamels, and "High gloss" on high-gloss coatings
Sellers must add the information if the manufacturer or importer did not (s. 17(1.1)).

**Rules that matter on site**
- Dilution instructions cannot take the product above its limit (s. 6).
- For multi-component products, the mixed product must meet the limit (s. 7).
- If the label or product documents say a coating can be used as another category, the most restrictive limit applies, with some listed exceptions (s. 8).
- In practice: do not thin beyond the label, and read the category statement before using a specialty product as a general-purpose one.

**Any newer changes?**
The Justice Laws consolidation current to September 21, 2026 shows the regulation last amended June 17, 2019. ECCC ran a consultation on possible amendments to align limits with leading North American jurisdictions, with comments due by January 13, 2023. We found no final amendment. Watch the Canada Gazette.

**Common mistakes**
- Specifying by brand name without checking the product's category and VOC.
- Over-thinning with solvent to improve flow.
- Assuming a product brought in for one job is exempt.

**Sources** (checked October 9, 2026)
- SOR/2009-264, Justice Laws: https://laws-lois.justice.gc.ca/eng/regulations/SOR-2009-264/index.html
- SOR/2009-264, PDF consolidation: https://laws-lois.justice.gc.ca/PDF/SOR-2009-264.pdf
- ECCC, consultation on amendments to the architectural coatings regulations: https://www.canada.ca/en/environment-climate-change/services/managing-pollution/sources-industry/volatile-organic-compounds-consumer-commercial/consultation-architectural-coatings-regulations.html
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  590, 'approved', true, true, 'guide:D8'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'painting-finishes' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gd5e9e0a66', c.id, p.user_id, 'discussion', $guide$Designated substances in Ontario: the owner's list before tendering and the asbestos report$guide$, 'designated-substances-in-ontario-the-owner-s-list-before-tendering-and',
  $guide$What this covers: what an Ontario project owner must do about designated substances before tendering, the separate asbestos report, and who is liable when something turns up later.

**OHSA section 30, in plain English**
- **Before the project starts,** the owner must determine whether any designated substances are present at the project site and prepare a list of those present.
- **If any work is tendered,** the person issuing the tender must include a copy of the list in the tendering information.
- **Before signing,** the owner must make sure a prospective constructor has received the list before entering a binding contract.
- **Down the chain,** the constructor must make sure each prospective contractor and subcontractor has the list before they sign.

**What happens if it is missed**
Section 30 sets out civil liability:
- An owner who fails to comply is liable to the constructor and every contractor and subcontractor for loss or damages from the later discovery of a designated substance that the owner ought reasonably to have known of but did not list.
- A constructor who fails to comply is liable to every contractor and subcontractor for loss or damages from the later discovery of a substance that was on the owner's list.

**Which substances**
O. Reg. 490/09 lists 11 designated substances: acrylonitrile, arsenic, asbestos, benzene, coke oven emissions, ethylene oxide, isocyanates, lead, mercury, silica and vinyl chloride.

**Asbestos: a separate report before tendering**
O. Reg. 278/05 adds specific steps before an owner requests tenders for demolition, alteration or repair (or arranges the work without tenders):
- Have an examination done to find out whether material likely to be disturbed is asbestos-containing. This can be skipped only if the owner already knows, or the work will be done as though the material contains asbestos.
- Either way, have a report prepared that states whether the material is asbestos-containing, describes its condition (friable or non-friable), and includes drawings or plans showing where it is.
- Give the complete report to every prospective constructor. Constructors pass it to prospective contractors, and contractors to prospective subcontractors.
- If suspect material not in the report is found during the work, the constructor or employer must immediately notify a ministry inspector, the owner, the contractor and the joint health and safety committee or representative, orally and in writing.

**Practical checklist for owners and property managers**
- Order the designated substance survey early. It is often needed before the scope can be priced.
- Attach the list and asbestos report to the RFP, not just "available on request."
- Confirm receipt from each bidder in writing.
- Update the survey if the scope expands into new areas.

**Common mistakes**
- Issuing an RFP with no designated substance list for a renovation.
- Using an old survey that does not cover the areas now in scope.
- Assuming a "no asbestos" note covers lead, mercury or silica.

**Sources** (checked October 9, 2026)
- Occupational Health and Safety Act, s. 30 (e-Laws): https://www.ontario.ca/laws/statute/90o01
- O. Reg. 490/09, Designated Substances, s. 2 (e-Laws): https://www.ontario.ca/laws/regulation/090490
- O. Reg. 278/05, Asbestos on Construction Projects and in Buildings and Repair Operations, s. 10 (e-Laws): https://www.ontario.ca/laws/regulation/050278
- Ontario guide to O. Reg. 278/05: Demolition, alterations and repairs: https://www.ontario.ca/document/guide-regulation-respecting-asbestos-construction-projects-and-buildings-and-repair-5
- Ontario, Lead on construction projects: legal requirements: https://www.ontario.ca/document/lead-construction-projects/legal-requirements

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  594, 'approved', true, true, 'guide:C8'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'concrete-structure' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g3c69fe5bf', c.id, p.user_id, 'discussion', $guide$Cold-weather concreting: the temperatures, protection times and checks that the guidance gives$guide$, 'cold-weather-concreting-the-temperatures-protection-times-and-checks-t',
  $guide$What this covers: the core cold-weather numbers and practices from the National Ready Mixed Concrete Association's CIP 27, Cold Weather Concreting, which cites ACI 306R. It is US industry guidance. On Canadian jobs, your contract specifications and any standards they reference govern, so check them before relying on the numbers below.

**When cold-weather precautions start**
CIP 27 defines cold weather as more than 3 consecutive days where the average daily temperature is below 5°C (40°F) and the air temperature is not above 10°C (50°F) for more than half of any 24 hours.

**Why it matters**
- Fresh concrete freezes at about -4°C (25°F). Frozen concrete can lose more than 50% of its potential strength and will not be durable.
- Protect concrete from freezing until it reaches 3.5 MPa (500 psi), about two days after placement.
- Concrete that will see water and freeze-thaw cycles should be air-entrained, and protected from freeze-thaw cycles until it reaches at least 24.0 MPa (3500 psi).
- Rule of thumb: a 10°C (20°F) drop in concrete temperature roughly doubles the setting time.

**Recommended concrete temperature as placed (CIP 27)**
- minimum section dimension under 300 mm: 13°C (55°F)
- 300 to 900 mm: 10°C (50°F)
- 900 to 1800 mm: 7°C (45°F)
Concrete should not exceed these by more than 10°C (20°F).

**Before the pour**
- Remove snow and ice. Surfaces and metal embedments that touch the concrete should be above freezing, which may mean heating or insulating the subgrade.
- Have blankets, tarps, enclosures or insulated forms on site before the truck arrives. Corners and edges lose heat fastest.
- Vent fossil-fuel heaters in enclosures, for safety and to avoid carbonation of the fresh surface, which causes dusting.

**Mix and placement**
- Accelerating admixtures (ASTM C494 Type C or E) are common. Calcium chloride should not exceed 2% by weight of cement. Use non-chloride accelerators for prestressed concrete or where corrosion of reinforcement is a concern.
- Accelerators do not prevent freezing and do not replace protection and curing.
- Place at the lowest practical slump. Adding water delays set and prolongs bleeding.

**Curing and protection**
- Water curing is not recommended when freezing is imminent. Use membrane curing compounds or impervious paper and plastic sheets on slabs.
- Thermal cracking can occur when the surface-to-core difference exceeds about 20°C (35°F). Remove protection gradually.
- Keep forms in place 1 to 7 days depending on strength gain, conditions and expected loads. Use field-cured cylinders or nondestructive methods to estimate in-place strength before stripping or loading.
- Under ASTM C31, store acceptance cylinders at 16 to 27°C (60 to 80°F) for the first 24 to 48 hours, in insulated boxes with a min/max thermometer.

**Common mistakes**
- Pouring on a frozen subgrade.
- Pulling blankets off on a cold morning and shocking the slab.
- Leaving test cylinders out overnight, then arguing about low breaks.

**Sources** (checked October 9, 2026)
- NRMCA, CIP 27 Cold Weather Concreting (PDF): https://www.nrmca.org/wp-content/uploads/2021/01/27pr.pdf
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  541, 'approved', true, true, 'guide:D9'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'concrete-structure' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g27526fcee', c.id, p.user_id, 'discussion', $guide$Ontario snow and ice slip claims: the 60-day notice rule and what to put in your snow contract$guide$, 'ontario-snow-and-ice-slip-claims-the-60-day-notice-rule-and-what-to-pu',
  $guide$What this covers: section 6.1 of Ontario's Occupiers' Liability Act and what it means for property managers and snow contractors, plus a practical snow contract checklist.

**The rule (s. 6.1)**
- No lawsuit for personal injury caused by snow or ice can be brought against an occupier, or against an independent contractor hired by the occupier to remove snow or ice, unless written notice of the claim is given within 60 days after the injury.
- The notice must include the date, time and location of the incident.
- It must be personally served on, or sent by registered mail to, at least one occupier or snow contractor.
- The section was added by S.O. 2020, c. 33.

**Exceptions**
- Missing notice does not bar the claim if the injured person died as a result of the injury.
- A judge can let a claim proceed despite missing or insufficient notice if there is a reasonable excuse and the defendant is not prejudiced in its defence.

**Duties when you receive a notice**
- An occupier that receives a notice must serve a copy, personally or by registered mail, on other occupiers of the premises at the time and on any snow contractor it hired for that period (s. 6.1(3)).
- A snow contractor that receives a notice must serve a copy the same way on the occupier that hired it (s. 6.1(4)).
- Notice given to any one listed person satisfies the 60-day rule even for a defendant who did not originally receive it (s. 6.1(7)).

**What this means in practice**
- The 60-day window is short, but claims can still arrive later through the exceptions. Keep records well beyond 60 days.
- Decide who in your company signs for registered mail and where it goes next.
- Put the forwarding duty in the contract with a short deadline.

**Snow contract checklist (common practice)**
- Site map: areas, priorities, entrances, ramps, no-salt zones, piling areas.
- Triggers: snow depth for plowing, and conditions that start salting (for example freezing rain at any depth).
- Service standard: time to clear after a trigger, re-visits during a storm, post-storm cleanup.
- Who monitors conditions and who can call the contractor out.
- Logs for every visit: arrival and departure, areas done, material and quantity, weather and surface conditions, photos. GPS records if available.
- Salt: product, application approach, storage on site.
- Insurance: liability limits, additional insured wording, certificate before the season starts.
- Claim notice clause: each party forwards any notice to the other within a set number of days.
- Record retention: a period well beyond the 60 days.
- Pricing model: seasonal, per event, per push or time and materials, and what counts as an event.

**Common mistakes**
- No logs for the day of the fall.
- Contractor and property manager each assuming the other forwarded the notice.
- "As needed" service with no trigger or response time.

**Sources** (checked October 9, 2026)
- Occupiers' Liability Act, R.S.O. 1990, c. O.2, s. 6.1: https://www.ontario.ca/laws/statute/90o02
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  540, 'approved', true, true, 'guide:D10'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'landscaping-snow' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gfa056c3c1', c.id, p.user_id, 'discussion', $guide$Salt use on commercial lots: the federal road salt code, Smart About Salt certification and record-keeping$guide$, 'salt-use-on-commercial-lots-the-federal-road-salt-code-smart-about-sal',
  $guide$What this covers: who the federal road salt code applies to, what Smart About Salt certification is, and a simple record system for lots and walkways.

**Federal Code of Practice for the Environmental Management of Road Salts**
- Environment and Climate Change Canada says the Code applies to organizations that use more than 500 tonnes of road salt a year (5-year rolling average), and to organizations with areas vulnerable to road salt.
- It does not apply to road salt used for domestic, private or institutional purposes, and its preface says it does not address salt use on parking lots and private properties.
- Covered organizations should prepare and implement a salt management plan covering storage, application and snow disposal, a training program, response to uncontrolled releases, monitoring, record-keeping (records kept 7 years) and a yearly review.
- Organizations that hire contractors should make sure those contractors follow the plan measures for their work.
So for a private lot the Code is not your rulebook, but it is a good template. If you plow or salt for a municipality, your client may be covered and may pass its plan requirements to you.

**Smart About Salt certification**
- The Smart About Salt Council certifies winter maintenance contractors (Certified Contractor) and properties (Certified Site).
- Eligible sites include institutional properties, multi-unit residential buildings such as condominiums, apartments and townhouse complexes, and industrial and commercial properties.
- Certification requires the "Essentials of Salt Management" training (for contractors, completed within the past five years), an application form and a self-assessment.
- To keep certification, an annual report is required and random program verifications may be done.
- An individual who passed the training test is a Trained Operator, which is not the same as a Certified Contractor.
- The Council lists benefits such as insurance premium discounts and qualifying for client contracts. Confirm with your own insurer and client.

**Record-keeping that holds up (common practice)**
For every visit:
- date, arrival and departure times, crew
- weather and surface conditions on arrival
- areas plowed, salted or both
- product and quantity applied (weight, or spreader setting and passes)
- timestamped photos
- hazards noted, such as icing from downspouts or poor drainage
Monthly:
- totals by product and site, set against the storms that month
Storage:
- covered, on a hard surface, away from drains

**For property managers**
- Ask bidders whether they are a Certified Contractor or only have trained operators.
- Ask for sample logs with the bid.
- Mark no-salt and reduced-salt zones (planting beds, new concrete) on the site map.

**Common mistakes**
- Treating heavier salting as a substitute for records.
- Logging "salted lot" with no quantity or time.
- Assuming one trained operator makes the company certified.

**Sources** (checked October 9, 2026)
- ECCC, Code of practice for the environmental management of road salts: https://www.canada.ca/en/environment-climate-change/services/pollutants/road-salts/code-practice-environmental-management.html
- Smart About Salt Council, Certification: https://smartaboutsalt.com/certification/
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  511, 'approved', true, true, 'guide:D11'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'landscaping-snow' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g5a126a584', c.id, p.user_id, 'discussion', $guide$WHMIS for cleaning crews: supplier labels, decanted bottles, SDS access and training$guide$, 'whmis-for-cleaning-crews-supplier-labels-decanted-bottles-sds-access-a',
  $guide$What this covers: the WHMIS basics a cleaning or janitorial contractor needs on a commercial site: supplier labels, workplace labels when you decant, safety data sheets (SDS) and worker training. Examples use Ontario rules. Other provinces follow the same national model, but details vary.

**The four parts of WHMIS**
CCOHS lists them as hazard classification, supplier labels, safety data sheets and worker education and training. Suppliers classify products and provide labels and SDSs. Employers train workers, keep labels in place, make current SDSs available and prepare workplace labels where needed. Workers take the training and follow the label and SDS.

**Supplier labels**
- Every hazardous product container received from a supplier must have a supplier label.
- Do not alter a supplier label while product remains in the container.
- If a label becomes illegible or comes off, replace it with a supplier label or a workplace label.

**Workplace labels: the decanting rule**
Cleaning crews decant concentrate into spray bottles and buckets all the time. In Ontario, if a hazardous product is moved into another container, that container needs a workplace label. A workplace label shows the product identifier (matching the SDS), safe handling information, and that an SDS is available.

Ontario's exception for portable containers is narrow. No label is needed if the container is filled from a labelled container and either the product is used immediately, or it stays under the control of the worker who filled it, is used only during that shift, and the contents are clearly identified. CCOHS notes the container must still be identified with the product name.

**Safety data sheets**
In Ontario, the employer must obtain a supplier SDS for each hazardous product, make a copy of every current SDS available in the workplace for workers to examine, and make it readily available to workers who may be exposed. An electronic copy counts.

**Worker education**
Ontario requires instruction on:
- what labels must contain and what the information means
- what SDSs must contain and what the information means
- safe use, storage, handling and disposal
- what to do in an emergency involving the product
The program must work in practice, so far as reasonably practicable, so workers can actually use the information to protect themselves.

**Consumer products**
CCOHS notes that consumer products are excluded from WHMIS labelling and SDS requirements, but workers still need training on health effects, safe use and storage. Many retail cleaners fall here. Do not skip the training because the bottle has no WHMIS pictogram.

**Site checklist**
- Binder or tablet with current SDSs for every product on the cart.
- Workplace labels or a label printer for decanted bottles.
- Training record for each cleaner, including new hires.
- Never mix products unless the label or SDS allows it.

**Common mistakes**
- Unlabelled spray bottles left on a cart overnight.
- Outdated SDS versions.
- Training once at hire and never again when products change.

**Sources** (checked October 9, 2026)
- CCOHS, WHMIS general: https://www.ccohs.ca/oshanswers/chemicals/whmis_ghs/general.html
- CCOHS, WHMIS labels: https://www.ccohs.ca/oshanswers/chemicals/whmis_ghs/labels.html
- Ontario, R.R.O. 1990, Reg. 860 (WHMIS) (e-Laws): https://www.ontario.ca/laws/regulation/900860
- Occupational Health and Safety Act, s. 38 (e-Laws): https://www.ontario.ca/laws/statute/90o01

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  570, 'approved', true, true, 'guide:C9'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'cleaning-janitorial' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g1e40e80fb', c.id, p.user_id, 'discussion', $guide$Ontario contract cleaning bids: building services provider rules under the Employment Standards Act$guide$, 'ontario-contract-cleaning-bids-building-services-provider-rules-under',
  $guide$What this covers: what Ontario's Employment Standards Act, 2000 (ESA) says when a cleaning, security or food services contract changes hands, and what owners, managers and bidders need to do. The rules are in Part XIX (sections 75 to 78) and section 10 of the ESA.

**Who is a building services provider**
The ESA defines building services as food, security and cleaning services for a building, plus any prescribed services. Ontario's ESA guide says property management, parking garage, parking lot and concession stand services can also count when they relate to a building, its occupants and visitors. An owner or manager who provides these services in-house is also a provider.

**When a new provider takes over**
- The new provider does not have to hire the old provider's staff.
- If it does not, it must generally comply with the termination and severance rules (Part XV) for employees of the old provider who worked at the premises, as if it had terminated them itself (s. 75).
- Ontario's guide lists exceptions, including employees who keep working for the previous provider, who did not mainly work at the premises in the 13 weeks before the switch, who did not work there at least 13 of the previous 26 weeks, or who refuse a reasonable job offer from the new provider. Some of these employees may be owed termination pay by the previous provider instead.
- If the new provider hires an employee of the old one, the employment is treated as continuous, unless the hire is more than 13 weeks after the earlier of the employee's last day and the day the new provider started (s. 10).
- The departing provider must pay accrued vacation pay within the later of seven days after employment ends or the next regular pay day (s. 76).

**What the owner or manager must provide**
When asked, the owner or manager must give a prospective provider prescribed information about the employees working at the premises (s. 77). Ontario's guide lists:
- job classification or description
- wage rate actually paid
- benefits, with cost and benefit period
- regular hours, or non-overtime hours for each of the last 13 weeks if hours vary
- hire date and any service credited under continuity rules
- weeks worked at the premises in the last 26 weeks
- whether the 13-week exceptions apply to each employee
Names, home addresses and phone numbers are available only to the provider that actually takes over.
The owner or manager can require the current provider to supply this information (s. 77(3)). Anyone who receives it may use it only to comply with or assess obligations under this Part, and must not disclose it except as allowed (s. 78).

**For bidders**
- Ask for the section 77 information with the RFP. Without it you cannot price the termination and severance exposure if you bring your own crew.
- Price both scenarios: hiring the current staff, or not.

**For property managers running the RFP**
- Get the information from the current provider early.
- Release it only to bidders, with a confidentiality note.

**Common mistakes**
- RFPs that ignore the incumbent staff, so the low bid grows later.
- Sending employee names to every bidder.

**Sources** (checked October 9, 2026)
- Employment Standards Act, 2000 (s. 1 definitions, s. 10, Part XIX): https://www.ontario.ca/laws/statute/00e41
- Ontario, Your guide to the ESA: Building services providers: https://www.ontario.ca/document/your-guide-employment-standards-act-0/building-services-providers
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  598, 'approved', true, true, 'guide:D12'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'cleaning-janitorial' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g6eea5ce19', c.id, p.user_id, 'discussion', $guide$Workers' comp clearances by province: how to check a contractor in Ontario, Alberta, B.C. and Québec$guide$, 'workers-comp-clearances-by-province-how-to-check-a-contractor-in-ontar',
  $guide$What this covers: how to confirm a contractor's workers' compensation account is in good standing in Ontario, Alberta, B.C. and Québec, and what each board says about your exposure if you skip the check.

**Why it matters**
In all four provinces, the board can look to the business that hired the contractor for premiums the contractor did not pay. A clearance (or attestation in Québec) is how you close that gap. Check before work starts, again on long jobs, and before final payment.

**Ontario: WSIB clearance certificate**
- Look it up yourself through WSIB's quick access clearances service, linked from the WSIB clearances page. WSIB says no login is needed.
- A clearance is valid for up to 90 days, depending on its issue date. Long jobs need renewals.
- WSIB's construction policy: get the clearance before construction work begins, get a new one if it expires or is revoked, and keep clearance records for at least three years.
- WSIB policy says it is an offence for a principal not to obtain a clearance before a contractor begins construction work.
- Without a valid clearance, WSIB policy says the principal may be liable for the contractor's unpaid amounts, up to the value of the labour portion of the contract.

**Alberta: WCB-Alberta clearance letter**
- Request it through myWCB or the clearance request link on WCB-Alberta's contractor coverage page, or ask the contractor for one.
- The letter shows who is covered, the industry the coverage is in, and whether the account is in good standing.
- WCB-Alberta suggests checking before work starts, during the contract and before final payment. It warns that paying a contractor with an outstanding balance can make you responsible for those premiums.

**British Columbia: WorkSafeBC clearance letter**
- Use WorkSafeBC's clearance letter application. Search by account number or exact legal or trade name, up to 150 firms at once.
- If you are the prime contractor, the letter must be addressed to you to be honoured.
- WorkSafeBC says you could be liable for premiums on work done for you by a registered subcontractor who is not paying. It recommends a letter before the subcontractor starts and again after the work ends. Its Clearance Alert tool emails you when a listed firm's status changes.

**Québec: CNESST attestation de conformité**
- The CNESST has three services: a validation (before the contract, requested by the contractor only), status follow-up (during the contract) and the attestation de conformité (at the end of each contract).
- Only the attestation releases the donneur d'ouvrage from possible liability for the contractor's contribution. The CNESST validation form says a validation does not.
- Request it through MonEspace CNESST. When the donneur d'ouvrage asks, the contractor has 14 days to confirm or object to the contract details.
- CNESST says the amount you could be asked to pay is calculated from the labour cost of your contract.

**Common mistakes**
- Checking once at signing and never again on a multi-month job.
- Relying on a forwarded copy instead of pulling the clearance from the board's own system.
- In B.C., filing a letter that is addressed to another company.
- In Québec, treating a validation as if it were the end-of-contract attestation.
- Forgetting subcontractors. Ask your contractor how it checks its own subs.

**Sources** (checked October 9, 2026)
- WSIB, Clearances: https://www.wsib.ca/en/clearances
- WSIB policy, Clearance Certificate: https://www.wsib.ca/en/operational-policy-manual/clearance-certificate
- WSIB policy, Clearance Certificate in Construction: https://www.wsib.ca/en/operational-policy-manual/clearance-certificate-construction
- WCB-Alberta, Coverage for contractors and subcontractors: https://wcb.ab.ca/insurance-and-premiums/types-of-coverage/coverage-for-contractors-and-subcontractors.html
- WorkSafeBC, Why get a clearance letter: https://www.worksafebc.com/en/insurance/why-clearance-letter
- WorkSafeBC, Get a clearance letter: https://www.worksafebc.com/en/insurance/why-clearance-letter/get-clearance-letter
- CNESST, Services de vérification de conformité: https://www.cnesst.gouv.qc.ca/fr/demarches-formulaires/employeurs/assurance-sante-securite-travail/gestion-dossier-dassurance/conformite/services-verification-conformite
- CNESST, Paiement de la cotisation due par un autre employeur: https://www.cnesst.gouv.qc.ca/fr/demarches-formulaires/employeurs/dossier-dassurance-lemployeur/conformite/paiement-cotisation-due-autre-employeur
- CNESST, Demande de validation de conformité (form): https://www.cnesst.gouv.qc.ca/sites/default/files/documents/validation-conformite_0.pdf

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  709, 'approved', true, true, 'guide:C1'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'property-managers' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g650735e4c', c.id, p.user_id, 'discussion', $guide$Writing an RFP contractors will actually bid on: an 8-part checklist for property managers and condo boards$guide$, 'writing-an-rfp-contractors-will-actually-bid-on-an-8-part-checklist-fo',
  $guide$This is a checklist for property managers and condo boards writing an RFP or tender for building work. Most of it is practice. Where we cite public procurement rules, treat them as a benchmark; private owners set their own rules.

**1. A scope that can be priced**
- Describe the result you want and the work, with quantities where you can.
- Attach drawings, photos, past reports and equipment lists.
- Say what is excluded and what the owner supplies.
- If you want options, ask for them as separate prices.

**2. Site access**
- Hold a site visit and say clearly whether it is mandatory. Public buyers who make visits mandatory reject bidders who miss them, so only make it mandatory if you will enforce it.
- State working hours, noise limits, elevator booking, parking, keys and resident notices.

**3. Insurance and workers' compensation**
- State the liability limit and any additional insured wording you need.
- In Ontario, ask for a WSIB clearance certificate. For construction work, the principal must have one before work begins and for the whole job. It is valid for up to 90 days and can be renewed. Without one, a principal may be liable for a contractor's unpaid premiums up to the labour portion of the contract.
- In other provinces, ask for proof of coverage from the provincial workers' compensation board.

**4. A realistic schedule**
List the issue date, site visit, question deadline, closing, award and work window. Give bidders time to price. As a benchmark, Ontario's broader public sector buyers must allow at least 15 calendar days for open competitions from $139,000 up to $368,000, and should consider 30 days for complex or high-value work. They must also close on a normal working day.

**5. One pricing form**
Give a form so bids compare like for like: lump sum, unit rates, separate prices, allowances, taxes shown separately and how long the price holds.

**6. Evaluation stated up front**
Say whether you will choose the lowest compliant price or best value. Federal guidance describes both: lowest price ranks compliant bids by price, and best value often uses the lowest compliant cost per technical point. If you use points, publish the criteria and weights.

**7. One contact, one question deadline**
Name one contact. Set a deadline for questions. Federal practice is to compile all questions and answers and send them to every bidder as an amendment, so nobody has information the others lack. Do the same.

**8. Close the loop**
Tell unsuccessful bidders who won and, if they ask, why they lost. It costs little and keeps good contractors bidding on your next job.

**Common mistakes**
- "Scope to be confirmed on site."
- A five-day turnaround on a complex job.
- Answering one bidder's question by phone and not telling the others.
- No pricing form, so every bid is built differently.

PMRFP lists open public tenders at https://pmrfp.com/rfps, which can also help you see how public buyers write theirs.

**Sources** (checked October 9, 2026)
- WSIB policy, Clearance certificate in construction: https://www.wsib.ca/en/operational-policy-manual/clearance-certificate-construction
- WSIB policy, Clearance certificate: https://www.wsib.ca/en/operational-policy-manual/clearance-certificate
- Ontario BPS Procurement Directive (effective April 13, 2026): https://www.ontario.ca/files/2026-03/bps-procurement-directive-en-2026-04-13.pdf
- CanadaBuys, Checklist for preparing a bid: https://canadabuys.canada.ca/en/support/checklist-preparing-bid
- CanadaBuys, Bidding and contract award: https://canadabuys.canada.ca/en/how-procurement-works/procurement-process/bidding-and-contract-award
- Example federal solicitation 23-58049 (NRC) on CanadaBuys: https://canadabuys.canada.ca/sites/default/files/webform/tender_notice/8134/23-58049_rfp_landscapinggroundsmaintenancesnowremoval.pdf

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  621, 'approved', true, true, 'guide:B12'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'property-managers' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gf8d9e85b0', c.id, p.user_id, 'discussion', $guide$How many quotes is enough? Public procurement thresholds (Ontario BPS, CFTA 2026-2027) as a benchmark$guide$, 'how-many-quotes-is-enough-public-procurement-thresholds-ontario-bps-cf',
  $guide$There is no single legal number of quotes for private owners. Public buyers do have written thresholds, and they make a useful yardstick when a property manager or condo board writes its own purchasing policy.

**Ontario broader public sector**
The BPS Procurement Directive (effective April 13, 2026) applies to designated broader public sector organizations such as hospitals, school boards, universities, colleges and children's aid societies. For goods, non-consulting services and construction it sets:
- under $100: petty cash (recommended)
- $100 to under $3,000: procurement card (recommended)
- $3,000 to under $10,000: purchase order (recommended)
- $10,000 to under $139,000: invitational competition with at least three suppliers invited (recommended)
- $139,000 or more: open competitive process (required)
Consulting services must be competed at any value. Splitting a purchase to get under a threshold is not allowed. Open competitions from $139,000 up to $368,000 must give bidders at least 15 calendar days.

Municipalities are not on that list. They follow their own purchasing by-laws. Toronto's, for example, is Chapter 195 of its Municipal Code.

**Canadian Free Trade Agreement thresholds, 2026 and 2027**
The CFTA sets the values at which public procurement becomes "covered" by its rules (January 1, 2026 to December 31, 2027):
- Federal and provincial departments and agencies: goods $34,700; services $139,000; construction $139,000.
- Municipalities, school boards and publicly funded academic, health and social service bodies: goods or services $139,000; construction $347,400.
- Crown corporations and government enterprises: goods or services $694,700; construction $6,943,900.
These thresholds are updated periodically. Check the current set before you rely on them.

**What this means for condos and private owners**
Condo corporations, landlords and private owners set their own rules. Check your declaration, by-laws, board policy and management agreement first. A simple policy modelled on the public approach:
- Small, routine work: one quote from a vetted vendor, with a dollar cap.
- Mid-size work: at least three written quotes on the same scope.
- Large or capital work: a formal RFP or tender, with a written scope, pricing form and evaluation method.
Pick dollar cut-offs that fit your building's budget and write them down.

**Tips**
- Three quotes only help if all three price the same scope.
- Record why you chose the winner, especially if it was not the lowest price.
- Do not split a job to stay under your own threshold. Public rules ban it for good reason.
- Revisit your cut-offs every couple of years, the way public thresholds are revised.

PMRFP lists public tenders at https://pmrfp.com/rfps if you want to see how public buyers scope similar work.

**Sources** (checked October 9, 2026)
- Ontario BPS Procurement Directive (effective April 13, 2026): https://www.ontario.ca/files/2026-03/bps-procurement-directive-en-2026-04-13.pdf
- CFTA Article 504.3 thresholds, effective January 1, 2026: https://www.cfta-alec.ca/wp-content/uploads/2025/11/Article-504.3-Covered-Procurement-Thresholds-Effective-January-1-2026.pdf
- CFTA Secretariat, Covered procurement thresholds: https://www.cfta-alec.ca/procurement/covered-procurement-thresholds/
- Treasury Board, Contracting Policy Notice 2025-8: https://www.canada.ca/en/treasury-board-secretariat/services/policy-notice/2025-8.html
- City of Toronto, Bidding on solicitations (Chapter 195): https://www.toronto.ca/business-economy/doing-business-with-the-city/searching-bidding-on-city-contracts/bidding-on-solicitations/

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  555, 'approved', true, true, 'guide:B13'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'property-managers' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'ga477fb299', c.id, p.user_id, 'discussion', $guide$Condo boards: a 5-step check before you sign a contractor (Ontario)$guide$, 'condo-boards-a-5-step-check-before-you-sign-a-contractor-ontario',
  $guide$What this covers: five checks an Ontario condo board can run before signing a contractor. Strata and syndicate boards in other provinces face different rules, but the same checks are a sound starting point.

Directors must act honestly and in good faith and use the care, diligence and skill of a reasonably prudent person (Condominium Act, 1998, s. 37). A documented vetting file is how you show that.

**Step 1: Licence or registration, where the work requires it**
Some trades cannot legally work without one. Check the regulator's own lookup, not the contractor's letterhead.
- Electrical: the company must be a Licensed Electrical Contractor. ESA says most electrical work needs a notification filed with ESA, even if you have an electrician on staff.
- Gas appliances (boilers, furnaces, water heaters): look the company up in TSSA's Registered Fuels Contractor tool.
- Compulsory trades such as electrician, plumber, refrigeration mechanic and sheet metal worker: workers can be checked on the Skilled Trades Ontario public register.

**Step 2: Insurance certificate**
The CMRAO, which licenses condo managers, advises managers to collect insurance and bonding documents when prequalifying vendors. Ask for a current certificate of insurance and read the dates and limits. Whether the corporation should be named as an additional insured, and what limits fit the job, is a question for your insurance broker and condo lawyer. Write the answer into the RFP.

**Step 3: Workers' compensation clearance**
Look up the contractor's WSIB clearance yourself. A clearance is valid for up to 90 days. For construction work, WSIB policy says the principal should get one before work begins, renew it if it lapses and keep records for three years. Without one, WSIB policy says the principal may be liable for unpaid premiums up to the labour portion of the contract.

**Step 4: References and past work**
The CMRAO guide lists examples of past projects (ideally in condos) and client references among the items to collect. Call at least two. Ask about schedule, change orders and how deficiencies were handled.

**Step 5: A written contract with a clear scope**
The CMRAO guide's procurement tips are: define clear requirements, use standard evaluation criteria, get at least three quotes, keep documentation and encourage competitive bidding. It also says that if the corporation decides to skip multiple quotes, that decision should be recorded in the board minutes. Make sure the signed contract matches the scope you tendered, with price, schedule, payment terms and warranty in writing.

**Common mistakes**
- Accepting a licence number on an invoice without checking the regulator's lookup.
- Filing an insurance certificate that expires mid-job.
- Pulling a WSIB clearance once on a project that runs four months.
- Comparing quotes that priced different scopes.
- Approving a sole-source contract without minuting why.

**Sources** (checked October 9, 2026)
- Condominium Act, 1998, s. 37 (e-Laws): https://www.ontario.ca/laws/statute/98c19
- CMRAO, Procurement and Contractor Oversight practice guide: https://www.cmrao.ca/wp-content/uploads/2025/08/Procurement-and-Contractor-Oversight-Practice-Guide.pdf
- WSIB, Clearances: https://www.wsib.ca/en/clearances
- WSIB policy, Clearance Certificate in Construction: https://www.wsib.ca/en/operational-policy-manual/clearance-certificate-construction
- ESA, Property Owner and Manager Obligations: https://esasafe.com/business-and-property-owners/property-owner-obligations/
- TSSA, Registered Fuels Contractor lookup: https://www.tssa.org/fuels-contractor
- Skilled Trades Ontario, Public Register: https://www.skilledtradesontario.ca/public-register/

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  571, 'approved', true, true, 'guide:C2'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'condo-boards' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g6da0391ce', c.id, p.user_id, 'discussion', $guide$Ontario condo reserve fund studies: types, the 3-year cycle, who can do them, and the notice to owners$guide$, 'ontario-condo-reserve-fund-studies-types-the-3-year-cycle-who-can-do-t',
  $guide$What this covers: the reserve fund study rules in the Condominium Act, 1998 (s. 94) and O. Reg. 48/01 (ss. 27 to 33), for boards, managers and the consultants who bid on studies.

**Three classes of study (O. Reg. 48/01, s. 28)**
- Comprehensive study
- Updated study based on a site inspection
- Updated study not based on a site inspection

**The cycle (s. 31)**
- A new corporation's first study is due within the year after its declaration and description are registered, and must be comprehensive.
- After that, a study is required within every three years of completing the previous one.
- The class depends on the last study. After a comprehensive study or a site-inspection update, the next can be an update without a site inspection. After an update without a site inspection, the next must be a site-inspection update. A comprehensive study is always allowed.

**What a study contains (s. 29)**
- Physical analysis: a component inventory of items expected to need major repair or replacement within at least 30 years, where replacement costs at least $500, with age, normal life, remaining life and estimated cost.
- Financial analysis: the fund's current status and a recommended funding plan over at least 30 years, with inflation and interest assumptions, contributions and closing balances.
- Site-inspection studies also review warranties, service contracts, as-built plans, specifications and maintenance records (s. 30).

**Who can do it (s. 32)**
Prescribed classes include AACI-designated appraisers, architects with a certificate of practice, OACETT certified engineering technologists, REIC certified reserve planners, holders of a certificate of authorization under the Professional Engineers Act, CIQS professional quantity surveyors, AATO architectural technologists, and certain Ryerson University architectural science graduates.
The person cannot be a director, officer or property manager of the corporation, an owner, a resident of the property, or a spouse or child of a director or officer.
They must carry errors and omissions insurance of at least $1 million per occurrence and $2 million aggregate per year (or automatic reinstatement), with a deductible of no more than $3,500, kept valid for at least three years after the study.

**After the study (Act, s. 94)**
- The study's cost is a common expense the board may charge to the reserve fund.
- Within 120 days of receiving the study, the board must review it and propose a plan for future funding.
- Within 15 days of proposing the plan, the board must send owners a notice with a summary of the study, a summary of the plan, and where the plan differs from the study, and send copies to the auditor.
- The notice must use the form specified by the Condominium Authority of Ontario (O. Reg. 48/01, s. 33(3)).
- The board implements the plan 30 days after sending the notice.
- For most corporations, the plan must make the fund adequate by the fiscal year after the year the study is completed (s. 33(1)).

**For firms bidding on studies**
- Confirm which class is due from the last study.
- Ask up front for the last study, the last notice to owners, the financial statements and the maintenance records. The regulation requires the preparer to review them.

**Common mistakes**
- Missing the 120-day or 15-day deadlines.
- Hiring a preparer with a conflict, such as an owner in the building.
- Two updates without a site inspection in a row.

**Sources** (checked October 9, 2026)
- Condominium Act, 1998, s. 94: https://www.ontario.ca/laws/statute/98c19
- O. Reg. 48/01, ss. 27 to 33: https://www.ontario.ca/laws/regulation/010048
General information, not legal or engineering advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  626, 'approved', true, true, 'guide:D13'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'condo-boards' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g2ee7654fe', c.id, p.user_id, 'discussion', $guide$Bid bonds, performance bonds and labour and material payment bonds: what each covers and typical amounts$guide$, 'bid-bonds-performance-bonds-and-labour-and-material-payment-bonds-what',
  $guide$This explains the three surety bonds you see most on Canadian construction tenders, and the amounts that official forms and rules actually set.

**The three bonds**
- Bid bond. CCDC 220 describes it as guaranteeing the bidder's intention to enter into a formal contract. If your bid is accepted, you sign the contract and provide the contract security the tender asks for.
- Performance bond. CCDC 221 guarantees performance of the contract by the contractor. If the contractor defaults, the surety steps in.
- Labour and material payment bond. CCDC 222 guarantees the contractor will meet its labour and material payment obligations on the job. It protects sub-trades and suppliers.

**What the federal forms say**
Bid Bond (PWGSC-TPSGC 504):
- 10% of the total bid amount, up to $2,000,000.
- If accepted, the bidder must sign within the set time and furnish a performance bond and a labour and material payment bond, each for 50% of the contract price, or other security acceptable to the Crown.
- If the bidder does not, the bond covers the extra cost of contracting with someone else, up to the bond amount.

Performance Bond (505): if the Crown declares the contractor in default, the surety either remedies the default, completes the work, or pays the excess cost of completion, depending on what the Crown does.

Labour and Material Payment Bond (506):
- A claimant is a party with a direct contract with the contractor or one of its subcontractors for labour or materials. Parties further down the chain have narrower rights.
- A claimant can claim if unpaid 90 days after its last work or supply.
- Written notice is due within 120 days.
- No suit can start more than one year after the contractor stopped work on the contract.

**Ontario public work**
Under Ontario's Construction Act and its General regulation, a public contract (Crown, municipality or broader public sector owner) of $500,000 or more needs both a performance bond and a labour and material payment bond in the prescribed form. Minimum coverage for each is 50% of the contract price. Above $500 million, the owner sets the coverage at no less than $250 million. Owners can still ask for other security.

**Sub-trade bid depositories**
Depositories can have their own bond rules. The Yukon Bid Depository, for example, requires a 10% bid bond on sub-bids of $1,000,000 or more to a general contractor, and disqualifies a bid with a missing or wrong bond.

**How to use this**
- Read the tender's bid security clause. The figures above are standard in those forms and rules, but each tender sets its own.
- Send your surety the tender documents early and confirm which form is required: CCDC, federal or the owner's own.
- Price the bond premium into your bid.
- Sub-trades: if the GC must provide bonds, your subcontract may require them too.

**Common mistakes**
- A bid bond in the wrong form or amount.
- Treating a payment bond as protection for the GC. It protects the people the GC owes.
- Missing the notice deadline as an unpaid sub or supplier.

**Sources** (checked October 9, 2026)
- CCDC 220, 221, 222 (2024) bond forms: https://www.ccdc.org/document/ccdc-220-221-222-2024-bond-forms/
- PSPC Bid Bond form 504: https://www.canada.ca/en/public-services-procurement/services/acquisitions/forms/bid-bond-504.html
- PSPC Performance Bond form 505: https://www.canada.ca/en/public-services-procurement/services/acquisitions/forms/performance-bond-505.html
- PSPC Labour and Material Payment Bond form 506: https://www.canada.ca/en/public-services-procurement/services/acquisitions/forms/labour-material-payment-bond-506.html
- Ontario Construction Act, s. 85.1: https://www.ontario.ca/laws/statute/90c30
- Ontario Regulation 304/18 (General), ss. 12 and 12.1: https://www.ontario.ca/laws/regulation/180304
- Yukon Contractors Association, Bid Depository Rules of Procedure (2023): https://yukoncontractors.ca/wp-content/uploads/2025/03/rules-of-procedures-2023-fnl-march-1-2023.pdf

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  661, 'approved', true, true, 'guide:B9'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'general-contractors' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g8ae962b1a', c.id, p.user_id, 'discussion', $guide$Federal prompt payment for construction: which contracts it covers, the 28/35/42-day clock and adjudication$guide$, 'federal-prompt-payment-for-construction-which-contracts-it-covers-the',
  $guide$This covers the federal Prompt Payment for Construction Work Act: which jobs it applies to, the payment clock, and adjudication. It applies to construction on federal property, so it matters if you bid federal work directly or work under a federal service provider.

**In force and scope**
- In force since December 9, 2023 (S.C. 2019, c. 29, s. 387).
- It applies to the federal Crown, service providers and every contractor and subcontractor doing construction work for a project on federal real property or federal immovables in Canada (s. 5).
- "Construction project" covers additions, alterations, capital repair or restoration, construction and installation, and demolition (s. 2). Routine maintenance to prevent normal deterioration is not "capital repair" (s. 2).
- For one year after it came into force, it did not apply to contracts already signed before that date (s. 25). That transition has now ended.
- Before signing, the federal payer must tell you the contract is subject to the Act, and each contractor must tell its subs (s. 8).

**Payment timeline (counted from when the federal payer receives the proper invoice)**
- Contractor invoices monthly or as the contract says (s. 9(1)).
- Day 21: last day for the federal payer to give a notice of non-payment (s. 9(3)).
- Day 28: federal payer must pay (s. 9(2)).
- Day 28: last day for the contractor to give its subs a notice of non-payment (s. 10(3)).
- Day 35: contractor pays its subs for work covered and paid (s. 10(1)).
- Day 42: first-tier subs pay their subs; day 49 and so on in 7-day steps down the chain (s. 11).
- Saturdays, holidays, December 24 to January 1, and provincially recognized construction holidays are left out of the count (regulations, s. 3).
- A notice of non-payment must describe the work, the amount withheld and the reasons (s. 13).
- A contractor must tell any sub, on request, the date the federal payer received the invoice (s. 9(5)). Ask for it.

**Holdback and interest**
- Holdback is allowed only if the contract provides for it, and can't exceed what provincial construction law would allow. It must be paid out no later than provincial law would require (s. 12).
- Late amounts earn simple interest at the average bank rate plus 3% a year, or the contract rate if higher (Act s. 14; regulations s. 4).

**Adjudication**
- If you are not fully paid on time, you can refer the non-payment dispute to an adjudicator (s. 16(1)).
- Notice of adjudication: no later than 21 days after the later of the certificate of completion for the project or the payment deadline on the last invoice that covers your work (s. 16(2)).
- The parties appoint an adjudicator jointly, or ask the Adjudicator Authority to appoint one (s. 17). PSPC contracted ADR Chambers Inc. to provide adjudication services.
- The paying party must pay within 10 days of receiving the determination. If it does not, you may suspend work without breaching the contract and file the determination in court within two years (s. 19).
- Each side pays its own costs and half the adjudicator's fees, unless someone acted in bad faith (s. 20).

**Provincial overlap**
Ontario, Saskatchewan and Alberta are designated provinces. On federal projects there, much of the subcontract-level federal regime steps aside for the provincial one (s. 6 and the designation order). Projects that straddle provinces stay under the federal Act.

**Before you bid**
- Confirm the site is federal property and who the payer is.
- Check the holdback clause against the provincial limit.
- Diary the 21-day notice deadline for adjudication now, not at the end of the job.

**Sources** (checked October 9, 2026)
- Federal Prompt Payment for Construction Work Act (Justice Laws): https://laws-lois.justice.gc.ca/eng/acts/F-7.7/FullText.html
- Regulations (Criteria, Time Limits, Interest and Circumstances), SOR/2023-269: https://laws-lois.justice.gc.ca/eng/regulations/SOR-2023-269/FullText.html
- Order Designating Provinces, SOR/2023-270: https://laws-lois.justice.gc.ca/eng/regulations/SOR-2023-270/FullText.html
- PSPC news release, December 2023: https://www.canada.ca/en/public-services-procurement/news/2023/12/new-federal-prompt-payment-legislation-to-protect-construction-workers.html

General information, not legal advice. Rules change; confirm with the source or a lawyer before you rely on it. Questions or corrections? Reply below.$guide$,
  716, 'approved', true, true, 'guide:A4'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'general-contractors' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g8519ff84f', c.id, p.user_id, 'discussion', $guide$Prequalification: what CCDC 11 (Contractor's Qualification Statement) asks for, plus a checklist to keep ready$guide$, 'prequalification-what-ccdc-11-contractor-s-qualification-statement-ask',
  $guide$This covers CCDC 11, the standard Contractor's Qualification Statement used in Canadian prequalification, and a checklist so you can answer a prequalification fast.

**What CCDC 11 is**
CCDC 11 (current edition 2019) is a standard form for contractors to give owners information about their company, capacity, skill and experience. CCDC points to a companion document, CCDC 29 Guide to Pre-Qualification, for recommended practice. CCDC documents are bought through authorized document outlets, and the electronic form needs a registration number to download.

**What CCDC 11 asks for** (per CCDC)
- Company information: legal structure, financial reference, contract security reference, insurance reference, and health and safety.
- Work volume: the projected value of construction work for the current year and the actual value for each of the past four years.
- Personnel: qualifications and experience of the key office and site staff you propose.
- Project experience: five relevant projects in each of three lists: key projects completed in the past five years, comparable completed projects, and key projects underway.
- Statutory declarations sworn before a commissioner. Who can take affidavits depends on your province.

**Checklist to keep ready**
Keep these current in one folder so a prequalification takes hours, not days:
- Legal name, legal structure and corporate documents.
- A bank reference contact.
- A reference letter from your surety.
- A current certificate of insurance.
- Your safety program summary and any safety certification you hold.
- Workers' compensation status. In Ontario, owners hiring for construction must get a WSIB clearance certificate before work starts, valid for up to 90 days.
- Annual construction volume for the last four years and this year's projection.
- Résumés for key office and site staff.
- Fifteen project sheets, five per list: owner, consultant, value, scope, dates and a reference.
- References who have agreed to take calls.

**How owners use it**
CCDC 29 compares several kinds of prequalification: unlimited, short-listing and source lists. It also covers checklists, evaluation, interviews and debriefing. In Ontario's broader public sector, a Request for Supplier Qualification must say that prequalification does not oblige the buyer to call on any supplier. Being prequalified gets you on a list. It does not guarantee work.

**Common mistakes**
- Listing projects that do not match the size or type being prequalified.
- References who have left the company.
- An unsigned or unsworn statutory declaration.
- Sending a generic package and ignoring the owner's own extra questions.

PMRFP lists public prequalification calls along with tenders at https://pmrfp.com/rfps.

**Sources** (checked October 9, 2026)
- CCDC 11 (2019) Contractor's Qualification Statement: https://www.ccdc.org/document/ccdc11/
- CCDC 29 (2016) Guide to Pre-Qualification: https://www.ccdc.org/document/ccdc29/
- WSIB policy, Clearance certificate in construction: https://www.wsib.ca/en/operational-policy-manual/clearance-certificate-construction
- Ontario BPS Procurement Directive (effective April 13, 2026): https://www.ontario.ca/files/2026-03/bps-procurement-directive-en-2026-04-13.pdf

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  495, 'approved', true, true, 'guide:B11'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'general-contractors' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g27857eada', c.id, p.user_id, 'discussion', $guide$How sub-trade bid depositories work: closing times, envelopes, bonds, withdrawals and GC rules$guide$, 'how-sub-trade-bid-depositories-work-closing-times-envelopes-bonds-with',
  $guide$This explains how a construction bid depository handles sub-trade bids to general contractors. We use the Yukon Bid Depository's published rules as a worked example. Rules differ by depository, so always read your local rules and the tender.

**What a bid depository does**
It is a system for receiving sealed trade contractor bids so general contractors (GCs) get firm written quotes in time to build their own tender. The Yukon rules say it protects the sanctity of bidding and gives GCs time to compile complete, accurate bids. In B.C., the BC Construction Association describes its bid depository standard as created mostly by trade contractors, supported by every construction association in B.C., and tied to a standard industry subcontract.

**Which trades go through it**
The owner's tender documents name the trade sections that must be bid through the depository. The GC's bid form then lists the trade contractors it is carrying for those sections.

**How it works in the Yukon example**
- Depository closing is at least two working days before GC closing, before 3:00 pm by the depository clock. Late sub-bids are disqualified.
- Trades must tell the depository at least 24 hours before closing that they intend to bid.
- Each sub-bid goes in a white envelope holding a sealed pink envelope (the detailed bid to the GC), a sealed grey envelope (an exact copy kept by the depository), any bid bond and the other required forms.
- Sub-bids totalling $1,000,000 or more to a GC need a 10% bid bond. Below that, the trade swears an affidavit instead.
- GCs pick up their bids between 30 minutes and 2 hours after depository closing.
- A trade can withdraw until 3 pm one working day before GC closing. Withdrawal fees start at $500 and double with each withdrawal within 12 months.
- If a GC gets no bid or only one bid for a section, it can get prices outside the depository or, under the rules, use its own forces.
- GCs must not accept changes that alter a sub-bid. They must contract with the trade they selected, unless the owner approves a substitution for a valid reason.
- If a GC does not select a bidder, it is deemed to accept the lowest compliant bid addressed to it.
- Unless stated otherwise, bids are subject to the CCA 1 subcontract (2008 or later).
- GCs keep pink envelopes for at least one year.

**Tips for trades**
- Get the depository's current rules and forms well before closing.
- Read the tender's list of depository trade sections.
- Check that your bond, affidavit and forms are in the right envelopes.

**Tips for GCs**
- Watch the bidders list for withdrawals before you select.
- Do not negotiate a sub-bid after closing. Accepting changes that alter a bid breaks the rules and can bring sanctions.

**Common mistakes**
- Treating the depository closing like the GC closing. It is earlier.
- Missing the advance notice of intent to bid.
- Withdrawing casually. It costs money and makes you ineligible on that job.

**Sources** (checked October 9, 2026)
- Yukon Contractors Association, Bid Depository Rules of Procedure (effective March 1, 2023): https://yukoncontractors.ca/wp-content/uploads/2025/03/rules-of-procedures-2023-fnl-march-1-2023.pdf
- BC Construction Association, Construction File: Procuring trade contractor bids: https://bccassn.com/portfolio-item/construction-file-procuring-trade-contractor-bids/

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  571, 'approved', true, false, 'guide:B10'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'general-contractors' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g4f66be110', c.id, p.user_id, 'discussion', $guide$Material suppliers and lien rights in Ontario, Alberta and BC: who qualifies and the deadlines$guide$, 'material-suppliers-and-lien-rights-in-ontario-alberta-and-bc-who-quali',
  $guide$For material suppliers and equipment rental firms on Ontario, Alberta and BC jobs: whether you have lien rights, how long you have, and what to keep on file.

**Ontario (Construction Act)**
- Anyone who supplies services or materials to an improvement for an owner, contractor or subcontractor has a lien (s. 14(1)). A supplier working under the contractor or a sub is a "subcontractor" under the Act, so the prompt payment rules in Part I.1 also reach you.
- "Materials" includes things that become part of the job or are used directly to make it, and equipment rented without an operator. Equipment rented with an operator counts as services (s. 1).
- Your lien arises when you first supply (s. 15).
- Deadline: 60 days after the earliest of publication of the certificate of substantial performance, your last supply, the contract ending, or your subcontract being certified complete (s. 31(3)). Then 90 more days to perfect (s. 36).
- On Crown or municipal property, the lien does not attach to the land. You give a copy of the claim to the owner instead (s. 16 and s. 34).
- You can ask the owner or contractor in writing for contract details, the state of accounts and any payment bond. They must answer within a reasonable time, no more than 21 days (s. 39).

**Alberta (Prompt Payment and Construction Lien Act)**
- A person who furnishes material to be used in an improvement for an owner, contractor or subcontractor has a lien (s. 6(1)).
- Material counts as furnished when delivered on the land, or to a nearby place the owner or contractor designates. If it ends up incorporated in the job anyway, you still have a lien (s. 9).
- Deadline: register within 60 days from the day the last material is furnished or the supply contract is abandoned. Concrete work and oil or gas well sites get 90 days (s. 41(1)).
- Fixing defective work later does not extend the time (s. 41(5)).
- A registered lien expires unless you start an action and register a certificate of lis pendens within 180 days (s. 43).
- Note: the Act's definition of "subcontractor" excludes a person engaged only in furnishing materials. Ask a lawyer how the prompt payment flow-down applies to you before relying on it.

**British Columbia (Builders Lien Act)**
- A "material supplier" is a contractor or sub who supplies only material (s. 1). Material suppliers have lien rights (s. 2(1)).
- Material must be delivered to the land and meant to become part of the job or be used up making it. Equipment rented without an operator counts (s. 1).
- If you supply material to a material supplier, for example a manufacturer selling to a distributor who then supplies the job, you have no lien (s. 2(2)).
- Deadline: 45 days after a certificate of completion for the contract or subcontract you supplied under, or otherwise 45 days after the head contract or improvement is completed, abandoned or terminated (s. 20). Claims under $200 can't be filed (s. 17).

**What to keep on file**
- A PO or credit application that names the project address and who ordered.
- Signed delivery tickets showing date, site address and what was delivered. In BC and Alberta, the delivery location matters.
- A running log of your last delivery date per job. That date often starts your clock.
- The legal description or PIN of the land and the owner's name.
- Any certificate of substantial performance or completion you hear about, and your written info requests and the replies.
- Rental agreements showing whether an operator was included.

**Common mistakes**
- Waiting for the GC's job to finish when your own deadline started at your last delivery.
- Selling through a middleman in BC and assuming you can lien.

**Sources** (checked October 9, 2026)
- Ontario Construction Act (e-Laws): https://www.ontario.ca/laws/statute/90c30
- Alberta Prompt Payment and Construction Lien Act (King's Printer): https://kings-printer.alberta.ca/documents/Acts/P26P4.pdf
- BC Builders Lien Act (BC Laws): https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/97045_01

General information, not legal advice. Rules change; confirm with the source or a lawyer before you rely on it. Questions or corrections? Reply below.$guide$,
  716, 'approved', true, true, 'guide:A6'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'suppliers-equipment' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gd5a02b17a', c.id, p.user_id, 'discussion', $guide$Paiement rapide au Québec : le projet pilote est terminé, voici le règlement en vigueur depuis 2025$guide$, 'paiement-rapide-au-quebec-le-projet-pilote-est-termine-voici-le-reglem',
  $guide$Ce guide fait le point sur le paiement rapide dans les contrats publics de construction au Québec, en date du 9 octobre 2026.

**Le projet pilote est terminé**
- Le projet pilote visant à faciliter le paiement aux entreprises parties à des contrats publics de travaux de construction a couru du 2 août 2018 au 1er août 2021 (Québec.ca).
- Il a été remplacé par un régime permanent : le Règlement sur les paiements et le règlement rapides des différends en matière de travaux de construction, en vigueur depuis le 8 septembre 2025. Les formulaires du projet pilote ne servent plus qu'aux contrats encore soumis à ses modalités.

**À quels contrats le règlement s'applique**
Il vise les contrats publics de travaux de construction des organismes publics assujettis à la Loi sur les contrats des organismes publics (LCOP), et les sous-contrats qui s'y rattachent. L'application est progressive selon la dépense prévue au contrat (art. 94) :
- Bâtiment : 750 000 $ et plus dès le 8 septembre 2025; de 75 000 $ à moins de 750 000 $ à compter du 8 septembre 2026; moins de 75 000 $ à compter du 8 septembre 2027.
- Génie civil : 2 500 000 $ et plus dès le 8 septembre 2025; de 675 000 $ à moins de 2 500 000 $ à compter du 8 septembre 2026; moins de 675 000 $ à compter du 8 septembre 2027.
- Les contrats déjà en cours, et ceux issus d'appels d'offres lancés avant la date applicable, ne sont pas visés, pas plus que leurs sous-contrats (art. 90).
- Sont exclus notamment les contrats conclus en situation d'urgence pour la sécurité des personnes ou des biens (art. 32).

**Le calendrier mensuel**
- Demande de paiement : l'entrepreneur général l'envoie à l'organisme public le 1er du mois; un sous-traitant l'envoie au plus tard le 25 du mois (art. 5).
- Refus : l'organisme public doit refuser par écrit au plus tard le 21 du mois de réception; l'entrepreneur général, au plus tard le dernier jour du mois; un sous-traitant, la veille de l'envoi de sa propre demande (art. 10). L'avis indique le montant refusé, les travaux visés et des motifs assez détaillés (art. 11).
- Paiement : l'organisme public paie au plus tard le dernier jour du mois de réception (art. 15).
- Exemple du guide du Conseil du trésor : l'organisme paie l'entrepreneur général le 31 mai, l'entrepreneur paie ses sous-traitants au plus tard le 5 juin, et ceux-ci paient les leurs au plus tard le 10 juin. On ajoute 5 jours par niveau supplémentaire.
- Un changement dont la valeur n'est pas encore convenue ne peut pas, à lui seul, justifier un refus de payer les travaux faits (art. 12).
- Intérêts : le plus élevé du taux légal et du taux prévu au contrat (art. 3).

**Différends : le tiers décideur**
- Il faut d'abord avoir tenté un règlement à l'amiable (art. 34).
- La demande d'intervention doit être notifiée au plus tard 90 jours après l'acceptation de l'ouvrage sans réserve, ou après que l'organisme se déclare satisfait des corrections (art. 35).
- Le tiers décideur, inscrit au registre tenu par le ministre de la Justice, rend sa décision dans les 50 jours de sa désignation, avec une prolongation possible de 15 jours (art. 63).
- La partie condamnée paie dans les 20 jours. L'entrepreneur paie ensuite ses sous-traitants concernés dans les 5 jours (art. 67).
- Les réclamations pour perte de profits, de productivité ou d'occasion d'affaires liées à un changement sont exclues du régime (art. 33).

**Avant de soumissionner**
- Vérifiez la catégorie (bâtiment ou génie civil), la valeur et la date de l'appel d'offres pour savoir si le régime s'applique.
- Gardez une trace écrite de vos tentatives de règlement à l'amiable.

**Sources** (vérifiées le 9 octobre 2026)
- Québec.ca, Règlement sur les paiements et le règlement rapides des différends: https://www.quebec.ca/gouvernement/faire-affaire-gouvernement/gestion-contrats-gouvernementaux/reglements-paiements-rapides-differends-travaux-construction
- Guide du Secrétariat du Conseil du trésor (version de novembre 2025): https://www.tresor.gouv.qc.ca/fileadmin/PDF/faire_affaire_avec_etat/marches_publics/paiement-reglement-differends-construction-guide.pdf

Information générale, pas un avis juridique. Les règles changent : validez auprès de la source ou d'un avocat avant de vous y fier. Des questions ou des corrections? Répondez ci-dessous.$guide$,
  696, 'approved', true, true, 'guide:A5'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'quebec' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g07febffa9', c.id, p.user_id, 'discussion', $guide$Licence RBQ : vérifier la licence et les sous-catégories au registre avant de signer$guide$, 'licence-rbq-verifier-la-licence-et-les-sous-categories-au-registre-ava',
  $guide$Ce que couvre ce guide : comment vérifier la licence RBQ d'un entrepreneur et ses sous-catégories avant de signer, et ce que le cautionnement de licence couvre vraiment.

**Étape 1 : demandez le numéro de licence**
Demandez le numéro de licence RBQ et le nom exact de l'entreprise. Le nom et le numéro sur la soumission et le contrat doivent correspondre à la licence.

**Étape 2 : cherchez-le au Registre des détenteurs de licence**
La RBQ recommande de saisir le numéro de licence dans son Registre des détenteurs de licence, accessible depuis la page « Vérifier la licence d'un entrepreneur ». La fiche affiche notamment :
- les noms et coordonnées de l'entreprise, le NEQ et le numéro de licence;
- les catégories et sous-catégories de licence;
- l'association ou la compagnie qui fournit le cautionnement;
- les réclamations en cours ou les indemnités versées, s'il y en a;
- une restriction pour les contrats publics, s'il y en a;
- les répondants et leurs domaines de qualification.

**Étape 3 : comparez les sous-catégories à vos travaux**
C'est l'étape la plus souvent oubliée. Une licence valide ne suffit pas : les sous-catégories indiquent les types de travaux que l'entrepreneur est autorisé à faire. Si votre projet touche plusieurs corps de métier (par exemple électricité, plomberie et enveloppe), vérifiez que l'entrepreneur ou ses sous-traitants détiennent chaque sous-catégorie visée.

**Étape 4 : regardez les réclamations et restrictions**
Des réclamations payées ou en cours ne disqualifient pas automatiquement un entrepreneur, mais posez la question. Si vous êtes un organisme public, une restriction pour les contrats publics vous concerne directement : validez-en l'effet auprès de la RBQ.

**Ce que le cautionnement de licence couvre**
Selon la RBQ, le cautionnement sert à indemniser un client qui subit un préjudice lié à l'exécution ou à l'inexécution des travaux : acomptes versés, travaux non terminés, malfaçons et vices découverts dans l'année suivant la fin des travaux.
- Montants actuellement en vigueur : 40 000 $ pour un entrepreneur général et 20 000 $ pour un entrepreneur spécialisé.
- Le montant est partagé entre tous les réclamants admissibles. Si le total dépasse le cautionnement, la somme est répartie au prorata. S'il est épuisé, il n'y a plus d'indemnisation.
- Pour réclamer, l'entrepreneur devait détenir une licence valide à la signature du contrat ou pendant les travaux, et vous devez avoir versé un montant. Pour une malfaçon, le problème doit être constaté dans les 12 mois suivant la fin des travaux.
- Les titulaires des seules sous-catégories 1.1.1 ou 1.1.2 (résidentiel neuf sous plan de garantie) n'ont pas à fournir de cautionnement.

À surveiller : en février 2026, la RBQ a publié pour commentaires un projet de règlement qui ferait passer le cautionnement à 30 000 $ (spécialisé) et 60 000 $ (général). Au moment de vérifier, la FAQ de la RBQ indique toujours 20 000 $ et 40 000 $.

Pour un projet commercial de taille importante, ces montants sont modestes. Le cautionnement de licence ne remplace pas un cautionnement d'exécution ou de paiement exigé au contrat.

**Erreurs fréquentes**
- Vérifier la licence, mais pas les sous-catégories.
- Signer avec une entreprise dont le nom diffère de celui inscrit au registre.
- Compter sur le cautionnement de licence pour protéger un gros contrat.
- Oublier de vérifier les sous-traitants.

**Sources** (vérifiées le 9 octobre 2026)
- RBQ, Vérifier la licence d'un entrepreneur: https://www.rbq.gouv.qc.ca/vous-etes/citoyen/verifier-la-licence-dun-entrepreneur/
- RBQ, Check a contractor's licence: https://www.rbq.gouv.qc.ca/en/you-are/citizen/check-a-contractors-licence/
- RBQ, FAQ Cautionnement: https://www.rbq.gouv.qc.ca/vous-etes/entrepreneur/foire-aux-questions-faq/cautionnement/
- RBQ, Effectuer une réclamation au cautionnement: https://www.rbq.gouv.qc.ca/vous-etes/citoyen/problemes-avec-un-entrepreneur/effectuer-une-reclamation/
- RBQ, Communiqué du 25 février 2026 (projets de règlement): https://www.rbq.gouv.qc.ca/salle-de-presse/les-nouvelles/nouvelles-detail/item/2026-02-25-qualification-professionnelle-des-entrepreneurs-publication-pour-commentaires-de-deux-projets-de-reglement/

Information générale, pas un avis juridique. Les règles changent : validez auprès de la source avant de vous y fier. Des questions ou des corrections? Répondez ci-dessous.$guide$,
  646, 'approved', true, true, 'guide:C10'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'quebec' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g7c004cfec', c.id, p.user_id, 'discussion', $guide$S'inscrire au SEAO et obtenir les documents d'appel d'offres : étapes, rôles et frais$guide$, 's-inscrire-au-seao-et-obtenir-les-documents-d-appel-d-offres-etapes-ro',
  $guide$Ce guide explique comment créer votre compte au SEAO, commander les documents d'un appel d'offres et déposer une soumission électronique, avec les frais publiés par le SEAO.

**Le SEAO en bref**
Le SEAO est le système électronique d'appel d'offres du gouvernement du Québec. On y trouve les appels d'offres des ministères, des organismes publics, des sociétés d'État et des municipalités, ainsi que des contrats déjà attribués. Selon la FAQ du SEAO, l'inscription est gratuite.

**Étape 1 : créer votre compte professionnel**
Pour accéder aux services du SEAO, il faut créer un compte professionnel au Service d'authentification gouvernementale. On vous demande un nom d'utilisateur, une adresse courriel professionnelle valide, un mot de passe et un code de sécurité reçu par courriel. Le SEAO précise qu'il ne faut jamais utiliser une adresse courriel personnelle.

**Étape 2 : attribuer les bons rôles**
Le coordonnateur SEAO de votre organisation gère les profils des utilisateurs. Les rôles principaux :
- Coordonnateur : crée et gère les profils.
- Comptabilité : modes de paiement et relevés de transactions.
- Spécialiste : commande et télécharge les documents, remplit la fiche de l'entreprise au répertoire des fournisseurs.
- Lecteur : prévisualise les documents liés aux avis.
- STVE : dépose et retire les soumissions électroniques.

**Étape 3 : remplir votre fiche et configurer une veille**
Inscrivez votre entreprise au répertoire des fournisseurs et gardez votre profil à jour pour que les organismes vous repèrent. Configurez une veille pour recevoir les avis de votre domaine.

**Étape 4 : commander les documents**
Quelques tarifs de la grille SEAO pour les fournisseurs :
- version électronique d'une page standard : 0,03 $ la page;
- préparation d'une commande de documents standards : 5,50 $;
- commande occasionnelle : 20,00 $, seulement pour les organisations qui utilisent les services de base;
- abonnement optionnel : 6,95 $ par mois par Spécialiste et 3,00 $ par mois par Lecteur.
Les addendas déjà publiés au moment de votre commande sont à vos frais. Ceux publiés après votre commande vous sont distribués sans frais. Au moment de la commande, cochez la case pour recevoir les addendas : ils font partie intégrante des documents.

**Étape 5 : déposer la soumission**
Le dépôt électronique (STVE) est généralement facultatif. Le dépôt papier reste accepté, sauf si le donneur d'ouvrage exige le dépôt électronique. Chaque dépôt électronique coûte 20,00 $ (organisation abonnée) ou 30,00 $ (services de base), facturé peu après la fermeture de l'avis. Vous pouvez remplacer ou retirer votre fichier sans frais avant la fin de la période de soumission.

**Étape 6 : si vous ne soumissionnez pas**
Si vous avez commandé les documents sans soumissionner, le gouvernement demande de remplir le Questionnaire de non-participation et de le renvoyer à l'adresse indiquée.

**Erreurs fréquentes**
- Créer le compte avec une adresse courriel personnelle.
- Commander les documents tard et payer pour des addendas déjà publiés.
- Oublier les exigences préalables : attestation de Revenu Québec, autorisation de contracter de l'AMP selon le montant, déclaration de lobbyisme et autres.
- Déposer sans vérifier si un addenda est sorti depuis votre dernière lecture.

PMRFP regroupe aussi des appels d'offres publics à https://pmrfp.com/rfps.

**Sources** (vérifiées le 9 octobre 2026)
- SEAO, Grille des tarifs: https://seao.gouv.qc.ca/service-accompagnement/grille-tarifs
- SEAO, Foire aux questions: https://seao.gouv.qc.ca/centre-aide/foire-aux-questions
- SEAO, Connexion au nouveau SEAO: https://seao.gouv.qc.ca/centre-aide/aide-en-ligne/connecter
- SEAO, Rôles et permissions: https://seao.gouv.qc.ca/centre-aide/aide-en-ligne/se-connecter-role-et-permission
- Québec.ca, Répondre à un appel d'offres: https://www.quebec.ca/gouvernement/faire-affaire-gouvernement/preparer-marches-publics/appel-offres
- Québec.ca, Trouver les occasions d'affaires: https://www.quebec.ca/gouvernement/faire-affaire-gouvernement/preparer-marches-publics/occasions-affaires
- Québec.ca, Exigences à remplir avant de déposer une soumission: https://www.quebec.ca/gouvernement/faire-affaire-gouvernement/preparer-marches-publics/exigences

Information générale, pas un avis juridique. Les règles changent : validez auprès de la source avant de vous y fier. Des questions ou des corrections? Répondez ci-dessous.$guide$,
  633, 'approved', true, true, 'guide:B3'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'quebec' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g58031a1f8', c.id, p.user_id, 'discussion', $guide$Contrats publics au Québec : attestation de Revenu Québec (25 000 $) et autorisation de l'AMP (1 M$ et 5 M$)$guide$, 'contrats-publics-au-quebec-attestation-de-revenu-quebec-25-000-et-auto',
  $guide$Ce guide résume deux exigences qui font rejeter des soumissions au Québec : l'attestation de Revenu Québec et l'autorisation de contracter de l'Autorité des marchés publics (AMP).

**1. L'attestation de Revenu Québec**
Ce qu'elle confirme : l'entreprise a produit les déclarations exigées par les lois fiscales et n'a pas de compte en souffrance, ou respecte une entente de paiement.

Quand : le gouvernement du Québec l'indique pour les contrats publics de 25 000 $ et plus. Pour les travaux de construction des organismes publics, le règlement (art. 40.1) vise tout contrat comportant une dépense de 25 000 $ ou plus.

Validité, selon ce règlement (art. 40.3) :
- valide jusqu'à la fin de la période de 3 mois qui suit le mois de sa délivrance;
- elle ne doit pas avoir été délivrée après la date et l'heure limites de réception des soumissions;
- la détenir est une condition d'admissibilité.
Le règlement prévoit des exceptions, notamment pour l'entrepreneur sans établissement permanent au Québec et pour les urgences touchant la sécurité.

**2. L'autorisation de contracter de l'AMP**
Seuils provinciaux publiés par l'AMP :
- 5 M$ et plus pour un contrat ou sous-contrat de travaux de construction ou de partenariat public-privé;
- 1 M$ et plus pour un contrat ou sous-contrat de services.
La dépense inclut, le cas échéant, la valeur de toutes les options de renouvellement.

Qui : toute entreprise qui veut conclure un contrat ou un sous-contrat public atteignant ces seuils avec un ministère, un organisme public, une société d'État ou une municipalité. Les sous-traitants sont donc visés aussi.

Quand : en appel d'offres, vous devez la détenir à la date du dépôt de la soumission. En gré à gré, à la conclusion du contrat. L'AMP a annoncé cette règle en octobre 2022.

Validité : depuis le 2 avril 2026, l'autorisation est valide pour une durée indéterminée, tant que l'entreprise respecte ses obligations et que l'AMP ne la suspend pas ou ne la révoque pas. La mise à jour annuelle est obligatoire. La manquer peut entraîner une suspension automatique et une sanction administrative pécuniaire.

Montréal : depuis avril 2024, les anciens seuils propres à la Ville de Montréal (100 000 $ et 25 000 $) ne s'appliquent plus. Ce sont les seuils provinciaux.

Préparer la demande : l'AMP recommande de s'y prendre bien avant de soumissionner. Elle mentionne notamment l'attestation de Revenu Québec, des états financiers audités, un organigramme et les mesures de gouvernance et de contrôle. Le statut se vérifie au Registre des entreprises autorisées (REA).

**Autres exigences à vérifier**
Québec.ca liste aussi : le RENA (une entreprise inscrite ne peut pas soumissionner), l'attestation de l'OQLF à partir de 25 employés au Québec, le programme d'accès à l'égalité (plus de 100 employés ou contrat de 100 000 $ ou plus), la déclaration de lobbyisme et la licence RBQ selon le secteur.

**Erreurs fréquentes**
- Demander l'autorisation de l'AMP après la publication de l'appel d'offres.
- Oublier que les options de renouvellement comptent dans le calcul.
- Joindre une attestation de Revenu Québec expirée.
- Oublier qu'un sous-traitant peut aussi avoir besoin de l'autorisation.

**Sources** (vérifiées le 9 octobre 2026)
- Québec.ca, Exigences à remplir avant de déposer une soumission: https://www.quebec.ca/gouvernement/faire-affaire-gouvernement/preparer-marches-publics/exigences
- LégisQuébec, Règlement sur les contrats de travaux de construction des organismes publics (C-65.1, r. 5): https://www.legisquebec.gouv.qc.ca/fr/document/rc/C-65.1,%20r.%205
- AMP, Seuils et catégories de contrats publics: https://www.amp.quebec/en/seuils-et-categories-de-contrats-publics
- AMP, Quand faut-il détenir une autorisation?: https://www.amp.quebec/autorisation-de-contracter
- AMP, Autorisation exigée à la date du dépôt de la soumission: https://www.amp.quebec/actualites/autorisation-contracter-date-depot
- AMP, Demande d'autorisation de contracter: https://www.amp.quebec/actualites/demande-autorisation-contracter

Information générale, pas un avis juridique. Les règles changent : validez auprès de la source avant de vous y fier. Des questions ou des corrections? Répondez ci-dessous.$guide$,
  643, 'approved', true, false, 'guide:B4'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'quebec' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'gad816ad16', c.id, p.user_id, 'discussion', $guide$CCQ et Loi R-20 : vos travaux sont-ils assujettis? Repères pour gestionnaires et syndicats$guide$, 'ccq-et-loi-r-20-vos-travaux-sont-ils-assujettis-reperes-pour-gestionna',
  $guide$Ce que couvre ce guide : comment savoir si des travaux dans un immeuble relèvent de la Loi R-20, ce que cela implique (certificats de compétence, licence RBQ), et pourquoi il vaut mieux valider auprès de la CCQ dans les cas limites. Les règles sont complexes : ce guide donne les repères, pas une réponse définitive pour votre chantier.

**Ce que la Loi R-20 vise**
Selon la CCQ, la Loi R-20 encadre les travaux de construction et les relations du travail dans l'industrie, partout au Québec. Sont visés les travaux relatifs aux bâtiments et au génie civil exécutés sur le chantier, notamment :
- la fondation, l'érection et la démolition;
- l'entretien, la rénovation, la réparation et la modification;
- certains travaux préalables d'aménagement du sol.
L'industrie est divisée en quatre secteurs : industriel, institutionnel et commercial, génie civil et voirie, et résidentiel.

Point important pour les gestionnaires : l'entretien et la réparation font partie de la définition. Un contrat d'entretien peut donc être assujetti.

**Les exclusions à connaître (article 19)**
La CCQ présente plusieurs exclusions. Celles qui touchent le plus souvent un gestionnaire ou un syndicat de copropriété :
- les travaux d'entretien et de réparation faits par des salariés permanents embauchés directement par un employeur qui n'est pas un employeur professionnel (par exemple, un employé d'entretien engagé directement par l'immeuble, si toutes les conditions sont remplies);
- les travaux qu'une personne physique fait pour elle-même, sans but lucratif, dans le logement qu'elle habite. Cette exclusion vise l'occupant, pas un syndicat ou un gestionnaire;
- le recours à un entrepreneur autonome pour l'entretien, la réparation et la rénovation mineure, avec des conditions précises (notamment un seul entrepreneur autonome à la fois sur un même chantier);
- certains travaux bénévoles, selon les conditions prévues par règlement.
Chaque exclusion a des conditions. Lisez la page Exclusions de la CCQ en entier avant de conclure.

**Si c'est assujetti : quoi vérifier**
- **Les travailleurs :** la CCQ indique que le travailleur atteste sa compétence par son certificat de compétence (apprenti, compagnon ou occupation) ou un autre droit de travail, comme une exemption. Un apprenti ne doit faire que les tâches de son métier.
- **L'employeur :** la CCQ précise qu'il revient à l'employeur de vérifier la validité du droit de travail de ses salariés. L'entrepreneur doit aussi détenir une licence RBQ lorsque requise et être inscrit comme employeur à la CCQ.
- **Vous, donneur d'ouvrage :** exigez au contrat une déclaration de l'entrepreneur sur l'assujettissement, son numéro d'employeur CCQ et sa licence RBQ. Vérifiez la licence au registre de la RBQ.

**Quand valider auprès de la CCQ**
- Travaux d'entretien récurrents confiés à un entrepreneur externe.
- Travaux mixtes (entretien par vos employés, plus une portion confiée à un entrepreneur).
- Installation ou entretien de machinerie de bâtiment, que la CCQ décrit comme visés sous conditions.
La CCQ inspecte les chantiers et examine les livres des employeurs. En cas de doute, écrivez-lui avant le début des travaux et gardez la réponse au dossier.

**Erreurs fréquentes**
- Présumer que « entretien » veut dire « non assujetti ».
- Appliquer au syndicat de copropriété l'exclusion prévue pour la personne qui habite son logement.
- Ne pas exiger au contrat la conformité à la Loi R-20.

**Sources** (vérifiées le 9 octobre 2026)
- CCQ, Loi R-20 et champ d'application: https://www.ccq.org/fr-CA/loi-r20/application
- CCQ, Exclusions: https://www.ccq.org/fr-CA/loi-r20/application/exclusions
- CCQ, Application de la Loi R-20: https://www.ccq.org/loi-r20
- CCQ, Règles d'embauche, de paie et de mobilité: https://www.ccq.org/fr-CA/loi-r20/etre-employeur/regles
- CCQ, Respecter la Loi R-20 et les conventions collectives: https://www.ccq.org/fr-CA/loi-r20/etre-employeur/loi-R20-conventions-collectives

Information générale, pas un avis juridique. Les règles changent : validez auprès de la source avant de vous y fier. Des questions ou des corrections? Répondez ci-dessous.$guide$,
  624, 'approved', true, false, 'guide:C11'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'quebec' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'ga440b6062', c.id, p.user_id, 'discussion', $guide$Ontario Construction Act: holdback, lien and prompt payment deadlines in one place$guide$, 'ontario-construction-act-holdback-lien-and-prompt-payment-deadlines-in',
  $guide$A one-page reference to the money deadlines in Ontario's Construction Act, as consolidated on e-Laws (current to October 6, 2026). Read the section before you act.

**Holdback**
- Every payer on a contract or subcontract where a lien can arise keeps back 10% of the price of what is actually supplied (s. 22).
- Annual release: after each anniversary of the contract date, the owner must publish a notice of annual release of holdback within 14 days, then pay that year's holdback 60 to 74 days after the notice, unless a lien has been preserved or perfected and not dealt with (s. 26). The contractor then has 14 days to pay its subs their share.
- Older contracts: see the transition rules in s. 87.4.
- Other holdback: owner pays within 14 days after liens expire or are dealt with; each tier then has 14 days (s. 26(8)).

**Prompt payment (Part I.1)**
- A proper invoice shows: your name and address; invoice date and the period or milestone; contract, line item or PO number; description and quantities; amount and payment terms; and the name, title, mailing address and phone number of whoever gets paid. The owner can also reasonably ask for what its accounts payable system needs (s. 6.1(1)).
- If something is missing, the invoice is deemed proper unless the owner tells you in writing within 7 days what is wrong and how to fix it (s. 6.1(2)).
- Invoices go monthly unless the contract says otherwise. A clause requiring certifier or owner approval before you can invoice has no effect, except for testing and commissioning (s. 6.3).
- The owner pays within 28 days of receiving a proper invoice (s. 6.4(1)).
- To hold back money, the owner must give a notice of non-payment in the prescribed form within 14 days, listing the amount and all reasons. The rest is still due at day 28 (s. 6.4(2) and (3)).
- The contractor pays each sub within 7 days of being paid (s. 6.5(1)). If the owner didn't pay, the sub is still owed by day 35 after invoicing, unless the contractor gives a notice of non-payment and undertakes to start adjudication within 21 days (s. 6.5(4) and (5)).
- The same pattern runs down each tier (s. 6.6).
- Late amounts earn interest at the Courts of Justice Act prejudgment rate, or the contract rate if that is higher (s. 6.9).

**Liens**
- Preserve a lien by registering a claim for lien on title. On Crown or municipal premises, give a copy of the claim to the owner instead (s. 16 and s. 34).
- Contractor: 60 days after the earlier of publication of the certificate or declaration of substantial performance, or the contract being completed, abandoned or terminated (s. 31(2)).
- Subs and suppliers: 60 days after the earliest of that publication, your last supply, the contract ending, or your subcontract being certified complete (s. 31(3)).
- A preserved lien must be perfected within 90 days after the last day it could have been preserved, by starting an action and registering a certificate of action (s. 36).

**Adjudication (Part II.1)**
- The Authorized Nominating Authority is ODACC.
- Give notice of adjudication within 90 days after the contract is completed, abandoned or terminated. For subcontracts it can start earlier, such as at your last supply (s. 13.5).
- The adjudicator decides within 30 days of receiving the documents, unless extended (s. 13.13). Amounts ordered are due within 15 days; if a contractor or sub isn't paid, it may suspend work (s. 13.19).

**Common mistakes**
- Counting your lien period from the end of the job when it started at your last delivery.
- Ignoring an owner's 7-day deficiency notice. If no notice comes within 7 days, the invoice is deemed proper.
- Assuming your contract terms override the Act. Contracts are deemed amended to conform (s. 5), and waivers are void (s. 4).

**Sources** (checked October 9, 2026)
- Construction Act, R.S.O. 1990, c. C.30 (e-Laws): https://www.ontario.ca/laws/statute/90c30
- ODACC, Authorized Nominating Authority: https://odacc.ca/

General information, not legal advice. Rules change; confirm with the source or a lawyer before you rely on it. Questions or corrections? Reply below.$guide$,
  723, 'approved', true, true, 'guide:A1'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'ontario' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'ga2f7d2949', c.id, p.user_id, 'discussion', $guide$Bidding on City of Toronto contracts: SAP Business Network registration, TO Bids and submission rules$guide$, 'bidding-on-city-of-toronto-contracts-sap-business-network-registration',
  $guide$This covers how to register as a City of Toronto supplier, find calls and submit a bid online.

**How the City buys**
The City issues Requests for Tender (mainly construction), Requests for Quotation, Requests for Proposal and other calls. They are posted electronically through SAP Ariba, and the City says bids must be received through that online tool. The supplier side runs on the SAP Business Network.

**Step 1: Check before you register**
- Ask whether your company already has an SAP Business Network account. If unsure, email supplychain@toronto.ca.
- Check the City's Suspended and Disqualified Firms list.

**Step 2: Register**
Use the City's Supplier Registration Form. New users create an SAP Business Network account. Existing users register their current account with the City. The City says there is no fee with a standard account. Allow about three days for the City to approve your registration. Once approved, you get alerts for calls in the commodities listed on your profile, so choose them carefully.

**Step 3: Find calls**
Search the Toronto Bids Portal (TO Bids). Biddable calls link through to SAP Business Network Discovery. The City says solicitation documents can be downloaded for free. The City also buys through cooperative groups such as Canoe Procurement, OECM, HealthPRO Canada and Sourcewell, which run their own calls.

**Step 4: Practise, then bid**
The City offers an SAP Ariba supplier training guide and mock RFT, RFQ and RFP events. Run through one before your first real bid. The City also holds monthly supplier information sessions (register through supplychain@toronto.ca or 416-397-4141).

**Rules that trip bidders up**
- Contact only the person named in the call document. The City prohibits contacting Council members or other City staff about a procurement.
- Closing follows the City's Purchasing By-law (Municipal Code Chapter 195), and each call states its own closing terms.
- If an addendum is issued close to closing, the City extends closing by at least three days. Re-check your bid against every addendum.
- To withdraw a bid without resubmitting, send the Withdrawal of Bid request letter to the buyer through the Event Messaging Board.
- Suppliers must follow the City's Fair Wage Policy. Read it before you price labour.

**After award**
The City uses a Contractor Performance Evaluation form after contracts are awarded. It also publishes a bid dispute process and a complaints procedure.

**Common mistakes**
- Registering the week a call closes, then waiting on approval.
- Choosing too few commodities, so alerts never arrive.
- Calling a councillor's office about an open call.
- Missing a late addendum.

PMRFP lists Toronto and other public tenders at https://pmrfp.com/rfps.

**Sources** (checked October 9, 2026)
- City of Toronto, Understanding the procurement process: https://www.toronto.ca/business-economy/doing-business-with-the-city/understanding-the-procurement-process/
- City of Toronto, Searching and bidding on City contracts: https://www.toronto.ca/business-economy/doing-business-with-the-city/searching-bidding-on-city-contracts/
- City of Toronto, How to register as a supplier: https://www.toronto.ca/business-economy/doing-business-with-the-city/searching-bidding-on-city-contracts/how-to-register-as-a-supplier-with-the-city/
- City of Toronto, Bidding on solicitations: https://www.toronto.ca/business-economy/doing-business-with-the-city/searching-bidding-on-city-contracts/bidding-on-solicitations/

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  533, 'approved', true, true, 'guide:B5'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'ontario' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g10a012441', c.id, p.user_id, 'discussion', $guide$Alberta Prompt Payment and Construction Lien Act: payment, holdback and lien deadlines$guide$, 'alberta-prompt-payment-and-construction-lien-act-payment-holdback-and',
  $guide$This covers the payment, holdback, lien and adjudication deadlines in Alberta's Prompt Payment and Construction Lien Act (PPCLA). The King's Printer consolidation we checked is current as of April 1, 2025, so check for later amendments.

**Who it covers**
- All new construction contracts have had to follow the PPCLA since August 29, 2022 (alberta.ca).
- Provincial government projects are under the Public Works Act instead, which has its own payment rules (PPCLA s. 1.1(1.1) and alberta.ca).

**Payment deadlines (Part 3)**
- A proper invoice must include: your name and business address; the invoice date and the period the work or materials cover; what authorized the work (written or verbal contract or otherwise); a description of the work or materials; the amount and payment terms, broken down; the name, title and contact information of the person who receives payment; and a statement that the invoice is intended to be a proper invoice (s. 32.1(1)).
- Subject to the regulations, invoices go to the owner at least every 31 days. A clause that makes invoicing wait for prior certification or owner approval has no effect, with a testing and commissioning exception (s. 32.1(3) to (6)).
- The owner pays within 28 days of receiving a proper invoice. To dispute it, the owner gives a notice of dispute within 14 days with the amount and all reasons (s. 32.2).
- The contractor pays each sub within 7 days of being paid. If the owner does not pay, the contractor owes the sub by day 35 after giving the invoice, unless it gives a notice of non-payment and an undertaking to refer the matter to adjudication within 21 days (s. 32.3).
- Sub to sub: 7 days after being paid, or 42 days after the proper invoice went to the owner if no payment came (s. 32.5).
- Late amounts earn interest at the prescribed rates (s. 32.6).

**Holdback (the "major lien fund")**
- The owner keeps 10% of the value of work done and materials furnished for 60 days from the certificate of substantial performance, or from completion if no certificate issues (s. 18(1)).
- For oil or gas well sites and for work primarily related to concrete, the period is 90 days (s. 18(1.1) and (1.2)).
- Work after substantial performance goes into a separate 10% "minor lien fund" (s. 23).
- On larger, longer contracts, holdback must come out annually or in phases (s. 24.1). alberta.ca describes the threshold as $10 million and more than 12 months.

**Liens**
- Register a lien within 60 days. Materials: from your last delivery or abandonment of the supply contract. Services: from completion. Contractors and subs: from completion or abandonment of their contract (s. 41).
- Concrete work and oil or gas well sites get 90 days instead of 60 (s. 41).
- An unregistered lien ends when the period runs out (s. 42).
- A registered lien ends unless, within 180 days of registration, you start an action and register a certificate of lis pendens (s. 43).

**Adjudication (Part 5)**
- Nominating Authorities: ARCANA (AB) and ADACC (alberta.ca).
- Notice of adjudication must be given within 30 days after the date of final payment, unless the parties agree otherwise (s. 33.4(2)).
- The decision binds the parties unless a court rules otherwise, an arbitrator makes an award, or they settle in writing (s. 33.6(5)).

**Finding public work**
Alberta Purchasing Connection (purchasing.alberta.ca) is the Government of Alberta's electronic tendering site. The province, municipalities, school boards and health entities post there. You can browse without registering. A supplier account lets you download bid documents and express interest.

**Common mistakes**
- Leaving out the "this is a proper invoice" statement.
- Mixing up the 60-day and 90-day lien periods.
- Signing away the Act. An agreement that the Act does not apply is void (s. 5(1)).

**Sources** (checked October 9, 2026)
- Prompt Payment and Construction Lien Act, RSA 2000, c. P-26.4 (King's Printer): https://kings-printer.alberta.ca/documents/Acts/P26P4.pdf
- Alberta prompt payment rules: https://www.alberta.ca/prompt-payment-rules-for-construction-industry
- Find and compete for government contracts (APC): https://www.alberta.ca/find-and-compete-for-government-contracts

General information, not legal advice. Rules change; confirm with the source or a lawyer before you rely on it. Questions or corrections? Reply below.$guide$,
  728, 'approved', true, true, 'guide:A2'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'alberta' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g9f39082b6', c.id, p.user_id, 'discussion', $guide$Finding public tenders in Alberta: how to use Alberta Purchasing Connection (APC)$guide$, 'finding-public-tenders-in-alberta-how-to-use-alberta-purchasing-connec',
  $guide$This covers how to search Alberta Purchasing Connection (APC), set up a supplier account and keep track of a posting.

**What APC is**
APC is Alberta's official electronic tendering site. The Government of Alberta and public sector bodies such as municipalities, school boards and health entities post goods, services and construction opportunities there.

**Browse without an account**
Anyone can browse public postings on APC without an account. Use the Find Opportunities and Notices page and narrow it with filters. The APC Help Centre has a guide on filtering.

**Create a supplier account**
You need an account to download bid documents. It also lets you bookmark postings, express interest, save filter sets and get new-posting notifications. Create it from the APC Suppliers page. Two things to know:
- You must complete a user verification step to sign in.
- One email address can be used for a Supplier account or a Buyer account, not both.

**Express interest on every job you might bid**
Click "express interest" on a posting, or download its documents, which counts as expressing interest. Your business then appears on the posting's public Interested Suppliers list and you get emails about updates, including addenda. You can change or withdraw your interest until closing. If you are a sub-trade, that public list shows which firms are looking at a job.

**Some postings link to SAP Ariba (1GX)**
The Government of Alberta uses 1GX, which runs on SAP Ariba, for some opportunities. A provincial guide published in 2020 says 1GX notices on APC link to Ariba, suppliers register for free or use an existing Ariba account to view and download documents, and there is no cost to suppliers to do business with the province in Ariba. The current alberta.ca page lists 1GX supplier help at 780-643-0150.

**Before you bid**
Alberta's guidance to suppliers says:
- failing a mandatory requirement leads to automatic disqualification;
- include all costs, insurance and certifications such as WCB coverage;
- submit by the stated date, time and location, since late bids are automatically rejected;
- unsuccessful suppliers can request a debrief within 10 days of the award decision;
- contract changes must follow the contract's amendment process.

**Common mistakes**
- Browsing without an account and never seeing an addendum.
- Using one email for both buyer and supplier roles.
- Assuming the documents sit on APC when the posting points to Ariba.
- Skipping the debrief after a loss.

PMRFP also lists Alberta public tenders at https://pmrfp.com/rfps.

**Sources** (checked October 9, 2026)
- Government of Alberta, Find and compete for government contracts: https://www.alberta.ca/find-and-compete-for-government-contracts
- Alberta Purchasing Connection, home: https://purchasing.alberta.ca/
- Alberta Purchasing Connection, Suppliers: https://purchasing.alberta.ca/supplier-login
- Government of Alberta, Find 1GX opportunities on APC (2020 guide): https://www.alberta.ca/system/files/custom_downloaded_images/sa-find-1gx-opportunities-in-apc.pdf

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  495, 'approved', true, true, 'guide:B6'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'alberta' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g5b4defde9', c.id, p.user_id, 'discussion', $guide$BC Builders Lien Act: 10% holdback, holdback account, 45-day lien deadline and prompt payment status$guide$, 'bc-builders-lien-act-10-holdback-holdback-account-45-day-lien-deadline',
  $guide$This covers the core rules of BC's Builders Lien Act (SBC 1997, c. 45, current to September 22, 2026 on BC Laws) and where prompt payment stands in BC today.

**Holdback**
- Whoever is primarily liable on each contract and subcontract where a lien can arise must hold back 10% of the greater of the value of work or material actually provided, or the amount of any payment made (s. 4).
- This applies whether the contract pays in instalments or on completion (s. 4(2)).

**Holdback account**
- The owner must open a holdback account at a savings institution for each contract, deposit the holdback, and run the account together with the contractor (s. 5(1)).
- Money in the account is charged with liens under that contractor and held in trust for the contractor. Nothing comes out without the agreement of everyone administering the account (s. 5(2)).
- If the owner fails to deposit the holdback, the contractor can suspend work on 10 days' notice for as long as the default lasts (s. 5(7)).
- The account rule does not apply where the owner is the government, a government corporation or another designated public body, or where the work and material total less than $100,000 (s. 5(8)).

**Certificate of completion**
- A contractor or sub can ask the payment certifier to decide whether its contract or subcontract is complete. The certifier must decide within 10 days and, if it is complete, issue a certificate of completion (s. 7(3)).
- Within 7 days of issuing it, the certifier must send copies to the owner, the head contractor and the person who asked, and post a notice on the site (s. 7(4)).
- If the certifier refuses, you can apply to court for an order with the same effect (s. 7(5) and (6)).
- Any lien holder can make a written request to be told about certificates issued (s. 7(2)). Do this early on any job you supply.

**Lien filing deadline: 45 days**
- If a certificate of completion was issued for your contract or subcontract, or for the one you work under, you have 45 days from the date it was issued (s. 20(1)).
- Otherwise, 45 days after the head contract is completed, abandoned or terminated, or after the improvement is completed or abandoned if there is no head contractor (s. 20(2)).
- A contract is deemed abandoned after 30 days with no work, unless the stop was caused by things like a strike, weather, holidays or a material shortage (s. 1(5)).
- A lien not filed in time is extinguished (s. 22). Claims under $200 cannot be filed (s. 17).
- After filing, you must start an action and register a certificate of pending litigation within one year. An owner can shorten that by serving a 21-day notice (s. 33).

**Holdback period**
The holdback period ends 55 days after the certificate of completion, or 55 days after completion or abandonment if no certificate issued (s. 8). Payment after that discharges liens unless a claim has been filed or proceedings started in the meantime.

**Prompt payment in BC: not in force yet**
BC's Construction Prompt Payment Act received Royal Assent on November 27, 2025, but it is not in force. The province says regulations still need to be developed and an adjudication authority selected. Consultation on the discussion paper closed July 7, 2026. As of the province's page (last updated August 20, 2026), no start date has been announced. Until it starts, your payment timing on BC jobs comes from your contract.

**Before you bid**
- Ask who the payment certifier is and send your section 7(2) request.
- Check if the owner is a public body exempt from the holdback account rule.
- Highways and some other public works are outside the Act entirely (s. 1.1).

**Sources** (checked October 9, 2026)
- Builders Lien Act, SBC 1997, c. 45 (BC Laws): https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/97045_01
- BC prompt payment legislation page: https://www2.gov.bc.ca/gov/content/governments/infrastructure/prompt-payment-legislation
- BC news release, May 26, 2026: https://news.gov.bc.ca/releases/2026INF0031-000593

General information, not legal advice. Rules change; confirm with the source or a lawyer before you rely on it. Questions or corrections? Reply below.$guide$,
  728, 'approved', true, true, 'guide:A3'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'british-columbia' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g95bb0beae', c.id, p.user_id, 'discussion', $guide$BC Bid: how to register, find opportunities and submit (Business BCeID, fees and e-Bidding)$guide$, 'bc-bid-how-to-register-find-opportunities-and-submit-business-bceid-fe',
  $guide$This covers how to set up on BC Bid, the Province of British Columbia's procurement platform, find opportunities and submit, including what costs money.

**Before you register**
- Get a Business BCeID. BC Bid requires one for suppliers, including suppliers outside B.C. An authorized person in your company registers it on the BCeID website.
- Decide who will be your Supplier Admin. The first person from your company to register gets that role automatically. That person manages the account, subscriptions and users.
- Look at the commodity codes. BC Bid uses UNSPSC codes, but not every code.

**Register**
BC Bid says there is no charge to register as a supplier. Registered suppliers can shortlist opportunities, manage submissions and subscribe to notifications and e-Bidding. Accept the terms and conditions, then set up the account. BC Bid notes that "Access Denied" messages can come from an incomplete registration.

**Optional paid subscriptions** (per user, per year)
- Notifications, $100: pick commodity codes and get alerts when matching opportunities are posted.
- e-Bidding, $150: submit bid responses electronically inside BC Bid.
Subscriptions do not renew automatically. Renew within 30 days of expiry or they lapse. The Supplier Admin can pay for other users.

**Find opportunities**
Under Sourcing, search Opportunities by keyword and filters. Status defaults to Open. The supplier guide recommends filtering by commodity code rather than industry category. You can also search Contract Awards and Unverified Bid Results to research past work.

**Submit**
Open the opportunity and click Start Submission. The person who clicks it becomes the default contact, so log in as the right person first. Review the documents, details and addenda.
- If the opportunity offers e-Bidding: upload, authenticate with your BCeID, validate and submit. Status changes to Received.
- If not: follow the opportunity's own instructions (for example hard copy or email) and quote the Opportunity ID clearly.

**Amendments and addenda are different**
- Amendment: a substantial change. BC Bid says bids already submitted are rejected, and you must submit a new response.
- Addendum: a minor update, clarification or answer. Update or replace your submission if it affects your response.

**Help**
BC Bid help desk: bcbid@gov.bc.ca or 1-250-387-7301, 8:30 am to 4:30 pm, Monday to Friday, excluding statutory holidays.

**Common mistakes**
- Letting a junior staffer register first and become Supplier Admin by default.
- Missing an amendment and assuming your earlier bid still stands.
- Letting the e-Bidding subscription lapse right before a closing.

PMRFP also lists B.C. public tenders at https://pmrfp.com/rfps.

**Sources** (checked October 9, 2026)
- BC Bid home page: https://www.bcbid.gov.bc.ca
- BC Bid, Important steps before login and registration: https://www2.gov.bc.ca/gov/content?id=943F3B2E15604916B567E5BB8ED16530
- BC Bid supplier guide, Account management: https://www2.gov.bc.ca/gov/content/bc-procurement-resources/bc-bid-resources/bc-bid-for-suppliers/bc-bid-supplier-guide/account-management
- BC Bid supplier guide, Explore opportunities: https://www2.gov.bc.ca/gov/content/bc-procurement-resources/bc-bid-resources/bc-bid-for-suppliers/bc-bid-supplier-guide/explore-opportinities
- BC Bid supplier guide, Start submission: https://www2.gov.bc.ca/gov/content/bc-procurement-resources/bc-bid-resources/bc-bid-for-suppliers/bc-bid-supplier-guide/step-3
- BC Bid supplier guide, Amendments and addenda: https://www2.gov.bc.ca/gov/content/bc-procurement-resources/bc-bid-resources/bc-bid-for-suppliers/bc-bid-supplier-guide/step-4

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  552, 'approved', true, true, 'guide:B7'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'british-columbia' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'g4e5512e17', c.id, p.user_id, 'discussion', $guide$Bidding on US federal work: free SAM.gov registration, the UEI, NAICS codes and the 365-day renewal$guide$, 'bidding-on-us-federal-work-free-sam-gov-registration-the-uei-naics-cod',
  $guide$This covers what you need to register in SAM.gov to bid on US federal contracts, with notes for Canadian firms.

**It is free**
SAM.gov's entity registration checklist says there is no charge to get a Unique Entity ID, register your entity or maintain your registration. GSA says you do not need to pay a third party to complete your registration. If someone offers to register you for a fee, you can do it yourself on SAM.gov.

**UEI only, or full registration?**
- Unique Entity ID (UEI) only: needs your legal business name and physical address. SAM.gov says a UEI alone does not let you apply directly for federal awards.
- Full registration for All Awards: assigns a UEI and lets you bid on contracts.

**What to have ready** (from the SAM.gov checklist)
- Legal business name and physical address. A PO box cannot be your physical address.
- Date and state of incorporation.
- Taxpayer Identification Number (US entities).
- Electronic funds transfer details (optional for non-US entities).
- NAICS codes for what you sell. Product Service Codes are optional.
- Size information, such as annual receipts and number of employees.
- Points of contact.
- CAGE code. US entities get one assigned if they do not have it. Non-US entities, including Canadian firms, must request an NCAGE code before starting a SAM.gov registration.

**NAICS codes**
You choose one or more NAICS codes that match your products or services. GSA says this helps agencies find your business. Pick codes that match the work you actually want, not every code you could argue for.

**Timing**
SAM.gov says to allow at least ten business days after you submit for your registration to become active. If your entity fails TIN or CAGE validation, you get an email with instructions to fix and resubmit, so watch your spam folder. GSA notes that once active, your business is searchable across government.

**Renewal**
You must renew every 365 days to keep your registration active. You can update it at any time. GSA says that where registration is required, you must maintain your registration, UEI and CAGE code for the life of the contract. Set a reminder well ahead of the expiry date.

**Finding work**
GSA says solicitations are posted on SAM.gov. For subcontracting, GSA points to SBA SubNet, USASpending.gov, SAM.gov and its own subcontracting directory.

**Common mistakes**
- Paying a service for something that is free.
- Getting a UEI only and assuming you can bid.
- Letting registration lapse in the middle of a pursuit.
- Canadian firms starting the form before they have an NCAGE code.

**Sources** (checked October 9, 2026)
- SAM.gov, Entity registration: https://sam.gov/content/entity-registration
- SAM.gov, Entity Registration Checklist (PDF): https://sam.gov/sites/default/files/2024-11/entity-checklist.pdf
- GSA, Register your business: https://www.gsa.gov/small-business/find-opportunities/register-your-business
- GSA, Find opportunities: https://www.gsa.gov/small-business/find-opportunities

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  515, 'approved', true, true, 'guide:B8'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'united-states' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select 'ge3437ab11', c.id, p.user_id, 'discussion', $guide$Verifying a US contractor license: state lookups in California, Florida and Texas$guide$, 'verifying-a-us-contractor-license-state-lookups-in-california-florida',
  $guide$What this covers: how to verify a contractor license in the US, where licensing is set by each state and sometimes by cities and counties, with three worked examples.

**Start with the right agency**
There is no national contractor license. Find the board that licenses the trade in the state, then check whether the city or county adds its own requirement. Always search the agency's own lookup. A license number on a truck or a quote proves nothing until you check it.

**California: CSLB**
- CSLB says a license is required when the project needs a building permit, uses employees or workers, or is valued at $1,000 or more for labor and materials combined.
- Search CSLB's Check a License tool by license number, business name or personnel name. Numbers are digits only.
- CSLB says licensed contractors must carry a $25,000 contractor license bond, and warns that this is often not enough for large projects or multiple claims.
- If a contractor has employees, it must carry workers' compensation insurance. CSLB says classifications C-8 (concrete), C-20 (HVAC), C-22 (asbestos abatement), C-39 (roofing) and D-49 (tree service) must have a workers' comp certificate on file whether or not they have employees. Coverage details appear on the license record.
- CSLB also advises asking for a certificate of insurance for general liability.

**Florida: DBPR**
- Search the DBPR license portal by name, license number, city or county, or license type.
- Florida law distinguishes two kinds of contractor. A certified contractor holds a state certificate of competency and may contract in any jurisdiction in the state. A registered contractor qualified through a local jurisdiction's competency requirements and may contract only there. Check that a registered contractor's jurisdiction matches your site.

**Texas: trade by trade**
- Texas licenses some construction trades at the state level through TDLR, including electrical work. TDLR says anyone who performs electrical work in Texas must be licensed, with some exemptions.
- An electrical contractor must hold a Master Electrician license or employ one as Master Electrician of Record.
- A state electrical license is valid statewide. A city license is valid only in that city.
- Search TDLR's license database by name or license number.

**What to check on any license record**
- **Status:** active, not expired, suspended or inactive.
- **Classification:** the license must cover the work you are buying.
- **Name match:** the legal name on the record matches your contract.
- **Bond:** amount, surety and any claims, where the state shows it.
- **Workers' comp:** coverage or an exemption, where the state shows it. Get the insurer's certificate either way.
- **Discipline:** complaints or actions on the record.
- **Local layer:** city or county registration where required.

**Common mistakes**
- Assuming a license in one state works in another.
- Hiring a general contractor whose trade subs are not licensed.
- Checking status but not classification.
- Relying on the bond as if it were insurance.

**Sources** (checked October 9, 2026)
- CSLB, Check a License: https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx
- CSLB, How do I find the right licensed contractor?: https://www.cslb.ca.gov/consumers/hire_a_contractor/finding_the_right_contractor.aspx
- CSLB, What Kind of Contractor Do You Need?: https://www.cslb.ca.gov/consumers/hire_a_contractor/What_Kind_Of_Contractor.aspx
- CSLB, Public Information FAQ: https://www.cslb.ca.gov/about_us/Public_Info_FAQ.aspx
- Florida DBPR, License search: https://www.myfloridalicense.com/wl11.asp?mode=0&SID=
- Florida Statutes s. 489.105: http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0400-0499/0489/Sections/0489.105.html
- TDLR, Electrical Safety and Licensing FAQ: https://www.tdlr.texas.gov/electricians/elecfaq.htm

General information, not legal advice. Rules change; confirm with the source before you rely on it. Questions or corrections? Reply below.$guide$,
  635, 'approved', true, true, 'guide:C12'
from public.forum_categories c, public.forum_profiles p
where c.slug = 'united-states' and p.handle = 'pmrfp_team'
on conflict (auto_source_key) where auto_source_key is not null do nothing;

commit;

-- Check: select count(*) from public.forum_threads where auto_source_key like 'guide:%';  -- expect 55

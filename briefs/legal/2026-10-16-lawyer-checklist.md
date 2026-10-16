# PMRFP: questions for a Canadian tech / privacy lawyer (2026-10-16)

PMRFP (pmrfp.com) is a bid board and trade directory for commercial property work in Canada and the U.S. It is run from Toronto and operated by Talkerstein Consulting Group ("TCG"). It republishes public tenders, contract awards and project data from government open-data portals, sells subscriptions to trade companies (Trade Pro, Award Intelligence, Featured listings, sponsorships), and runs a member forum. This page lists what we did on 2026-10-16 and what we need a lawyer to confirm. It is not legal advice. Evidence is in PR "Compliance pass" (branch `fix/compliance-pass`) and `briefs/strategy/feed-map/compliance-audit-2026-10-16.csv`, which has 79 fetchers with their robots.txt result and licence.

## 1. Data sources, licences, robots.txt
- **What we use:** Federal (OGL-Canada), Ontario, BC, Toronto, Calgary, Edmonton, Ottawa, Halifax, Surrey, York, Nova Scotia and Yukon open-government licences; Données Québec and Montréal data under CC BY 4.0; Mississauga's Terms of Use; Manitoba's OpenMB licence; U.S. federal public-domain data (SAM.gov, USAspending); NYC and LA open data; and state and city bid pages that state no licence. Every listing shows the source and its licence credit in en, fr and es, and a test enforces this.
- **Fixed today:**
  - **CanadaBuys:** robots.txt on canadabuys.canada.ca blocks every bot except Google and Bing, but our daily and weekly jobs were downloading its CSVs. Those downloads are now off by default. An admin downloads the files in a browser and uploads them. open.canada.ca has no separate copy; its links redirect to CanadaBuys.
  - **Données Québec:** we were calling its API path, which robots.txt disallows. We now use only the allowed `/download/` file links, 10 s apart.
- **Ask:**
  - (a) Is downloading a file that the Government of Canada itself lists on open.canada.ca under OGL, from a host whose robots.txt says no, a contract or trespass risk, or only bad etiquette? Should we ask PSPC for written permission and turn the job back on?
  - (b) Sources with no licence: Ontario Northland, Saanich, FVRD, Portage la Prairie, SaskTenders (switched off), SC, Florida, LA County, Delaware, NC eVP, TxDOT. We show their notices with credit and a link. Is that acceptable as public information, or do we need permission from each buyer? Massachusetts (COMMBUYS) gave written permission.
  - (c) The Ottawa licence text has not been verified, and our credit line may use the wrong licence name.
  - (d) Bank of Canada exchange rates are used for USD/CAD and the site does not yet credit the Bank, which its terms §1.1 require.
  - (e) Government logos: we closed PR #89 rather than show the CanadaBuys and SEAO logos, because of the Federal Identity Program and Québec visual-identity rules. Confirm this is right.

## 2. Personal information (PIPEDA, Québec Law 25)
- **Public records:** they name businesses, and some name buyer staff (contact names, emails and phones the buyer published). Award winners that look like a person and not a business are shown as "Individual (not named)". A trading name such as "Jean Tremblay Excavation" is still shown. Ask: is that line in the right place? Do buyer-contact details on tender pages need any extra handling?
- **Privacy Officer:** now named in the privacy policy as "Privacy Officer, Talkerstein Consulting Group, privacy@pmrfp.com". **The mailbox does not exist yet** and Rishon must create it. Law 25 also requires the person with the highest authority to delegate this role in writing. Confirm who that is and keep the delegation on file.
- **Not done yet:**
  - a confidentiality-incident register
  - a privacy impact assessment for sending data outside Québec (Supabase, Vercel, Stripe, Resend, HighLevel, Google, Upstash, Cloudflare and Microsoft Clarity are mostly U.S.-hosted)
  - a written retention schedule. The policy says "only as long as needed", with no fixed periods.
- **Cookies and analytics:**
  - The new privacy page discloses a first-touch signup cookie (`pmrfp_ft`, 90 days), language/market cookies, Vercel Analytics, Google Analytics 4 and Microsoft Clarity.
  - Clarity loads only after consent.
  - **GA4 loads without consent in production.** Law 25 s.9.1 wants privacy-protective defaults. Ask: must GA4 move behind the consent banner, or is Consent Mode with analytics_storage set to "denied" by default enough?
- **Rights:** access, correction, deletion/de-indexing, withdrawing consent, and portability, answered within 30 days. Account deletion is manual, on request. Is that acceptable?
- **Corrections process:** there is a new "Report an error or request removal" link on RFP, contract-winner, Award Intelligence, major-project and benchmark pages. It feeds the admin queue at /admin/corrections and is covered by the public /corrections policy: acknowledge within 2 business days, fix or explain within 10, personal information first. Ask: are those targets safe to publish?

## 3. CASL: the basis for each kind of email
| Email | Our basis today | Ask |
|---|---|---|
| Cold B2B outreach to property managers and trade firms (sent from info@pmrfp.com or hi@ by hand, outside the codebase) | Conspicuous publication (s.10(9)(b)): the address is published on the firm's own site, no "no unsolicited email" statement is posted, and the message relates to the recipient's business role | Confirm. Confirm that each email needs our ID, mailing address and an unsubscribe that is honoured within 10 business days. We keep a send log; is that enough as proof of consent? |
| Account, billing, alerts and digests a member turns on | Transactional (s.6(6)) or express consent (they opt in) | Are RFP alerts that include upsell lines still exempt? |
| Lifecycle and onboarding emails to free sign-ups (at most one a day; stop on upgrade or unsubscribe) | Implied consent from an inquiry or application within 6 months? There is **no marketing-consent checkbox at sign-up** | Do we need a checkbox? Should these emails stop 6 months after sign-up? |
| Weekly email (double opt-in) | Express consent | Wording of the consent request. |

## 4. Consumer protection and billing
- **Prices and plans:**
  - Trade Pro is $249 CAD a year ($29 a month where offered).
  - The free trial is 14 days, needs no card, and drops back to the free plan with no charge.
  - Refunds are "none except Founding 500", by founder decision.
  - Plans renew automatically through Stripe.
- **Founding 500 "lifetime":** now defined in the Terms as the life of the Trade Pro service as PMRFP runs it, not the life of a person or company, and non-transferable. The offer page also mentions a 24-month pro-rated refund. **A lifecycle email still says "keep Trade Pro for life"**, and the wording should match the page. Ask whether this is safe under the Competition Act and the Ontario and Québec consumer protection acts.
- **Who is a consumer:** most buyers are businesses, but sole-proprietor trades could count as consumers, especially in Québec. Ask:
  - Do we need renewal reminder emails before an annual charge?
  - Do we need Ontario CPA internet-agreement disclosures and a copy of the contract?
  - **There is no "I agree to the Terms" step at sign-up or checkout.** Do we need clickwrap for the limitation-of-liability, indemnity and governing-law (Ontario) clauses to hold?
- **Marketing claims:** we softened 213 strings today: "every tender", "vetted", "free forever", "most popular", and false early-bird scarcity. Founding 500 shows no exact spots-left count. It only says "fewer than N left" when the number is genuinely low. Ask for a final check of the pricing and Founding pages.

## 5. Defamation, user content, forum
- Award, bid-result and "who wins" pages describe real companies, using official records only. Bid results are labelled unofficial, and insights and benchmarks are labelled as not advice.
- **Forum:**
  - New /forum/rules page: no defamation, no personal attacks, no unproven fraud accusations, no personal information, no spam. It is linked from the forum home and from every composer.
  - Members flag posts to moderators, and 3 reports hide a post automatically.
  - Visitors and non-members get a Report link that files a correction request.
  - Moderators can hide posts, lock or pin threads, and ban members; they cannot edit posts.
- Ask:
  - What is our exposure as a host after we receive notice (Canada has no safe harbour)?
  - What takedown timeline should we commit to?
  - Do the Terms give us a broad enough licence to user content, and enough notice-and-takedown wording?

## 6. Sponsorships and advertising
Sponsored placements are labelled "Sponsored" in en, fr and es, and their links carry rel="sponsored". Ask: are these labels enough under the Competition Act and Ad Standards rules? Do contracts with sponsors need any specific clauses?

## 7. Tax
- GST/HST: registration is required once taxable sales pass $30,000 over four consecutive quarters. Confirm whether TCG is already registered.
- QST: selling digital services to Québec consumers may require registration for QST, under the specified regime for out-of-province suppliers, above $30,000.
- U.S. customers: sales tax nexus for SaaS.
- Ask: is Stripe Tax configured? The Terms say "taxes as shown at checkout".

## 8. Québec Bill 96 (French language)
- French versions of the site, Terms, Privacy, Corrections and Forum Rules are complete.
- The French Terms are now declared equally authoritative, while the Spanish notice says English prevails.
- Ask:
  - Must contracts of adhesion be offered in French first, before an English choice?
  - Must invoices, receipts and Stripe checkout be in French for Québec customers?
  - Is "PMRFP" an issue as a trademark or brand name?

## 9. Open questions
1. **Legal entity:** what is TCG's exact legal name and form? Some pages call TCG an "affiliate of PMRFP". The new Terms say PMRFP is operated by TCG. Align all of these.
2. **Bid-help requests:** these go to HighLevel for TCG follow-up. If TCG and the PMRFP operator are different entities, this is a disclosure to a third party.
3. **Insurance:** E&O and cyber cover for a data republisher?
4. **"Award Intelligence":** do we need any extra terms on reselling public-record analytics, such as competitor profiles, by subscription?

import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Markdown } from "@/components/public/markdown";
import { CTASection } from "@/components/public/section";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";

const SLUG = "how-to-write-a-commercial-property-maintenance-rfp";
const TITLE = "How to Write a Commercial Property Maintenance RFP";
const META_DESC =
  "A working property manager's guide to writing commercial maintenance RFPs that get real, comparable bids — scope, insurance, evaluation, and the mistakes to avoid. Canada-specific.";

export const metadata: Metadata = {
  title: `${TITLE} | ${SITE.name}`,
  description: META_DESC,
  alternates: { canonical: `/resources/${SLUG}` },
};

const FAQS = [
  {
    q: "Do I need a lawyer to review the RFP before posting?",
    a: "Not for the RFP itself — it's an invitation to bid, not a contract. The contract you sign with the winning bidder is where legal review matters, especially for any job above $50,000 or any multi-year service agreement. For capital work, a standard CCDC 2 or short-form contract is worth the legal review.",
  },
  {
    q: "How many bidders should I invite?",
    a: "Three to five is right for most jobs. Fewer than three and you have no real price tension. More than five and you waste contractors' time quoting jobs they're unlikely to win, which means fewer respond to your future RFPs.",
  },
  {
    q: "What if no one responds to my RFP?",
    a: "Usually the tender period was too short, the scope was unclear, or the posting didn't reach the right trade. Give bidders at least three weeks, keep the scope specific, and reach out to a vendor or two directly to ask why. Don't reduce your requirements to get bids.",
  },
  {
    q: "My board wants me to always take the lowest price. What do I do?",
    a: "That's a governance problem more than a procurement one. The board sets the threshold; your job is to document the evaluation clearly enough that they can see why the awarded bid was the best value, not just the cheapest. Most boards accept a reasoned recommendation when shown a clear evaluation.",
  },
];

const ARTICLE = `Somewhere in your email right now there's a vendor quote. Maybe three of them, for the same job. One is $28,000. One is $41,000. One is $19,500 with a vague scope that could mean anything. You have no idea what's included, whether they're comparing the same materials, or whether the cheapest one has WSIB coverage. The board is asking when you'll have a recommendation.

This is what happens when you collect quotes instead of running an RFP.

A proper request for proposal — even a simple one — gives every contractor the same scope, the same requirements, and the same questions to answer. What you get back is actually comparable. You can defend your decision to the board. You have a paper trail. And you've created price tension, because every contractor knows there are others bidding.

This guide walks through how to write one, from scratch, for any commercial property maintenance job.

## Why "phone three contractors for quotes" keeps failing you

The informal quote process works fine for small repairs — a broken window, a one-off plumbing call, replacing a single fixture. Under roughly $5,000 to $10,000, the overhead of a formal RFP isn't worth it.

For anything larger, the informal process creates four specific problems:

**No comparable scope.** Each contractor interprets the job differently. One includes tear-off and disposal; one assumes you'll handle disposal; one is pricing a recover, not a replacement. When the bids come back at wildly different numbers, you can't tell if it's because the scopes differ or because someone is padding.

**No paper trail.** When a board member challenges your vendor selection, "I called three roofers" is not a defensible answer. An RFP with documented bid responses and a written evaluation is.

**No price tension.** A contractor who is the only bidder knows it, and prices accordingly. A contractor who knows they're competing against two other qualified shops prices more carefully.

**No board-approval trigger.** Most condo corporations and commercial leases have spending thresholds that require board approval or a formal competitive process. Keeping things informal to avoid the process often makes the governance situation worse, not better.

The RFP process doesn't have to be bureaucratic. A focused RFP for a flat roof replacement or a snow removal contract can be written in under an hour and posted the same day.

## What counts as an RFP versus a simple quote request

Not every job needs a full RFP. Here's a rough decision rule.

**Use a simple quote request when:**
- The job is under $5,000–$10,000 (the threshold varies by your condo bylaws, management agreement, or owner's spending policy — check yours)
- The scope is unambiguous (e.g., "replace one exterior door")
- You already have an approved vendor and just need pricing
- It's an emergency with no time for a tender period

**Use an RFP when:**
- The job exceeds your spending threshold or requires board approval
- You're awarding a multi-year contract (snow, janitorial, HVAC maintenance, elevator service)
- The scope requires a site visit to price accurately
- You're comparing meaningfully different approaches (boiler: mid-efficiency vs. high-efficiency condensing; flat roof: TPO vs. EPDM vs. modified bitumen)
- It's capital work charged to the reserve fund or line-itemed in an annual budget
- You're sourcing a new vendor in a trade where you have no established relationship

For capital projects — boiler replacement, roof replacement, elevator modernization, parking lot reconstruction — the RFP is almost always the right tool, regardless of dollar amount. The documentation alone justifies it.

## Writing the scope: the part everyone gets wrong

Most bad RFPs fail at the scope. Either they're so vague that contractors have to guess, or they're so prescriptive that you've made decisions that should be left to the bidder (like specifying an exact product when you actually want their recommendation).

A solid scope has four parts.

### 1. Describe the building and the site

Contractors need to understand what they're walking into before they can price accurately. Include:

- Property type (multi-unit residential, commercial office, mixed-use, industrial)
- Age and rough size
- Relevant history (existing system age, known issues, prior work)
- Site constraints: occupied during work? Elevator or parking required? Limited staging area? Crane access?

You don't need an essay. Four to six sentences is usually enough.

### 2. Describe the work

Be specific about what you want done, but leave method open where you're genuinely agnostic. "Replace the boiler" is too vague. "We need a like-for-like or upgraded replacement of our existing 2,000,000 BTU natural-gas hot-water boiler, including all TSSA-required permits and inspections, controls integration with our existing thermostat system, and a plan to minimize heating downtime during the swap" is a scope.

**What to include:**

- What is being replaced, repaired, or maintained (with current specs if known)
- What is explicitly included (materials, disposal, permits, commissioning, warranties)
- What is explicitly excluded — anything that might be assumed in scope but isn't
- Add-alternates: items you might want but want priced separately so you can decide later

Add-alternates are underused. If you're replacing the boiler and you might also want the circulating pumps done, don't guess whether the bidder included them. Put it as an add-alternate. They price it separately. You decide after you see the numbers.

### 3. Worked example: a flat roof scope skeleton

Here's how a scope section reads for a flat roof replacement on a mid-rise residential property.

> **Scope of work:** Tear-off and disposal of existing membrane roof system (approx. 18,000 sq ft), including all layers down to deck. Inspection and report on deck condition; allowance for deck repair quoted as a separate line item. Install new tapered insulation to current Ontario Building Code R-value. Install new single-ply membrane (bidder to specify system: TPO, EPDM, or modified bitumen) with manufacturer-certified installation. All flashings, edge metal, drains, and penetrations included. Daily site cleanup; final disposal manifest provided. Final manufacturer inspection and issuance of an NDL (No Dollar Limit) warranty.
>
> **Out of scope unless quoted as add-alternates:** Structural deck replacement beyond 10% of total area; roof-access ladder upgrade; HVAC unit reset or re-curbing.

That tells the contractor what they're pricing, what's included, what's not, and that they have room to recommend their preferred system. Use the [flat roof replacement template](/rfp-templates/flat-roof-replacement) if you want this pre-filled and ready to post.

Before writing the scope, check what typical costs look like so you know whether the bids you get are in the right range. The [commercial roof replacement cost guide](/cost-guides/commercial-roof-replacement-cost) covers TPO, EPDM, modified bitumen, and built-up systems, with the main cost drivers explained.

## What to require from every bidder

Every RFP, regardless of trade, should include a standard requirements section. These are the non-negotiables — a bidder who can't meet them doesn't make the shortlist.

**Insurance.** $5 million general liability minimum for most commercial and capital work; $2 million is acceptable for lower-risk service contracts (landscaping, painting, janitorial). The certificate must name the building owner (or condo corporation) as additional insured. Get the certificate before mobilization, not just a promise.

**WSIB.** A valid WSIB clearance certificate in good standing. Non-negotiable in Ontario. For trades from other provinces, confirm registration with the applicable WCB.

**Trade certifications.** This is where most PMs are vague, and it matters. They vary by trade:

- Gas/boiler work: TSSA Gas Technician certification (Ontario). See the [boiler replacement template](/rfp-templates/boiler-replacement) or [rooftop unit replacement template](/rfp-templates/rooftop-unit-replacement) for the specific TSSA language.
- Electrical: an ESA (Electrical Safety Authority) licensed contractor in Ontario; panel, service, and new-circuit work requires an ESA permit and inspection. See the [commercial electrical cost guide](/cost-guides/commercial-electrical-cost) for what that adds.
- Elevators: a TSSA-licensed elevator mechanic. The [elevator service contract template](/rfp-templates/elevator-service-contract) spells out the requirements.
- Fire safety: CFAA (Canadian Fire Alarm Association) certification for alarm work. See the [annual fire safety inspection template](/rfp-templates/annual-fire-safety-inspection).
- Mold remediation: IICRC S520 certification — and never let the remediation company do its own clearance testing; require an independent industrial hygienist.
- Roofing: manufacturer certification, not a government licence — the membrane manufacturer's certified-installer program is what secures the NDL warranty.

**References.** Three comparable projects completed in the last 24 months, with contact information you will actually call. "Comparable" means similar in scale and type — a roofer experienced on 3,000 sq ft strip malls is not the same as one experienced on 25,000 sq ft residential mid-rise.

**Project manager assignment.** For any job longer than a week, require the contractor to name their project manager and site contact before mobilization. You want one person you can reach.

## How to evaluate bids fairly

You have three submissions. Now what?

**1. Verify requirements first.** Before you read pricing, confirm every bidder meets the minimums: insurance naming the right parties, WSIB clearance, required certifications. Anyone who can't provide these is disqualified. Don't waive this to reach a lower price.

**2. Compare scope coverage, not just totals.** Build a checklist of everything your scope required, and mark what each bidder included, excluded, or was ambiguous on. If bidder A included disposal and bidder B didn't, their prices aren't comparable until you adjust.

**3. Look at add-alternates separately.** Compare base prices, then add-alternate pricing independently. A bidder higher on base may be far lower on an alternate you're likely to approve — which changes the total picture.

**4. Call references.** At least two for your shortlisted bidder. Did they finish on time? Were change orders reasonable? Would you use them again? The question that surfaces the most: "How did they handle problems when they came up?" — because on any substantial job, something will.

**5. Document your decision.** Write a brief evaluation summary — even one page — explaining why you selected the awarded vendor: that you verified insurance and certifications, called references, and selected on the criteria you named in the RFP. It goes in the property file. When the board asks why you chose the middle bidder over the lowest, you have an answer.

**On lowest price:** it's relevant information, not the decision. A boiler installed by an uncertified contractor that fails TSSA inspection costs more than the savings. A snow contractor who doesn't show during a freezing-rain event creates more liability than a cheaper per-season rate. You're awarding the combination of scope coverage, credentials, references, and price — in that order.

## Common mistakes that produce bad bids

**A vague scope you expect contractors to fill in.** They won't. They'll each fill it in differently and you'll get incomparable numbers.

**Pricing without a site walk.** For roofing, parking lots, and HVAC replacement, get shortlisted bidders on site before they finalize pricing. The site walk is where they find the things that otherwise become change orders.

**Too short a tender period.** Three weeks is the minimum for most capital jobs. One week gets you whoever happened to be free, not the best bidder.

**Ignoring the calendar.** Award snow contracts by October 1, paving runs May through October, exterior painting needs warm dry weather. The best bids come from contractors who aren't desperate. Issue the RFP before the season, not after it starts.

**Not reading the exclusions.** The $19,500 roof quote that excludes disposal, deck repair, and the NDL warranty is not the low bid once you add those back in. Read every line.

**A multi-year contract with no termination clause.** Elevator contracts are the worst — some are five-year auto-renewing agreements that are nearly impossible to exit. Require a 90-day termination-for-convenience clause on any multi-year contract. If the vendor won't agree, that's information.

**No paper trail on change orders.** The RFP sets the price; anything beyond that scope should require written approval before the contractor proceeds. Verbal mid-job approvals are how a $28,000 contract becomes $47,000.

## Templates by trade

If you don't want to write a scope from scratch, these have the scope, requirements, timeline, and evaluation criteria filled in. Customize with your property details and post.

**Roofing**
- [Flat Roof Replacement template](/rfp-templates/flat-roof-replacement) — tear-off and new single-ply membrane. [Typical costs.](/cost-guides/commercial-roof-replacement-cost)
- [Annual Roof Inspection & Maintenance template](/rfp-templates/annual-roof-inspection-contract) — twice-yearly inspections and a minor-repair allowance.
- [Emergency Roof Repair template](/rfp-templates/emergency-roof-repair) — fast response for active leaks.

**HVAC**
- [Boiler Replacement template](/rfp-templates/boiler-replacement) — mid or high-efficiency, TSSA requirements, heating-downtime plan.
- [Rooftop Unit Replacement template](/rfp-templates/rooftop-unit-replacement) — RTU swap with crane, curb, and controls. [Typical costs.](/cost-guides/commercial-hvac-replacement-cost)
- [Annual HVAC Maintenance template](/rfp-templates/annual-hvac-maintenance-contract) — quarterly visits, repair allowance, emergency terms.

**Exterior and grounds**
- [Snow Removal Seasonal Contract template](/rfp-templates/snow-removal-seasonal-contract) — per-season or per-event, response times, slip-and-fall liability. [Typical costs.](/cost-guides/commercial-snow-removal-cost)
- [Parking Lot Resurfacing template](/rfp-templates/parking-lot-resurfacing) — mill-and-overlay or full reconstruction. [Typical costs.](/cost-guides/parking-lot-paving-cost)
- [Landscaping Annual Contract template](/rfp-templates/landscaping-annual-contract) — weekly maintenance, seasonal cleanup, irrigation.
- [Exterior Painting template](/rfp-templates/exterior-painting) — full repaint with prep, warranty, and lift/scaffold scope. [Typical costs.](/cost-guides/commercial-painting-cost)

**Mechanical and electrical**
- [Elevator Service Contract template](/rfp-templates/elevator-service-contract) — full-maintenance vs. oil-and-grease, TSSA requirements, exit clauses.
- [Electrical Panel Upgrade template](/rfp-templates/electrical-panel-upgrade) — service upgrade, ESA coordination, outage planning. [Typical costs.](/cost-guides/commercial-electrical-cost)
- [LED Lighting Retrofit template](/rfp-templates/led-lighting-retrofit) — rebate coordination, fixture audit, payback analysis.

**Safety and compliance**
- [Annual Fire Safety Inspection template](/rfp-templates/annual-fire-safety-inspection) — CFAA-certified, deficiency reporting, conflict-of-interest disclosure.
- [Mold Remediation template](/rfp-templates/mold-remediation) — IICRC containment with independent clearance.

**Cleaning and restoration**
- [Janitorial Annual Contract template](/rfp-templates/janitorial-annual-contract) — daily scope, references, performance terms. [Typical costs.](/cost-guides/commercial-cleaning-cost)
- [Common Area Painting template](/rfp-templates/common-area-painting) — occupied-building phasing, low-VOC, floor-by-floor scheduling.
- [Post-Damage Restoration template](/rfp-templates/post-damage-restoration) — emergency water/fire/smoke, insurance-direct billing.

## FAQ

**Do I need a lawyer to review the RFP before posting?**

Not for the RFP itself — it's an invitation to bid, not a contract. The contract you sign with the winning bidder is where legal review matters, especially for any job above $50,000 or any multi-year service agreement. For capital work, a standard CCDC 2 or short-form contract is worth the few hundred dollars in legal review.

**How many bidders should I invite?**

Three to five for most jobs. Fewer than three and you have no real price tension. More than five and you waste contractors' time quoting jobs they're unlikely to win — which means fewer respond next time. If vendor quality is a concern, invite more at the expression-of-interest stage and shortlist to three for full bids.

**What if no one responds to my RFP?**

Usually the tender period was too short, the scope was unclear, or the posting didn't reach the right trade. Give bidders at least three weeks. If you're getting zero interest, reach out to a vendor or two directly to ask why — often there's a simple fix. Don't reduce your requirements to get bids.

**My board wants me to always take the lowest price. What do I do?**

That's a governance problem more than a procurement one. The board sets the threshold ("a competitive process for anything over $25,000") and should understand that lowest price is one input, not the only one. Your job is to document the evaluation clearly enough that they can see why the awarded bid was the best value. Most boards, shown a clear evaluation, accept a reasoned recommendation.`;

export default function RfpGuidePage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Resources", path: "/resources" },
          { name: TITLE, path: `/resources/${SLUG}` },
        ])}
      />
      <JsonLd data={faqSchema(FAQS)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: META_DESC,
          author: { "@type": "Organization", name: SITE.name, url: SITE.url },
          publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
          mainEntityOfPage: `${SITE.url}/resources/${SLUG}`,
          inLanguage: "en-CA",
        }}
      />

      <Container size="narrow" className="py-14">
        <Link href="/resources" className="text-sm text-muted-foreground hover:text-foreground">
          ← All resources
        </Link>
        <p className="mt-6 font-mono text-xs uppercase tracking-widest text-teal-ink">Guide</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{TITLE}</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          A working property manager&apos;s guide to running a competitive process that gets you
          real, comparable bids — and a decision you can defend to your board.
        </p>
        <article className="mt-8">
          <Markdown content={ARTICLE} />
        </article>
      </Container>

      <CTASection
        title="Post your project — free"
        description="Once your scope is written, posting takes about two minutes. Qualified trades respond, and you stay anonymous until you choose to engage."
        primaryHref="/sign-up?role=property_manager"
        primaryLabel="Post a project — free"
        secondaryHref="/rfp-templates"
        secondaryLabel="Browse RFP templates"
      />
    </>
  );
}

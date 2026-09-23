import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { Markdown } from "@/components/public/markdown";
import { CTASection } from "@/components/public/section";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";

const SLUG = "how-to-post-a-quality-rfp";
const TITLE = "How to Post an RFP That Gets Real Bids: 7 Steps";
const META_DESC =
  "The seven steps from 'we need a contractor' to a signed contract — and exactly what to put in each field of your RFP so qualified Canadian trades bid, and bid comparably.";

const STEPS = [
  "Define the need and get sign-off before you post",
  "Decide who should see it",
  "Write the request — field by field",
  "Run a fair Q&A and site walk",
  "Receive bids and check compliance first",
  "Score against criteria you set in advance",
  "Award, sign, and close the loop",
];

const FAQS = [
  {
    q: "How long should my RFP stay open?",
    a: "Three weeks for capital work and multi-year service contracts. One to two weeks is fine for a small, well-defined job. Shorter than that and you only hear from whoever happens to be free — not the best shop.",
  },
  {
    q: "Should I show my budget?",
    a: "If the board has already approved a number, showing a range usually gets you better bids: trades who can't work at that level skip it, and the ones who bid design to it. If you genuinely don't know what the work costs, keep the budget private and check a cost guide so you can spot outliers when bids arrive.",
  },
  {
    q: "Do I have to take the lowest bid?",
    a: "No — unless your bylaws or owner's policy say so. Tell bidders in the RFP how you'll evaluate (price, experience, schedule, scope coverage), score against those criteria, and write one page on why you chose the winner. That's what a board needs to see.",
  },
  {
    q: "Can I stay anonymous while I collect interest?",
    a: "Yes. On PMRFP you can keep your contact details hidden until you approve a trade's interest, or have interest routed through PMRFP. Your building and budget details stay yours until you choose to engage.",
  },
];

const ARTICLE = `Most RFPs that get zero bids, or three bids nobody can compare, weren't bad projects. They were bad requests. The scope said "repair roof as needed." The deadline was four days out. Nobody said whether disposal was included, whether a site visit was possible, or how the winner would be picked.

Good trades read that and move on. They have more work than time, and they bid on the requests that tell them exactly what they're pricing.

Here's the whole process in seven steps — from "we need a contractor" to a signed contract — with what to put in each field when you post on PMRFP.

## 1. Define the need and get sign-off before you post

The fastest way to lose a good contractor is to run an RFP, collect bids, and then discover the board won't approve the spend. Do the internal work first.

- **What problem are you solving?** "The roof leaks in three places after heavy rain" is a need. "New roof" is a guess at the answer. Start from the problem — a good bidder may propose a better fix.
- **Who approves the award?** Board, owner, asset manager, or you. Know your spending threshold and whether a competitive process is required.
- **Where does the money come from?** Reserve fund, operating budget, or an insurance claim. It changes the timeline and the paperwork.
- **When does the work have to happen?** Snow contracts should be awarded before the season starts, paving and exterior painting need warm, dry weather, and roofing is easiest before winter.

Write the answers down in a paragraph. It becomes the opening of your scope.

## 2. Decide who should see it

You want three to five serious bids. Fewer than three and there's no price tension. More than five and contractors stop bidding on your projects, because the odds aren't worth the estimating time.

On PMRFP, the **categories**, **region** and **property type** you choose decide which trades see your request. Be precise:

- Pick the trade that actually does the work. A boiler replacement is HVAC, not general contracting.
- Pick the region where the building is, not where your office is.
- Only add a second or third category if the work genuinely spans trades.

If you already have a contractor you trust, invite them to bid too. The RFP is how you check their price, not a replacement for the relationship.

## 3. Write the request — field by field

This is where quality is won or lost. Here's what each field is for.

### RFP title

Say the work, the property type and the city. A contractor scanning a list decides in two seconds.

> **Weak:** Roofing project
>
> **Strong:** Flat roof replacement — 18,000 sq ft mid-rise condo, Mississauga

### Short summary

Two sentences: what you need and the one detail that shapes the price.

> Tear-off and replacement of a 20-year-old built-up roof on an occupied 9-storey residential building. Work must be completed between June and September, with no interruption to rooftop mechanical units.

### Full scope

The scope is the job. Every gap in it becomes a different assumption in each bid — and a change order later. Cover five things:

1. **The building.** Type, age, size, and anything that affects access: occupied units, elevator use, staging space, parking, crane access.
2. **The work.** What is being replaced, repaired or maintained, with current specs where you know them (system type, capacity, square footage, number of units).
3. **What's included.** Materials, disposal, permits, inspections, commissioning, warranty.
4. **What's excluded.** Anything a bidder might reasonably assume is in scope but isn't.
5. **Add-alternates.** Items you might want, priced separately, so you can decide after you see the numbers.

Leave the method open where you honestly don't mind how it's done. "Bidder to recommend TPO, EPDM or modified bitumen, with reasons" gets you expertise. Naming one product gets you the same bid three times.

Photos help more than a paragraph. Add a few of the equipment, the area, or the damage.

### Requirements

The non-negotiables. A bid that can't meet them doesn't get scored.

- **Insurance.** Commercial general liability — commonly $5M for capital work, $2M for lower-risk service contracts — with the owner or condo corporation named as additional insured.
- **Workers' compensation.** A WSIB clearance certificate in Ontario, or the equivalent WCB coverage in other provinces.
- **Licences and certifications for the trade.** TSSA for gas and elevators, ESA for electrical in Ontario, manufacturer certification for roofing warranties.
- **References.** Three comparable jobs in the last two years, with contacts you'll actually call.
- **A named project lead** for anything longer than a week.

### Budget

If you have an approved number, give a range and consider showing it. Trades who can't work at that level will skip the request, and the ones who bid will design to it. If you don't know what the work costs yet, keep the budget private and check a [cost guide](/cost-guides) first so you can spot a bid that's too good to be true.

### Submission deadline

Three weeks for capital work and multi-year contracts; one to two weeks for small, well-defined jobs. Four days gets you whoever is free, not whoever is best.

### Submission instructions

Tell bidders exactly what to send and how you'll decide. This is the field most PMs leave blank, and it's the one that makes bids comparable.

> Submit a lump-sum price for the base scope, with each add-alternate priced separately. Include your insurance certificate, WSIB clearance, proposed schedule and three references. Optional site walk on May 12 at 10 a.m. — email to confirm. Questions in writing by May 15; answers will be shared with all bidders. Evaluation: price 40%, relevant experience and references 30%, scope coverage 20%, schedule 10%.

Those weights are an example — set your own. What matters is that bidders know them before they bid.

### Contact visibility

Choose how trades reach you. You can publish your contact details to paid members, route interest through PMRFP, or stay anonymous until you approve a trade's interest.

## 4. Run a fair Q&A and site walk

Every bidder should price the same job. So:

- **Answer questions in writing, and send every answer to every interested bidder** — not just the one who asked.
- **Hold one site walk** for anything that can't be priced from photos: roofs, parking lots, mechanical rooms. It's where contractors find the things that would otherwise become change orders.
- **Set a question cut-off** a few days before the deadline so late answers don't reach some bidders and miss others.
- **Don't negotiate privately during the bid period.** If the scope changes, it changes for everyone.

## 5. Receive bids and check compliance first

When the deadline passes, check each bid against your requirements before you look at price:

- Insurance certificate with the right named insured
- WSIB or WCB clearance in good standing
- Required licences and certifications
- References included
- Every scope item priced, or clearly marked as excluded

Anything missing a hard requirement is out. Don't waive it to keep a low number in play — a boiler installed by an uncertified contractor that fails its TSSA inspection costs far more than the saving.

## 6. Score against criteria you set in advance

Now compare the compliant bids, using the weights you published.

- **Normalize the scope.** Build a simple checklist of everything the scope required and mark what each bidder included, excluded, or left vague. A $19,500 bid that excludes disposal and the warranty isn't the low bid once you add those back.
- **Price add-alternates separately.** The bidder who's higher on the base may be much lower on an alternate you're likely to approve.
- **Call at least two references** for your top pick. Ask: "How did they handle it when something went wrong?"
- **Shortlist to two** if the job is large, and interview both.

## 7. Award, sign, and close the loop

- **Put it in writing.** Sign a contract that includes the scope, price, schedule, payment terms, warranty, and a written change-order process. For multi-year service agreements, include a termination-for-convenience clause. Have a lawyer review larger or multi-year contracts.
- **Collect certificates before mobilization.** Get the insurance and WSIB paperwork before anyone is on site, not a promise that it's coming.
- **Tell the unsuccessful bidders.** One line is enough: "Thanks — we've awarded this one." Trades remember who told them. It's the cheapest way to get good bids next time.
- **Mark the RFP as awarded on PMRFP** so it comes off the board and your history stays accurate.
- **File a one-page evaluation summary.** When a board member asks why you didn't take the cheapest bid, it's already written.

## The pre-submit checklist

Before you click submit, check:

- [ ] Title names the work, the property type and the city
- [ ] Summary says what you need in two sentences
- [ ] Scope covers the building, the work, inclusions, exclusions and add-alternates
- [ ] At least one photo of the area or equipment
- [ ] Requirements list insurance, WSIB/WCB, licences and references
- [ ] Budget range entered (shown or private)
- [ ] Deadline gives bidders at least one to three weeks
- [ ] Submission instructions say what to send, the site-walk date, the question cut-off, and how you'll score
- [ ] Sign-off to award is already in place

If you'd rather not start from a blank page, every [RFP template](/rfp-templates) comes with the scope, requirements and evaluation criteria filled in — edit it for your building and post. For the long version of scope writing and bid evaluation, read [how to write a commercial property maintenance RFP](/resources/how-to-write-a-commercial-property-maintenance-rfp).

## FAQ

**How long should my RFP stay open?**

Three weeks for capital work and multi-year service contracts. One to two weeks is fine for a small, well-defined job. Shorter than that and you only hear from whoever happens to be free — not the best shop.

**Should I show my budget?**

If the board has already approved a number, showing a range usually gets you better bids: trades who can't work at that level skip it, and the ones who bid design to it. If you genuinely don't know what the work costs, keep the budget private and check a cost guide so you can spot outliers when bids arrive.

**Do I have to take the lowest bid?**

No — unless your bylaws or owner's policy say so. Tell bidders in the RFP how you'll evaluate, score against those criteria, and write one page on why you chose the winner. That's what a board needs to see.

**Can I stay anonymous while I collect interest?**

Yes. On PMRFP you can keep your contact details hidden until you approve a trade's interest, or have interest routed through PMRFP. Your building and budget details stay yours until you choose to engage.`;

export const metadata: Metadata = {
  title: TITLE,
  description: META_DESC,
  alternates: { canonical: `/resources/${SLUG}` },
};

export default function QualityRfpGuidePage() {
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
          "@type": "HowTo",
          name: TITLE,
          description: META_DESC,
          inLanguage: "en-CA",
          step: STEPS.map((name, i) => ({
            "@type": "HowToStep",
            position: i + 1,
            name,
          })),
        }}
      />

      <Container size="narrow" className="py-14">
        <Link href="/resources" className="text-sm text-muted-foreground hover:text-foreground">
          ← All resources
        </Link>
        <p className="mt-6 font-mono text-xs uppercase tracking-widest text-teal-ink">Guide · Property managers</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{TITLE}</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          What to do before, during and after you post — and what to write in each field so good
          trades bid, and bid on the same job.
        </p>
        <ol className="mt-8 space-y-1.5 rounded-lg border border-border bg-card p-5 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="font-mono text-teal-ink">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <article className="mt-8">
          <Markdown content={ARTICLE} />
        </article>
      </Container>

      <CTASection
        title="Post your RFP — free"
        description="Start from a template or a blank form. We review every listing before it goes live, and you stay anonymous until you choose to engage."
        primaryHref="/sign-up?role=property_manager"
        primaryLabel="Post an RFP — free"
        secondaryHref="/rfp-templates"
        secondaryLabel="Browse RFP templates"
      />
    </>
  );
}

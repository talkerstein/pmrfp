import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, PencilRuler, Send } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { PostForMeForm } from "@/components/forms/post-for-me-form";
import { TrustDisclaimer } from "@/components/public/trust-disclaimer";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Post my RFP for me — concierge RFP posting | PMRFP",
  description: `Short on time? Describe your commercial or residential building project and ${SITE.name} drafts and posts the RFP for you — free. You approve it before it goes live to vetted Canadian trades in your region.`,
  alternates: { canonical: "/post-for-me" },
};

const STEPS = [
  {
    icon: FileText,
    title: "Describe the project",
    desc: "A few sentences on the work, the building, and where it is. Two minutes — no account needed.",
  },
  {
    icon: PencilRuler,
    title: "We draft the RFP",
    desc: `${SITE.name} turns it into a clear, structured RFP — scope, requirements, region — and sends it to you to approve.`,
  },
  {
    icon: Send,
    title: "It goes live to trades",
    desc: "Once you approve, vetted trades in your category and region see it and respond. You compare bids in one place.",
  },
];

export default function PostForMePage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-border bg-indigo text-white">
        <Container className="py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_320px] lg:items-center">
            <div>
              <Eyebrow className="text-teal">Concierge posting · free</Eyebrow>
              <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
                Don&rsquo;t have time to write the RFP?
                <br />
                <span className="text-teal-300">We&rsquo;ll post it for you.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-indigo-100/80">
                Describe your building project in a few sentences. {SITE.name} drafts a clean,
                structured RFP, sends it to you to approve, and publishes it to vetted Canadian
                trades in your region. Free — and you&rsquo;re in control the whole way.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#post-form"
                  className="inline-flex items-center gap-2 rounded-full bg-teal-300 px-5 py-2.5 text-sm font-semibold text-indigo transition-colors hover:bg-teal-300/90"
                >
                  Send us your project <ArrowRight className="size-4" />
                </a>
                <Link
                  href="/sign-up?role=property_manager&next=/pm-dashboard/rfps/new"
                  className="inline-flex items-center px-3 py-2.5 text-sm font-medium text-indigo-100/80 transition-colors hover:text-white"
                >
                  Rather post it yourself? Do it free →
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur">
              <p className="text-xs font-mono uppercase tracking-widest text-teal-300">
                What it costs
              </p>
              <p className="mt-1 text-3xl font-semibold text-white">$0</p>
              <ul className="mt-5 space-y-2.5 text-sm text-indigo-100/85">
                <li>· we draft the RFP from your description</li>
                <li>· you approve it before anything goes live</li>
                <li>· published to matched trades by region</li>
                <li>· no account required to start</li>
                <li>· no obligation to hire anyone</li>
              </ul>
            </div>
          </div>
        </Container>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-background">
        <Container className="py-16">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Three steps. You stay in control.
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-teal-100 text-teal-ink">
                    <s.icon className="size-5" />
                  </span>
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Step {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* THE FORM */}
      <section id="post-form" className="border-t border-border bg-secondary/30">
        <Container size="narrow" className="py-16">
          <Eyebrow>Send us your project</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Two minutes now. We&rsquo;ll handle the rest.
          </h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
            Describe the work and where to send the draft. We&rsquo;ll reply within one business
            day with a structured RFP for your approval.
          </p>
          <div className="mt-8">
            <PostForMeForm />
          </div>
          <div className="mt-10">
            <TrustDisclaimer
              text={`${SITE.name} drafts and posts RFPs on your behalf and connects you with trades. We don't guarantee bids, responses, contract awards, or revenue. You approve every RFP before it goes live and choose whether to hire.`}
            />
          </div>
        </Container>
      </section>
    </>
  );
}

/**
 * Print-optimized template view. The "Download PDF" CTA on the detail page links
 * here; the page auto-triggers the browser print dialog (which writes a clean PDF
 * via the OS print pipeline — no extra dependency, identical output cross-platform).
 *
 * Layout is intentionally narrow, serif-friendly, and free of nav/footer chrome.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { RFP_TEMPLATES, getRfpTemplate } from "@/lib/seo/rfp-templates";
import { SITE } from "@/lib/site";
import { PrintTrigger } from "./print-trigger";

export const revalidate = 86400;

export async function generateStaticParams() {
  return RFP_TEMPLATES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const t = getRfpTemplate(slug);
  return {
    title: t ? `${t.name} — Print View` : "Not found",
    robots: { index: false, follow: false },
  };
}

export default async function PrintableTemplate({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = getRfpTemplate(slug);
  if (!t) notFound();

  return (
    <div className="mx-auto max-w-4xl bg-white px-8 py-10 text-[12pt] leading-relaxed text-black print:px-0 print:py-0">
      <PrintTrigger />
      <style>{`
        @page { margin: 0.75in; }
        @media print {
          header.site-header, footer.site-footer, .no-print { display: none !important; }
          body { background: white; }
          a { text-decoration: none; color: inherit; }
        }
      `}</style>

      <div className="no-print mb-6 flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <span>
          Press <kbd className="rounded border border-gray-300 bg-white px-1.5 py-0.5 font-mono text-xs">Ctrl/Cmd + P</kbd> and
          choose &ldquo;Save as PDF&rdquo; if the print dialog didn&rsquo;t open automatically.
        </span>
        <a
          href={`/rfp-templates/${t.slug}`}
          className="ml-4 text-sm font-medium text-indigo-700 hover:underline"
        >
          ← Back to template
        </a>
      </div>

      <header className="border-b-2 border-black pb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">
          RFP Template — {SITE.name}
        </p>
        <h1 className="mt-2 text-2xl font-bold">{t.name}</h1>
        <p className="mt-1 text-sm text-gray-700">{t.pitch}</p>
      </header>

      <Section title="When to use this template">
        <p>{t.whenToUse}</p>
      </Section>

      <Section title="Sample title">
        <p className="font-semibold">{t.titleSample}</p>
      </Section>

      <Section title="Summary">
        <p>{t.summarySample}</p>
      </Section>

      <Section title="Scope of work">
        <pre className="whitespace-pre-wrap font-sans text-[11pt] leading-relaxed">{t.scope}</pre>
      </Section>

      <Section title="Standard requirements">
        <pre className="whitespace-pre-wrap font-sans text-[11pt] leading-relaxed">
          {t.requirements}
        </pre>
      </Section>

      <Section title="Suggested timeline">
        <ol className="ml-5 list-decimal space-y-1.5">
          {t.timeline.map((p) => (
            <li key={p.label}>
              <span className="font-semibold">{p.label}:</span> {p.detail}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Site access & logistics">
        <p>{t.siteAccess}</p>
      </Section>

      <Section title="Questions every bidder should answer">
        <ul className="ml-5 list-disc space-y-1">
          {t.questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      </Section>

      <Section title="Evaluation criteria">
        <ol className="ml-5 list-decimal space-y-1">
          {t.evaluationCriteria.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ol>
      </Section>

      <footer className="mt-10 border-t border-gray-300 pt-4 text-xs text-gray-600">
        <p className="font-semibold">{SITE.name} — Free RFP template</p>
        <p className="mt-1">
          This is a scoping template, not a contract. Have your lawyer review the final RFP and
          procurement contract. For real, scope-specific pricing, post your RFP on{" "}
          <span className="font-semibold">{SITE.url.replace(/^https?:\/\//, "")}</span> — Canadian
          trades respond free.
        </p>
        <p className="mt-3 text-gray-500">
          Printed from {SITE.url.replace(/^https?:\/\//, "")}/rfp-templates/{t.slug}
        </p>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="border-b border-gray-300 pb-1 text-base font-bold uppercase tracking-wide text-gray-800">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

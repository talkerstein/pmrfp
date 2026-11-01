import type { Metadata } from "next";
import Link from "@/i18n/link";
import { Container } from "@/components/container";
import { VendorUploadForm } from "@/components/vendor-certs/vendor-upload-form";
import { lookupRequest } from "@/lib/vendor-certs/server";
import { SITE } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { fmt } from "@/i18n/format";

// Per-link state (open / used / expired) must never be served from a cache.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: getDictionary(hasLocale(lang) ? lang : "en").certs.vendor.metaTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * /vendor-certificate/[token] — the one-time link a vendor gets when a PM
 * clicks "Request certificate" (or in a renewal reminder). No account: the
 * token is the credential. Invalid, used and expired links land on a
 * friendly message; after the upload, a soft prompt to claim or create
 * their free PMRFP trade profile.
 */
export default async function VendorCertificatePage({ params }: { params: Promise<{ token: string }> }) {
  await setLangFrom(params);
  const t = getT("certs").vendor;
  const types = getT("certsClient").types;
  const { token } = await params;
  const req = await lookupRequest(token);

  if (req.state !== "open") {
    const [before, after] = t.mistake.split("{email}");
    return (
      <Container size="narrow" className="py-16">
        <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight">{req.state === "expired" ? t.expiredTitle : t.brokenTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{req.state === "expired" ? fmt(t.expiredBody, { company: req.company }) : t.brokenBody}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            {before}
            <a href={`mailto:${SITE.email}`} className="font-medium text-teal-ink hover:underline">{SITE.email}</a>
            {after}
          </p>
          <Link href="/" className="mt-6 inline-block text-sm font-medium text-teal-ink hover:underline">{t.goHome}</Link>
        </div>
      </Container>
    );
  }

  const cert = types[req.country][req.type];
  return (
    <Container size="narrow" className="py-10 sm:py-14">
      <div className="mx-auto max-w-xl">
        <p className="eyebrow text-teal-600">{t.eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{fmt(t.title, { company: req.company, cert })}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{fmt(t.intro, { company: req.company, vendor: req.vendorName })}</p>
        <div className="mt-6">
          <VendorUploadForm
            token={token}
            company={req.company}
            country={req.country}
            onPmrfp={req.onPmrfp}
            current={{ insurer: req.insurer, policyNumber: req.policyNumber, coverage: req.coverage, expiresOn: req.expiresOn }}
          />
        </div>
      </div>
    </Container>
  );
}

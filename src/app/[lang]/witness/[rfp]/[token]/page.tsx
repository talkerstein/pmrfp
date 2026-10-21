import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { isServiceConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { WitnessConfirmForm } from "@/components/towns/jobs/sealed-forms";
import { witnessInfo } from "@/lib/town-jobs/sealed-server";
import { closingLabel, momentLabel } from "@/lib/town-jobs/sealed-email-copy";
import { loadTownJob } from "@/lib/town-jobs/server";
import { townTimeZone } from "@/lib/town-jobs/sealed";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { fmt, plural } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").townResults.witness.title, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/**
 * The witness's one-time link (PMRFP for Towns, Part C): a one-person town
 * named this person to confirm the opening of its sealed quotes. No account:
 * the link is the credential, checked against the SHA-256 the database keeps,
 * and it works once. The page shows counts only; confirming opens the box
 * for the town and puts the witness's typed name in the record.
 */
export default async function WitnessPage({ params }: { params: Promise<{ rfp: string; token: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("townResults").witness;
  const { rfp, token } = await params;
  const valid = /^[0-9a-f-]{36}$/i.test(rfp) && /^[A-Za-z0-9_-]{16,100}$/.test(token);
  const db = valid && isServiceConfigured() ? createServiceClient() : null;
  const info = db ? await witnessInfo(db, rfp, token) : ({ ok: false, error: "bad_link" } as const);
  const job = db && info.ok ? await loadTownJob(db, rfp) : null;
  const tz = townTimeZone(job?.buyer_key);

  return (
    <main className="mx-auto max-w-xl px-4 py-12" data-page="witness">
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        <Lock className="size-5" /> {t.title}
      </h1>
      {!info.ok ? (
        <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-state={info.error}>
          {info.error === "expired" ? t.expired : t.bad}
        </p>
      ) : (
        <div className="mt-6 space-y-4 text-sm">
          <p className="text-base">{fmt(t.intro, { who: info.requested_by_name ?? "", buyer: info.buyer_name ?? "", title: info.title })}</p>
          <div className="rounded-md bg-secondary/50 px-4 py-3">
            <p className="font-semibold">{plural(Number(info.received) || 0, t.count, { n: Number(info.received) || 0 })}</p>
            <p className="text-muted-foreground">{fmt(t.closed, { date: closingLabel(info.closes_at, tz, lang) })}</p>
          </div>
          <p>{t.what}</p>
          <p className="text-xs text-muted-foreground">{fmt(t.expires, { date: momentLabel(info.expires_at, tz, lang) })}</p>
          <WitnessConfirmForm rfpId={rfp} token={token} defaultName={info.witness_name} />
        </div>
      )}
    </main>
  );
}

"use client";

import { useState } from "react";
import Link from "@/i18n/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CertCountry } from "@/lib/vendor-certs/rules";
import { useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";

type ErrorKey = "upload" | "tooBig" | "type" | "date" | "amount" | "invalid" | "expired";

/**
 * The vendor's side of "Request certificate": insurer, policy, coverage,
 * expiry and the file, posted to /api/vendor-certs/submit with the token.
 * Done = thanks, plus the soft prompt: create a free PMRFP trade profile,
 * or (already a member) keep the profile's insurance status current.
 */
export function VendorUploadForm({
  token,
  company,
  country,
  onPmrfp,
  current,
}: {
  token: string;
  company: string;
  country: CertCountry;
  onPmrfp: boolean;
  current: { insurer: string | null; policyNumber: string | null; coverage: number | null; expiresOn: string | null };
}) {
  const t = useT("certsClient");
  const f = t.vendorForm;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body = new FormData(e.currentTarget);
      body.set("token", token);
      const res = await fetch("/api/vendor-certs/submit", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { error?: ErrorKey };
      if (!res.ok) setError(json.error && json.error in t.errors ? json.error : "upload");
      else setDone(true);
    } catch {
      setError("upload");
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-teal-300 bg-teal-50/60 p-6">
          <CheckCircle2 className="size-6 text-teal-700" />
          <h2 className="mt-2 text-lg font-semibold">{f.doneTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{fmt(f.doneBody, { company })}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold">{onPmrfp ? f.memberTitle : f.joinTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{onPmrfp ? (country === "US" ? f.memberBodyUs : f.memberBody) : f.joinBody}</p>
          <Link href={onPmrfp ? "/dashboard/company" : "/sign-up?role=trade"} className={`${buttonVariants({ size: "lg" })} mt-4`}>
            {onPmrfp ? f.memberCta : f.joinCta} <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="vc-insurer"><span className="text-sm font-medium">{f.insurer}</span></Label>
          <Input id="vc-insurer" name="insurer" maxLength={120} defaultValue={current.insurer ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vc-policy"><span className="text-sm font-medium">{f.policy}</span></Label>
          <Input id="vc-policy" name="policy_number" maxLength={80} defaultValue={current.policyNumber ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vc-coverage"><span className="text-sm font-medium">{f.coverage}</span></Label>
          <Input id="vc-coverage" name="coverage_amount" inputMode="numeric" placeholder="2000000" defaultValue={current.coverage ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vc-expiry"><span className="text-sm font-medium">{f.expiry}</span></Label>
          <Input id="vc-expiry" name="expires_on" type="date" required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vc-file"><span className="text-sm font-medium">{f.file}</span></Label>
        <Input id="vc-file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" />
      </div>
      {error && <p className="text-sm font-medium text-destructive">{t.errors[error]}</p>}
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
        {pending ? f.submitting : f.submit}
      </Button>
    </form>
  );
}

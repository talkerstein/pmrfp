"use client";

/**
 * Trade-referral form. Direct-revenue lane — fee triggers when the referred
 * trade activates Trade Pro ($249/yr). Sister to the project-referral form,
 * intentionally same structure for visual consistency.
 */
import { useActionState } from "react";
import { submitTradeReferralAction, type ReferralActionState } from "@/lib/refer/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REFERRAL } from "@/lib/site";
import { useLang, useT } from "@/i18n/provider";
import { defaultProvinceFor } from "@/lib/geo-defaults";
import { fmt } from "@/i18n/format";
import { regionName } from "@/i18n/terms";
import { referServerMessageKey } from "@/i18n/messages/miscClient";

const PROVINCES = [
  "Ontario",
  "Quebec",
  "British Columbia",
  "Alberta",
  "Manitoba",
  "Saskatchewan",
  "Nova Scotia",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Prince Edward Island",
  "Yukon",
  "Northwest Territories",
  "Nunavut",
];

export function ReferTradeForm() {
  const lang = useLang();
  const t = useT("miscClient").referForm;
  const tt = t.trade;
  const [state, action, pending] = useActionState(
    submitTradeReferralAction,
    {} as ReferralActionState,
  );

  // The action answers in English; show the same message in the visitor's language.
  const say = (msg: string) => {
    if (lang === "en") return msg;
    const key = referServerMessageKey(msg);
    return key ? t.server[key] : t.serverFallback;
  };

  if (state.success) {
    return (
      <div className="rounded-xl border border-teal-300 bg-teal-100/40 p-8 text-center">
        <h3 className="text-lg font-semibold text-teal-ink">{t.received}</h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">{say(state.success)}</p>
        <p className="mt-6 text-xs text-muted-foreground">
          {t.another}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{say(state.error)}</p>
      )}

      <input
        type="text"
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />

      <Section
        title={tt.companyTitle}
        sub={tt.companySub}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tt.companyName} required>
            <Input name="tradeCompanyName" required placeholder={tt.companyNamePlaceholder} />
          </Field>
          <Field label={tt.category}>
            <Input name="tradeCategory" placeholder={tt.categoryPlaceholder} />
          </Field>
          <Field label={t.city} required>
            <Input name="tradeCity" required placeholder={t.cityPlaceholder} />
          </Field>
          <Field label={t.province} required>
            <select
              name="tradeProvince"
              required
              defaultValue={defaultProvinceFor(lang)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {regionName(p, lang)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tt.website}>
            <Input name="tradeWebsite" type="url" placeholder="https://" />
          </Field>
        </div>
        <Field label={tt.why}>
          <Textarea
            name="whyThemNote"
            rows={3}
            placeholder={tt.whyPlaceholder}
          />
        </Field>
      </Section>

      <Section
        title={tt.contactTitle}
        sub={t.contactSub}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t.name}>
            <Input name="tradeContactName" />
          </Field>
          <Field label={t.email}>
            <Input name="tradeContactEmail" type="email" />
          </Field>
          <Field label={t.phone}>
            <Input name="tradeContactPhone" />
          </Field>
        </div>
      </Section>

      <Section
        title={t.youTitle}
        sub={tt.youSub}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.yourName} required>
            <Input name="referrerName" required />
          </Field>
          <Field label={t.yourEmail} required>
            <Input name="referrerEmail" type="email" required />
          </Field>
          <Field label={t.phone}>
            <Input name="referrerPhone" />
          </Field>
          <Field label={t.affiliation}>
            <Input
              name="referrerAffiliation"
              placeholder={tt.affiliationPlaceholder}
            />
          </Field>
        </div>
      </Section>

      <label className="flex items-start gap-2 text-sm text-foreground/85">
        <input type="checkbox" name="permission" required className="mt-0.5 size-4 shrink-0" />
        <span>{tt.permission}</span>
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t.submitting : t.submit}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {fmt(tt.fine, { fee: REFERRAL.tradeFee, feeMonthly: REFERRAL.tradeFeeMonthly, currency: REFERRAL.currency })}
        </p>
      </div>
    </form>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <Label className="mb-1.5 block">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </Label>
      {children}
    </label>
  );
}

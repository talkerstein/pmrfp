import { saveSponsorAction } from "@/lib/sponsors/actions";
import { COPY_LIMITS } from "@/lib/sponsors/model";
import { SPONSOR_TIERS } from "@/lib/sponsors/pricing";
import type { AdminSponsorRow } from "@/lib/sponsors/admin";

const input = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function Field({
  label,
  name,
  value,
  area,
  hint,
  max,
  required,
}: {
  label: string;
  name: string;
  value?: string | null;
  area?: boolean;
  hint?: string;
  max?: number;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">
        {label}
        {required && <span className="text-red-600">*</span>}
      </span>
      {area ? (
        <textarea name={name} defaultValue={value ?? ""} rows={3} maxLength={max} className={input} />
      ) : (
        <input name={name} defaultValue={value ?? ""} maxLength={max} required={required} className={input} />
      )}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/**
 * Create/edit a sponsor (/admin/sponsors/new, /admin/sponsors/[id]).
 * Plain server form: saveSponsorAction validates, checks the copy rules
 * and slot exclusivity for live rows, and redirects back with the result.
 */
export function SponsorForm({ row }: { row: AdminSponsorRow | null }) {
  return (
    <form action={saveSponsorAction} className="grid max-w-3xl gap-4">
      <input type="hidden" name="id" value={row?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" name="name" value={row?.name} max={120} required />
        <Field label="Link name (slug)" name="slug" value={row?.slug} max={40} hint="pmrfp.com/go/<slug>. Leave blank to make one from the name." />
        <Field label="Website (https://…)" name="url" value={row?.url} max={500} required />
        <Field label="Logo URL" name="logoUrl" value={row?.logo_url} max={500} hint="https:// image, or /logos/… in the repo. Square, at least 80 px." />
      </div>

      <fieldset className="grid gap-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Slot</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Tier</span>
            <select name="tier" defaultValue={row?.tier ?? "province"} className={input}>
              {SPONSOR_TIERS.map((t) => (
                <option key={t} value={t}>{t === "province" ? "Province × trade" : t === "national" ? "National trade" : "Digest only (emails)"}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Country</span>
            <select name="country" defaultValue={row?.country ?? "CA"} className={input}>
              <option value="CA">Canada (CAD)</option>
              <option value="US">United States (USD)</option>
            </select>
          </label>
          <div />
        </div>
        <Field label="Trades (slugs, comma separated)" name="trades" value={(row?.trades ?? []).join(", ")} hint="e.g. electrical, hvac. Same slugs as /trades/<slug>." required />
        <Field label="Provinces/states (comma separated)" name="regions" value={(row?.regions ?? []).join(", ")} hint="Empty for National. Full names or codes (Ontario, ON, Texas, TX). Québec needs French copy below." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date (YYYY-MM-DD)" name="startDate" value={row?.start_date} hint="Blank: starts the day it's approved." />
          <Field label="End date (YYYY-MM-DD)" name="endDate" value={row?.end_date} hint="Blank: until cancelled." />
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Message (reviewed before it goes live)</legend>
        <p className="text-xs text-muted-foreground">
          No words that make it read like a listing (RFP, tender, closing date…), no PMRFP endorsement or guaranteed results, no tender-finding pitch. Labelled “Sponsored” automatically.
        </p>
        <Field label={`Headline (≤ ${COPY_LIMITS.headline})`} name="headline" value={row?.headline} max={COPY_LIMITS.headline} />
        <Field label={`Message (≤ ${COPY_LIMITS.message})`} name="message" value={row?.message} area max={COPY_LIMITS.message} />
        <Field label={`Button text (≤ ${COPY_LIMITS.cta})`} name="cta" value={row?.cta} max={COPY_LIMITS.cta} />
        <Field label="Headline, French" name="headlineFr" value={row?.headline_fr} max={COPY_LIMITS.headline} />
        <Field label="Message, French" name="messageFr" value={row?.message_fr} area max={COPY_LIMITS.message} />
        <Field label="Button text, French" name="ctaFr" value={row?.cta_fr} max={COPY_LIMITS.cta} />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name" name="contactName" value={row?.contact_name} max={120} />
        <Field label="Contact email" name="contactEmail" value={row?.contact_email} max={200} />
      </div>
      <Field label="Internal notes" name="notes" value={row?.notes} area max={4000} />
      <div>
        <button className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Save</button>
      </div>
    </form>
  );
}

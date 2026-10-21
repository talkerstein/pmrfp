import { findBuyerPage, type BuyerPage } from "@/lib/buyers/model";
import { FOR_PUBLIC_BUYERS_PATH } from "@/lib/buyers/source-links";
import { claimBuyerPageAction } from "@/lib/towns/actions";
import { claimContext } from "@/lib/towns/claim-context";
import { buyerDisplayName, claimableFrom, searchBuyerPages } from "@/lib/towns/claimable";
import { decideClaim, registrableOf } from "@/lib/towns/domains";
import { getManagedPagesSnapshot } from "@/lib/towns/managed-data";
import { parseBuyerKey } from "@/lib/towns/managed";
import { claimOnboardingHref } from "@/lib/towns/paths";
import { getT } from "@/i18n/server";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { regionName } from "@/i18n/terms";

const input = "mt-1 block w-full rounded-md border border-border bg-card px-3 py-2 text-sm";

/**
 * Onboarding for a public buyer: find the organization, then claim its page.
 * Before they submit, it says what will happen (verified on the spot by
 * email domain, a person checks it, or a join request to colleagues who
 * already manage it), using the same rule the claim action applies.
 */
export async function BuyerClaimStep({
  lang,
  claimKey,
  q,
  error,
  email,
  emailConfirmed,
}: {
  lang: Locale;
  claimKey: string | null;
  q: string | null;
  error: string | null;
  email: string;
  emailConfirmed: boolean;
}) {
  const t = getT("towns").claim;
  const L = (p: string) => localizePath(p, lang);
  const ctx = await claimContext();
  const key = parseBuyerKey(claimKey);
  const page: BuyerPage | null = key ? findBuyerPage(ctx.pages, key.provinceSlug, key.slug) : null;
  const errorText = error && error in t.errors ? t.errors[error as keyof typeof t.errors] : null;
  const label = (p: BuyerPage) => `${buyerDisplayName(p, lang)}, ${regionName(p.province, lang)}`;

  if (!page) {
    const results = q ? searchBuyerPages(ctx.pages, q, 20) : [];
    return (
      <div data-claim-step="search">
        {errorText && <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorText}</p>}
        <form method="get" action={L("/onboarding")} className="flex flex-wrap items-end gap-2">
          <label className="min-w-[240px] flex-1 text-sm font-medium">
            {t.searchLabel}
            <input name="q" defaultValue={q ?? ""} required minLength={2} maxLength={80} placeholder={t.searchPlaceholder} className={input} />
          </label>
          <button type="submit" className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">{t.searchBtn}</button>
        </form>
        {q && (
          results.length ? (
            <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-card" data-list="claim-results">
              {results.map((p) => (
                <li key={p.path} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span>{label(p)}</span>
                  <a href={L(claimOnboardingHref(`${p.provinceSlug}/${p.buyer.slug}`))} className="shrink-0 font-medium text-teal-700 underline">{t.pick}</a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{fmt(t.noResults, { q })}</p>
          )
        )}
        <p className="mt-4 text-sm"><a href={L(FOR_PUBLIC_BUYERS_PATH)} className="text-teal-700 underline">{t.notListed} →</a></p>
      </div>
    );
  }

  // What the claim rule will say (the action decides again on submit).
  const managed = (await getManagedPagesSnapshot()).has(claimKey!);
  const buyer = claimableFrom(page, ctx.trusted.get(claimKey!) ?? []);
  const decision = decideClaim({ email, emailConfirmed, buyer: buyer.holder, owners: ctx.owners, managedBy: managed ? "managed" : null });
  const name = buyerDisplayName(page, lang);
  const domain = registrableOf(email) ?? email.split("@")[1] ?? "";
  const preview =
    decision.kind === "verified" ? fmt(t.preview.verified, { domain, name }) : decision.kind === "join" ? fmt(t.preview.join, { name }) : fmt(t.preview[decision.reason], { domain, name });

  return (
    <div data-claim-step="claim">
      {errorText && <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorText}</p>}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.claiming}</p>
        <p className="mt-1 text-base font-semibold" data-claiming={claimKey}>{label(page)}</p>
        <p className="mt-2 text-sm" data-preview={decision.kind}>{preview}</p>
        <a href={L(`/onboarding?q=${encodeURIComponent(page.town ? page.town.name : page.buyer.name)}`)} className="mt-2 inline-block text-sm text-teal-700 underline">{t.change}</a>
      </div>
      <form action={claimBuyerPageAction} className="mt-5 grid gap-4">
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="buyer" value={claimKey!} />
        <label className="text-sm font-medium">
          {t.fullName}
          <input name="fullName" required minLength={2} maxLength={120} autoComplete="name" className={input} />
        </label>
        <label className="text-sm font-medium">
          {t.jobTitle}
          <input name="jobTitle" maxLength={120} autoComplete="organization-title" className={input} />
        </label>
        <label className="text-sm font-medium">
          {t.phone}
          <input name="phone" type="tel" maxLength={40} autoComplete="tel" className={input} />
        </label>
        <label className="text-sm font-medium">
          {t.note}
          <textarea name="note" rows={3} maxLength={1000} className={input} />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm" required className="mt-1" />
          <span>{fmt(t.confirm, { name })}</span>
        </label>
        <button type="submit" className="justify-self-start rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">{t.submit}</button>
      </form>
    </div>
  );
}

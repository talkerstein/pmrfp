import type { Metadata } from "next";
import Link from "@/i18n/link";
import { redirect } from "next/navigation";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { listReferenceSheet, listSheetChoices, SHEET_MAX } from "@/lib/projects/server";
import { clientTypeKey, valueBandKey } from "@/lib/projects/case-study";
import { PrintButton } from "@/components/projects/print-button";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { regionName, tradeName } from "@/i18n/terms";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: getDictionary(hasLocale(lang) ? lang : "en").portfolio.sheet.metaTitle,
    robots: { index: false, follow: false },
  };
}

/** Trades and service area for the sheet header (public rows; empty on any error). */
async function orgCoverage(orgId: string): Promise<{ trades: string[]; regions: string[] }> {
  try {
    const db = await createClient();
    const [c, r] = await Promise.all([
      db.from("organization_categories").select("trade_categories(name)").eq("organization_id", orgId),
      db.from("organization_regions").select("regions(name)").eq("organization_id", orgId),
    ]);
    return {
      trades: ((c.data ?? []) as unknown as { trade_categories: { name: string } | null }[])
        .map((x) => x.trade_categories?.name)
        .filter((x): x is string => Boolean(x)),
      regions: ((r.data ?? []) as unknown as { regions: { name: string } | null }[])
        .map((x) => x.regions?.name)
        .filter((x): x is string => Boolean(x)),
    };
  } catch {
    return { trades: [], regions: [] };
  }
}

/**
 * One printable capability statement for a bid or a prequalification
 * package: the company's credentials on file and the projects it picks
 * (?p=<id>&p=<id>), with references where the client agreed. Private
 * projects print their private link when the company has made one. The
 * dashboard chrome hides itself in print (DashboardShell print:hidden).
 */
export default async function CapabilitySheetPage({
  params,
  searchParams,
}: {
  params: Promise<object>;
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("portfolio").sheet;
  const old = getT("dash").sheet;
  const pc = getT("portfolioClient");
  const session = await requireRole(["trade", "supplier"]);
  const org = session.organization;
  if (!org) redirect(localizePath("/onboarding", lang));
  const sp = await searchParams;
  const picked = (Array.isArray(sp.p) ? sp.p : sp.p ? [sp.p] : []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, SHEET_MAX);

  const demo = isDemoMode();
  const [entries, choices, coverage] = demo
    ? [[], [], { trades: [], regions: [] }]
    : await Promise.all([listReferenceSheet(org.id, picked), listSheetChoices(org.id), orgCoverage(org.id)]);
  const shown = new Set(entries.map((e) => e.id));
  const base = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");
  const host = base.replace(/^https?:\/\//, "");
  const contact = [org.phone, org.email, org.website].filter(Boolean).join(" · ");
  const fmtMonth = (d: string | null) => (d ? formatDate(d, lang, { month: "long", year: "numeric" }) : "");
  const creds = [
    org.years_in_business ? fmt(t.years, { n: formatNumber(org.years_in_business, lang) }) : null,
    org.emergency_service ? t.emergency : null,
    org.insurance_status ? `${t.insurance}: ${org.insurance_status}` : null,
    org.wsib_status ? `${t.wsib}: ${org.wsib_status}` : null,
  ].filter((x): x is string => Boolean(x));

  return (
    <div className="mx-auto max-w-3xl bg-white text-black">
      <style>{`@page { margin: 0.6in; } @media print { body { background: white; } a { color: inherit; text-decoration: none; } }`}</style>

      <div className="mb-6 rounded-lg border border-border bg-secondary/40 p-4 text-sm print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-muted-foreground">{t.intro}</span>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/projects" className="font-medium text-teal-ink hover:underline">
              {old.back}
            </Link>
            <PrintButton />
          </div>
        </div>
        {choices.length > 1 && (
          <form method="get" className="mt-4 border-t border-border pt-3">
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.pick} <span className="font-normal normal-case">({fmt(t.max, { n: SHEET_MAX })})</span>
              </legend>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {choices.map((c) => (
                  <label key={c.id} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="p" value={c.id} defaultChecked={shown.has(c.id)} className="mt-0.5 size-4 accent-teal-700" />
                    <span>
                      {c.title}
                      {c.visibility !== "public" && <span className="ml-1 text-xs text-muted-foreground">({pc.visibility[c.visibility]})</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" className="mt-3 inline-flex h-9 items-center rounded-full border border-border bg-white px-4 text-sm font-semibold hover:border-teal-400">
              {t.update}
            </button>
          </form>
        )}
      </div>

      <header className="border-b-2 border-black pb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">{t.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold">{org.name}</h1>
        <p className="mt-1 text-sm text-gray-700">
          {[org.city, org.province ? regionName(org.province, lang) : null].filter(Boolean).join(", ")}
          {contact ? ` · ${contact}` : ""}
        </p>
        {org.profile_status === "approved" && (
          <p className="mt-1 text-sm text-gray-700">{fmt(old.profileLine, { url: `${host}/directory/${org.slug}` })}</p>
        )}
        {(coverage.trades.length > 0 || coverage.regions.length > 0 || creds.length > 0) && (
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {coverage.trades.length > 0 && (
              <div>
                <dt className="inline font-semibold">{t.trades}: </dt>
                <dd className="inline text-gray-800">{coverage.trades.map((x) => tradeName(x, lang)).join(", ")}</dd>
              </div>
            )}
            {coverage.regions.length > 0 && (
              <div>
                <dt className="inline font-semibold">{t.areas}: </dt>
                <dd className="inline text-gray-800">{coverage.regions.map((x) => regionName(x, lang)).join(", ")}</dd>
              </div>
            )}
            {creds.map((c) => (
              <div key={c} className="text-gray-800">{c}</div>
            ))}
          </dl>
        )}
      </header>

      {entries.length === 0 ? (
        <p className="mt-6 text-sm text-gray-700">
          {t.empty}{" "}
          <Link href="/dashboard/projects/new" className="font-medium underline print:hidden">
            {t.addOne}
          </Link>
        </p>
      ) : (
        <>
          <h2 className="mt-5 text-xs font-semibold uppercase tracking-widest text-gray-600">{t.projects}</h2>
          <ol className="mt-1 divide-y divide-gray-200">
            {entries.map((e) => {
              const client = clientTypeKey(e.clientType);
              const band = valueBandKey(e.valueBand);
              const meta = [
                e.tradeName ? tradeName(e.tradeName, lang) : null,
                e.place,
                client ? `${t.client}: ${pc.clientTypes[client]}` : null,
                e.completedOn ? `${t.completed}: ${fmtMonth(e.completedOn)}` : fmtMonth(e.publishedAt),
                band ? `${t.value}: ${pc.valueBands[band]}` : e.valueBand ? `${t.value}: ${e.valueBand}` : null,
              ].filter(Boolean);
              const link =
                e.visibility === "private"
                  ? e.shareToken
                    ? `${t.privateLink}: ${host}/shared/${e.shareToken}`
                    : null
                  : `${host}/case-studies/${e.slug}`;
              return (
                <li key={e.id} className="flex gap-4 py-4 [break-inside:avoid]">
                  {e.heroUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- print layout, plain img
                    <img src={e.heroUrl} alt="" className="size-24 shrink-0 rounded object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold leading-snug">{e.title}</h3>
                    <p className="text-xs text-gray-600">{meta.join(" · ")}</p>
                    <p className="mt-1 text-sm text-gray-800">{e.summary}</p>
                    {e.scope && (
                      <p className="mt-1 text-sm text-gray-800">
                        <span className="font-semibold">{t.scope}: </span>
                        {e.scope}
                      </p>
                    )}
                    {e.results.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {e.results.map((r, i) => (
                          <li key={i} className="rounded border border-gray-300 px-2 py-1 text-xs">
                            <strong>{r.value}</strong> {r.label}
                          </li>
                        ))}
                      </ul>
                    )}
                    {link ? (
                      <p className="mt-1 break-all text-xs text-gray-600">{link}</p>
                    ) : (
                      <p className="mt-1 text-xs text-gray-500 print:hidden">{t.noLink}</p>
                    )}
                    {e.references.map((r, i) => (
                      <div key={i} className="mt-2 rounded border border-gray-200 p-2 text-sm">
                        <p className="text-gray-800">
                          <span className="text-amber-600">{"★".repeat(r.rating)}</span> &ldquo;{r.quote}&rdquo;
                        </p>
                        <p className="mt-1 text-xs text-gray-700">
                          {old.reference} <strong>{r.name}</strong>
                          {r.company ? `, ${r.company}` : ""}
                          {r.email ? ` · ${r.email}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}

      <p className="mt-6 border-t border-gray-200 pt-3 text-xs text-gray-500">{fmt(old.footer, { site: SITE.name })}</p>
    </div>
  );
}

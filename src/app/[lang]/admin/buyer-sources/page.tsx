import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner, StatCard } from "@/components/dashboard/stat-card";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { isMissingTableError } from "@/lib/entitlement/trial";
import { BuyerSourceDecide } from "@/components/admin/buyer-source-decide";
import { loadPermissionRegistry } from "@/lib/buyers/permissions-data";
import { METHOD_LABEL, PERMISSION_METHODS, STATUS_LABEL, seedRefused, seedRegistry, type PermissionMethod } from "@/lib/buyers/permissions";
import { emailMatchesSite } from "@/lib/buyers/source-links";
import { CITY_SOURCES } from "@/lib/tenders/city-sources";
import { citySourceGate } from "@/lib/tenders/city-list";
import { slugify } from "@/lib/tenders/shared";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Buyer sources · Admin · PMRFP" };

interface Row {
  id: string;
  organization: string;
  contact_name: string;
  work_email: string;
  tenders_url: string;
  method: string;
  feed_url: string | null;
  province_code: string;
  buyer_slug: string | null;
  lang: string;
  status: string;
  admin_notes: string | null;
  decided_at: string | null;
  created_at: string;
}

const MIGRATION = "supabase/migrations/20261021000010_buyer_sources.sql";
const isMethod = (m: string): m is PermissionMethod => (PERMISSION_METHODS as readonly string[]).includes(m);

/**
 * Admin: the city flow. "List your tenders free" requests from
 * /for-public-buyers (approve → registry status yes + method; reject;
 * notes), the permission registry (code seed + buyer_permissions) and each
 * city source's state today (running, or why not). English only.
 *
 * Approving a request records permission; importing also needs a city
 * source config (src/lib/tenders/city-sources.ts) unless the buyer emails
 * its notices to info@pmrfp.com.
 */
export default async function AdminBuyerSourcesPage({ params, searchParams }: { params: Promise<object>; searchParams: Promise<{ all?: string }> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const showAll = (await searchParams).all === "1";
  const demo = isDemoMode() || !isServiceConfigured();
  let rows: Row[] = [];
  let missing = false;
  let registry = seedRegistry();
  if (!demo) {
    const db = createServiceClient();
    let q = db
      .from("buyer_source_requests")
      .select("id,organization,contact_name,work_email,tenders_url,method,feed_url,province_code,buyer_slug,lang,status,admin_notes,decided_at,created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (!showAll) q = q.eq("status", "new");
    const [{ data, error }, loaded] = await Promise.all([q.returns<Row[]>(), loadPermissionRegistry(db)]);
    missing = isMissingTableError(error) || loaded.tableMissing;
    rows = data ?? [];
    registry = loaded.registry;
  }
  const permissions = [...registry.values()].sort((a, b) => a.status.localeCompare(b.status) || a.buyerName.localeCompare(b.buyerName));
  const cities = CITY_SOURCES.map((c) => ({ c, gate: citySourceGate(c, registry) }));

  return (
    <>
      <PageHeader
        title="Buyer sources"
        description="Public buyers who asked to list their tenders (from /for-public-buyers), the permission registry the daily municipal cron checks, and each city source's state. A buyer that said no never imports; approving here can't override a logged refusal. No email is sent from this page: reply to the requester from info@pmrfp.com."
      />
      {demo && <DemoBanner />}
      {missing && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The buyer_source_requests / buyer_permissions tables are missing. Run {MIGRATION}. Until then the registry is the code seed (src/lib/buyers/permissions.ts) and the public form shows an email link instead.
        </p>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="New requests" value={rows.filter((r) => r.status === "new").length} />
        <StatCard label="Buyers who said yes" value={permissions.filter((p) => p.scope === "buyer" && p.status === "yes").length} />
        <StatCard label="City sources running" value={cities.filter((x) => x.gate.run).length} />
      </div>

      <h2 className="mb-2 text-lg font-semibold">Requests</h2>
      <p className="mb-3 text-sm">
        {showAll ? <a href="?" className="underline">Show new only</a> : <a href="?all=1" className="underline">Show all (incl. decided)</a>}
      </p>
      <AdminTable columns={["Received", "Organization", "Contact", "Tenders page", "Method", "Decision"]}>
        {rows.map((r) => {
          const slug = r.buyer_slug ?? slugify(r.organization).slice(0, 120);
          const domainOk = emailMatchesSite(r.work_email, r.tenders_url);
          return (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-xs">
                {r.created_at.slice(0, 10)}
                <br />
                <span className="text-muted-foreground">{r.status}{r.decided_at ? ` ${r.decided_at.slice(0, 10)}` : ""}</span>
              </TableCell>
              <TableCell className="max-w-[200px] text-xs">
                <b>{r.organization}</b>
                <br />
                <span className="text-muted-foreground">{r.province_code} · {r.lang}{r.buyer_slug ? ` · ${r.buyer_slug}` : ""}</span>
                {seedRefused(slug) && <p className="font-semibold text-red-700">Declined earlier (do-not-list)</p>}
              </TableCell>
              <TableCell className="text-xs">
                {r.contact_name}
                <br />
                <a href={`mailto:${r.work_email}`} className="underline">{r.work_email}</a>
                <br />
                <span className={domainOk ? "text-emerald-700" : "text-amber-700"}>{domainOk ? "Email matches the site's domain" : "Email domain differs from the site: verify"}</span>
              </TableCell>
              <TableCell className="max-w-[240px] break-all text-xs">
                <a href={r.tenders_url} className="underline" target="_blank" rel="noreferrer">{r.tenders_url}</a>
                {r.feed_url && (
                  <>
                    <br />
                    Feed: <a href={r.feed_url} className="underline" target="_blank" rel="noreferrer">{r.feed_url}</a>
                  </>
                )}
              </TableCell>
              <TableCell className="text-xs">{isMethod(r.method) ? METHOD_LABEL[r.method] : r.method}</TableCell>
              <TableCell>
                <BuyerSourceDecide id={r.id} status={r.status} method={isMethod(r.method) ? r.method : "email_notices"} buyerSlug={slug} notes={r.admin_notes} refused={seedRefused(slug)} />
              </TableCell>
            </TableRow>
          );
        })}
      </AdminTable>

      <h2 className="mb-2 mt-8 text-lg font-semibold">City sources (daily municipal cron)</h2>
      <AdminTable columns={["Source", "Buyer", "How bids are listed", "Today"]}>
        {cities.map(({ c, gate }) => (
          <TableRow key={c.key}>
            <TableCell className="text-xs"><b>{c.key}</b> <span className="text-muted-foreground">-{c.marker}-</span></TableCell>
            <TableCell className="text-xs">{c.buyer} ({c.provinceCode})</TableCell>
            <TableCell className="max-w-[260px] break-all text-xs">
              {c.list.kind === "platform" ? (
                <>Hosted on {c.list.platform}: <a href={c.list.portalUrl} className="underline" target="_blank" rel="noreferrer">{c.list.portalUrl}</a></>
              ) : (
                <>{c.list.kind}: <a href={c.list.url} className="underline" target="_blank" rel="noreferrer">{c.list.url}</a></>
              )}
            </TableCell>
            <TableCell className={`text-xs ${gate.run ? "text-emerald-700" : "text-muted-foreground"}`}>{gate.run ? "Runs daily" : `Not reading: ${gate.reason}`}</TableCell>
          </TableRow>
        ))}
      </AdminTable>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Permission registry</h2>
      <AdminTable columns={["Buyer", "Status", "Method", "Reply", "Notes", "Origin"]}>
        {permissions.map((p) => (
          <TableRow key={p.buyerSlug}>
            <TableCell className="max-w-[200px] text-xs">
              <b>{p.buyerName}</b>
              <br />
              <span className="text-muted-foreground">{p.buyerSlug}{p.provinceCode ? ` · ${p.provinceCode}` : ""}{p.scope === "platform" ? " · platform" : ""}</span>
            </TableCell>
            <TableCell className={`text-xs font-semibold ${p.status === "no" ? "text-red-700" : p.status === "yes" ? "text-emerald-700" : ""}`}>{STATUS_LABEL[p.status]}</TableCell>
            <TableCell className="text-xs">{p.method ? METHOD_LABEL[p.method] : "—"}</TableCell>
            <TableCell className="max-w-[260px] text-xs">
              {p.grantedOn ?? "—"}
              {p.contact && <><br />{p.contact}</>}
              {p.quote && <><br /><i>&ldquo;{p.quote}&rdquo;</i></>}
            </TableCell>
            <TableCell className="max-w-[300px] text-xs">{p.notes ?? ""}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{p.origin}</TableCell>
          </TableRow>
        ))}
      </AdminTable>
    </>
  );
}

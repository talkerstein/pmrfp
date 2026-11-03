import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAccountGeo } from "@/lib/visitor-geo.server";
import { getSharedRoster, loadRoster, rosterCountry, type RosterRecord } from "@/lib/roster/server";
import { buildVcards, rosterContacts, rosterRows, vcardFileName, type EntryRow, type RosterCountry } from "@/lib/roster/rules";
import { rowLabel } from "@/lib/roster/view";
import { getDictionary } from "@/i18n/dictionaries";
import { DEFAULT_LOCALE, hasLocale } from "@/i18n/config";

/**
 * "Add to phone": one .vcf with every contact on a building's roster.
 *   ?id=<roster>  a PM of the company (their RLS client: other companies' rosters read as not found)
 *   ?t=<token>    a live share link (read-only, same as the card)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const langParam = url.searchParams.get("lang");
  const lang = hasLocale(langParam) ? langParam : DEFAULT_LOCALE;
  const R = getDictionary(lang).roster;
  const id = url.searchParams.get("id");
  const token = url.searchParams.get("t");
  if (!isSupabaseConfigured()) return new NextResponse("Not found", { status: 404 });

  let data: { roster: RosterRecord; entries: EntryRow[]; country: RosterCountry } | null = null;
  if (token) {
    const shared = await getSharedRoster(token);
    if (shared) data = { roster: shared.roster, entries: shared.entries, country: shared.country };
  } else if (id && z.uuid().safeParse(id).success) {
    const session = await getSession().catch(() => null);
    if (session?.organization) {
      const { roster, entries } = await loadRoster(await createClient(), id);
      if (roster) {
        const geo = await getAccountGeo(session).catch(() => null);
        data = { roster, entries, country: rosterCountry(geo?.country, session.organization) };
      }
    }
  }
  if (!data) return new NextResponse("Not found", { status: 404 });
  const { roster, entries, country } = data;

  const rows = rosterRows(entries, { country, province: roster.province });
  const contacts = rosterContacts(roster, rows, {
    category: (r) => rowLabel(r, R, country),
    primary: R.vcard.primary,
    backup: R.vcard.backup,
    onCall: R.vcard.onCall,
    available247: R.vcard.available247,
  });
  return new NextResponse(buildVcards(contacts), {
    headers: {
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition": `attachment; filename="${vcardFileName(roster.building_name)}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
      "referrer-policy": "no-referrer",
    },
  });
}

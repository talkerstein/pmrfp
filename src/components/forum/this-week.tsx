import Link from "@/i18n/link";
import { BarChart3, Camera, CircleHelp, Gavel } from "lucide-react";
import type { SessionContext } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import {
  listActivePolls,
  listLatestPhotos,
  listRecurringThreads,
  listTopQuestions,
  listUnansweredQuestions,
  viewerFollows,
  type ForumCategory,
} from "@/lib/forum/data";
import type { RoomCountry } from "@/lib/forum/categories";
import { pickOpenBids, pickRooms } from "@/lib/forum/this-week";
import { publicPhotoUrl } from "@/lib/forum/photos";
import { ForumIcon, ThreadList } from "@/components/forum/organize";
import { getT } from "@/i18n/server";
import { fmt } from "@/i18n/format";

/** The viewer's trade slugs (their company's directory trades). */
async function viewerTrades(session: SessionContext | null): Promise<string[]> {
  const org = session?.organization;
  if (!org) return [];
  try {
    const { data } = await (await createClient()).from("organization_categories").select("trade_categories(slug)").eq("organization_id", org.id).limit(20);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    return ((data ?? []) as any[]).map((r) => (Array.isArray(r.trade_categories) ? r.trade_categories[0] : r.trade_categories)?.slug).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * "This week in your trade and region" + "Unanswered questions" on the
 * forum home. Country-first (one country only), the viewer's rooms first.
 * Everything is a real thread or post; empty parts say so or stay hidden.
 */
export async function ThisWeek({ session, visitor, categories }: { session: SessionContext | null; visitor: { country: RoomCountry; province: string | null }; categories: ForumCategory[] }) {
  const t = getT("forum");
  const h = t.hub;
  const country = visitor.country;
  const [followIds, trades, bids, photos, polls, top, unanswered] = await Promise.all([
    session ? viewerFollows(await createClient(), session.userId) : Promise.resolve(new Set<string>()),
    viewerTrades(session),
    listRecurringThreads("open-bids", country, 60),
    listLatestPhotos(country, 6),
    listActivePolls(country, 3),
    listTopQuestions(country, 7, 5),
    listUnansweredQuestions(country, 6),
  ]);
  const followed = categories.filter((c) => followIds.has(c.id)).map((c) => c.slug);
  const rooms = pickRooms({ followed, tradeSlugs: trades, province: visitor.province, country });
  const openBids = pickOpenBids(bids, rooms, 4);
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return (
    <>
      <section className="wrap f-sec first" aria-labelledby="forum-this-week">
        <h2 className="h2" id="forum-this-week">{h.thisWeekTitle}</h2>
        <p className="mt-1 max-w-2xl text-sm text-[#4B4F6B]">{h.thisWeekLead}</p>
        {rooms.length > 0 ? (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-[#1B1D3A]">{h.yourRooms}:</span>
            {rooms.map((r) => (
              <Link key={r} href={`/forum/${r}`} className="inline-flex items-center gap-1 rounded-full border-2 border-[#E3E4EE] bg-white px-3 py-1 font-semibold text-[#282B59] hover:border-[#282B59]">
                <ForumIcon slug={r} className="size-3.5" /> {t.categories[r].name}
              </Link>
            ))}
          </p>
        ) : (
          <p className="mt-3 text-xs text-[#4B4F6B]">{h.followHint}</p>
        )}

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border-2 border-[#E3E4EE] bg-white p-4">
            <h3 className="flex items-center gap-2 font-bold text-[#1B1D3A]"><Gavel className="size-4 text-teal-700" aria-hidden /> {h.openBids}</h3>
            {openBids.length > 0 ? (
              <ul className="mt-2 divide-y divide-[#E3E4EE]">
                {openBids.map((th) => (
                  <li key={th.id}>
                    <Link href={th.path} className="block py-2 text-sm font-semibold text-[#1B1D3A] hover:underline" lang={th.categorySlug === "quebec" ? "fr-CA" : undefined}>{th.title}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[#4B4F6B]">{h.openBidsNone}</p>
            )}
          </div>

          <div className="rounded-2xl border-2 border-[#E3E4EE] bg-white p-4">
            <h3 className="flex items-center gap-2 font-bold text-[#1B1D3A]"><Camera className="size-4 text-teal-700" aria-hidden /> {h.photos}</h3>
            {photos.length > 0 && base ? (
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {photos.map((p) => (
                  <li key={p.key}>
                    <Link href={p.path} className="block overflow-hidden rounded-lg border border-[#E3E4EE]" title={p.threadTitle}>
                      {/* Plain <img>: a hidden post's photo must not live on in the image optimizer's cache. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={publicPhotoUrl(base, p.image.path)} alt={p.threadTitle} width={p.image.w} height={p.image.h} loading="lazy" className="aspect-square w-full object-cover" />
                    </Link>
                    {p.author && <span className="mt-0.5 block truncate text-[11px] text-[#4B4F6B]">{fmt(h.by, { name: p.author.displayName })}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[#4B4F6B]">{h.photosNone} <Link href="/forum/show-your-work" className="font-bold">{h.photosCta} →</Link></p>
            )}
          </div>

          {polls.length > 0 && (
            <div className="rounded-2xl border-2 border-[#E3E4EE] bg-white p-4">
              <h3 className="flex items-center gap-2 font-bold text-[#1B1D3A]"><BarChart3 className="size-4 text-teal-700" aria-hidden /> {h.polls}</h3>
              <ul className="mt-2 divide-y divide-[#E3E4EE]">
                {polls.map((p) => (
                  <li key={p.pollId}>
                    <Link href={p.path} className="block py-2 text-sm hover:underline">
                      <span className="font-semibold text-[#1B1D3A]">{p.question}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-[#4B4F6B]"><ForumIcon slug={p.categorySlug} className="size-3" /> {t.categories[p.categorySlug].name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {top.length > 0 && (
            <div className="rounded-2xl border-2 border-[#E3E4EE] bg-white p-4">
              <h3 className="flex items-center gap-2 font-bold text-[#1B1D3A]"><CircleHelp className="size-4 text-teal-700" aria-hidden /> {h.topQuestions}</h3>
              <ul className="mt-2 divide-y divide-[#E3E4EE]">
                {top.map((th) => (
                  <li key={th.id}>
                    <Link href={th.path} className="block py-2 text-sm font-semibold text-[#1B1D3A] hover:underline">{th.title}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {unanswered.length > 0 && (
        <section className="wrap f-sec" aria-labelledby="forum-unanswered">
          <h2 className="h2" id="forum-unanswered">{h.unansweredTitle}</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#4B4F6B]">{h.unansweredLead}</p>
          <div className="mt-4">
            <ThreadList items={unanswered.map((th) => ({ th, forum: th.categorySlug }))} empty="" />
          </div>
        </section>
      )}
    </>
  );
}

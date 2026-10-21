/**
 * A town's own posts on its buyer page (pure; tested in
 * test/unit/town-jobs.test.ts). The page's open bids (lib/buyers/model) come
 * from imported tenders that name the town; a town's own quote requests and
 * tender mirrors are linked by their page key instead
 * (rfp_posts.buyer_key "ontario/town-of-cobourg"). They lead the list, so the
 * town page, its widget and its "shown in Google" rule (a page with open bids
 * is indexable) all see them.
 */

export interface TownPostLite {
  slug: string;
  title: string;
  deadline: string | null;
  buyer_key: string | null;
  status: string;
}

interface OpenBid {
  slug: string;
  title: string;
  deadline: string | null;
}

const MAX_OPEN = 12;

export function mergeTownPosts<P extends { provinceSlug: string; buyer: { slug: string }; openBids: OpenBid[] }>(pages: P[], posts: readonly TownPostLite[], today: string): P[] {
  if (!posts.length) return pages;
  const byKey = new Map<string, OpenBid[]>();
  for (const p of posts) {
    if (!p.buyer_key || p.status !== "published" || (p.deadline && p.deadline < today)) continue;
    byKey.set(p.buyer_key, [...(byKey.get(p.buyer_key) ?? []), { slug: p.slug, title: p.title, deadline: p.deadline }]);
  }
  if (!byKey.size) return pages;
  return pages.map((page) => {
    const own = byKey.get(`${page.provinceSlug}/${page.buyer.slug}`);
    if (!own) return page;
    const seen = new Set(own.map((b) => b.slug));
    const byDate = (a: OpenBid, b: OpenBid) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
    return { ...page, openBids: [...[...own].sort(byDate), ...page.openBids.filter((b) => !seen.has(b.slug))].slice(0, MAX_OPEN) };
  });
}

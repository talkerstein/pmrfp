/**
 * LOCAL PREVIEW ONLY. In-memory sample forum so the UI can be screenshotted
 * without a database. Active only when PREVIEW_SAMPLES === "1" (never set it
 * in production). Names and companies are invented samples, labelled as such.
 */
import type { ForumCategory, MemberRef, Post, Profile, Thread, ThreadSummary } from "./data";
import type { ForumCategorySlug } from "./categories";

export function previewSamplesOn(): boolean {
  return process.env.PREVIEW_SAMPLES === "1";
}

const day = (n: number) => new Date(Date.UTC(2026, 9, 6) - n * 86_400_000).toISOString();

const dave: MemberRef = { userId: "u-dave", handle: "dave_hvac", displayName: "Dave R. (sample)", reputation: 520, isStaff: false, verifiedBusiness: true };
const marie: MemberRef = { userId: "u-marie", handle: "marie_toit", displayName: "Marie L. (exemple)", reputation: 140, isStaff: false, verifiedBusiness: false };

const CAT_IDS: Partial<Record<ForumCategorySlug, string>> = {
  "job-site-stories": "c-jss",
  "client-talk": "c-ct",
  "off-topic": "c-ot",
  electrical: "c-el",
  "hvac-mechanical": "c-hv",
  plumbing: "c-pl",
  quebec: "c-qc",
};

interface Seed {
  sid: string;
  cat: ForumCategorySlug;
  slug: string;
  title: string;
  type: "question" | "discussion";
  author: MemberRef;
  body: string;
  replies: { id: string; author: MemberRef; body: string; up: number; accepted?: boolean; age: number }[];
  views: number;
  rating: [number, number];
  age: number;
  pinned?: boolean;
}

const SEEDS: Seed[] = [
  {
    sid: "hv01rtu1", cat: "hvac-mechanical", slug: "who-pulls-the-permit-on-a-rooftop-unit-swap", type: "question", author: marie,
    title: "Who pulls the permit on a rooftop unit swap, us or the PM?",
    body: "Like-for-like RTU replacement on a 4-storey commercial building in Mississauga. The PM says permits are on us, our contract is silent. Who normally carries it, and does a crane lift change anything?",
    replies: [
      { id: "p1", author: dave, accepted: true, up: 7, age: 2, body: "The mechanical contractor pulls it. The installer is the one named on the permit and the one who books the inspection, so put it in your quote as a line item.\n\nA crane lift adds a road occupancy permit from the city if you're on the street, and that one is usually yours too. Get the structural letter from the owner's engineer if the new unit is heavier." },
      { id: "p2", author: marie, up: 1, age: 1, body: "Thanks. Adding a permit line and a road occupancy allowance to the quote from now on." },
    ],
    views: 412, rating: [27, 6], age: 3,
  },
  {
    sid: "el01panl", cat: "electrical", slug: "panel-upgrade-timeline-for-a-strip-mall", type: "question", author: dave,
    title: "Realistic timeline for a 600A service upgrade at a strip mall?",
    body: "Utility coordination is the part nobody can give me a straight answer on. What have you seen for lead times on the utility side lately?",
    replies: [], views: 88, rating: [0, 0], age: 1,
  },
  {
    sid: "pl01back", cat: "plumbing", slug: "annual-backflow-testing-bundles", type: "discussion", author: dave,
    title: "Anyone bundling annual backflow testing into maintenance contracts?",
    body: "Thinking of offering it as a flat yearly add-on to PMs instead of one-off calls. Curious how others price it.",
    replies: [{ id: "p3", author: marie, up: 2, age: 4, body: "We do it per device with a minimum. PMs like one invoice a year." }],
    views: 131, rating: [10, 3], age: 6,
  },
  {
    sid: "qc01rbq1", cat: "quebec", slug: "licence-rbq-pour-sous-traitants", type: "discussion", author: marie,
    title: "Licence RBQ : vos sous-traitants hors Québec, comment vous gérez ça?",
    body: "On reçoit de plus en plus d'appels d'offres de gestionnaires à Montréal qui veulent une seule soumission. Pour les sous-traitants de l'Ontario, qui s'occupe de la licence RBQ?",
    replies: [{ id: "p4", author: dave, up: 3, age: 1, body: "Chaque entreprise qui exécute les travaux au Québec doit avoir sa propre licence. On a appris ça à nos dépens." }],
    views: 64, rating: [8, 2], age: 2,
  },
  {
    sid: "js01boil", cat: "job-site-stories", slug: "the-boiler-room-that-flooded-at-2am", type: "discussion", author: dave,
    title: "The boiler room that flooded at 2am on Christmas Eve",
    body: "Call comes in at 1:40. Super says \"a little water.\" We get there and it's shin deep, the sump pump is sitting on the shelf still in the box. Three of us bailing, one on the phone with the restoration guys. Back on heat by 7. Best thank-you card I've ever gotten from a board.",
    replies: [{ id: "p5", author: marie, up: 5, age: 0, body: "Pump still in the box is a classic. Ours was a float switch zip-tied up \"so it would stop running.\"" }],
    views: 290, rating: [23, 5], age: 1, pinned: false,
  },
  {
    sid: "ct01paid", cat: "client-talk", slug: "ninety-days-and-still-not-paid", type: "discussion", author: marie,
    title: "90 days and still not paid by a condo corporation. What actually works?",
    body: "Work signed off, invoice approved by the manager, and it's sitting waiting on a board signature that never comes. I don't want to burn the relationship. Lien deadlines are on my mind. What's worked for you?",
    replies: [{ id: "p6", author: dave, up: 4, age: 0, body: "Polite email to the manager with the lien deadline date in it, copied to the board's general inbox. Facts only. Usually gets a cheque within two weeks." }],
    views: 175, rating: [17, 4], age: 2,
  },
  {
    sid: "ot01lnch", cat: "off-topic", slug: "best-job-site-lunch", type: "discussion", author: dave,
    title: "Best job site lunch you've had this year?",
    body: "Mine: a Portuguese bakery next to a reroof in Etobicoke. Bifana and a custard tart. Your turn.",
    replies: [{ id: "p7", author: marie, up: 2, age: 0, body: "Poutine d'un camion à Laval, -20 dehors. Rien ne bat ça." }],
    views: 96, rating: [9, 2], age: 0,
  },
];

const path = (s: Seed) => `/forum/${s.cat}/${s.slug}-${s.sid}`;

function summary(s: Seed): ThreadSummary {
  const last = s.replies[s.replies.length - 1];
  return {
    id: `t-${s.sid}`, shortId: s.sid, slug: s.slug, path: path(s), title: s.title, type: s.type, status: "approved",
    isPinned: Boolean(s.pinned), isLocked: false, isStaff: false, hasAccepted: s.replies.some((r) => r.accepted),
    replyCount: s.replies.length, viewCount: s.views, ratingAvg: s.rating[1] ? s.rating[0] / s.rating[1] : null, ratingCount: s.rating[1],
    createdAt: day(s.age), lastPostAt: day(last ? last.age : s.age), author: s.author,
    lastUser: { handle: (last?.author ?? s.author).handle, displayName: (last?.author ?? s.author).displayName },
    region: null,
  };
}

function words(t: string) {
  return t.split(/\s+/).filter(Boolean).length;
}

export function sampleIndex(): ForumCategory[] {
  return (Object.keys(CAT_IDS) as ForumCategorySlug[]).map((slug) => {
    const mine = SEEDS.filter((s) => s.cat === slug).map(summary).sort((a, b) => b.lastPostAt.localeCompare(a.lastPostAt));
    const lt = mine[0];
    return {
      id: CAT_IDS[slug]!, slug,
      threadCount: mine.length, postCount: mine.reduce((n, t) => n + 1 + t.replyCount, 0), lastPostAt: lt?.lastPostAt ?? null,
      lastThread: lt ? { title: lt.title, path: lt.path, lastUser: lt.lastUser?.displayName ?? null } : null,
      mods: slug === "hvac-mechanical" ? [{ handle: dave.handle, displayName: dave.displayName }] : [],
    };
  });
}

export function sampleCategoryThreads(categoryId: string) {
  const slug = (Object.keys(CAT_IDS) as ForumCategorySlug[]).find((k) => CAT_IDS[k] === categoryId);
  const all = SEEDS.filter((s) => s.cat === slug).map(summary);
  return { pinned: all.filter((t) => t.isPinned), threads: all.filter((t) => !t.isPinned), total: all.filter((t) => !t.isPinned).length };
}

export function sampleAllThreads(): (ThreadSummary & { categorySlug: ForumCategorySlug })[] {
  return SEEDS.map((s) => ({ ...summary(s), categorySlug: s.cat }));
}

export function sampleThread(sid: string): Thread | null {
  const s = SEEDS.find((x) => x.sid === sid);
  if (!s) return null;
  const acc = s.replies.find((r) => r.accepted);
  return {
    ...summary(s), categoryId: CAT_IDS[s.cat]!, categorySlug: s.cat, body: s.body,
    wordsTotal: words(s.body) + s.replies.reduce((n, r) => n + words(r.body), 0), flagCount: 0,
    acceptedPostId: acc ? acc.id : null, updatedAt: day(0),
  };
}

export function samplePosts(thread: Thread): { posts: Post[]; accepted: Post | null } {
  const s = SEEDS.find((x) => x.sid === thread.shortId);
  const posts: Post[] = (s?.replies ?? []).map((r) => ({
    id: r.id, body: r.body, status: "approved", isStaff: false, isAccepted: Boolean(r.accepted), upvoteCount: r.up,
    createdAt: day(r.age), editedAt: null, author: r.author,
  }));
  if (thread.type === "question") posts.sort((a, b) => Number(b.isAccepted) - Number(a.isAccepted) || b.upvoteCount - a.upvoteCount);
  return { posts, accepted: posts.find((p) => p.isAccepted) ?? null };
}

export function sampleProfile(handle: string): Profile | null {
  const m = [dave, marie].find((x) => x.handle === handle);
  if (!m) return null;
  const isDave = m === dave;
  return {
    userId: m.userId, handle: m.handle, displayName: m.displayName, trade: isDave ? "HVAC" : "Toiture", region: isDave ? "Ontario" : "Québec",
    bio: isDave ? "Sample profile for local preview." : "Profil d'exemple pour l'aperçu local.",
    reputation: m.reputation, postCount: isDave ? 48 : 12, verifiedBusiness: m.verifiedBusiness, isStaff: false,
    joinedAt: isDave ? "2025-09-01T00:00:00Z" : "2026-08-15T00:00:00Z", lastSeenAt: day(0),
    answers: isDave ? 21 : 3, accepted: isDave ? 11 : 0, bestThreadAverage: isDave ? 4.6 : 4.25,
    modOf: isDave ? ["hvac-mechanical"] : [],
    latest: SEEDS.filter((s) => s.author === m).map(summary),
    crew: isDave
      ? { name: "Northline Mechanical (sample)", slug: "sample-northline-mechanical", listed: true, rank: 520, members: [
          { handle: dave.handle, displayName: dave.displayName, reputation: 520 },
        ] }
      : null,
  };
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/i18n/link";
import { BadgeCheck, Building2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { OpeningSoon, RankBar } from "@/components/forum/parts";
import { getProfile } from "@/lib/forum/data";
import { badgesFor, isIndexableProfile, rankFor } from "@/lib/forum/rules";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { V3Body } from "@/components/v3/body";

type P = { params: Promise<{ lang: string; handle: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, handle } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const res = await getProfile(handle);
  if (!res.ready || !res.profile) return { robots: { index: false, follow: true } };
  const p = res.profile;
  const t = getDictionary(l).forum;
  return {
    title: fmt(t.meta.profileTitle, { name: p.displayName, handle: p.handle }),
    description: fmt(t.meta.profileDescription, { rank: t.ranks[rankFor(p.reputation).rank], posts: p.postCount, date: p.joinedAt.slice(0, 10) }),
    alternates: { canonical: `/forum/u/${p.handle}` },
    robots: isIndexableProfile(p.postCount) ? undefined : { index: false, follow: true },
  };
}

export default async function ForumProfilePage({ params }: P) {
  await setLangFrom(params);
  const { handle } = await params;
  const lang = getLang();
  const t = getT("forum");
  const res = await getProfile(handle);
  if (!res.ready) return <OpeningSoon />;
  const p = res.profile;
  if (!p) notFound();

  const badges = badgesFor({
    answers: p.answers,
    accepted: p.accepted,
    verifiedBusiness: p.verifiedBusiness,
    bestThreadAverage: p.bestThreadAverage,
    joinedAt: p.joinedAt,
    isModerator: p.modOf.length > 0,
  });
  const stats: [string, string][] = [
    [t.profile.reputation, formatNumber(p.reputation, lang)],
    [t.profile.posts, formatNumber(p.postCount, lang)],
    [t.profile.answers, formatNumber(p.answers, lang)],
    [t.profile.accepted, formatNumber(p.accepted, lang)],
    [t.profile.joined, formatDate(p.joinedAt, lang)],
    ...(p.lastSeenAt ? ([[t.profile.lastSeen, formatDate(p.lastSeenAt, lang)]] as [string, string][]) : []),
  ];

  return (
    <V3Body>
      <JsonLd data={breadcrumbSchema([{ name: "PMRFP", path: "/" }, { name: t.forum, path: "/forum" }, { name: p.displayName, path: `/forum/u/${p.handle}` }])} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          mainEntity: { "@type": "Person", name: p.displayName, alternateName: `@${p.handle}`, ...(p.crew ? { worksFor: { "@type": "Organization", name: p.crew.name } } : {}) },
        }}
      />
      <section className="f-band">
        <div className="wrap f-band-in">
          <nav className="f-crumbs" aria-label="Breadcrumb">
            <Link href="/forum">{t.forum}</Link>
            <span aria-hidden>/</span>
            <span aria-current="page">@{p.handle}</span>
          </nav>
          <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 18 }}>
            <span aria-hidden style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 999, background: "#282B59", border: "2px solid #91F2CF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--fp)", fontWeight: 700, fontSize: 30, color: "#91F2CF" }}>
              {p.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ marginTop: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                {p.displayName}
                {p.verifiedBusiness && <BadgeCheck className="size-7 text-[#91F2CF]" aria-label={t.thread.verified} />}
              </h1>
              <p className="lead" style={{ marginTop: 6, fontSize: 16 }}>
                @{p.handle}
                {p.isStaff && ` · ${t.thread.staff}`}
                {p.trade && ` · ${p.trade}`}
                {p.region && ` · ${p.region}`}
              </p>
            </div>
          </div>
        </div>
      </section>
      <div className="wrap f-page">
        <div className="f-cols">
          <div className="main">
            {p.bio && <p className="mt-4 whitespace-pre-line text-muted-foreground">{p.bio}</p>}

            <div className="f-card mt-6">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.profile.rank}</p>
              <div className="mt-2"><RankBar reputation={p.reputation} /></div>
              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {stats.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              {p.modOf.length > 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                  {fmt(t.profile.modOf, { forums: p.modOf.map((s) => t.categories[s].name).join(", ") })}
                </p>
              )}
            </div>

            <h2 className="f-hd2" style={{ marginTop: 40 }}>{t.profile.latest}</h2>
            {p.latest.length === 0 ? (
              <p className="mt-2 text-muted-foreground">{t.profile.noThreads}</p>
            ) : (
              <ul className="mt-3 divide-y divide-[#E3E4EE] overflow-hidden rounded-3xl border-2 border-[#E3E4EE]">
                {p.latest.map((th) => (
                  <li key={th.id} className="flex items-center justify-between gap-3 px-5 py-4 text-sm">
                    <Link href={th.path} className="font-bold">{th.title}</Link>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(th.createdAt, lang)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside>
            {p.crew?.listed && (
              <div className="f-side-mint">
                <p className="flex items-center gap-1.5 text-sm font-bold"><Building2 className="size-4" /> {t.profile.listedTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">{fmt(t.profile.listedBody, { name: p.crew.name })}</p>
                <Link href={`/directory/${p.crew.slug}`} className={buttonVariants({ size: "sm", className: "mt-3" })}>{t.profile.listedCta}</Link>
              </div>
            )}

            <div className="f-side-line">
              <h2 className="font-bold">{t.profile.badges}</h2>
              {badges.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">{t.profile.noBadges}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {badges.map((b) => (
                    <li key={b} className="text-sm">
                      <span className="font-semibold">{t.badges[b].name}</span>
                      <span className="block text-xs text-muted-foreground">{t.badges[b].desc}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {p.crew && (
              <div className="f-side-line">
                <h2 className="font-bold">{t.profile.crews}</h2>
                <table className="mt-2 w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr><th className="py-1 font-medium">{t.profile.crewName}</th><th className="py-1 font-medium">{t.profile.crewRole}</th><th className="py-1 text-right font-medium">{t.profile.crewRank}</th><th className="py-1 text-right font-medium">{t.profile.crewMembers}</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border">
                      <td className="py-1.5">{p.crew.listed ? <Link href={`/directory/${p.crew.slug}`} className="hover:underline">{p.crew.name}</Link> : p.crew.name}</td>
                      <td className="py-1.5">{t.profile.roleMember}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatNumber(p.crew.rank, lang)}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.crew.members.length}</td>
                    </tr>
                  </tbody>
                </table>
                {p.crew.members.length > 1 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {p.crew.members.filter((m) => m.handle !== p.handle).slice(0, 12).map((m, i) => (
                      <span key={m.handle}>{i > 0 && ", "}<Link href={`/forum/u/${m.handle}`} className="hover:underline">{m.displayName}</Link></span>
                    ))}
                  </p>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </V3Body>
  );
}

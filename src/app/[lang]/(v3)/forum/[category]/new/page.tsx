import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/container";
import { ForumHero, OpeningSoon, VerifyPanel } from "@/components/forum/parts";
import { ThreadForm } from "@/components/forum/forms";
import { getSession } from "@/lib/access/access";
import { getCategoryRow } from "@/lib/forum/data";
import { sessionCanPost } from "@/lib/forum/eligibility";
import { createClient } from "@/lib/supabase/server";
import { FORUM_CATEGORY_SLUGS, isForumCategory } from "@/lib/forum/categories";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { localizePath } from "@/i18n/config";
import { V3Body } from "@/components/v3/body";

export const metadata: Metadata = { title: "Start a thread · PMRFP Forum", robots: { index: false, follow: true } };

export default async function NewThreadPage({ params }: { params: Promise<{ lang: string; category: string }> }) {
  await setLangFrom(params);
  const { category } = await params;
  if (!isForumCategory(category)) notFound();
  const lang = getLang();
  const t = getT("forum");
  const session = await getSession();
  if (!session) redirect(localizePath(`/sign-in?next=${encodeURIComponent(`/forum/${category}/new`)}`, lang));
  const row = await getCategoryRow(category);
  if (!row.ready) return <OpeningSoon />;

  let firstPost = true;
  if (isServiceConfigured()) {
    const { data } = await createServiceClient().from("forum_profiles").select("post_count").eq("user_id", session.userId).maybeSingle<{ post_count: number }>();
    firstPost = !data || data.post_count === 0;
  }

  return (
    <V3Body>
      <ForumHero eyebrow={t.forum} title={t.meta.newTitle} crumbs={[{ label: t.forum, href: "/forum" }, { label: t.categories[category].name, href: `/forum/${category}` }, { label: t.meta.newTitle }]} />
      <Container className="max-w-2xl f-page">
        {!(await sessionCanPost(session, (await (await createClient()).auth.getUser()).data.user)) ? (
          <VerifyPanel signedIn next={`/forum/${category}/new`} />
        ) : (
        <ThreadForm
          categories={FORUM_CATEGORY_SLUGS.map((slug) => ({ slug, name: t.categories[slug].name }))}
          initialCategory={category}
          firstPost={firstPost}
        />
        )}
      </Container>
    </V3Body>
  );
}

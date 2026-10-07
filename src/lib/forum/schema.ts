import { SITE } from "@/lib/site";
import type { Post, Thread } from "./data";
import { excerpt } from "./text";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");

function person(a: Post["author"]) {
  return a ? { "@type": "Person", name: a.displayName, url: `${BASE}/forum/u/${a.handle}` } : { "@type": "Person", name: "Member" };
}

function plain(text: string) {
  return excerpt(text, 5000);
}

/** QAPage for questions (Google Q&A rich result), DiscussionForumPosting otherwise. */
export function threadSchema(thread: Thread, posts: Post[], accepted: Post | null): Record<string, unknown> {
  const url = `${BASE}${thread.path}`;
  if (thread.type === "question") {
    const answer = (p: Post) => ({
      "@type": "Answer",
      text: plain(p.body),
      dateCreated: p.createdAt,
      upvoteCount: p.upvoteCount,
      url: `${url}#post-${p.id}`,
      author: person(p.author),
    });
    return {
      "@context": "https://schema.org",
      "@type": "QAPage",
      mainEntity: {
        "@type": "Question",
        name: thread.title,
        text: plain(thread.body),
        answerCount: thread.replyCount,
        dateCreated: thread.createdAt,
        author: person(thread.author),
        ...(accepted ? { acceptedAnswer: answer(accepted) } : {}),
        suggestedAnswer: posts.filter((p) => p.id !== accepted?.id).slice(0, 20).map(answer),
      },
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: thread.title,
    text: plain(thread.body),
    url,
    datePublished: thread.createdAt,
    dateModified: thread.lastPostAt,
    author: person(thread.author),
    interactionStatistic: [
      { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: thread.replyCount },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/ViewAction", userInteractionCount: thread.viewCount },
    ],
    comment: posts.slice(0, 20).map((p) => ({
      "@type": "Comment",
      text: plain(p.body),
      datePublished: p.createdAt,
      url: `${url}#post-${p.id}`,
      author: person(p.author),
    })),
  };
}

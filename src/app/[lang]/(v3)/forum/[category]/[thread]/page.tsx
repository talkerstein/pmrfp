import type { Metadata } from "next";
import { ThreadView, threadMetadata } from "@/components/forum/thread-view";
import { setLangFrom } from "@/i18n/server";

type P = { params: Promise<{ lang: string; category: string; thread: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, category, thread } = await params;
  return threadMetadata(lang, category, thread, 1);
}

export default async function ForumThreadPage({ params }: P) {
  await setLangFrom(params);
  const { category, thread } = await params;
  return <ThreadView category={category} param={thread} page={1} />;
}

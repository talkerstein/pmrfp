import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThreadView, threadMetadata } from "@/components/forum/thread-view";
import { parsePage } from "@/lib/forum/rules";
import { setLangFrom } from "@/i18n/server";

type P = { params: Promise<{ lang: string; category: string; thread: string; n: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, category, thread, n } = await params;
  const page = parsePage(n);
  return page ? threadMetadata(lang, category, thread, page) : {};
}

export default async function ForumThreadPagedPage({ params }: P) {
  await setLangFrom(params);
  const { category, thread, n } = await params;
  const page = parsePage(n);
  if (!page) notFound();
  return <ThreadView category={category} param={thread} page={page} />;
}

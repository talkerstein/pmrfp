import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryView, categoryMetadata } from "@/components/forum/category-view";
import { parsePage } from "@/lib/forum/rules";
import { setLangFrom } from "@/i18n/server";

type P = { params: Promise<{ lang: string; category: string; n: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, category, n } = await params;
  const page = parsePage(n);
  return page ? categoryMetadata(lang, category, page) : {};
}

export default async function ForumCategoryPagedPage({ params }: P) {
  await setLangFrom(params);
  const { category, n } = await params;
  const page = parsePage(n);
  if (!page) notFound();
  return <CategoryView category={category} page={page} />;
}

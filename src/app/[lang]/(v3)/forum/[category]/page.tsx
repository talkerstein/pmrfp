import type { Metadata } from "next";
import { CategoryView, categoryMetadata } from "@/components/forum/category-view";
import { parseSort } from "@/lib/forum/organize";
import { setLangFrom } from "@/i18n/server";
import { V3Body } from "@/components/v3/body";

type P = { params: Promise<{ lang: string; category: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

// Metadata ignores ?sort: every tab canonicalizes to the base forum URL.
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, category } = await params;
  return categoryMetadata(lang, category, 1);
}

export default async function ForumCategoryPage({ params, searchParams }: P) {
  await setLangFrom(params);
  const { category } = await params;
  const sort = parseSort((await searchParams).sort);
  return <V3Body><CategoryView category={category} page={1} sort={sort} /></V3Body>;
}

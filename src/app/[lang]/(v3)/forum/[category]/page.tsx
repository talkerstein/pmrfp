import type { Metadata } from "next";
import { CategoryView, categoryMetadata } from "@/components/forum/category-view";
import { setLangFrom } from "@/i18n/server";
import { V3Body } from "@/components/v3/body";

export async function generateMetadata({ params }: { params: Promise<{ lang: string; category: string }> }): Promise<Metadata> {
  const { lang, category } = await params;
  return categoryMetadata(lang, category, 1);
}

export default async function ForumCategoryPage({ params }: { params: Promise<{ lang: string; category: string }> }) {
  await setLangFrom(params);
  const { category } = await params;
  return <V3Body><CategoryView category={category} page={1} /></V3Body>;
}

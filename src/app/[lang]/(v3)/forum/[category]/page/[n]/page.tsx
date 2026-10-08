import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryView, categoryMetadata } from "@/components/forum/category-view";
import { parsePage } from "@/lib/forum/rules";
import { parseSort } from "@/lib/forum/organize";
import { setLangFrom } from "@/i18n/server";
import { V3Body } from "@/components/v3/body";

type P = { params: Promise<{ lang: string; category: string; n: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, category, n } = await params;
  const page = parsePage(n);
  return page ? categoryMetadata(lang, category, page) : {};
}

export default async function ForumCategoryPagedPage({ params, searchParams }: P) {
  await setLangFrom(params);
  const { category, n } = await params;
  const page = parsePage(n);
  if (!page) notFound();
  const sort = parseSort((await searchParams).sort);
  return <V3Body><CategoryView category={category} page={page} sort={sort} /></V3Body>;
}

import type { Metadata } from "next";
import { CategoryLanding, categoryLandingMetadata } from "@/components/marketplace/category-landing";
import { setLangFrom } from "@/i18n/server";

type Props = { params: Promise<{ lang: string; category: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, category } = await params;
  return categoryLandingMetadata(lang, category);
}

export default async function MarketplaceCategoryPage({ params }: Props) {
  await setLangFrom(params);
  const { category } = await params;
  return <CategoryLanding category={category} />;
}

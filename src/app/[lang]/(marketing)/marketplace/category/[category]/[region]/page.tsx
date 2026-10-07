import type { Metadata } from "next";
import { CategoryLanding, categoryLandingMetadata } from "@/components/marketplace/category-landing";
import { setLangFrom } from "@/i18n/server";

type Props = { params: Promise<{ lang: string; category: string; region: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, category, region } = await params;
  return categoryLandingMetadata(lang, category, region);
}

export default async function MarketplaceCategoryRegionPage({ params }: Props) {
  await setLangFrom(params);
  const { category, region } = await params;
  return <CategoryLanding category={category} regionSlug={region} />;
}

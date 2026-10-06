import type { Metadata } from "next";
import { ProvinceHub, provinceMetadata } from "@/components/public/province-hub";
import { PROVINCES } from "@/lib/data/province-hub";
import { setLangFrom } from "@/i18n/server";

export const revalidate = 3600;

const def = PROVINCES.ontario;

export async function generateMetadata(): Promise<Metadata> {
  return provinceMetadata(def);
}

export default async function Page({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  return <ProvinceHub def={def} />;
}

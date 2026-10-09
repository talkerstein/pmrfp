import { redirect } from "next/navigation";
import { setLangFrom } from "@/i18n/server";
import { localizePath } from "@/i18n/config";

/** The reference sheet grew into the capability sheet; old links (and the mobile app) land there. */
export default async function ReferenceSheetPage({ params }: { params: Promise<object> }) {
  const lang = await setLangFrom(params);
  redirect(localizePath("/dashboard/projects/capability-sheet", lang));
}

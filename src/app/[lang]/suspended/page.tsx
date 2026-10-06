import type { Metadata } from "next";
import Link from "@/i18n/link";
import { SITE } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").misc.suspended.metaTitle, robots: { index: false, follow: false } };
}

export default async function SuspendedPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("misc").suspended;
  const [before, after] = t.body.split("{email}");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 px-5 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {before}
        <a href={`mailto:${SITE.supportEmail}`} className="text-teal-700 hover:underline">
          {SITE.supportEmail}
        </a>
        {after}
      </p>
      <Link href="/" className="mt-6 text-sm text-teal-700 hover:underline">
        {t.back}
      </Link>
    </div>
  );
}

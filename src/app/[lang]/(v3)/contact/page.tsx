import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { SimplePage } from "@/components/v3/simple";
import { ContactFormV3 } from "@/components/v3/contact-form";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).misc.contact.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/contact") };
}

/** Contact, on the simple page template; the full form is the article, the contact card the aside. */
export default async function ContactPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("misc").contact;
  const v = getT("v3pages").simple;
  const [before, after] = t.body.split("{email}");
  return (
    <SimplePage lang={lang} current="contact" group="company" title={t.title}>
      <div className="eb">{t.eyebrow}</div>
      <p className="intro">
        {before}
        <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        {after}
      </p>
      <div className="s-form" style={{ marginTop: 32 }}>
        <ContactFormV3 title={v.noteTitle} again={v.writeAnother} />
      </div>
    </SimplePage>
  );
}

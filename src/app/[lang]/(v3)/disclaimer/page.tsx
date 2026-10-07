import type { Metadata } from "next";
import Link from "@/i18n/link";
import { SimplePage } from "@/components/v3/simple";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).misc.disclaimer.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/disclaimer") };
}

const LAST_UPDATED = "May 29, 2026";
const LAST_UPDATED_ISO = "2026-05-29";

function DisclaimerBlock({ label, text }: { label: string; text: string }) {
  return (
    <section className="s-block">
      <h2>{label}</h2>
      <p>{text}</p>
    </section>
  );
}

export default async function DisclaimerPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const m = getT("misc");
  const t = m.disclaimer;
  const updated =
    lang === "en" ? LAST_UPDATED : formatDate(LAST_UPDATED_ISO, lang, { day: "numeric", month: "long", year: "numeric" });
  const [contactBefore, contactAfter] = t.contact.split("{email}");
  return (
    <SimplePage lang={lang} current="disclaimer" group="legal" title={t.title} lead={fmt(m.legal.lastUpdated, { date: updated })}>
      <p className="s-meta">{m.legal.eyebrow}</p>
      {m.legal.translationNote && <p className="s-note">{m.legal.translationNote}</p>}

      <div className="s-callout">
        <p style={{ fontWeight: 700 }}>{m.copy.disclaimer}</p>
      </div>

      <p className="muted" style={{ marginTop: 32 }}>{t.intro}</p>

      <DisclaimerBlock label={t.signupLabel} text={m.copy.signup} />
      <DisclaimerBlock label={t.pmLabel} text={m.copy.pmPosting} />
      <DisclaimerBlock label={t.interestLabel} text={m.copy.interest} />

      <p className="small muted" style={{ marginTop: 32 }}>
        {contactBefore}
        <Link href={`mailto:${SITE.email}`}>{SITE.email}</Link>
        {contactAfter}
      </p>
    </SimplePage>
  );
}

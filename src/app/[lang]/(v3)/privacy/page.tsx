import type { Metadata } from "next";
import Link from "@/i18n/link";
import { SH2, SimplePage } from "@/components/v3/simple";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).misc.privacy.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/privacy") };
}

const LAST_UPDATED = "May 29, 2026";
const LAST_UPDATED_ISO = "2026-05-29";

/** One numbered section of the legal text (wording unchanged, layout only). */
function LegalSection({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <SH2 no={no} sm>{title}</SH2>
      <div className="s-legal">{children}</div>
    </section>
  );
}

export default async function PrivacyPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const m = getT("misc");
  const t = m.privacy;
  const updated =
    lang === "en" ? LAST_UPDATED : formatDate(LAST_UPDATED_ISO, lang, { day: "numeric", month: "long", year: "numeric" });
  const [contactBefore, contactAfter] = t.contact.body.split("{email}");
  return (
    <SimplePage lang={lang} current="privacy" group="legal" title={t.title} lead={fmt(m.legal.lastUpdated, { date: updated })}>
        <p className="s-meta">{m.legal.eyebrow}</p>
        {m.legal.translationNote && (
          <p className="s-note">{m.legal.translationNote}</p>
        )}
        <p className="muted">
          {t.intro}
        </p>

        {t.sections.map((s, i) => (
          <LegalSection key={s.title} no={i + 1} title={s.title}>
            <p>{s.body}</p>
          </LegalSection>
        ))}

        <LegalSection no={t.sections.length + 1} title={t.contact.title}>
          <p>
            {contactBefore}
            <Link
              href={`mailto:${SITE.email}`}
              
            >
              {SITE.email}
            </Link>
            {contactAfter}
          </p>
        </LegalSection>
    </SimplePage>
  );
}

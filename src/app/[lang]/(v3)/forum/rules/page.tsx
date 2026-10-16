import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import Link from "@/i18n/link";
import { SH2, SimplePage } from "@/components/v3/simple";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate } from "@/i18n/format";
import type { LegalBlock } from "@/i18n/messages/misc";

/*
 * /forum/rules. A static segment, so it is matched before the sibling
 * dynamic [category] route (same as /forum/u). No forum room uses the slug
 * "rules" (lib/forum/categories).
 */
export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).policies.forumRules.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/forum/rules") };
}

const LAST_UPDATED = "October 16, 2026";
const LAST_UPDATED_ISO = "2026-10-16";
/** The Privacy Officer's mailbox (legal reports about posts). */
const PRIVACY_EMAIL = "privacy@pmrfp.com";

/** One numbered rule or section. */
function LegalSection({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <SH2 no={no} sm>{title}</SH2>
      <div className="s-legal">{children}</div>
    </section>
  );
}

/** A string with {token} placeholders, each replaced by its link. */
function Rich({ text, links }: { text: string; links: Record<string, ReactNode> }) {
  return (
    <>
      {text.split(/(\{\w+\})/g).map((part, i) => {
        const key = /^\{(\w+)\}$/.exec(part)?.[1];
        return <Fragment key={i}>{key && key in links ? links[key] : part}</Fragment>;
      })}
    </>
  );
}

/** Paragraphs, then the bullet list, then the closing paragraphs. */
function Block({ b, links }: { b: LegalBlock; links: Record<string, ReactNode> }) {
  return (
    <>
      {b.body.map((p) => (
        <p key={p}><Rich text={p} links={links} /></p>
      ))}
      {b.list && (
        <ul className="mb-4">
          {b.list.map((li) => (
            <li key={li}><Rich text={li} links={links} /></li>
          ))}
        </ul>
      )}
      {b.after?.map((p) => (
        <p key={p}><Rich text={p} links={links} /></p>
      ))}
    </>
  );
}

export default async function ForumRulesPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const m = getT("misc");
  const t = getT("policies").forumRules;
  const updated =
    lang === "en" ? LAST_UPDATED : formatDate(LAST_UPDATED_ISO, lang, { day: "numeric", month: "long", year: "numeric" });
  const L = m.legal.links;
  const links: Record<string, ReactNode> = {
    privacyEmail: <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>,
    email: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>,
    corrections: <Link href="/corrections">{L.corrections}</Link>,
    forumRules: <Link href="/forum/rules">{L.forumRules}</Link>,
    privacyLink: <Link href="/privacy">{L.privacy}</Link>,
    termsLink: <Link href="/terms">{L.terms}</Link>,
  };
  return (
    <SimplePage lang={lang} current={null} group="legal" title={t.title} lead={fmt(m.legal.lastUpdated, { date: updated })}>
        <p className="s-meta">{m.legal.eyebrow}</p>
        {m.legal.translationNote && (
          <p className="s-note">{m.legal.translationNote}</p>
        )}
        {t.intro.map((p) => (
          <p key={p} className="muted"><Rich text={p} links={links} /></p>
        ))}

        {t.sections.map((s, i) => (
          <LegalSection key={s.title} no={i + 1} title={s.title}>
            <Block b={s} links={links} />
          </LegalSection>
        ))}
    </SimplePage>
  );
}

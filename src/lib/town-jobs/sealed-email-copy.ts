/**
 * Emails of the sealed quote box (PMRFP for Towns, Part C), in English,
 * French and Spanish (pure; sending is lib/email/send.ts sendTownJobEmail).
 * Every one goes out only behind TOWN_SEALED_EMAILS_ENABLED (default off);
 * in-app notices always. None names a company or a price: the box is sealed.
 *
 *   witness     to the witness a one-person town named: a one-time link to
 *               confirm the opening (7 days).
 *   colleague   to the town's other members: someone asked to open; please
 *               confirm.
 *   receipt     to the trade: its sealed quote is in the box (or replaced,
 *               or withdrawn), with the time.
 */
import { localizePath, LOCALE_TAG, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { emailBox, emailButton, escHtml } from "@/lib/email/parts";
import type { BuiltEmail, EmailLang } from "@/lib/pm-jobs/email-copy";

const COPY = {
  en: {
    town: "the town",
    witness: {
      subject: "Please witness the opening of sealed quotes: {title}",
      title: "You've been named as a witness",
      body: "{who} at {buyer} asked to open the sealed quotes for <strong>{title}</strong> and named you as the witness. The quotes stay sealed until you confirm.",
      count: "Quotes in the box: {n}. Closed {closes}.",
      button: "Confirm the opening",
      expires: "This link works once and expires on {date}. If you weren't expecting it, ignore this email: nothing opens without you.",
      foot: "Sent by PMRFP on behalf of {buyer}. You won't get any other email from us about this.",
    },
    colleague: {
      subject: "Please confirm: open the sealed quotes for {title}",
      title: "A colleague asked to open the sealed quotes",
      body: "{who} asked to open the sealed quotes for <strong>{title}</strong>. A second person from your organization has to confirm before anyone sees them.",
      button: "Review and confirm",
      expires: "The request expires on {date}.",
    },
    receipt: {
      subject: { received: "Your sealed quote is in: {title}", replaced: "Your sealed quote was replaced: {title}", withdrawn: "Your sealed quote was withdrawn: {title}" },
      title: { received: "Your quote is sealed", replaced: "Your quote was replaced", withdrawn: "Your quote was withdrawn" },
      body: {
        received: "We received your sealed quote for <strong>{title}</strong> ({buyer}) on {at}. Nobody, including the town, can see it until the box closes and two people open it.",
        replaced: "Your new quote for <strong>{title}</strong> ({buyer}) replaced the earlier one on {at}. Only the latest version is opened.",
        withdrawn: "You withdrew your quote for <strong>{title}</strong> ({buyer}) on {at}. It was erased unopened. You can send a new one until closing.",
      },
      closes: "The box closes {closes}.",
      button: "See your quote",
    },
  },
  fr: {
    town: "la municipalité",
    witness: {
      subject: "Témoin de l'ouverture des prix scellés : {title}",
      title: "Vous êtes nommé témoin",
      body: "{who} de {buyer} a demandé d'ouvrir les prix scellés de <strong>{title}</strong> et vous a nommé témoin. Les prix restent scellés jusqu'à votre confirmation.",
      count: "Prix dans la boîte : {n}. Clôture : {closes}.",
      button: "Confirmer l'ouverture",
      expires: "Ce lien ne fonctionne qu'une fois et expire le {date}. Si vous ne l'attendiez pas, ignorez ce courriel : rien ne s'ouvre sans vous.",
      foot: "Envoyé par PMRFP au nom de {buyer}. Vous ne recevrez aucun autre courriel de notre part à ce sujet.",
    },
    colleague: {
      subject: "À confirmer : ouvrir les prix scellés de {title}",
      title: "Un collègue a demandé d'ouvrir les prix scellés",
      body: "{who} a demandé d'ouvrir les prix scellés de <strong>{title}</strong>. Une deuxième personne de votre organisation doit confirmer avant que quiconque les voie.",
      button: "Vérifier et confirmer",
      expires: "La demande expire le {date}.",
    },
    receipt: {
      subject: { received: "Votre prix scellé est reçu : {title}", replaced: "Votre prix scellé a été remplacé : {title}", withdrawn: "Votre prix scellé a été retiré : {title}" },
      title: { received: "Votre prix est scellé", replaced: "Votre prix a été remplacé", withdrawn: "Votre prix a été retiré" },
      body: {
        received: "Nous avons reçu votre prix scellé pour <strong>{title}</strong> ({buyer}) le {at}. Personne, pas même la municipalité, ne peut le voir avant la clôture et l'ouverture par deux personnes.",
        replaced: "Votre nouveau prix pour <strong>{title}</strong> ({buyer}) a remplacé le précédent le {at}. Seule la dernière version est ouverte.",
        withdrawn: "Vous avez retiré votre prix pour <strong>{title}</strong> ({buyer}) le {at}. Il a été effacé sans être ouvert. Vous pouvez en envoyer un nouveau jusqu'à la clôture.",
      },
      closes: "La boîte ferme le {closes}.",
      button: "Voir votre prix",
    },
  },
  es: {
    town: "el municipio",
    witness: {
      subject: "Sea testigo de la apertura de cotizaciones selladas: {title}",
      title: "Lo nombraron testigo",
      body: "{who}, de {buyer}, pidió abrir las cotizaciones selladas de <strong>{title}</strong> y lo nombró testigo. Las cotizaciones siguen selladas hasta que usted confirme.",
      count: "Cotizaciones en el buzón: {n}. Cierre: {closes}.",
      button: "Confirmar la apertura",
      expires: "Este enlace funciona una sola vez y vence el {date}. Si no lo esperaba, ignore este correo: nada se abre sin usted.",
      foot: "Enviado por PMRFP en nombre de {buyer}. No recibirá ningún otro correo nuestro sobre esto.",
    },
    colleague: {
      subject: "Confirme: abrir las cotizaciones selladas de {title}",
      title: "Un colega pidió abrir las cotizaciones selladas",
      body: "{who} pidió abrir las cotizaciones selladas de <strong>{title}</strong>. Una segunda persona de su organización debe confirmar antes de que alguien las vea.",
      button: "Revisar y confirmar",
      expires: "La solicitud vence el {date}.",
    },
    receipt: {
      subject: { received: "Su cotización sellada fue recibida: {title}", replaced: "Su cotización sellada fue reemplazada: {title}", withdrawn: "Su cotización sellada fue retirada: {title}" },
      title: { received: "Su cotización está sellada", replaced: "Su cotización fue reemplazada", withdrawn: "Su cotización fue retirada" },
      body: {
        received: "Recibimos su cotización sellada para <strong>{title}</strong> ({buyer}) el {at}. Nadie, ni siquiera el municipio, puede verla hasta que el buzón cierre y dos personas lo abran.",
        replaced: "Su nueva cotización para <strong>{title}</strong> ({buyer}) reemplazó a la anterior el {at}. Solo se abre la última versión.",
        withdrawn: "Retiró su cotización para <strong>{title}</strong> ({buyer}) el {at}. Se borró sin abrirse. Puede enviar una nueva hasta el cierre.",
      },
      closes: "El buzón cierra el {closes}.",
      button: "Ver su cotización",
    },
  },
} as const;

const p = (html: string) => `<p>${html}</p>`;
const link = (base: string, path: string, lang: Locale) => `${base}${localizePath(path, lang)}`;
const buyerOf = (lang: EmailLang, b: string | null | undefined) => escHtml(b?.trim() || COPY[lang].town);

/** "Oct 30, 2026, 11:59 p.m. PDT": the last minute of the closing day, in the town's time zone. */
export function closingLabel(closesAt: string | null | undefined, timeZone: string, lang: Locale): string {
  if (!closesAt) return "—";
  const last = new Date(Date.parse(closesAt) - 60_000);
  return last.toLocaleString(LOCALE_TAG[lang], { timeZone, month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

/** A moment, in the town's time zone ("Oct 21, 2026, 2:14 p.m. EDT"). */
export function momentLabel(at: string | null | undefined, timeZone: string, lang: Locale): string {
  if (!at) return "—";
  return new Date(at).toLocaleString(LOCALE_TAG[lang], { timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

interface BoxBits {
  base: string;
  buyer: string | null;
  title: string;
  timeZone: string;
}

/** To the witness: a one-time link to confirm the opening. Transactional (one email, no list). */
export function witnessEmail(lang: EmailLang, x: BoxBits & { who: string; rfpId: string; path: string; received: number; closesAt: string | null; expiresAt: string }): BuiltEmail {
  const c = COPY[lang].witness;
  const buyer = buyerOf(lang, x.buyer);
  return {
    subject: fmt(c.subject, { title: x.title }),
    title: c.title,
    bodyHtml: [
      p(fmt(c.body, { who: escHtml(x.who), buyer, title: escHtml(x.title) })),
      emailBox(escHtml(fmt(c.count, { n: x.received, closes: closingLabel(x.closesAt, x.timeZone, lang) }))),
      p(emailButton(link(x.base, x.path, lang), c.button)),
      `<p style="font-size:14px;color:#475569">${escHtml(fmt(c.expires, { date: momentLabel(x.expiresAt, x.timeZone, lang) }))}</p>`,
    ].join("\n"),
    footnote: fmt(c.foot, { buyer }),
  };
}

/** To the town's other members: please confirm the opening. */
export function colleagueOpeningEmail(lang: EmailLang, x: BoxBits & { who: string; rfpId: string; expiresAt: string }): BuiltEmail {
  const c = COPY[lang].colleague;
  return {
    subject: fmt(c.subject, { title: x.title }),
    title: c.title,
    bodyHtml: [
      p(fmt(c.body, { who: escHtml(x.who), title: escHtml(x.title) })),
      p(emailButton(link(x.base, `/buyer-dashboard/jobs/${x.rfpId}#sealed`, lang), c.button)),
      `<p style="font-size:14px;color:#475569">${escHtml(fmt(c.expires, { date: momentLabel(x.expiresAt, x.timeZone, lang) }))}</p>`,
    ].join("\n"),
    footnote: "",
  };
}

/** To the trade: its sealed quote was received, replaced or withdrawn (never the price). */
export function sealedReceiptEmail(lang: EmailLang, x: BoxBits & { kind: "received" | "replaced" | "withdrawn"; slug: string; at: string; closesAt: string | null }): BuiltEmail {
  const c = COPY[lang].receipt;
  return {
    subject: fmt(c.subject[x.kind], { title: x.title }),
    title: c.title[x.kind],
    bodyHtml: [
      p(fmt(c.body[x.kind], { title: escHtml(x.title), buyer: buyerOf(lang, x.buyer), at: escHtml(momentLabel(x.at, x.timeZone, lang)) })),
      p(escHtml(fmt(c.closes, { closes: closingLabel(x.closesAt, x.timeZone, lang) }))),
      p(emailButton(link(x.base, `/rfps/${x.slug}#sealed-quote`, lang), c.button)),
    ].join("\n"),
    footnote: "",
  };
}

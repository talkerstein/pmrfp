/**
 * The badge lane's email copy, en / fr / es (lib/lifecycle/copy renders it):
 *   badge          right after the profile is approved
 *   badge_reminder 7 days later, only if no install was detected (the last one)
 *   badge_thanks   once, when the install is first detected
 *   welcome_back   the single catch-up email for accounts older than go-live
 *
 * Honest by rule: the badge helps visitors verify the listing and links to
 * the PMRFP profile; links from relevant directories "can help search engines
 * understand your business", and no copy here promises rankings, traffic or
 * results. The reward line exists only while BADGE_REWARD_ENABLED is on
 * (CopyData.badge.reward is null otherwise). The code in the email is the
 * /badge page's own snippet (lib/badge/snippet badgeHtml) with the company's
 * real slug; nothing is generated twice. Canada and U.S. share this copy: it
 * names no currency, province, state or postal term.
 */
import { localizePath, type Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { badgeHtml } from "@/lib/badge/snippet";
import type { Block } from "./blocks";
import type { CopyData } from "./copy";

/** What the badge emails need that the other steps don't. */
export interface BadgeCopy {
  /** The company's real directory slug: in the snippet, the profile link and /badge?company=. */
  slug: string;
  /** The company's own site as shown ("acme.ca"), or null when its profile lists none. */
  website: string | null;
  /** badge_thanks: the domain the badge was detected on. */
  detectedDomain: string | null;
  /** The reward line. Null unless BADGE_REWARD_ENABLED is on and this company can still earn it (offer), or just did (granted). */
  reward: { state: "offer" | "granted"; days: number; endsAt: string | null } | null;
}

interface BadgeStrings {
  badge: {
    subject: string;
    intro: (company: string) => string;
    imgAlt: string;
    why: string;
    install: string;
    platforms: string[];
    noSite: string;
    noSiteCta: string;
    send: string;
    page: string;
    reward: (days: number) => string;
  };
  reminder: { subject: string; intro: string; paste: string; why: string; last: string };
  thanks: {
    subject: (domain: string) => string;
    intro: (domain: string) => string;
    granted: (date: string) => string;
    nothing: string;
    cta: string;
  };
  back: { subject: (first: string | null) => string; intro: (company: string) => string };
  mail: { subject: string; body: (code: string, profileUrl: string) => string };
}

const EN: BadgeStrings = {
  badge: {
    subject: "Put your PMRFP badge on your website (2 minutes)",
    intro: (c) => `${c} is listed on PMRFP. Here's a small PMRFP badge for your website footer or contact page.`,
    imgAlt: "The PMRFP badge: Listed on pmrfp.com",
    why: "Why add it: visitors can check that you're listed and click through to your projects and reviews. Links from relevant directories can help search engines understand your business, but we can't promise rankings. Once the badge is on your site and your profile has been live 14 days, your PMRFP link to your website becomes a followed link.",
    install: "It takes about two minutes. Paste this code where you want the badge to show:",
    platforms: ["WordPress: Appearance, Widgets, Custom HTML", "Wix: Add, Embed Code, Embed HTML", "Squarespace: edit footer, add a Code block", "Shopify: Themes, Edit code, footer"],
    noSite: "Your profile doesn't list a website yet. Add it, and we'll tell you when we see the badge on it.",
    noSiteCta: "Add your website",
    send: "Send this to whoever manages your website",
    page: "Your badge page, with a dark version",
    reward: (n) => `Once we see it on your own site, we'll add ${n} days of Trade Pro, free.`,
  },
  reminder: {
    subject: "Your PMRFP badge is still waiting",
    intro: "A week ago we sent you a PMRFP badge for your website. We can't see it on your site yet.",
    paste: "It takes two minutes. Paste this code in your website footer or contact page:",
    why: "Visitors can then check you're listed and see your projects and reviews.",
    last: "This is the last reminder. Your listing stays the same either way.",
  },
  thanks: {
    subject: (d) => `Thanks: we can see your PMRFP badge on ${d}`,
    intro: (d) => `Thanks, the PMRFP badge is showing on ${d}. Visitors can now check you're listed and click through to your profile.`,
    granted: (date) => `As a thank-you, Trade Pro is on for you through ${date}.`,
    nothing: "Nothing else to do. Your listing stays the same either way.",
    cta: "See your PMRFP profile",
  },
  back: {
    subject: (f) => (f ? `Welcome back to PMRFP, ${f}: a badge for your website` : "Welcome back to PMRFP: a badge for your website"),
    intro: (c) => `Welcome back to PMRFP. We've added a small PMRFP badge for ${c}'s website footer or contact page.`,
  },
  mail: {
    subject: "Please add our PMRFP badge to the website",
    body: (code, url) =>
      `Hi,\n\nCould you add the PMRFP badge to our website, in the footer or on the contact page? It takes about two minutes.\n\nPaste this HTML where it should show:\n\n${code}\n\nIt shows we're listed on PMRFP and links to our profile: ${url}\n\nThanks!`,
  },
};

const FR: BadgeStrings = {
  badge: {
    subject: "Mettez votre badge PMRFP sur votre site Web (2 minutes)",
    intro: (c) => `${c} figure au répertoire PMRFP. Voici un petit badge pour le pied de page ou la page de contact de votre site.`,
    imgAlt: "Le badge PMRFP : Listed on pmrfp.com",
    why: "Pourquoi : les visiteurs voient que vous êtes inscrit et accèdent à vos projets et avis. Les liens de répertoires pertinents peuvent aider les moteurs de recherche à comprendre votre entreprise, sans garantie de classement. Badge sur votre site et profil en ligne depuis 14 jours : le lien de PMRFP vers votre site devient un lien suivi.",
    install: "Deux minutes. Collez ce code là où le badge doit s'afficher :",
    platforms: ["WordPress : Apparence, Widgets, HTML personnalisé", "Wix : Ajouter, Code d'intégration, HTML", "Squarespace : pied de page, bloc Code", "Shopify : Thèmes, Modifier le code, pied de page"],
    noSite: "Votre profil n'indique pas encore de site Web. Ajoutez-le, et nous vous dirons quand le badge y apparaît.",
    noSiteCta: "Ajouter votre site Web",
    send: "Envoyer ceci à la personne qui gère votre site",
    page: "Votre page de badge, avec version sombre",
    reward: (n) => `Dès qu'il s'affiche sur votre site : ${n} jours de Trade Pro offerts.`,
  },
  reminder: {
    subject: "Votre badge PMRFP vous attend toujours",
    intro: "Il y a une semaine, nous vous avons envoyé un badge PMRFP pour votre site Web. Nous ne le voyons pas encore sur votre site.",
    paste: "Ça prend deux minutes. Collez ce code dans le pied de page ou la page de contact de votre site :",
    why: "Les visiteurs pourront alors vérifier que vous êtes inscrit et voir vos projets et vos avis.",
    last: "C'est le dernier rappel. Votre inscription reste telle quelle, peu importe.",
  },
  thanks: {
    subject: (d) => `Merci : nous voyons votre badge PMRFP sur ${d}`,
    intro: (d) => `Merci, le badge PMRFP s'affiche sur ${d}. Les visiteurs peuvent maintenant vérifier que vous êtes inscrit et accéder à votre profil.`,
    granted: (date) => `En remerciement, Trade Pro est activé pour vous jusqu'au ${date}.`,
    nothing: "Rien d'autre à faire. Votre inscription reste telle quelle, peu importe.",
    cta: "Voir votre profil PMRFP",
  },
  back: {
    subject: (f) => (f ? `Content de vous revoir sur PMRFP, ${f} : un badge pour votre site` : "Content de vous revoir sur PMRFP : un badge pour votre site"),
    intro: (c) => `Content de vous revoir sur PMRFP. Voici un petit badge pour le pied de page ou la page de contact du site de ${c}.`,
  },
  mail: {
    subject: "Veuillez ajouter notre badge PMRFP au site Web",
    body: (code, url) =>
      `Bonjour,\n\nPourriez-vous ajouter le badge PMRFP à notre site Web, dans le pied de page ou sur la page de contact? Ça prend environ deux minutes.\n\nCollez ce code HTML là où il doit s'afficher :\n\n${code}\n\nIl montre que nous sommes inscrits sur PMRFP et mène à notre profil : ${url}\n\nMerci!`,
  },
};

const ES: BadgeStrings = {
  badge: {
    subject: "Ponga la insignia de PMRFP en su sitio web (2 minutos)",
    intro: (c) => `${c} está en PMRFP. Aquí tiene una pequeña insignia para el pie de página o la página de contacto de su sitio.`,
    imgAlt: "La insignia de PMRFP: Listed on pmrfp.com",
    why: "Por qué: los visitantes comprueban que usted está registrado y ven sus proyectos y reseñas. Los enlaces de directorios relevantes pueden ayudar a los buscadores a entender su negocio, pero no prometemos posiciones. Con la insignia en su sitio y el perfil publicado 14 días, el enlace de PMRFP a su sitio pasa a ser un enlace seguido.",
    install: "Dos minutos. Pegue este código donde quiera la insignia:",
    platforms: ["WordPress: Apariencia, Widgets, HTML personalizado", "Wix: Agregar, Código para insertar, HTML", "Squarespace: pie de página, bloque de Código", "Shopify: Temas, Editar código, pie de página"],
    noSite: "Su perfil todavía no tiene un sitio web. Agréguelo y le avisaremos cuando veamos la insignia.",
    noSiteCta: "Agregar su sitio web",
    send: "Enviar esto a quien administra su sitio",
    page: "Su página de la insignia, con versión oscura",
    reward: (n) => `Al verla en su sitio: ${n} días de Trade Pro gratis.`,
  },
  reminder: {
    subject: "Su insignia de PMRFP sigue esperando",
    intro: "Hace una semana le enviamos una insignia de PMRFP para su sitio web. Todavía no la vemos en su sitio.",
    paste: "Toma dos minutos. Pegue este código en el pie de página o la página de contacto de su sitio:",
    why: "Así los visitantes pueden comprobar que usted está registrado y ver sus proyectos y reseñas.",
    last: "Es el último recordatorio. Su registro sigue igual de todos modos.",
  },
  thanks: {
    subject: (d) => `Gracias: vemos su insignia de PMRFP en ${d}`,
    intro: (d) => `Gracias, la insignia de PMRFP ya se ve en ${d}. Los visitantes ahora pueden comprobar que usted está registrado y entrar a su perfil.`,
    granted: (date) => `Como agradecimiento, Trade Pro está activo para usted hasta el ${date}.`,
    nothing: "No hay nada más que hacer. Su registro sigue igual de todos modos.",
    cta: "Ver su perfil de PMRFP",
  },
  back: {
    subject: (f) => (f ? `Bienvenido de nuevo a PMRFP, ${f}: una insignia para su sitio` : "Bienvenido de nuevo a PMRFP: una insignia para su sitio"),
    intro: (c) => `Bienvenido de nuevo a PMRFP. Agregamos una pequeña insignia para el pie de página o la página de contacto del sitio de ${c}.`,
  },
  mail: {
    subject: "Por favor agregue nuestra insignia de PMRFP al sitio web",
    body: (code, url) =>
      `Hola:\n\n¿Podría agregar la insignia de PMRFP a nuestro sitio web, en el pie de página o en la página de contacto? Toma unos dos minutos.\n\nPegue este HTML donde deba aparecer:\n\n${code}\n\nMuestra que estamos registrados en PMRFP y enlaza a nuestro perfil: ${url}\n\n¡Gracias!`,
  },
};

export const BADGE_STRINGS: Record<Locale, BadgeStrings> = { en: EN, fr: FR, es: ES };

/** Where a badge email's links go (copy.ts passes its own helpers in, so this file imports no runtime values from it). */
export interface BadgeEnv {
  /** https://pmrfp.com, no trailing slash. */
  base: string;
  /** Our link, localized and tagged for the step. */
  url: (path: string) => string;
  /** The preview picture. */
  previewUrl: string;
  /** Paths (copy.ts PATHS). */
  paths: { badge: string; company: string };
}

/** The sample copy-paste code for this company: the /badge page's own generator, the real slug. */
export function badgeCode(d: Pick<CopyData, "company" | "lang"> & { badge: BadgeCopy }, base: string): { code: string; profileUrl: string } {
  const lang = d.lang;
  const profileUrl = `${base}${localizePath(`/directory/${d.badge.slug}`, lang)}`;
  const code = badgeHtml({ kind: "listed", base, slug: d.badge.slug, pageUrl: profileUrl, name: d.company, lang });
  return { code, profileUrl };
}

/** A mailto: link whose body is ready to forward to whoever manages the website. */
export function mailtoUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function fallbackBadgeCopy(d: Pick<CopyData, "company">): BadgeCopy {
  const slug = d.company.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "your-company";
  return { slug, website: null, detectedDomain: null, reward: null };
}

export type BadgeBodyStep = "badge" | "badge_reminder" | "badge_thanks" | "welcome_back";

/** Subject and blocks for a badge-lane step. */
export function badgeBody(step: BadgeBodyStep, d: CopyData, env: BadgeEnv): { subject: string; blocks: Block[] } {
  const s = BADGE_STRINGS[d.lang];
  const b = d.badge ?? fallbackBadgeCopy(d);
  const dd = { company: d.company, lang: d.lang, badge: b };
  const { code, profileUrl } = badgeCode(dd, env.base);
  const share: Block = { link: { label: s.badge.send, url: mailtoUrl(s.mail.subject, s.mail.body(code, profileUrl)) } };
  const page: Block = { link: { label: s.badge.page, url: env.url(`${env.paths.badge}?company=${encodeURIComponent(b.slug)}`) } };
  const picture: Block = { img: { src: env.previewUrl, alt: s.badge.imgAlt, width: 214, height: 54 } };
  const reward = b.reward?.state === "offer" ? ([{ p: s.badge.reward(b.reward.days) }] as Block[]) : [];

  switch (step) {
    case "badge":
    case "welcome_back": {
      const hasSite = Boolean(b.website);
      const intro = step === "badge" ? s.badge.intro(d.company) : s.back.intro(d.company);
      return {
        subject: step === "badge" ? s.badge.subject : s.back.subject(d.firstName),
        blocks: [
          { p: intro },
          picture,
          ...(hasSite ? [] : ([{ p: s.badge.noSite }, { link: { label: s.badge.noSiteCta, url: env.url(env.paths.company) } }] as Block[])),
          { p: s.badge.why },
          ...reward,
          { p: s.badge.install },
          { code },
          ...(hasSite ? ([{ list: s.badge.platforms }] as Block[]) : []),
          share,
          page,
        ],
      };
    }
    case "badge_reminder": {
      const x = s.reminder;
      return {
        subject: x.subject,
        blocks: [{ p: x.intro }, picture, { p: x.paste }, { code }, share, { p: x.why }, ...reward, { p: x.last }, page],
      };
    }
    case "badge_thanks": {
      const x = s.thanks;
      const domain = b.detectedDomain ?? b.website ?? "your website";
      const granted =
        b.reward?.state === "granted" && b.reward.endsAt
          ? ([{ p: x.granted(formatDate(b.reward.endsAt, d.lang, { month: "long", day: "numeric" })) }] as Block[])
          : [];
      return {
        subject: x.subject(domain),
        blocks: [{ p: x.intro(domain) }, ...granted, { p: x.nothing }, { link: { label: x.cta, url: env.url(`/directory/${b.slug}`) } }],
      };
    }
  }
}

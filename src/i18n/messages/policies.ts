/**
 * Server strings for the public policy pages: /corrections (how we correct
 * and remove public-record data) and /forum/rules (community rules).
 * Legal-style text: French and Spanish are complete, faithful translations.
 *
 * In the text, {privacyEmail} {email} {corrections} {forumRules}
 * {privacyLink} {termsLink} become links on the page (labels in
 * misc.legal.links). Timelines are targets ("we aim to"), not guarantees.
 */
import type { LegalBlock } from "./misc";

const en = {
  corrections: {
    meta: {
      title: "Corrections and removal policy",
      description: "How to report an error on PMRFP or ask for a removal, what we check, and how long it takes.",
    },
    title: "Corrections and removal policy",
    intro: [
      "PMRFP republishes public tenders, contract awards, bid results, permits and project data from government sources, and hosts profiles and posts from members. This policy explains how to report an error or ask for a removal, and what we do with your request. It doesn't limit your rights under our {privacyLink}.",
    ],
    sections: [
      {
        title: "How to Report",
        body: [
          "Use the “Report an error or request removal” link on the listing, award or profile page where it appears, or email {privacyEmail}. Please include:",
        ],
        list: [
          "the page address (URL) and what is wrong;",
          "what the correct information is, and a link to the official source if you have one;",
          "your name, how to reach you, and your connection to the record (for example, you work for the company named).",
        ],
        after: ["To report a forum post, use the “Report” link on the post, as set out in the {forumRules}."],
      },
      {
        title: "What We Check",
        body: [
          "We compare the record with the official source (the notice, award record or dataset it came from) and check whether we copied it correctly, whether the source has since updated or withdrawn it, and whether our own sorting made an error (for example the trade, region or country, how company names were grouped, or our rule that leaves individuals unnamed). For a company profile, we may ask you to show that you represent the company.",
        ],
      },
      {
        title: "How Long It Takes",
        list: [
          "We aim to acknowledge your request within 2 business days.",
          "We aim to fix the record, or explain why we can't, within 10 business days.",
          "Requests to remove an individual's personal information are handled first.",
          "If we need an answer from the source or more information from you, we'll tell you and keep you updated.",
        ],
        body: [],
        after: ["These are our targets, not guarantees. Requests to access or correct your personal information under privacy law are answered within 30 days, as set out in our {privacyLink}."],
      },
      {
        title: "What We Correct",
        list: [
          "Information we copied or transcribed wrongly.",
          "Records that are out of date because the source has since changed them.",
          "Records filed under the wrong trade, region or country.",
          "Records attached to the wrong company (for example, two companies with similar names).",
          "A private individual's name that our automated rule should have left out.",
        ],
        body: [],
      },
      {
        title: "What We Can't Change",
        body: [
          "We can't change the official record held by the issuing body. If the source itself is wrong, we'll point you to the buyer or agency that published it so you can ask them to correct it, and we'll update PMRFP once they do. In the meantime, we can add a note to the record or hide it where it is likely wrong or could cause harm.",
        ],
      },
      {
        title: "Personal Information About Individuals",
        body: [
          "On request, we remove personal information about private individuals, such as a person's name, home address, personal phone number or personal email, even when the source published it, unless the law requires us to keep it. Where the law provides, we also stop disseminating it or de-index links to it.",
        ],
      },
      {
        title: "Business Information From Public Records",
        body: [
          "Business names, contract values and award details are public records of public spending, so they generally stay published. We correct them when they are wrong, and with supporting evidence we can add a note (for example, that a contract was later cancelled or amended). We don't remove accurate records just because a company would prefer they weren't shown.",
        ],
      },
      {
        title: "Member Content & Forum Posts",
        body: [
          "You can edit your own company profile and listings from your dashboard. Reviews and forum posts by others follow our {termsLink} and {forumRules}: we don't rewrite other members' posts on request, but we hide posts that break the rules.",
        ],
      },
      {
        title: "How We Tell You the Outcome",
        body: [
          "We reply by email with what we decided: corrected, annotated, hidden, removed, or no change, with our reasons and the source we relied on. If you disagree, reply with any further information and we'll look again. For a privacy complaint, you can also contact the authorities listed in our {privacyLink}.",
        ],
      },
      {
        title: "Records We Keep",
        body: [
          "We keep a record of each request (what was asked, what we checked, what we decided and when) so we can handle follow-ups consistently. We keep it only as long as needed for that purpose, and handle any personal information in it under our {privacyLink}.",
        ],
      },
    ] as LegalBlock[],
  },
  forumRules: {
    meta: { title: "Forum rules", description: "The rules for posting in the PMRFP forum, how to report a post, and how moderation works." },
    title: "Forum rules",
    intro: [
      "The PMRFP forum is for people in the trades and property business to share real experience. These rules keep it useful and lawful, and they are part of our {termsLink}. Posts reflect the views of their authors, not PMRFP.",
    ],
    sections: [
      {
        title: "Real People, Real Companies",
        body: ["Post as yourself or your real company. No fake personas, and don't pretend to be another person or company."],
      },
      {
        title: "No Defamation",
        body: ["Don't post false statements of fact that could harm the reputation of a person or a company. You are responsible for what you post."],
      },
      {
        title: "Facts and First-Hand Experience, Not Accusations",
        body: [
          "Don't accuse named people or companies of fraud, crimes or dishonesty unless it is a verifiable fact (for example, a court decision or an official public record you can link to). Stick to what you saw yourself and what can be checked. Say “in my experience” and keep opinion clearly separate from fact.",
        ],
      },
      {
        title: "No Personal Attacks or Harassment",
        body: ["No threats, insults, slurs or hate, no pile-ons, and don't follow someone around the forum. Disagree with the idea, not the person."],
      },
      {
        title: "No Personal Information About Others",
        body: [
          "Don't post other people's home addresses, personal phone numbers or emails, unit numbers, licence plates, or photos of people who haven't agreed. When you discuss clients or payment problems, don't name private individuals. Companies can be discussed, factually.",
        ],
      },
      {
        title: "No Spam or Self-Promotion",
        body: [
          "No cold pitches, ads or link-dropping in threads. Your profile already links to your listing. Link shorteners and repeated posts are blocked. To promote your business, see Advertise with us.",
        ],
      },
      {
        title: "Nothing Illegal; Respect Others' Rights",
        body: [
          "Don't post anything unlawful or that encourages unlawful conduct (for example, bid-rigging or price-fixing). Only post photos, documents, drawings and text you have the right to share, and never confidential bid documents.",
        ],
      },
      {
        title: "Stay on Topic",
        body: ["Answer the question that was asked, show your work, and post in the right room."],
      },
      {
        title: "How to Report a Post",
        body: [
          "Use the “Report” link on any post or thread. Signed-in members who can post may report (not their own posts) and may add a reason. When three different members report the same post, it is hidden automatically until a moderator reviews it.",
          "For a legal problem, such as defamation, personal information or copyright, you can also email {privacyEmail}. Our {corrections} explains how we handle those requests.",
        ],
      },
      {
        title: "What Moderators Do",
        list: [
          "Review reported posts and posts held for review.",
          "Hide posts or threads that break these rules, and restore those that don't.",
          "Lock threads that have gone off the rails, and pin useful ones.",
          "Stop an account from posting for serious or repeated breaches.",
        ],
        body: [],
        after: [
          "Some checks are automatic: posts with links from new members may be held for review before they appear, and posting limits apply. A post hidden by a moderator can lower the author's company reputation score.",
        ],
      },
      {
        title: "Appeals",
        body: [
          "If you think a post was hidden or your account was stopped from posting by mistake, email {email} with a link to the post and why you think the decision was wrong. We'll review it and reply.",
        ],
      },
    ] as LegalBlock[],
  },
};

const fr: typeof en = {
  corrections: {
    meta: {
      title: "Politique de correction et de retrait",
      description: "Comment signaler une erreur sur PMRFP ou demander un retrait, ce que nous vérifions et les délais.",
    },
    title: "Politique de correction et de retrait",
    intro: [
      "PMRFP republie des appels d'offres publics, des contrats octroyés, des résultats de soumissions, des permis et des données de projets provenant de sources gouvernementales, et héberge les profils et les messages de ses membres. La présente politique explique comment signaler une erreur ou demander un retrait, et ce que nous faisons de votre demande. Elle ne limite pas les droits que vous confère notre {privacyLink}.",
    ],
    sections: [
      {
        title: "Comment faire un signalement",
        body: [
          "Utilisez le lien « Signaler une erreur ou demander un retrait » sur la page de la fiche, du contrat ou du profil où il est affiché, ou écrivez à {privacyEmail}. Veuillez indiquer :",
        ],
        list: [
          "l'adresse (URL) de la page et ce qui est erroné;",
          "le renseignement exact et, si vous l'avez, un lien vers la source officielle;",
          "votre nom, la façon de vous joindre et votre lien avec le dossier (par exemple, vous travaillez pour l'entreprise nommée).",
        ],
        after: ["Pour signaler un message du forum, utilisez le lien « Signaler » du message, comme le prévoient les {forumRules}."],
      },
      {
        title: "Ce que nous vérifions",
        body: [
          "Nous comparons le dossier avec la source officielle (l'avis, le dossier d'octroi ou le jeu de données d'où il provient) et vérifions si nous l'avons copié correctement, si la source l'a depuis mis à jour ou retiré, et si notre propre classement a commis une erreur (par exemple le corps de métier, la région ou le pays, le regroupement des noms d'entreprises, ou notre règle qui ne nomme pas les particuliers). Pour un profil d'entreprise, nous pourrions vous demander de démontrer que vous représentez l'entreprise.",
        ],
      },
      {
        title: "Délais",
        list: [
          "Nous visons à accuser réception de votre demande dans un délai de 2 jours ouvrables.",
          "Nous visons à corriger le dossier, ou à expliquer pourquoi nous ne le pouvons pas, dans un délai de 10 jours ouvrables.",
          "Les demandes de retrait de renseignements personnels concernant un particulier sont traitées en priorité.",
          "Si nous avons besoin d'une réponse de la source ou de renseignements supplémentaires de votre part, nous vous le dirons et vous tiendrons au courant.",
        ],
        body: [],
        after: ["Ce sont nos objectifs, et non des garanties. Les demandes d'accès à vos renseignements personnels ou de rectification présentées en vertu des lois sur la protection des renseignements personnels reçoivent une réponse dans un délai de 30 jours, comme le prévoit notre {privacyLink}."],
      },
      {
        title: "Ce que nous corrigeons",
        list: [
          "Les renseignements que nous avons mal copiés ou mal transcrits.",
          "Les dossiers périmés parce que la source les a modifiés depuis.",
          "Les dossiers classés sous le mauvais corps de métier, la mauvaise région ou le mauvais pays.",
          "Les dossiers rattachés à la mauvaise entreprise (par exemple, deux entreprises aux noms semblables).",
          "Le nom d'un particulier que notre règle automatisée aurait dû omettre.",
        ],
        body: [],
      },
      {
        title: "Ce que nous ne pouvons pas modifier",
        body: [
          "Nous ne pouvons pas modifier le dossier officiel détenu par l'organisme émetteur. Si la source elle-même est erronée, nous vous dirigerons vers l'acheteur ou l'organisme qui l'a publiée afin que vous lui demandiez de la corriger, et nous mettrons PMRFP à jour une fois la correction faite. Entre-temps, nous pouvons ajouter une note au dossier ou le masquer lorsqu'il est probablement erroné ou pourrait causer un préjudice.",
        ],
      },
      {
        title: "Renseignements personnels concernant des particuliers",
        body: [
          "Sur demande, nous retirons les renseignements personnels concernant des particuliers, comme le nom d'une personne, son adresse domiciliaire, son numéro de téléphone personnel ou son courriel personnel, même lorsque la source les a publiés, à moins que la loi ne nous oblige à les conserver. Lorsque la loi le prévoit, nous cessons aussi de les diffuser ou désindexons les liens qui y mènent.",
        ],
      },
      {
        title: "Renseignements d'entreprises issus de dossiers publics",
        body: [
          "Les noms d'entreprises, les valeurs des contrats et les détails des octrois sont des dossiers publics sur les dépenses publiques; ils demeurent donc généralement publiés. Nous les corrigeons lorsqu'ils sont erronés et, avec des preuves à l'appui, nous pouvons ajouter une note (par exemple, qu'un contrat a par la suite été annulé ou modifié). Nous ne retirons pas un dossier exact simplement parce qu'une entreprise préférerait qu'il ne soit pas affiché.",
        ],
      },
      {
        title: "Contenu des membres et messages du forum",
        body: [
          "Vous pouvez modifier vous-même le profil et les annonces de votre entreprise à partir de votre tableau de bord. Les avis et les messages du forum publiés par d'autres sont régis par nos {termsLink} et nos {forumRules} : nous ne réécrivons pas les messages d'autres membres sur demande, mais nous masquons ceux qui enfreignent les règles.",
        ],
      },
      {
        title: "Comment nous vous informons du résultat",
        body: [
          "Nous vous répondons par courriel en indiquant notre décision : dossier corrigé, annoté, masqué, retiré ou inchangé, avec nos motifs et la source sur laquelle nous nous sommes fondés. Si vous n'êtes pas d'accord, répondez-nous avec tout renseignement supplémentaire et nous réexaminerons la demande. Pour une plainte relative à la vie privée, vous pouvez aussi vous adresser aux autorités indiquées dans notre {privacyLink}.",
        ],
      },
      {
        title: "Dossiers que nous conservons",
        body: [
          "Nous conservons une trace de chaque demande (ce qui a été demandé, ce que nous avons vérifié, ce que nous avons décidé et quand) afin de traiter les suivis de façon cohérente. Nous ne la conservons que le temps nécessaire à cette fin et traitons tout renseignement personnel qu'elle contient conformément à notre {privacyLink}.",
        ],
      },
    ] as LegalBlock[],
  },
  forumRules: {
    meta: { title: "Règles du forum", description: "Les règles de publication sur le forum de PMRFP, comment signaler un message et comment fonctionne la modération." },
    title: "Règles du forum",
    intro: [
      "Le forum de PMRFP permet aux gens des métiers et de l'immobilier de partager leur expérience réelle. Ces règles le gardent utile et conforme à la loi, et elles font partie de nos {termsLink}. Les messages reflètent l'opinion de leurs auteurs, et non celle de PMRFP.",
    ],
    sections: [
      {
        title: "De vraies personnes, de vraies entreprises",
        body: ["Publiez en votre nom ou au nom de votre véritable entreprise. Aucun faux profil, et ne vous faites pas passer pour une autre personne ou une autre entreprise."],
      },
      {
        title: "Aucune diffamation",
        body: ["Ne publiez pas de fausses affirmations de fait qui pourraient nuire à la réputation d'une personne ou d'une entreprise. Vous êtes responsable de ce que vous publiez."],
      },
      {
        title: "Des faits et votre expérience, pas des accusations",
        body: [
          "N'accusez pas des personnes ou des entreprises nommées de fraude, de crimes ou de malhonnêteté, sauf s'il s'agit d'un fait vérifiable (par exemple, une décision judiciaire ou un dossier public officiel auquel vous pouvez renvoyer). Tenez-vous-en à ce que vous avez vu vous-même et à ce qui peut être vérifié. Dites « d'après mon expérience » et séparez clairement l'opinion des faits.",
        ],
      },
      {
        title: "Aucune attaque personnelle ni harcèlement",
        body: ["Aucune menace, insulte, injure ni propos haineux, aucun acharnement collectif, et ne suivez pas quelqu'un d'un fil à l'autre. Contestez l'idée, pas la personne."],
      },
      {
        title: "Aucun renseignement personnel sur autrui",
        body: [
          "Ne publiez pas l'adresse domiciliaire, le numéro de téléphone ou le courriel personnels, le numéro de logement ni la plaque d'immatriculation d'autrui, ni de photos de personnes qui n'y ont pas consenti. Lorsque vous parlez de clients ou de problèmes de paiement, ne nommez pas de particuliers. On peut parler des entreprises, avec des faits.",
        ],
      },
      {
        title: "Aucun pourriel ni autopromotion",
        body: [
          "Aucune sollicitation, publicité ni lien lancé dans les fils. Votre profil renvoie déjà à votre fiche. Les raccourcisseurs de liens et les messages répétés sont bloqués. Pour promouvoir votre entreprise, consultez la page Annoncer avec nous.",
        ],
      },
      {
        title: "Rien d'illégal; respectez les droits d'autrui",
        body: [
          "Ne publiez rien d'illégal ni rien qui encourage un comportement illégal (par exemple, le truquage d'offres ou la fixation des prix). Ne publiez que des photos, documents, dessins et textes que vous avez le droit de partager, et jamais de documents de soumission confidentiels.",
        ],
      },
      {
        title: "Restez dans le sujet",
        body: ["Répondez à la question posée, expliquez votre raisonnement et publiez dans la bonne section."],
      },
      {
        title: "Comment signaler un message",
        body: [
          "Utilisez le lien « Signaler » de tout message ou fil. Les membres connectés qui peuvent publier peuvent faire un signalement (sauf pour leurs propres messages) et ajouter un motif. Lorsque trois membres différents signalent le même message, il est automatiquement masqué jusqu'à ce qu'un modérateur l'examine.",
          "Pour un problème juridique, comme la diffamation, des renseignements personnels ou le droit d'auteur, vous pouvez aussi écrire à {privacyEmail}. Notre {corrections} explique comment nous traitons ces demandes.",
        ],
      },
      {
        title: "Ce que font les modérateurs",
        list: [
          "Examiner les messages signalés et les messages retenus pour examen.",
          "Masquer les messages ou les fils qui enfreignent ces règles, et rétablir ceux qui les respectent.",
          "Verrouiller les fils qui dérapent et épingler les fils utiles.",
          "Empêcher un compte de publier en cas de manquements graves ou répétés.",
        ],
        body: [],
        after: [
          "Certaines vérifications sont automatiques : les messages de nouveaux membres qui contiennent des liens peuvent être retenus pour examen avant d'être affichés, et des limites de publication s'appliquent. Un message masqué par un modérateur peut faire baisser la note de réputation de l'entreprise de son auteur.",
        ],
      },
      {
        title: "Appels",
        body: [
          "Si vous croyez qu'un message a été masqué ou que votre compte a été empêché de publier par erreur, écrivez à {email} en indiquant le lien du message et pourquoi vous croyez que la décision est erronée. Nous l'examinerons et vous répondrons.",
        ],
      },
    ] as LegalBlock[],
  },
};

const es: typeof en = {
  corrections: {
    meta: {
      title: "Política de correcciones y retiros",
      description: "Cómo reportar un error en PMRFP o pedir un retiro, qué verificamos y cuánto tarda.",
    },
    title: "Política de correcciones y retiros",
    intro: [
      "PMRFP republica licitaciones públicas, contratos adjudicados, resultados de ofertas, permisos y datos de proyectos de fuentes gubernamentales, y aloja perfiles y mensajes de sus miembros. Esta política explica cómo reportar un error o pedir un retiro, y qué hacemos con su solicitud. No limita los derechos que le otorga nuestra {privacyLink}.",
    ],
    sections: [
      {
        title: "Cómo reportar",
        body: [
          "Use el enlace “Reportar un error o pedir un retiro” en la página de la ficha, del contrato o del perfil donde aparezca, o escriba a {privacyEmail}. Incluya:",
        ],
        list: [
          "la dirección (URL) de la página y qué está mal;",
          "cuál es la información correcta y, si lo tiene, un enlace a la fuente oficial;",
          "su nombre, cómo contactarlo y su relación con el registro (por ejemplo, trabaja para la empresa mencionada).",
        ],
        after: ["Para reportar un mensaje del foro, use el enlace “Reportar” del mensaje, como se indica en las {forumRules}."],
      },
      {
        title: "Qué verificamos",
        body: [
          "Comparamos el registro con la fuente oficial (el aviso, el registro de adjudicación o el conjunto de datos del que proviene) y verificamos si lo copiamos correctamente, si la fuente lo actualizó o retiró desde entonces, y si nuestra propia clasificación cometió un error (por ejemplo, el oficio, la región o el país, cómo se agruparon los nombres de empresas, o nuestra regla que no nombra a los particulares). En el caso de un perfil de empresa, podemos pedirle que demuestre que representa a la empresa.",
        ],
      },
      {
        title: "Cuánto tarda",
        list: [
          "Procuramos acusar recibo de su solicitud en un plazo de 2 días hábiles.",
          "Procuramos corregir el registro, o explicar por qué no podemos, en un plazo de 10 días hábiles.",
          "Las solicitudes para retirar información personal de un particular se atienden primero.",
          "Si necesitamos una respuesta de la fuente o más información de usted, se lo diremos y lo mantendremos informado.",
        ],
        body: [],
        after: ["Estos son nuestros objetivos, no garantías. Las solicitudes de acceso o corrección de su información personal en virtud de las leyes de privacidad se responden en un plazo de 30 días, como se indica en nuestra {privacyLink}."],
      },
      {
        title: "Qué corregimos",
        list: [
          "Información que copiamos o transcribimos mal.",
          "Registros desactualizados porque la fuente los cambió desde entonces.",
          "Registros clasificados en el oficio, la región o el país equivocados.",
          "Registros asociados a la empresa equivocada (por ejemplo, dos empresas con nombres parecidos).",
          "El nombre de un particular que nuestra regla automatizada debió omitir.",
        ],
        body: [],
      },
      {
        title: "Qué no podemos cambiar",
        body: [
          "No podemos cambiar el registro oficial que conserva el organismo emisor. Si la fuente misma está equivocada, le indicaremos el comprador o la agencia que la publicó para que les pida corregirla, y actualizaremos PMRFP cuando lo hagan. Mientras tanto, podemos agregar una nota al registro u ocultarlo cuando probablemente esté equivocado o pueda causar daño.",
        ],
      },
      {
        title: "Información personal de particulares",
        body: [
          "A solicitud, retiramos la información personal de particulares, como el nombre de una persona, su domicilio, su teléfono personal o su correo personal, aunque la fuente la haya publicado, salvo que la ley nos obligue a conservarla. Cuando la ley lo prevé, también dejamos de difundirla o desindexamos los enlaces a ella.",
        ],
      },
      {
        title: "Información de empresas en registros públicos",
        body: [
          "Los nombres de empresas, los valores de los contratos y los detalles de las adjudicaciones son registros públicos del gasto público, por lo que en general siguen publicados. Los corregimos cuando están equivocados y, con pruebas que lo respalden, podemos agregar una nota (por ejemplo, que un contrato se canceló o modificó después). No retiramos registros exactos solo porque una empresa preferiría que no se mostraran.",
        ],
      },
      {
        title: "Contenido de los miembros y mensajes del foro",
        body: [
          "Usted puede editar el perfil y los anuncios de su empresa desde su panel. Las reseñas y los mensajes del foro de otras personas se rigen por nuestros {termsLink} y nuestras {forumRules}: no reescribimos los mensajes de otros miembros a solicitud, pero ocultamos los que infringen las reglas.",
        ],
      },
      {
        title: "Cómo le comunicamos el resultado",
        body: [
          "Le respondemos por correo electrónico con nuestra decisión: corregido, anotado, ocultado, retirado o sin cambios, con nuestras razones y la fuente en la que nos basamos. Si no está de acuerdo, responda con cualquier información adicional y lo revisaremos de nuevo. Para una queja sobre privacidad, también puede dirigirse a las autoridades indicadas en nuestra {privacyLink}.",
        ],
      },
      {
        title: "Registros que conservamos",
        body: [
          "Conservamos un registro de cada solicitud (qué se pidió, qué verificamos, qué decidimos y cuándo) para atender los seguimientos de forma coherente. Lo conservamos solo el tiempo necesario para ese fin y tratamos cualquier información personal que contenga según nuestra {privacyLink}.",
        ],
      },
    ] as LegalBlock[],
  },
  forumRules: {
    meta: { title: "Reglas del foro", description: "Las reglas para publicar en el foro de PMRFP, cómo reportar un mensaje y cómo funciona la moderación." },
    title: "Reglas del foro",
    intro: [
      "El foro de PMRFP es para que las personas de los oficios y del sector inmobiliario compartan su experiencia real. Estas reglas lo mantienen útil y dentro de la ley, y forman parte de nuestros {termsLink}. Los mensajes reflejan la opinión de sus autores, no la de PMRFP.",
    ],
    sections: [
      {
        title: "Personas reales, empresas reales",
        body: ["Publique como usted mismo o como su empresa real. Nada de perfiles falsos, y no se haga pasar por otra persona u otra empresa."],
      },
      {
        title: "Sin difamación",
        body: ["No publique afirmaciones de hecho falsas que puedan dañar la reputación de una persona o una empresa. Usted es responsable de lo que publica."],
      },
      {
        title: "Hechos y experiencia propia, no acusaciones",
        body: [
          "No acuse a personas o empresas con nombre de fraude, delitos o deshonestidad, salvo que sea un hecho verificable (por ejemplo, una decisión judicial o un registro público oficial que pueda enlazar). Limítese a lo que vio usted mismo y a lo que se puede comprobar. Diga “según mi experiencia” y separe claramente la opinión de los hechos.",
        ],
      },
      {
        title: "Sin ataques personales ni acoso",
        body: ["Nada de amenazas, insultos, ofensas ni discursos de odio, nada de ataques en grupo, y no persiga a nadie de un hilo a otro. Discuta la idea, no a la persona."],
      },
      {
        title: "Sin información personal de otras personas",
        body: [
          "No publique el domicilio, el teléfono o el correo personal, el número de unidad ni la placa de otras personas, ni fotos de personas que no lo autorizaron. Cuando hable de clientes o de problemas de pago, no nombre a particulares. Se puede hablar de empresas, con hechos.",
        ],
      },
      {
        title: "Sin spam ni autopromoción",
        body: [
          "Nada de ofertas en frío, anuncios ni enlaces sueltos en los hilos. Su perfil ya enlaza a su ficha. Los acortadores de enlaces y los mensajes repetidos están bloqueados. Para promocionar su empresa, consulte Anúnciese con nosotros.",
        ],
      },
      {
        title: "Nada ilegal; respete los derechos de otros",
        body: [
          "No publique nada ilícito ni que fomente conductas ilícitas (por ejemplo, la colusión en licitaciones o la fijación de precios). Publique solo fotos, documentos, planos y textos que tenga derecho a compartir, y nunca documentos de ofertas confidenciales.",
        ],
      },
      {
        title: "No se salga del tema",
        body: ["Responda la pregunta que se hizo, explique su razonamiento y publique en la sala correcta."],
      },
      {
        title: "Cómo reportar un mensaje",
        body: [
          "Use el enlace “Reportar” de cualquier mensaje o hilo. Los miembros con sesión iniciada que pueden publicar pueden reportar (no sus propios mensajes) y agregar un motivo. Cuando tres miembros distintos reportan el mismo mensaje, se oculta automáticamente hasta que un moderador lo revise.",
          "Para un problema legal, como difamación, información personal o derechos de autor, también puede escribir a {privacyEmail}. Nuestra {corrections} explica cómo tratamos esas solicitudes.",
        ],
      },
      {
        title: "Qué hacen los moderadores",
        list: [
          "Revisan los mensajes reportados y los retenidos para revisión.",
          "Ocultan los mensajes o hilos que infringen estas reglas y restablecen los que no.",
          "Bloquean los hilos que se descontrolan y fijan los útiles.",
          "Impiden que una cuenta publique por infracciones graves o repetidas.",
        ],
        body: [],
        after: [
          "Algunas verificaciones son automáticas: los mensajes con enlaces de miembros nuevos pueden retenerse para revisión antes de aparecer, y se aplican límites de publicación. Un mensaje ocultado por un moderador puede bajar la puntuación de reputación de la empresa de su autor.",
        ],
      },
      {
        title: "Apelaciones",
        body: [
          "Si cree que un mensaje se ocultó o que se impidió publicar a su cuenta por error, escriba a {email} con el enlace del mensaje y por qué cree que la decisión fue equivocada. Lo revisaremos y le responderemos.",
        ],
      },
    ] as LegalBlock[],
  },
};

export default { en, fr, es };

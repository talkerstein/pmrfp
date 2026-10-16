/** Client strings for the "Report an error or request removal" link and form. */
const en = {
  link: "Report an error or request removal",
  title: "Report an error or request removal",
  description:
    "Tell us what is wrong on this page, or what personal information you want removed. We check every request against the official source and reply by email.",
  reason: "What is the problem?",
  reasons: {
    wrong_info: "Information is wrong",
    outdated: "Information is out of date",
    personal_info: "It shows my personal information",
    removal: "I want this removed",
    defamation: "It is unfair or damaging to me or my company",
    other: "Something else",
  },
  details: "Details",
  detailsPlaceholder: "What is wrong, and what is correct? A link to the official record helps.",
  email: "Your email (we reply here)",
  name: "Your name (optional)",
  policy: "How we handle requests",
  privacy: "We use your email only to handle this request.",
  submit: "Send request",
  sending: "Sending…",
  cancel: "Cancel",
  done: "Thanks. We received your request and will reply by email.",
  error: "We couldn't send your request. Please try again, or email privacy@pmrfp.com.",
  tooMany: "Too many requests from your connection. Please try again in a few minutes.",
  invalid: "Please check the form: a valid email and at least 10 characters of detail.",
};

const fr: typeof en = {
  link: "Signaler une erreur ou demander un retrait",
  title: "Signaler une erreur ou demander un retrait",
  description:
    "Dites-nous ce qui est inexact sur cette page, ou quels renseignements personnels vous voulez faire retirer. Nous vérifions chaque demande auprès de la source officielle et vous répondons par courriel.",
  reason: "Quel est le problème?",
  reasons: {
    wrong_info: "L'information est inexacte",
    outdated: "L'information n'est plus à jour",
    personal_info: "La page montre mes renseignements personnels",
    removal: "Je veux que ce contenu soit retiré",
    defamation: "Le contenu est injuste ou nuit à moi ou à mon entreprise",
    other: "Autre chose",
  },
  details: "Détails",
  detailsPlaceholder: "Qu'est-ce qui est inexact, et quelle est la bonne information? Un lien vers le document officiel est utile.",
  email: "Votre courriel (nous vous répondons à cette adresse)",
  name: "Votre nom (facultatif)",
  policy: "Comment nous traitons les demandes",
  privacy: "Nous utilisons votre courriel uniquement pour traiter cette demande.",
  submit: "Envoyer la demande",
  sending: "Envoi…",
  cancel: "Annuler",
  done: "Merci. Nous avons reçu votre demande et vous répondrons par courriel.",
  error: "Nous n'avons pas pu envoyer votre demande. Veuillez réessayer ou écrire à privacy@pmrfp.com.",
  tooMany: "Trop de demandes à partir de votre connexion. Veuillez réessayer dans quelques minutes.",
  invalid: "Veuillez vérifier le formulaire : un courriel valide et au moins 10 caractères de détails.",
};

const es: typeof en = {
  link: "Reportar un error o pedir un retiro",
  title: "Reportar un error o pedir un retiro",
  description:
    "Díganos qué está mal en esta página o qué información personal desea que eliminemos. Verificamos cada solicitud con la fuente oficial y le respondemos por correo electrónico.",
  reason: "¿Cuál es el problema?",
  reasons: {
    wrong_info: "La información es incorrecta",
    outdated: "La información está desactualizada",
    personal_info: "Muestra mi información personal",
    removal: "Quiero que se elimine",
    defamation: "Es injusto o perjudica a mi persona o a mi empresa",
    other: "Otra cosa",
  },
  details: "Detalles",
  detailsPlaceholder: "¿Qué está mal y cuál es la información correcta? Un enlace al registro oficial ayuda.",
  email: "Su correo electrónico (le respondemos aquí)",
  name: "Su nombre (opcional)",
  policy: "Cómo tratamos las solicitudes",
  privacy: "Usamos su correo electrónico solo para tramitar esta solicitud.",
  submit: "Enviar solicitud",
  sending: "Enviando…",
  cancel: "Cancelar",
  done: "Gracias. Recibimos su solicitud y le responderemos por correo electrónico.",
  error: "No pudimos enviar su solicitud. Inténtelo de nuevo o escriba a privacy@pmrfp.com.",
  tooMany: "Demasiadas solicitudes desde su conexión. Inténtelo de nuevo en unos minutos.",
  invalid: "Revise el formulario: un correo electrónico válido y al menos 10 caracteres de detalle.",
};

export default { en, fr, es };

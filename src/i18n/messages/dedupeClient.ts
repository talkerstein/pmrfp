/**
 * Duplicate sign-ups and duplicate company listings (lib/dedupe): the
 * sign-in notice, the onboarding "may already be on PMRFP" step, the
 * pending join request, and the owner's approval card.
 */
const en = {
  signIn: {
    existsHeading: "You already have an account",
    existsBody: "That email already has a PMRFP account, so we didn't create a second one. Sign in below, or",
    existsReset: "reset your password",
  },
  match: {
    heading: "This company may already be on PMRFP",
    intro: "We found a listing that looks like yours. If it's your company, ask to join it instead of creating a second listing.",
    oneOf: "Matches:",
    reasons: {
      name: "Same name",
      website: "Same website",
      phone: "Same phone number",
      email_domain: "Same email domain",
      similar_name: "Similar name",
    },
    viewListing: "View listing",
    requestJoin: "Request to join this company",
    different: "It's a different company",
    differentHint: "We'll create your listing now. Our team double-checks listings that look alike.",
    edit: "Edit my details",
    sending: "Sending…",
  },
  pending: {
    heading: "Request sent",
    body: "We asked {company} to add you. You'll get access as soon as the company (or the PMRFP team) approves it.",
    cancel: "Cancel the request and create my own listing",
  },
  joinErrors: {
    missing_table: "Joining an existing company isn't available yet. Choose “It's a different company” for now, or contact us.",
    already_member: "You're already a member of this company.",
    already_pending: "You've already asked to join this company.",
    no_company: "That company isn't on PMRFP anymore.",
    failed: "Something went wrong. Please try again.",
  },
  card: {
    title: "Requests to join your company",
    intro: "These people asked to be added to {company}. Only approve people you know work there.",
    requested: "Asked {date}",
    approve: "Approve",
    decline: "Decline",
    approved: "Added to your company.",
    declined: "Request declined.",
    error: "That request couldn't be updated. It may already have been answered.",
  },
};

const fr: typeof en = {
  signIn: {
    existsHeading: "Vous avez déjà un compte",
    existsBody: "Cette adresse courriel a déjà un compte PMRFP, nous n'en avons donc pas créé un deuxième. Connectez-vous ci-dessous ou",
    existsReset: "réinitialisez votre mot de passe",
  },
  match: {
    heading: "Cette entreprise est peut-être déjà sur PMRFP",
    intro: "Nous avons trouvé une fiche qui ressemble à la vôtre. Si c'est votre entreprise, demandez à la rejoindre plutôt que de créer une deuxième fiche.",
    oneOf: "Correspondances :",
    reasons: {
      name: "Même nom",
      website: "Même site Web",
      phone: "Même numéro de téléphone",
      email_domain: "Même domaine de courriel",
      similar_name: "Nom semblable",
    },
    viewListing: "Voir la fiche",
    requestJoin: "Demander à rejoindre cette entreprise",
    different: "C'est une autre entreprise",
    differentHint: "Nous créons votre fiche maintenant. Notre équipe vérifie les fiches qui se ressemblent.",
    edit: "Modifier mes renseignements",
    sending: "Envoi…",
  },
  pending: {
    heading: "Demande envoyée",
    body: "Nous avons demandé à {company} de vous ajouter. Vous aurez accès dès que l'entreprise (ou l'équipe PMRFP) l'approuvera.",
    cancel: "Annuler la demande et créer ma propre fiche",
  },
  joinErrors: {
    missing_table: "Rejoindre une entreprise existante n'est pas encore offert. Choisissez « C'est une autre entreprise » pour l'instant, ou écrivez-nous.",
    already_member: "Vous êtes déjà membre de cette entreprise.",
    already_pending: "Vous avez déjà demandé à rejoindre cette entreprise.",
    no_company: "Cette entreprise n'est plus sur PMRFP.",
    failed: "Une erreur s'est produite. Veuillez réessayer.",
  },
  card: {
    title: "Demandes pour rejoindre votre entreprise",
    intro: "Ces personnes ont demandé à être ajoutées à {company}. N'approuvez que des personnes qui y travaillent, à votre connaissance.",
    requested: "Demandé le {date}",
    approve: "Approuver",
    decline: "Refuser",
    approved: "Ajouté à votre entreprise.",
    declined: "Demande refusée.",
    error: "Impossible de mettre à jour cette demande. Elle a peut-être déjà reçu une réponse.",
  },
};

const es: typeof en = {
  signIn: {
    existsHeading: "Ya tiene una cuenta",
    existsBody: "Ese correo electrónico ya tiene una cuenta de PMRFP, así que no creamos una segunda. Inicie sesión abajo o",
    existsReset: "restablezca su contraseña",
  },
  match: {
    heading: "Es posible que esta empresa ya esté en PMRFP",
    intro: "Encontramos un perfil que se parece al suyo. Si es su empresa, pida unirse en lugar de crear un segundo perfil.",
    oneOf: "Coincidencias:",
    reasons: {
      name: "Mismo nombre",
      website: "Mismo sitio web",
      phone: "Mismo número de teléfono",
      email_domain: "Mismo dominio de correo",
      similar_name: "Nombre parecido",
    },
    viewListing: "Ver perfil",
    requestJoin: "Pedir unirme a esta empresa",
    different: "Es otra empresa",
    differentHint: "Crearemos su perfil ahora. Nuestro equipo revisa los perfiles que se parecen.",
    edit: "Editar mis datos",
    sending: "Enviando…",
  },
  pending: {
    heading: "Solicitud enviada",
    body: "Le pedimos a {company} que lo agregue. Tendrá acceso en cuanto la empresa (o el equipo de PMRFP) lo apruebe.",
    cancel: "Cancelar la solicitud y crear mi propio perfil",
  },
  joinErrors: {
    missing_table: "Todavía no es posible unirse a una empresa existente. Por ahora elija “Es otra empresa”, o escríbanos.",
    already_member: "Ya es miembro de esta empresa.",
    already_pending: "Ya pidió unirse a esta empresa.",
    no_company: "Esa empresa ya no está en PMRFP.",
    failed: "Algo salió mal. Inténtelo de nuevo.",
  },
  card: {
    title: "Solicitudes para unirse a su empresa",
    intro: "Estas personas pidieron que las agreguen a {company}. Apruebe solo a quienes sepa que trabajan allí.",
    requested: "Solicitado el {date}",
    approve: "Aprobar",
    decline: "Rechazar",
    approved: "Agregado a su empresa.",
    declined: "Solicitud rechazada.",
    error: "No se pudo actualizar la solicitud. Es posible que ya tenga respuesta.",
  },
};

export default { en, fr, es };

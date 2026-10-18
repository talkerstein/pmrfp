/** Client-side sales strings: the Trade Pro plan card (and the Founding 500 feature list). */
const en = {
  interval: {
    label: "Billing interval",
    annual: "Annual · save ${n}",
    monthly: "Monthly",
  },
  price: "${n}",
  perYear: "{currency}/year",
  perMonth: "{currency}/month",
  billedAnnually: "~${n}/mo billed annually",
  monthlyNote: "${total}/yr if held all year — switch to annual any time to save ${savings}",
  tradePro: {
    badge: "Recommended",
    blurb: "Full RFP access and everything you need to win commercial work.",
    features: [
      "Full company profile",
      "Directory listing",
      "Full RFP access",
      "Save opportunities",
      "Express interest",
      "Matching alerts",
      "PMRFP badge for your website",
    ],
    cta: "Join {site}",
  },
};

const fr: typeof en = {
  interval: {
    label: "Période de facturation",
    annual: "Annuel · économisez {n} $",
    monthly: "Mensuel",
  },
  price: "{n} $",
  perYear: "{currency}/an",
  perMonth: "{currency}/mois",
  billedAnnually: "~{n} $/mois facturé annuellement",
  monthlyNote: "{total} $/an sur une année complète — passez à l'annuel en tout temps pour économiser {savings} $",
  tradePro: {
    badge: "Recommandé",
    blurb: "L'accès complet aux appels d'offres et tout ce qu'il faut pour décrocher des contrats commerciaux.",
    features: [
      "Profil d'entreprise complet",
      "Fiche au répertoire",
      "Accès complet aux appels d'offres",
      "Sauvegarde des occasions",
      "Manifestation d'intérêt",
      "Alertes sur mesure",
      "Badge PMRFP pour votre site Web",
    ],
    cta: "S'inscrire à {site}",
  },
};

const es: typeof en = {
  interval: {
    label: "Periodo de facturación",
    annual: "Anual · ahorre ${n}",
    monthly: "Mensual",
  },
  price: "${n}",
  perYear: "{currency} al año",
  perMonth: "{currency} al mes",
  billedAnnually: "~${n} al mes, facturado anualmente",
  monthlyNote: "${total} al año si lo mantiene todo el año — cambie al plan anual cuando quiera para ahorrar ${savings}",
  tradePro: {
    badge: "Recomendado",
    blurb: "Acceso completo a las RFP y todo lo que necesita para ganar trabajos comerciales.",
    features: [
      "Perfil completo de la empresa",
      "Ficha en el directorio",
      "Acceso completo a las RFP",
      "Guardar oportunidades",
      "Expresar interés",
      "Alertas de oportunidades",
      "Insignia de PMRFP para su sitio web",
    ],
    cta: "Únase a {site}",
  },
};

export default { en, fr, es };

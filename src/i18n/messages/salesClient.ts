/** Client-side sales strings: the Trade Pro and SEO Listing plan cards on /pricing. */
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
      "Priority placement",
      "PMRFP badge for your website",
    ],
    cta: "Join {site}",
  },
  seo: {
    name: "SEO Listing",
    blurb: "Get found where property managers actually search — no RFP access.",
    features: [
      "Listed on your trade + city pages",
      "Unlimited project photo gallery",
      "Case studies featured on your profile",
      "Google rating displayed on your profile",
      "Priority over free listings",
    ],
    cta: "Get an SEO Listing",
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
      "Placement prioritaire",
      "Badge PMRFP pour votre site Web",
    ],
    cta: "S'inscrire à {site}",
  },
  seo: {
    name: "Fiche SEO",
    blurb: "Soyez trouvé là où les gestionnaires immobiliers cherchent vraiment — sans accès aux appels d'offres.",
    features: [
      "Présence sur les pages de votre corps de métier et de votre ville",
      "Galerie de photos de projets illimitée",
      "Études de cas mises en valeur sur votre profil",
      "Note Google affichée sur votre profil",
      "Priorité sur les fiches gratuites",
    ],
    cta: "Obtenir une fiche SEO",
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
      "Ubicación prioritaria",
      "Insignia de PMRFP para su sitio web",
    ],
    cta: "Únase a {site}",
  },
  seo: {
    name: "Ficha SEO",
    blurb: "Aparezca donde los administradores de propiedades realmente buscan — sin acceso a las RFP.",
    features: [
      "Presencia en las páginas de su oficio y su ciudad",
      "Galería ilimitada de fotos de proyectos",
      "Casos de éxito destacados en su perfil",
      "Calificación de Google visible en su perfil",
      "Prioridad sobre las fichas gratuitas",
    ],
    cta: "Obtener una Ficha SEO",
  },
};

export default { en, fr, es };

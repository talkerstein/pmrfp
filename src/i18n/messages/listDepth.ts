/**
 * The /rfps list filters added in the depth study, Step 1 (2026-10-22): closing
 * windows, contract value, buyer type and the "Posted" date on each row.
 * "$" in a value band is the listing's own currency: Canada and the U.S. are
 * never mixed on one list.
 */
const en = {
  windows: {
    all: "Any date",
    today: "Today",
    tomorrow: "Tomorrow",
    week: "Next 7 days",
    "two-weeks": "Next 14 days",
    month: "Next 30 days",
    later: "Beyond 30 days",
  },
  value: {
    title: "Contract value",
    note: "From the value stated on award notices.",
    bands: {
      "under-100k": "Under $100K",
      "100k-500k": "$100K to $500K",
      "500k-1m": "$500K to $1M",
      "1m-5m": "$1M to $5M",
      "5m-10m": "$5M to $10M",
      "over-10m": "Over $10M",
      "not-stated": "Not stated",
    },
    any: "Any value",
  },
  buyer: {
    title: "Buyer type",
    any: "Any buyer",
    types: {
      municipal: "City or town",
      regional: "County or region",
      school: "School board",
      health: "Hospital or health",
      housing: "Housing",
      provincial: "Provincial or state",
      federal: "Federal",
      college: "College or university",
      private: "Private (property manager)",
    },
    note: "Read from the buyer's name. Listings that don't say aren't counted.",
  },
  chips: { value: "Value", buyer: "Buyer type" },
  office: {
    title: "Buyer office details",
    free: "Public information, free for everyone.",
    website: "Website",
    bids: "Bids page",
    email: "Procurement inbox",
    phone: "Phone",
    source: "From the buyer's own public pages.",
    proNote: "The contact named on this notice and the bid checklist are in Trade Pro.",
  },
  where: {
    official: "{name} lists its bids on its official page, linked below. We have not confirmed which bid platform it uses.",
    postedOn: "The bids we hold for {name} were posted on {portal}.",
  },
  browse: { title: "Browse more", trades: "All trades", regions: "All regions", buyers: "Where public buyers post bids", directory: "Company directory", awards: "Contract winners" },
  posted: "Posted {date}",
  empty: {
    value: "No listing in this view states a contract value yet.",
  },
};

const fr: typeof en = {
  windows: {
    all: "Toutes les dates",
    today: "Aujourd'hui",
    tomorrow: "Demain",
    week: "7 prochains jours",
    "two-weeks": "14 prochains jours",
    month: "30 prochains jours",
    later: "Au-delà de 30 jours",
  },
  value: {
    title: "Valeur du contrat",
    note: "D'après la valeur indiquée dans les avis d'octroi.",
    bands: {
      "under-100k": "Moins de 100 k$",
      "100k-500k": "100 k$ à 500 k$",
      "500k-1m": "500 k$ à 1 M$",
      "1m-5m": "1 M$ à 5 M$",
      "5m-10m": "5 M$ à 10 M$",
      "over-10m": "Plus de 10 M$",
      "not-stated": "Non indiquée",
    },
    any: "Toute valeur",
  },
  buyer: {
    title: "Type d'acheteur",
    any: "Tous les acheteurs",
    types: {
      municipal: "Ville ou municipalité",
      regional: "MRC ou région",
      school: "Commission ou centre de services scolaire",
      health: "Hôpital ou santé",
      housing: "Habitation",
      provincial: "Provincial ou État",
      federal: "Fédéral",
      college: "Collège ou université",
      private: "Privé (gestionnaire immobilier)",
    },
    note: "Déterminé d'après le nom de l'acheteur. Les appels d'offres sans indice ne sont pas comptés.",
  },
  chips: { value: "Valeur", buyer: "Type d'acheteur" },
  office: {
    title: "Coordonnées du bureau de l'acheteur",
    free: "Information publique, gratuite pour tous.",
    website: "Site Web",
    bids: "Page des appels d'offres",
    email: "Courriel des approvisionnements",
    phone: "Téléphone",
    source: "Tiré des pages publiques de l'acheteur.",
    proNote: "La personne-ressource nommée dans cet avis et la liste de vérification de la soumission sont dans Trade Pro.",
  },
  where: {
    official: "{name} publie ses appels d'offres sur sa page officielle, ci-dessous. Nous n'avons pas confirmé quelle plateforme de soumission elle utilise.",
    postedOn: "Les appels d'offres que nous avons pour {name} ont été publiés sur {portal}.",
  },
  browse: { title: "Explorer davantage", trades: "Tous les corps de métier", regions: "Toutes les régions", buyers: "Où les acheteurs publics publient leurs appels d'offres", directory: "Répertoire d'entreprises", awards: "Adjudicataires" },
  posted: "Publié le {date}",
  empty: {
    value: "Aucune annonce de cette vue n'indique encore de valeur de contrat.",
  },
};

const es: typeof en = {
  windows: {
    all: "Cualquier fecha",
    today: "Hoy",
    tomorrow: "Mañana",
    week: "Próximos 7 días",
    "two-weeks": "Próximos 14 días",
    month: "Próximos 30 días",
    later: "Después de 30 días",
  },
  value: {
    title: "Valor del contrato",
    note: "Según el valor indicado en los avisos de adjudicación.",
    bands: {
      "under-100k": "Menos de $100 mil",
      "100k-500k": "$100 mil a $500 mil",
      "500k-1m": "$500 mil a $1 M",
      "1m-5m": "$1 M a $5 M",
      "5m-10m": "$5 M a $10 M",
      "over-10m": "Más de $10 M",
      "not-stated": "No indicado",
    },
    any: "Cualquier valor",
  },
  buyer: {
    title: "Tipo de comprador",
    any: "Cualquier comprador",
    types: {
      municipal: "Ciudad o pueblo",
      regional: "Condado o región",
      school: "Distrito escolar",
      health: "Hospital o salud",
      housing: "Vivienda",
      provincial: "Provincial o estatal",
      federal: "Federal",
      college: "Colegio universitario o universidad",
      private: "Privado (administrador de propiedades)",
    },
    note: "Se deduce del nombre del comprador. Los avisos que no lo dicen no se cuentan.",
  },
  chips: { value: "Valor", buyer: "Tipo de comprador" },
  office: {
    title: "Datos de la oficina del comprador",
    free: "Información pública, gratis para todos.",
    website: "Sitio web",
    bids: "Página de licitaciones",
    email: "Correo de compras",
    phone: "Teléfono",
    source: "Tomado de las páginas públicas del comprador.",
    proNote: "El contacto nombrado en este aviso y la lista de verificación de la oferta están en Trade Pro.",
  },
  where: {
    official: "{name} publica sus licitaciones en su página oficial, abajo. No hemos confirmado qué plataforma de licitaciones usa.",
    postedOn: "Las licitaciones que tenemos de {name} se publicaron en {portal}.",
  },
  browse: { title: "Explorar más", trades: "Todos los oficios", regions: "Todas las regiones", buyers: "Dónde publican licitaciones los compradores públicos", directory: "Directorio de empresas", awards: "Ganadores de contratos" },
  posted: "Publicado el {date}",
  empty: {
    value: "Ningún aviso de esta vista indica todavía un valor de contrato.",
  },
};

export default { en, fr, es };

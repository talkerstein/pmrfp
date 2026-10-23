/**
 * Open-data blocks (batch 1): recent permits on a trade x city page, the
 * most active Calgary contractors, Toronto's planned procurements, and the
 * "Data sources" credit. Placeholders: {city} {trade} {n} {from} {to}.
 */
const en = {
  permits: {
    title: "Recent building permits in {city}",
    lead: "Permits worth $100,000 or more issued in {city} in the last 24 months, with the contractor named on the permit. A sign of who is building and who is busy.",
    issued: "Issued",
    contractor: "Contractor",
    value: "Declared value",
    work: "Work",
    note: "Only contractors that are businesses are shown. Permit values are what the applicant declared to the city.",
  },
  active: {
    title: "Most active {trade} contractors in {city}",
    lead: "The contractors with the most {trade} permits issued in {city} between {from} and {to}.",
    summaryTitle: "Most active trade contractors in {city}",
    summaryLead: "The five contractors with the most HVAC, electrical and plumbing permits issued in {city} over the last 12 months.",
    contractor: "Contractor",
    permits: "Permits",
    note: "Counted from the City's permit and inspection data; the City publishes no project value for these permits. Only businesses are listed.",
  },
  coming: {
    title: "Coming up: planned City of Toronto procurements",
    lead: "Work the City plans to put out to bid, from its capital project pipeline. The sourcing year is when the City expects to issue the bid; the range is its own estimate.",
    sourcing: "Sourcing {year}",
    estimate: "Estimate {range}",
    note: "A plan, not a notice: dates and amounts can change. Bids are posted on the City's own bid portal.",
  },
  credits: {
    title: "Data sources",
  },
};

const fr: typeof en = {
  permits: {
    title: "Permis de construction récents à {city}",
    lead: "Permis de 100 000 $ ou plus délivrés à {city} au cours des 24 derniers mois, avec l'entrepreneur nommé sur le permis. Un indice de qui construit et de qui est occupé.",
    issued: "Délivré",
    contractor: "Entrepreneur",
    value: "Valeur déclarée",
    work: "Travaux",
    note: "Seuls les entrepreneurs qui sont des entreprises sont affichés. La valeur est celle déclarée par le demandeur à la ville.",
  },
  active: {
    title: "Entrepreneurs les plus actifs en {trade} à {city}",
    lead: "Les entrepreneurs ayant le plus de permis de {trade} délivrés à {city} entre le {from} et le {to}.",
    summaryTitle: "Entrepreneurs de métier les plus actifs à {city}",
    summaryLead: "Les cinq entrepreneurs ayant le plus de permis de CVC, d'électricité et de plomberie délivrés à {city} au cours des 12 derniers mois.",
    contractor: "Entrepreneur",
    permits: "Permis",
    note: "Compté à partir des données de permis et d'inspection de la Ville; la Ville ne publie pas la valeur des projets pour ces permis. Seules les entreprises sont listées.",
  },
  coming: {
    title: "À venir : achats prévus de la Ville de Toronto",
    lead: "Travaux que la Ville prévoit mettre en appel d'offres, tirés de son plan de projets d'immobilisations. L'année d'approvisionnement est celle où la Ville prévoit lancer l'appel; la fourchette est sa propre estimation.",
    sourcing: "Approvisionnement {year}",
    estimate: "Estimation {range}",
    note: "Un plan, pas un avis : les dates et les montants peuvent changer. Les appels d'offres sont publiés sur le portail de la Ville.",
  },
  credits: {
    title: "Sources des données",
  },
};

export default { en, fr };

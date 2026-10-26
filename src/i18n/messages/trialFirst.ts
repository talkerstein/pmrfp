/**
 * Trial-first conversion: the one-click trial button on every Pro gate, the
 * trial banner, "Bids you missed", the Pro value ledger and the annual
 * saving line. Every number in these strings is filled from real data;
 * nothing here is a countdown to a made-up date or a made-up count.
 * Placeholders: {n} {m} {day} {total} {date} {alerts} {saved} {responses}
 * {annual} {yearly} {monthly} {save} {currency}.
 */
const en = {
  cta: {
    start: "Start 14-day free trial (no card)",
    seePlans: "See plans",
    note: "No card. Full Trade Pro for 14 days, then back to free unless you subscribe. One trial per company.",
  },
  confirm: {
    title: "Ready to start your free trial?",
    body: "14 days of Trade Pro, no card. You will land back where you were, with everything unlocked.",
    back: "Not now",
    already: "Your company already has Trade Pro or has used its trial.",
  },
  banner: {
    day: "Trial day {day} of {total}",
    left: { one: "Trial: {n} day left", other: "Trial: {n} days left" },
    usedLead: "so far",
    alerts: { one: "{n} alert received", other: "{n} alerts received" },
    saved: { one: "{n} bid saved", other: "{n} bids saved" },
    responses: { one: "{n} response sent", other: "{n} responses sent" },
    usedNone: "Open your matches and turn on alerts to put the trial to work.",
    three: "3 days left. Pro access ends on {date}, then you are back on the free plan unless you upgrade.",
    one: "Last day. Pro access ends on {date}. Upgrade to keep your alerts and the full detail on every bid.",
    upgrade: "Upgrade",
    ended: "Your trial ended on {date}.",
    endedFree: "You are on the free plan again.",
    lostHead: "Here is what you have lost access to:",
    lostAlerts: { one: "The daily bid alert emails ({n} reached you during the trial)", other: "The daily bid alert emails ({n} reached you during the trial)" },
    seePlans: "See plans",
  },
  missed: {
    title: "Bids you may have missed",
    body: {
      one: "This week {n} open bid matched your trade and region{closed}. Pro members were emailed it the morning it was posted.",
      other: "This week {n} open bids matched your trade and region{closed}. Pro members were emailed these the morning they were posted.",
    },
    closed: "; {m} closed",
    closes: "Closes {date}",
    noDeadline: "No fixed closing date",
    locked: "Buyer details, price band and previous winner: free for 14 days with the trial.",
    all: "See all matching bids",
  },
  ledger: {
    title: "Pro this month",
    alerts: "Alerts received",
    saved: "Bids saved",
    responses: "Responses sent",
    note: "Counted from your own alert emails, saved bids and responses.",
  },
  compare: "${annual} a year vs ${yearly} at ${monthly} a month: save ${save}",
};

const fr: typeof en = {
  cta: {
    start: "Commencer l'essai gratuit de 14 jours (sans carte)",
    seePlans: "Voir les forfaits",
    note: "Aucune carte. Trade Pro complet pendant 14 jours, puis retour au gratuit sauf si vous vous abonnez. Un essai par entreprise.",
  },
  confirm: {
    title: "Prêt à commencer votre essai gratuit?",
    body: "14 jours de Trade Pro, sans carte. Vous reviendrez là où vous étiez, avec tout de débloqué.",
    back: "Pas maintenant",
    already: "Votre entreprise a déjà Trade Pro ou a déjà utilisé son essai.",
  },
  banner: {
    day: "Essai : jour {day} sur {total}",
    left: { one: "Essai : {n} jour restant", other: "Essai : {n} jours restants" },
    usedLead: "jusqu'ici",
    alerts: { one: "{n} alerte reçue", other: "{n} alertes reçues" },
    saved: { one: "{n} appel d'offres sauvegardé", other: "{n} appels d'offres sauvegardés" },
    responses: { one: "{n} réponse envoyée", other: "{n} réponses envoyées" },
    usedNone: "Ouvrez vos correspondances et activez les alertes pour mettre l'essai à profit.",
    three: "Il reste 3 jours. L'accès Pro prend fin le {date}, puis vous revenez au forfait gratuit sauf si vous passez au payant.",
    one: "Dernier jour. L'accès Pro prend fin le {date}. Passez au payant pour garder vos alertes et le détail complet de chaque appel d'offres.",
    upgrade: "Passer au payant",
    ended: "Votre essai s'est terminé le {date}.",
    endedFree: "Vous êtes de retour au forfait gratuit.",
    lostHead: "Voici ce à quoi vous n'avez plus accès :",
    lostAlerts: { one: "Les alertes quotidiennes par courriel ({n} reçue pendant l'essai)", other: "Les alertes quotidiennes par courriel ({n} reçues pendant l'essai)" },
    seePlans: "Voir les forfaits",
  },
  missed: {
    title: "Appels d'offres que vous avez peut-être manqués",
    body: {
      one: "Cette semaine, {n} appel d'offres ouvert correspondait à votre métier et à votre région{closed}. Les membres Pro l'ont reçu par courriel le matin de sa publication.",
      other: "Cette semaine, {n} appels d'offres ouverts correspondaient à votre métier et à votre région{closed}. Les membres Pro les ont reçus par courriel le matin de leur publication.",
    },
    closed: " ; {m} fermés",
    closes: "Se termine le {date}",
    noDeadline: "Sans date limite fixe",
    locked: "Coordonnées de l'acheteur, fourchette de prix et gagnant précédent : gratuits pendant 14 jours avec l'essai.",
    all: "Voir tous les appels d'offres correspondants",
  },
  ledger: {
    title: "Pro ce mois-ci",
    alerts: "Alertes reçues",
    saved: "Appels d'offres sauvegardés",
    responses: "Réponses envoyées",
    note: "Compté à partir de vos propres alertes par courriel, appels d'offres sauvegardés et réponses.",
  },
  compare: "{annual} $ par an contre {yearly} $ à {monthly} $ par mois : économisez {save} $",
};

const es: typeof en = {
  cta: {
    start: "Empezar la prueba gratis de 14 días (sin tarjeta)",
    seePlans: "Ver planes",
    note: "Sin tarjeta. Trade Pro completo por 14 días, luego vuelve al plan gratis salvo que se suscriba. Una prueba por empresa.",
  },
  confirm: {
    title: "¿Listo para empezar su prueba gratis?",
    body: "14 días de Trade Pro, sin tarjeta. Volverá a donde estaba, con todo desbloqueado.",
    back: "Ahora no",
    already: "Su empresa ya tiene Trade Pro o ya usó su prueba.",
  },
  banner: {
    day: "Prueba: día {day} de {total}",
    left: { one: "Prueba: queda {n} día", other: "Prueba: quedan {n} días" },
    usedLead: "hasta ahora",
    alerts: { one: "{n} alerta recibida", other: "{n} alertas recibidas" },
    saved: { one: "{n} licitación guardada", other: "{n} licitaciones guardadas" },
    responses: { one: "{n} respuesta enviada", other: "{n} respuestas enviadas" },
    usedNone: "Abra sus coincidencias y active las alertas para aprovechar la prueba.",
    three: "Quedan 3 días. El acceso Pro termina el {date}; después vuelve al plan gratis salvo que mejore su plan.",
    one: "Último día. El acceso Pro termina el {date}. Mejore su plan para conservar sus alertas y el detalle completo de cada licitación.",
    upgrade: "Mejorar plan",
    ended: "Su prueba terminó el {date}.",
    endedFree: "Está de nuevo en el plan gratis.",
    lostHead: "Esto es a lo que ya no tiene acceso:",
    lostAlerts: { one: "Las alertas diarias por correo ({n} le llegó durante la prueba)", other: "Las alertas diarias por correo ({n} le llegaron durante la prueba)" },
    seePlans: "Ver planes",
  },
  missed: {
    title: "Licitaciones que quizá se perdió",
    body: {
      one: "Esta semana {n} licitación abierta coincidió con su oficio y su región{closed}. Los miembros Pro la recibieron por correo la mañana en que se publicó.",
      other: "Esta semana {n} licitaciones abiertas coincidieron con su oficio y su región{closed}. Los miembros Pro las recibieron por correo la mañana en que se publicaron.",
    },
    closed: "; {m} cerradas",
    closes: "Cierra el {date}",
    noDeadline: "Sin fecha de cierre fija",
    locked: "Datos del comprador, rango de precios y ganador anterior: gratis por 14 días con la prueba.",
    all: "Ver todas las licitaciones que coinciden",
  },
  ledger: {
    title: "Pro este mes",
    alerts: "Alertas recibidas",
    saved: "Licitaciones guardadas",
    responses: "Respuestas enviadas",
    note: "Contado a partir de sus propias alertas por correo, licitaciones guardadas y respuestas.",
  },
  compare: "{annual} $ al año frente a {yearly} $ a {monthly} $ al mes: ahorre {save} $",
};

export default { en, fr, es };

/** Founding 500 buy button and billing badge (client components). Placeholders: {price}. */
const en = {
  buy: "Become a Founding member · {price}",
  busy: "Opening checkout…",
  failed: "Couldn't start checkout. Please try again.",
  signUp: "Create a free trade account to continue",
  priceUs: "${n} USD",
  oneTime: "{price} one time",
  regularCa: "${n} CAD/year, every year",
  regularUs: "Instead of paying every year",
  priceCa: "${n} CAD",
};

const fr: typeof en = {
  buy: "Devenir membre fondateur · {price}",
  busy: "Ouverture du paiement…",
  failed: "Impossible d'ouvrir le paiement. Veuillez réessayer.",
  signUp: "Créez un compte de métier gratuit pour continuer",
  priceUs: "{n} $ USD",
  oneTime: "{price}, paiement unique",
  regularCa: "{n} $ CAD/an, chaque année",
  regularUs: "Au lieu de payer chaque année",
  priceCa: "{n} $ CAD",
};

const es: typeof en = {
  buy: "Hazte miembro fundador · {price}",
  busy: "Abriendo el pago…",
  failed: "No se pudo iniciar el pago. Inténtalo de nuevo.",
  signUp: "Crea una cuenta gratuita de oficio para continuar",
  priceUs: "${n} USD",
  oneTime: "{price} pago único",
  regularCa: "${n} CAD/año, cada año",
  regularUs: "En lugar de pagar cada año",
  priceCa: "${n} CAD",
};

export default { en, fr, es };

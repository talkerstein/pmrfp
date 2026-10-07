/** Founding 500 buy button and billing badge (client components). Placeholders: {price}. */
const en = {
  buy: "Become a Founding member · {price}",
  busy: "Opening checkout…",
  failed: "Couldn't start checkout. Please try again.",
  signUp: "Create a free trade account to continue",
  priceUs: "US${n}",
  priceCa: "C${n}",
};

const fr: typeof en = {
  buy: "Devenir membre fondateur · {price}",
  busy: "Ouverture du paiement…",
  failed: "Impossible d'ouvrir le paiement. Veuillez réessayer.",
  signUp: "Créez un compte de métier gratuit pour continuer",
  priceUs: "{n} $ US",
  priceCa: "{n} $ CA",
};

const es: typeof en = {
  buy: "Hazte miembro fundador · {price}",
  busy: "Abriendo el pago…",
  failed: "No se pudo iniciar el pago. Inténtalo de nuevo.",
  signUp: "Crea una cuenta gratuita de oficio para continuar",
  priceUs: "US${n}",
  priceCa: "C${n}",
};

export default { en, fr, es };

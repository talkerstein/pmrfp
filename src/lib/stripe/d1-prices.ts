export interface D1BillingPrices {
  STRIPE_PRICE_TRADE_PRO_MONTHLY?: string;
  STRIPE_PRICE_TRADE_PRO_ANNUAL?: string;
  STRIPE_PRICE_FEATURED_ANNUAL?: string;
  STRIPE_PRICE_REALTOR_ANNUAL?: string;
  STRIPE_PRICE_SEO_MONTHLY?: string;
  STRIPE_PRICE_SEO_ANNUAL?: string;
}

export function d1LegacySeoPrice(priceId: string, prices: D1BillingPrices) {
  return Boolean(priceId && (priceId === prices.STRIPE_PRICE_SEO_MONTHLY || priceId === prices.STRIPE_PRICE_SEO_ANNUAL));
}

export function d1SubscriptionPlan(priceId: string, prices: D1BillingPrices) {
  if (priceId === prices.STRIPE_PRICE_TRADE_PRO_MONTHLY) return { tier: "pro", amount: "29" };
  if (priceId === prices.STRIPE_PRICE_TRADE_PRO_ANNUAL) return { tier: "pro", amount: "249" };
  if (priceId === prices.STRIPE_PRICE_FEATURED_ANNUAL) return { tier: "featured", amount: "599" };
  if (priceId === prices.STRIPE_PRICE_REALTOR_ANNUAL) return { tier: "realtor", amount: "249" };
}

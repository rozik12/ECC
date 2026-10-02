export const currencies = ["USD", "EUR", "USDT", "RUB", "UZS"] as const;
export type Currency = (typeof currencies)[number];

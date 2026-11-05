import type { Plan } from "@/lib/plans";

/**
 * Место для платёжного провайдера (Stripe, Click, Payme и т. д.). Оплата пока НЕ подключена:
 * PRO выдаётся владельцем вручную на странице /admin. Когда выберем провайдера, реализуем этот интерфейс,
 * а вебхук провайдера будет менять строку в таблице subscriptions (plan, status, expires_at).
 */
export interface BillingProvider {
  name: string;
  /** Ссылка на оплату тарифа для пользователя */
  createCheckoutUrl(userId: string, plan: Exclude<Plan, "free">): Promise<string>;
}

export function getBillingProvider(): BillingProvider | null {
  return null;
}

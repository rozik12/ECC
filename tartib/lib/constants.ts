export const currencies = ["USD", "EUR", "USDT", "RUB", "UZS"] as const;
export type Currency = (typeof currencies)[number];

/** Вопросы чек-листа по умолчанию; тексты в словаре: checklist.defaults.<key> */
export const DEFAULT_CHECKLIST_KEYS = ["plan", "stop", "risk", "calm", "revenge"] as const;

/** Логин Telegram-бота (без @). */
export const TELEGRAM_BOT_USERNAME = "tartibuk_bot";

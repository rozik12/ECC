// Реферальные ссылки: проверка кода, ссылка для приглашения, адреса «поделиться». Чистые функции без обращений к браузеру и базе.
export const REF_COOKIE = "tartib_ref";
export const REF_MAX_AGE = 30 * 24 * 3600;

/** Код приглашения: 6–12 латинских букв и цифр. Всё остальное отбрасываем. */
export function parseRefCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  return /^[A-Z0-9]{6,12}$/.test(v) ? v : null;
}

export const refLink = (origin: string, code: string) => `${origin.replace(/\/$/, "")}/r/${code}`;

/** Адрес «поделиться в Telegram» с готовым текстом. */
export const telegramShareUrl = (link: string, text: string) => `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
export const whatsappShareUrl = (link: string, text: string) => `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`;

/** Источник ссылки в канал: короткое слово из латинских букв, цифр и дефиса. */
export function parseSource(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9-]{1,32}$/i.test(value) ? value.toLowerCase() : "site";
}

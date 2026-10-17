// Словарь для браузера. Тексты этих разделов нужны только серверным страницам (они переводятся на сервере),
// поэтому в браузер их не отправляем: страницы становятся легче. Новые разделы по умолчанию отправляются.
// Проверяет tests/client-dictionary.test.ts: ни один клиентский файл не должен обращаться к исключённому разделу.
export const SERVER_ONLY_SECTIONS = [
  "achievements", "adv", "blog", "calendar", "dashboard", "derivatives", "footer", "hero", "landing", "legal", "mytools", "news",
  "pages", "pdt", "pm", "pricing", "ratios", "reminder", "risk", "seo", "streak", "tradertypes", "usstats", "week",
] as const;

export function clientDictionary<T extends Record<string, unknown>>(dict: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dict)) if (!(SERVER_ONLY_SECTIONS as readonly string[]).includes(k)) out[k] = v;
  return out as T;
}

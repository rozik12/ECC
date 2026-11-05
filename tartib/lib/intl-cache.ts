// Кэш форматтеров Intl. Создание Intl.NumberFormat и Intl.DateTimeFormat стоит 50–100 мкс, а на страницах со сделками
// их вызывают сотни раз. На бесплатном тарифе Cloudflare на запрос даётся около 10 мс процессора, поэтому форматтеры
// создаём один раз на сочетание «язык + параметры» и дальше используем повторно. Без зависимостей: работает и в тестах.

const dateCache = new Map<string, Intl.DateTimeFormat>();
const numberCache = new Map<string, Intl.NumberFormat>();

export function dtf(locale: string | string[], options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${Array.isArray(locale) ? locale.join(",") : locale}|${options ? JSON.stringify(options) : ""}`;
  let f = dateCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options); // при неверном часовом поясе бросает ошибку и в кэш не попадает
    if (dateCache.size > 500) dateCache.clear();
    dateCache.set(key, f);
  }
  return f;
}

export function nfmt(locale: string | string[], options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${Array.isArray(locale) ? locale.join(",") : locale}|${options ? JSON.stringify(options) : ""}`;
  let f = numberCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, options);
    if (numberCache.size > 200) numberCache.clear();
    numberCache.set(key, f);
  }
  return f;
}

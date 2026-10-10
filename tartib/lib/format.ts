import type { Locale } from "@/lib/i18n/config";

const intlLocale: Record<Locale, string> = { ru: "ru-RU", uz: "uz-UZ", en: "en-US" };

/** Принимает «1 234,5» и «1234.5». Пустая или неверная строка → null. */
export function parseNumber(value: string): number | null {
  const cleaned = value.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Узбекский: у браузеров нет полных данных для uz-UZ и числа выглядят иначе, чем на сервере (из-за этого страница «моргает»).
 *  Поэтому форматируем по en-US и подставляем разделители сами: пробел между тысячами, запятая в дробной части. */
function uzNumber(value: number, options: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat("en-US", options).format(value).replace(/[,.]/g, (c) => (c === "," ? "\u00a0" : ","));
}

function decimal(value: number, locale: Locale, options: Intl.NumberFormatOptions): string {
  return locale === "uz" ? uzNumber(value, options) : new Intl.NumberFormat(intlLocale[locale], options).format(value);
}

export function formatNumber(value: number, locale: Locale, maxFractionDigits = 4): string {
  return decimal(value, locale, { maximumFractionDigits: maxFractionDigits });
}

/** Символы валют заданы здесь, а не берутся из Intl: у узбекского языка Node, браузер и сервер Cloudflare подписывают валюты по-разному,
 *  из-за чего страница не совпадала при загрузке (гидратация). Число форматирует Intl, символ и порядок задаём сами. */
const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", RUB: "₽", JPY: "¥", UZS: "soʻm", KZT: "₸", UAH: "₴", TRY: "₺", CNY: "¥" };

export function formatMoney(value: number, currency: string, locale: Locale, signed = false): string {
  const num = decimal(value, locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: signed ? "exceptZero" : "auto",
  });
  const symbol = CURRENCY_SYMBOL[currency.toUpperCase()] ?? currency;
  if (locale === "en") {
    const m = /^([+\-\u2212]?)(.*)$/.exec(num) as RegExpExecArray;
    const prefix = symbol.length === 1 ? symbol : `${symbol} `;
    return `${m[1]}${prefix}${m[2]}`;
  }
  return `${num}\u00a0${symbol}`;
}

const UZ_WEEKDAY_SHORT = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Juma", "Shan"];
const UZ_WEEKDAY_LONG = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const UZ_MONTH_LONG = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const UZ_MONTH_SHORT = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];

/** Форматтер дат с тем же интерфейсом, что у Intl.DateTimeFormat (метод format). Для узбекского собирает строку сам по тем же параметрам. */
export function dateFormat(locale: Locale, options: Intl.DateTimeFormatOptions): { format: (d: Date | number) => string } {
  if (locale !== "uz") return new Intl.DateTimeFormat(intlLocale[locale], options);
  return {
    format(input: Date | number) {
      const medium = options.dateStyle === "medium";
      const wantYear = !!options.year || medium;
      const wantMonth = !!options.month || medium;
      const wantDay = !!options.day || medium;
      const wantTime = !!options.hour || !!options.minute || !!options.timeStyle;
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", { timeZone: options.timeZone, year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
          .formatToParts(new Date(input)).map((p) => [p.type, p.value]),
      ) as Record<string, string>;
      const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
      const month = Number(parts.month) - 1;
      const pad = (n: string | number) => String(n).padStart(2, "0");
      const out: string[] = [];
      const weekday = options.weekday ? (options.weekday === "long" ? UZ_WEEKDAY_LONG : UZ_WEEKDAY_SHORT)[dow] : "";
      if (wantMonth && (options.month === "long" || options.month === "short")) {
        const name = (options.month === "long" ? UZ_MONTH_LONG : UZ_MONTH_SHORT)[month];
        const year = wantYear ? (options.year === "2-digit" ? pad(Number(parts.year) % 100) : parts.year) : "";
        out.push([weekday && `${weekday},`, wantDay ? `${options.day === "2-digit" ? pad(parts.day) : parts.day}` : "", name, year].filter(Boolean).join(" "));
      } else if (wantMonth || wantDay || wantYear) {
        const date = [wantDay && pad(parts.day), wantMonth && pad(month + 1), wantYear && (options.year === "2-digit" ? pad(Number(parts.year) % 100) : parts.year)].filter(Boolean).join(".");
        out.push([weekday && `${weekday},`, date].filter(Boolean).join(" "));
      } else if (weekday) out.push(weekday);
      if (wantTime) out.push(`${pad(parts.hour === "24" ? "00" : parts.hour)}:${parts.minute}`);
      return out.join(", ");
    },
  };
}

export function formatDateTime(iso: string, locale: Locale, timeZone: string): string {
  return dateFormat(locale, { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export const pnlTone = (value: number) => (value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-muted");

/** Значение для <input type="datetime-local"> в часовом поясе браузера. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatCompact(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

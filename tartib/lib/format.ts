import type { Locale } from "@/lib/i18n/config";

const intlLocale: Record<Locale, string> = { ru: "ru-RU", uz: "uz-UZ", en: "en-US" };

/** Принимает «1 234,5» и «1234.5». Пустая или неверная строка → null. */
export function parseNumber(value: string): number | null {
  const cleaned = value.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatNumber(value: number, locale: Locale, maxFractionDigits = 4): string {
  return new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: maxFractionDigits }).format(value);
}

export function formatMoney(value: number, currency: string, locale: Locale, signed = false): string {
  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: signed ? "exceptZero" : "auto",
  };
  try {
    return new Intl.NumberFormat(intlLocale[locale], { ...options, style: "currency", currency }).format(value);
  } catch {
    // Не-ISO валюты (например, USDT)
    return `${new Intl.NumberFormat(intlLocale[locale], options).format(value)} ${currency}`;
  }
}

export function formatDateTime(iso: string, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export const pnlTone = (value: number) => (value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-muted");

/** Значение для <input type="datetime-local"> в часовом поясе браузера. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

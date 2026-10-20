import type { Locale } from "@/lib/i18n/config";

const TAG: Record<string, string> = { ru: "ru-RU", uz: "uz-Latn-UZ", en: "en-GB" };

export const localeTag = (locale: Locale | string) => TAG[locale] ?? "en-GB";

export function formatClock(iso: string, locale: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(localeTag(locale), { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

/** Время для списка чатов: сегодня часы и минуты, раньше день и месяц. */
export function formatListTime(iso: string, locale: string, timeZone: string, todayKey: string, dayOf: (iso: string, tz: string) => string): string {
  try {
    if (dayOf(iso, timeZone) === todayKey) return formatClock(iso, locale, timeZone);
    return new Intl.DateTimeFormat(localeTag(locale), { day: "numeric", month: "short", timeZone }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function formatDayLabel(day: string, iso: string, locale: string, timeZone: string, todayKey: string, yesterdayKey: string, todayLabel: string, yesterdayLabel: string): string {
  if (day === todayKey) return todayLabel;
  if (day === yesterdayKey) return yesterdayLabel;
  try {
    return new Intl.DateTimeFormat(localeTag(locale), { day: "numeric", month: "long", year: "numeric", timeZone }).format(new Date(iso));
  } catch {
    return day;
  }
}

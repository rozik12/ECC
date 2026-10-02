export const locales = ["ru", "uz", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ru";
export const LOCALE_COOKIE = "tartib_locale";

/** Названия языков для переключателя. Новый язык = новая строка здесь + новый JSON-словарь. */
export const localeLabels: Record<Locale, string> = {
  ru: "Русский",
  uz: "O'zbekcha",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

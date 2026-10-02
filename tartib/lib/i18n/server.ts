import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { dictionaries } from "./dictionaries";
import { createTranslator } from "./translate";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}

/** Для серверных компонентов: const { t, list, locale } = await getTranslator(); */
export async function getTranslator() {
  const locale = await getLocale();
  return { locale, ...createTranslator(dictionaries[locale]) };
}

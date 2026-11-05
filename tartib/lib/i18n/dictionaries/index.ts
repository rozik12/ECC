import type { Locale } from "../config";
import ru from "./ru.json";
import uz from "./uz.json";
import en from "./en.json";

/** Форма словаря берётся из русского. Остальные языки обязаны иметь те же ключи. */
export type Dictionary = typeof ru;

export const dictionaries: Record<Locale, Dictionary> = { ru, uz, en };

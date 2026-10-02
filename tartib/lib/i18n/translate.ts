import type { Dictionary } from "./dictionaries";

function lookup(dict: Dictionary, key: string): unknown {
  return key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, dict);
}

export type Translator = {
  /** Текст по ключу, например t("landing.hero.title"). Можно подставлять {значения}. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Список строк по ключу, например list("pricing.free.features"). */
  list: (key: string) => string[];
};

export function createTranslator(dict: Dictionary): Translator {
  return {
    t(key, vars) {
      const value = lookup(dict, key);
      if (typeof value !== "string") return key;
      if (!vars) return value;
      return value.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""));
    },
    list(key) {
      const value = lookup(dict, key);
      return Array.isArray(value) ? (value as string[]) : [];
    },
  };
}

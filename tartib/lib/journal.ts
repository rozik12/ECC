// Журнал: теги, ошибки, оценка исполнения, длительность сделки. Файл без зависимостей, чтобы его можно было тестировать.

/** Категории ошибок. Значения должны совпадать со списком в триггере validate_trade_journal (миграция 20260116). */
export const MISTAKES = ["fomo_entry", "moved_stop", "oversize", "early_exit", "late_exit", "no_plan", "revenge", "overtrading", "chased", "no_stop"] as const;
export type Mistake = (typeof MISTAKES)[number];
export const GRADES = ["A", "B", "C", "D"] as const;
export type Grade = (typeof GRADES)[number];

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

/** «#пробой, Новости; пробой» → ["пробой", "Новости"]. Повторы (без учёта регистра) убираются, лишнее обрезается. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]/)) {
    const tag = part.trim().replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH).trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export const tagsToText = (tags: string[]) => tags.join(", ");

/** Сколько минут сделка была открыта. null — время закрытия неизвестно или указано раньше открытия. */
export function durationMinutes(openedAt: string, closedAt: string | null | undefined): number | null {
  if (!closedAt) return null;
  const a = Date.parse(openedAt);
  const b = Date.parse(closedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

export type DurationBucket = "lt5" | "m5_30" | "m30_120" | "h2_8" | "h8_24" | "gt24";
export const DURATION_BUCKETS: DurationBucket[] = ["lt5", "m5_30", "m30_120", "h2_8", "h8_24", "gt24"];

export function durationBucket(minutes: number): DurationBucket {
  if (minutes < 5) return "lt5";
  if (minutes < 30) return "m5_30";
  if (minutes < 120) return "m30_120";
  if (minutes < 480) return "h2_8";
  if (minutes < 1440) return "h8_24";
  return "gt24";
}

export function splitDuration(minutes: number): { d: number; h: number; m: number } {
  return { d: Math.floor(minutes / 1440), h: Math.floor((minutes % 1440) / 60), m: minutes % 60 };
}

/**
 * Строка поиска для фильтра PostgREST `or(...)`: убираем знаки, которыми можно изменить само условие
 * (запятая, скобки, звёздочка, процент, кавычки, двоеточие, обратная косая черта), и ограничиваем длину.
 */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()%*_\\"'`:;]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
}

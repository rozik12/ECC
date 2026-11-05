import type { SupabaseClient } from "@supabase/supabase-js";
import { getCalendar, getDominance, getFearGreed, isFearGreed, parseCachedCalendar, type CalendarEvent, type FearGreed } from "@/lib/market-feed";

const MAX_AGE_MS = 3 * 3600_000;

type Row = { key: string; value: unknown; updated_at: string };

/**
 * Рыночные данные для страницы «Рынок». Сначала свежий кэш из базы (его раз в 10 минут обновляет функция бота),
 * а если кэша нет или он старый, прямой запрос к источнику. Так страница работает, даже когда источник закрыт для серверов сайта.
 */
export async function loadMarketExtras(supabase: SupabaseClient): Promise<{ calendar: CalendarEvent[]; dominance: number | null; fear: FearGreed | null }> {
  const { data } = await supabase.from("market_cache").select("key, value, updated_at").in("key", ["calendar", "dominance", "fng"]);
  const fresh = new Map<string, unknown>();
  for (const r of (data ?? []) as Row[]) if (Date.now() - new Date(r.updated_at).getTime() < MAX_AGE_MS) fresh.set(r.key, r.value);

  const cachedCalendar = fresh.has("calendar") ? parseCachedCalendar(fresh.get("calendar")) : [];
  const dominance = typeof fresh.get("dominance") === "number" ? (fresh.get("dominance") as number) : null;
  const fear = isFearGreed(fresh.get("fng")) ? (fresh.get("fng") as FearGreed) : null;
  const [calendar, dom, fng] = await Promise.all([
    cachedCalendar.length > 0 ? cachedCalendar : getCalendar(),
    dominance !== null ? dominance : getDominance(),
    fear ?? getFearGreed(),
  ]);
  return { calendar, dominance: dom, fear: fng };
}

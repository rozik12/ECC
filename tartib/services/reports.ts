import type { SupabaseClient } from "@supabase/supabase-js";
import { getReportGenerator, type WeeklyReportContent } from "@/services/ai";
import { fetchStatTrades } from "@/lib/data";
import { localDay } from "@/lib/statistics";
import { dayBounds } from "@/lib/time";

const DAY_MS = 24 * 3600 * 1000;

/** Последние 7 дней, включая сегодня, в часовом поясе пользователя. */
export function weekPeriod(timeZone: string, now: Date = new Date()) {
  const first = new Date(now.getTime() - 6 * DAY_MS);
  return {
    periodStart: localDay(first.toISOString(), timeZone),
    periodEnd: localDay(now.toISOString(), timeZone),
    from: dayBounds(timeZone, first).start,
    to: dayBounds(timeZone, now).end,
  };
}

export async function buildAndSaveWeeklyReport(supabase: SupabaseClient, userId: string, timeZone: string, locale: "ru" | "uz" | "en" = "ru"): Promise<WeeklyReportContent> {
  const { periodStart, periodEnd, from, to } = weekPeriod(timeZone);
  const all = await fetchStatTrades(supabase);
  const trades = all.filter((t) => {
    const at = new Date(t.tradedAt);
    return at >= from && at < to;
  });

  const content = await getReportGenerator().generate({ periodStart, periodEnd, trades, locale });
  const { error } = await supabase
    .from("weekly_reports")
    .upsert(
      { user_id: userId, period_start: periodStart, period_end: periodEnd, content },
      { onConflict: "user_id,period_start,period_end" },
    );
  if (error) throw new Error("Failed to save weekly report");
  return content;
}

export async function getLatestWeeklyReport(supabase: SupabaseClient): Promise<{ content: WeeklyReportContent; createdAt: string } | null> {
  const { data } = await supabase
    .from("weekly_reports")
    .select("content, created_at")
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { content: data.content as WeeklyReportContent, createdAt: data.created_at } : null;
}

import { groupBy, topViolations } from "../../lib/statistics/index.ts";
import type { ReportInput, WeeklyReportContent, WeeklyReportGenerator } from "./types.ts";

/** Заглушка без AI: собирает тот же отчёт простыми подсчётами по журналу. */
export class RuleBasedReportGenerator implements WeeklyReportGenerator {
  async generate({ periodStart, periodEnd, trades }: ReportInput): Promise<WeeklyReportContent> {
    const violating = trades.filter((t) => !t.rulesFollowed);

    const top = topViolations(trades, 1)[0] ?? null;
    const topViolation = top
      ? {
          ruleId: top.id,
          name: top.name,
          count: top.count,
          pnl: trades.filter((t) => t.violations.some((v) => v.id === top.id)).reduce((s, t) => s + t.pnl, 0),
        }
      : null;

    const categories = [
      ...groupBy(trades, (t) => t.instrument).map((b) => ({ kind: "instrument" as const, key: b.key, pnl: b.pnl, count: b.count })),
      ...groupBy(trades, (t) => t.emotion).map((b) => ({ kind: "emotion" as const, key: b.key, pnl: b.pnl, count: b.count })),
    ].filter((c) => c.pnl > 0);
    const bestCategory = categories.sort((a, b) => b.pnl - a.pnl)[0] ?? null;

    return {
      version: 1,
      generatedBy: "rules",
      periodStart,
      periodEnd,
      tradesCount: trades.length,
      violationTradesCount: violating.length,
      totalPnl: Math.round(trades.reduce((s, t) => s + t.pnl, 0) * 100) / 100,
      topViolation: topViolation && { ...topViolation, pnl: Math.round(topViolation.pnl * 100) / 100 },
      bestCategory: bestCategory && { ...bestCategory, pnl: Math.round(bestCategory.pnl * 100) / 100 },
    };
  }
}

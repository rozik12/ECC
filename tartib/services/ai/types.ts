import type { StatTrade } from "../../lib/statistics/index.ts";

/** Что хранится в weekly_reports.content. Только факты и цифры, тексты собираются на языке пользователя при показе. */
export type WeeklyReportContent = {
  version: 1;
  /** Кто сформировал отчёт: правила без AI или AI-модель */
  generatedBy: "rules" | "ai";
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  tradesCount: number;
  /** Сколько сделок было с нарушениями правил */
  violationTradesCount: number;
  totalPnl: number;
  /** Самое частое нарушение и результат сделок, где оно было */
  topViolation: { ruleId: string; name: string; count: number; pnl: number } | null;
  /** Лучшая по результату категория сделок (инструмент или эмоция) */
  bestCategory: { kind: "instrument" | "emotion"; key: string; pnl: number; count: number } | null;
};

export type ReportInput = {
  periodStart: string;
  periodEnd: string;
  /** Сделки только за период отчёта */
  trades: StatTrade[];
};

/** Любой способ собрать недельный отчёт: сейчас по правилам, позже через AI. */
export interface WeeklyReportGenerator {
  generate(input: ReportInput): Promise<WeeklyReportContent>;
}

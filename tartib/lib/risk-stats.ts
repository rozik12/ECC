// Показатели риска и качества системы по сделкам пользователя. Чистые функции без зависимостей от браузера и базы.
import { coreStats, rMultiples, type GroupRow } from "./analytics.ts";
import type { EquityPoint, StatTrade } from "./statistics/index.ts";
import { kelly, riskOfRuin } from "./tools.ts";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Результат по дням недели (понедельник — 0) в часовом поясе пользователя. Дни без сделок пропускаются. */
export function byWeekday(trades: StatTrade[], tz: string): (GroupRow & { day: number })[] {
  const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz });
  const index: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const days: StatTrade[][] = Array.from({ length: 7 }, () => []);
  for (const t of trades) {
    const d = index[fmt.format(new Date(t.tradedAt))];
    if (d !== undefined) days[d].push(t);
  }
  return days.flatMap((xs, day) =>
    xs.length === 0
      ? []
      : [{ day, key: String(day), count: xs.length, winRate: (xs.filter((t) => t.pnl > 0).length / xs.length) * 100, pnl: sum(xs.map((t) => t.pnl)), avgPnl: sum(xs.map((t) => t.pnl)) / xs.length }],
  );
}

export type SqnBand = "poor" | "belowAvg" | "average" | "good" | "excellent" | "superb";

/**
 * SQN (System Quality Number, Ван Тарп): √N · среднее(R) / отклонение(R). Нужны сделки с указанным риском, не меньше 10.
 * Это статистическая оценка стабильности результатов, а не прогноз.
 */
export function sqn(trades: StatTrade[]): { value: number; n: number; band: SqnBand } | null {
  const rs = rMultiples(trades);
  if (rs.length < 10) return null;
  const mean = sum(rs) / rs.length;
  const variance = sum(rs.map((r) => (r - mean) ** 2)) / (rs.length - 1);
  const sd = Math.sqrt(variance);
  if (!(sd > 0)) return null;
  const value = (Math.sqrt(rs.length) * mean) / sd;
  const band: SqnBand = value < 1.6 ? "poor" : value < 2 ? "belowAvg" : value < 2.5 ? "average" : value < 3 ? "good" : value < 5 ? "excellent" : "superb";
  return { value, n: rs.length, band };
}

/** Фактор восстановления: чистая прибыль, делённая на максимальную просадку в деньгах. null, если просадки не было. */
export function recoveryFactor(netPnl: number, maxDrawdownAmount: number): number | null {
  return maxDrawdownAmount > 0 ? netPnl / maxDrawdownAmount : null;
}

/** Сколько дней кривая баланса была ниже предыдущего максимума: самый долгий период и текущий (если сейчас ниже максимума). */
export function underwater(curve: EquityPoint[]): { longestDays: number; currentDays: number } {
  let peak = -Infinity;
  let peakTs = 0;
  let longest = 0;
  let dipped = false; // была ли просадка с последнего максимума
  for (const p of curve) {
    if (p.balance >= peak) {
      if (dipped) longest = Math.max(longest, p.ts - peakTs);
      dipped = false;
      peak = p.balance;
      peakTs = p.ts;
    } else dipped = true;
  }
  const last = curve[curve.length - 1];
  const current = last && last.balance < peak ? last.ts - peakTs : 0;
  if (last && last.balance < peak) longest = Math.max(longest, current);
  const day = 86400 * 1000;
  return { longestDays: longest / day, currentDays: current / day };
}

/**
 * Критерий Келли и риск разорения по собственным цифрам пользователя (процент прибыльных и средняя прибыль к среднему убытку).
 * Риск на сделку и «разорение» заданы параметрами. Нужно не меньше 20 сделок и хотя бы одна прибыльная и одна убыточная.
 */
export function personalRiskMath(trades: StatTrade[], riskPct = 1, ruinDrawdown = 50): { winRate: number; payoff: number; kellyPct: number; ruinPct: number; expectancyR: number } | null {
  const c = coreStats(trades);
  if (c.count < 20 || c.winRate === null || c.payoff === null || c.winRate <= 0 || c.winRate >= 100) return null;
  const k = kelly({ winRate: c.winRate, rr: c.payoff });
  const r = riskOfRuin({ winRate: c.winRate, rr: c.payoff, riskPct, ruinDrawdown });
  if (!k.ok || !r.ok) return null;
  return { winRate: c.winRate, payoff: c.payoff, kellyPct: k.kellyPct, ruinPct: r.ruinPct, expectancyR: r.expectancyR };
}

export type LimitLevel = "ok" | "warn" | "hit";

/**
 * Дневной лимит убытка: сколько процентов от баланса на начало дня уже потеряно и какая доля лимита использована.
 * Прибыльный день не использует лимит. «warn» с 70% лимита, «hit» — лимит достигнут.
 */
export function dailyLimit(todayPnl: number, dayStartBalance: number, limitPct: number): { lossPct: number; usedPct: number; level: LimitLevel } | null {
  if (!(dayStartBalance > 0) || !(limitPct > 0) || !Number.isFinite(todayPnl)) return null;
  const lossPct = (Math.max(0, -todayPnl) / dayStartBalance) * 100;
  const usedPct = Math.min(100, (lossPct / limitPct) * 100);
  return { lossPct, usedPct, level: lossPct >= limitPct ? "hit" : usedPct >= 70 ? "warn" : "ok" };
}

/**
 * Серия убыточных сделок подряд, считая с самой свежей. Учитываются только сделки за последние `hours` часов,
 * чтобы вчерашние убытки не включали «паузу» сегодня. Возвращает число подряд и сколько минут прошло с последнего убытка.
 */
export function losingRun(trades: { tradedAt: string; pnl: number }[], now: Date, hours = 8): { count: number; minutesSince: number } {
  const from = now.getTime() - hours * 3600 * 1000;
  const recent = trades
    .map((t) => ({ ts: new Date(t.tradedAt).getTime(), pnl: t.pnl }))
    .filter((t) => Number.isFinite(t.ts) && t.ts >= from && t.ts <= now.getTime() + 60000)
    .sort((a, b) => b.ts - a.ts);
  let count = 0;
  for (const t of recent) {
    if (t.pnl < 0) count++;
    else break;
  }
  return { count, minutesSince: count ? Math.max(0, Math.round((now.getTime() - recent[0].ts) / 60000)) : 0 };
}

// Показатели риска и качества системы по сделкам пользователя. Чистые функции без зависимостей от браузера и базы.
import { coreStats, rMultiples, type GroupRow } from "./analytics.ts";
import { localDay, type EquityPoint, type StatTrade } from "./statistics/index.ts";
import { kelly, riskOfRuin } from "./tools.ts";
import { dtf } from "./intl-cache.ts";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Результат по дням недели (понедельник — 0) в часовом поясе пользователя. Дни без сделок пропускаются. */
export function byWeekday(trades: StatTrade[], tz: string): (GroupRow & { day: number })[] {
  const fmt = dtf("en-US", { weekday: "short", timeZone: tz });
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

export type Ratios = {
  days: number;
  /** Среднедневная доходность, % от баланса на начало дня */
  meanDailyPct: number;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  cagrPct: number | null;
  maxDrawdownPct: number;
  totalReturnPct: number;
};

export const MIN_RATIO_DAYS = 10;

/**
 * Коэффициенты, к которым привыкли алгоритмические трейдеры: Шарп, Сортино и Калмар по дневным доходностям журнала.
 * Доходность дня = результат дня / баланс на начало дня; годовой пересчёт на 252 торговых дня, безрисковая ставка 0.
 * Нужно не меньше 10 торговых дней. Это арифметика прошлых сделок, а не прогноз.
 */
export function performanceRatios(trades: Pick<StatTrade, "tradedAt" | "pnl">[], timeZone: string, startBalance: number): Ratios | null {
  if (!(startBalance > 0)) return null;
  const perDay = new Map<string, number>();
  for (const t of trades) {
    const d = localDay(t.tradedAt, timeZone);
    perDay.set(d, (perDay.get(d) ?? 0) + t.pnl);
  }
  const days = [...perDay.keys()].sort();
  if (days.length < MIN_RATIO_DAYS) return null;
  let equity = startBalance;
  let peak = startBalance;
  let maxDd = 0;
  const returns: number[] = [];
  for (const d of days) {
    const r = (perDay.get(d) as number) / equity;
    returns.push(r);
    equity += perDay.get(d) as number;
    if (equity <= 0) return null; // баланс обнулён: коэффициенты теряют смысл
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  const downside = Math.sqrt(returns.reduce((a, b) => a + Math.min(b, 0) ** 2, 0) / returns.length);
  const span = (Date.parse(`${days[days.length - 1]}T00:00:00Z`) - Date.parse(`${days[0]}T00:00:00Z`)) / 86_400_000 + 1;
  const years = span / 365;
  const total = equity / startBalance - 1;
  const cagr = span >= 30 ? Math.pow(equity / startBalance, 1 / years) - 1 : null;
  return {
    days: days.length,
    meanDailyPct: mean * 100,
    sharpe: std > 0 ? (mean / std) * Math.sqrt(252) : null,
    sortino: downside > 0 ? (mean / downside) * Math.sqrt(252) : null,
    calmar: cagr !== null && maxDd > 0 ? cagr / maxDd : null,
    cagrPct: cagr === null ? null : cagr * 100,
    maxDrawdownPct: maxDd * 100,
    totalReturnPct: total * 100,
  };
}

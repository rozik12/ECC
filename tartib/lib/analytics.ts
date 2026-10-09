// Расширенная аналитика журнала. Чистые функции без зависимостей от интерфейса, чтобы их можно было тестировать.
import { DURATION_BUCKETS, durationBucket, durationMinutes, type DurationBucket } from "./journal.ts";
import { localDay, localWeekdayAndHour, type EquityPoint, type StatTrade } from "./statistics/index.ts";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const byTime = (a: StatTrade, b: StatTrade) => new Date(a.tradedAt).getTime() - new Date(b.tradedAt).getTime();
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

// ---------- ожидание и R ----------
export type Core = {
  count: number;
  winRate: number | null;
  /** Средний результат одной сделки */
  expectancy: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  /** Средняя прибыль к среднему убытку */
  payoff: number | null;
  profitFactor: number | null;
  /** Средний результат в R (только сделки, где известна сумма риска) */
  avgR: number | null;
  rCount: number;
};

export function coreStats(trades: StatTrade[]): Core {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossProfit = sum(wins.map((t) => t.pnl));
  const grossLoss = Math.abs(sum(losses.map((t) => t.pnl)));
  const avgWin = wins.length ? grossProfit / wins.length : null;
  const avgLoss = losses.length ? grossLoss / losses.length : null;
  const rs = rMultiples(trades);
  return {
    count: trades.length,
    winRate: pct(wins.length, trades.length),
    expectancy: trades.length ? sum(trades.map((t) => t.pnl)) / trades.length : null,
    avgWin,
    avgLoss,
    payoff: avgWin !== null && avgLoss !== null && avgLoss > 0 ? avgWin / avgLoss : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    avgR: rs.length ? sum(rs) / rs.length : null,
    rCount: rs.length,
  };
}

/** Результат каждой сделки в R (прибыль, делённая на сумму риска). Сделки без суммы риска пропускаются. */
export function rMultiples(trades: StatTrade[]): number[] {
  return trades.filter((t) => t.riskAmount !== null && t.riskAmount > 0).map((t) => t.pnl / (t.riskAmount as number));
}

export type RBin = { id: string; from: number; to: number; count: number };
const R_EDGES = [-Infinity, -2, -1, 0, 1, 2, 3, Infinity];

/** Распределение результатов по R: меньше −2R, −2…−1, −1…0, 0…1, 1…2, 2…3, больше 3R. */
export function rHistogram(rs: number[]): RBin[] {
  const bins: RBin[] = [];
  for (let i = 0; i < R_EDGES.length - 1; i++) {
    const from = R_EDGES[i];
    const to = R_EDGES[i + 1];
    bins.push({ id: `${Number.isFinite(from) ? from : "min"}_${Number.isFinite(to) ? to : "max"}`, from, to, count: rs.filter((r) => r >= from && r < to).length });
  }
  return bins;
}

// ---------- сторона сделки ----------
export type SideStat = { count: number; winRate: number | null; pnl: number; avgPnl: number | null };

export function bySide(trades: StatTrade[]): { long: SideStat; short: SideStat } {
  const calc = (xs: StatTrade[]): SideStat => ({
    count: xs.length,
    winRate: pct(xs.filter((t) => t.pnl > 0).length, xs.length),
    pnl: sum(xs.map((t) => t.pnl)),
    avgPnl: xs.length ? sum(xs.map((t) => t.pnl)) / xs.length : null,
  });
  return { long: calc(trades.filter((t) => t.direction === "long")), short: calc(trades.filter((t) => t.direction === "short")) };
}

// ---------- торговые сессии ----------
export type SessionId = "asia" | "europe" | "overlap" | "us" | "late";

/** Сессии по времени UTC: Азия 00–07, Европа 07–13, пересечение Европы и США 13–17, США 17–22, поздний вечер 22–24. */
export function sessionOf(iso: string): SessionId {
  const h = new Date(iso).getUTCHours();
  if (h < 7) return "asia";
  if (h < 13) return "europe";
  if (h < 17) return "overlap";
  if (h < 22) return "us";
  return "late";
}
export const SESSION_IDS: SessionId[] = ["asia", "europe", "overlap", "us", "late"];

export type SessionStat = { id: SessionId; count: number; winRate: number | null; pnl: number; violationRate: number | null };

export function bySession(trades: StatTrade[]): SessionStat[] {
  return SESSION_IDS.map((id) => {
    const xs = trades.filter((t) => sessionOf(t.tradedAt) === id);
    return { id, count: xs.length, winRate: pct(xs.filter((t) => t.pnl > 0).length, xs.length), pnl: sum(xs.map((t) => t.pnl)), violationRate: pct(xs.filter((t) => !t.rulesFollowed).length, xs.length) };
  });
}

// ---------- тепловая карта «день недели × время суток» ----------
export const HEAT_BLOCK_HOURS = 4;
export type HeatCell = { weekday: number; block: number; pnl: number; count: number };

/** 7 дней (0 — понедельник) × 6 блоков по 4 часа в часовом поясе пользователя. */
export function heatmap(trades: StatTrade[], timeZone: string): HeatCell[] {
  const cells: HeatCell[] = [];
  for (let weekday = 0; weekday < 7; weekday++) for (let block = 0; block < 24 / HEAT_BLOCK_HOURS; block++) cells.push({ weekday, block, pnl: 0, count: 0 });
  for (const t of trades) {
    const { weekday, hour } = localWeekdayAndHour(t.tradedAt, timeZone);
    const cell = cells[weekday * (24 / HEAT_BLOCK_HOURS) + Math.floor(hour / HEAT_BLOCK_HOURS)];
    cell.pnl += t.pnl;
    cell.count += 1;
  }
  return cells;
}

// ---------- просадка и месяцы ----------
export type DrawdownPoint = { ts: number; drawdown: number; percent: number };

/** Глубина просадки от последнего максимума баланса после каждого события. */
export function drawdownSeries(points: EquityPoint[]): DrawdownPoint[] {
  let peak = -Infinity;
  return points.map((p) => {
    if (p.balance > peak) peak = p.balance;
    const dd = peak - p.balance;
    return { ts: p.ts, drawdown: dd === 0 ? 0 : -dd, percent: dd === 0 || peak <= 0 ? 0 : -(dd / peak) * 100 };
  });
}

export type MonthRow = { key: string; pnl: number; count: number; winRate: number | null };

/** Результат по месяцам (ключ ГГГГ-ММ) в часовом поясе пользователя, последние `limit` месяцев по возрастанию. */
export function monthly(trades: StatTrade[], timeZone: string, limit = 12): MonthRow[] {
  const map = new Map<string, StatTrade[]>();
  for (const t of trades) {
    const key = localDay(t.tradedAt, timeZone).slice(0, 7);
    map.set(key, [...(map.get(key) ?? []), t]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-limit)
    .map(([key, xs]) => ({ key, pnl: sum(xs.map((t) => t.pnl)), count: xs.length, winRate: pct(xs.filter((t) => t.pnl > 0).length, xs.length) }));
}

// ---------- серии ----------
export type Streaks = { longestWin: number; longestLoss: number; current: { type: "win" | "loss" | null; length: number } };

/** Серии прибыльных и убыточных сделок подряд. Сделка с нулевым результатом серию прерывает. */
export function winLossStreaks(trades: StatTrade[]): Streaks {
  let longestWin = 0;
  let longestLoss = 0;
  let type: "win" | "loss" | null = null;
  let length = 0;
  for (const t of [...trades].sort(byTime)) {
    const kind = t.pnl > 0 ? "win" : t.pnl < 0 ? "loss" : null;
    if (kind !== null && kind === type) length += 1;
    else {
      type = kind;
      length = kind === null ? 0 : 1;
    }
    if (type === "win") longestWin = Math.max(longestWin, length);
    if (type === "loss") longestLoss = Math.max(longestLoss, length);
  }
  return { longestWin, longestLoss, current: { type, length } };
}

// ---------- цена каждого правила ----------
export type RuleCostRow = { id: string; name: string; count: number; pnl: number; avgPnl: number };

/** Сколько принесли или потеряли сделки, в которых нарушено каждое правило. Самые убыточные правила сверху. */
export function ruleCost(trades: StatTrade[]): RuleCostRow[] {
  const map = new Map<string, RuleCostRow>();
  for (const t of trades) {
    for (const v of t.violations) {
      const row = map.get(v.id) ?? { id: v.id, name: v.name, count: 0, pnl: 0, avgPnl: 0 };
      row.count += 1;
      row.pnl += t.pnl;
      map.set(v.id, row);
    }
  }
  return [...map.values()].map((r) => ({ ...r, avgPnl: r.pnl / r.count })).sort((a, b) => a.pnl - b.pnl);
}

// ---------- постоянство риска ----------
export type RiskStat = { count: number; avg: number | null; max: number | null; min: number | null; /** разброс относительно среднего, % */ variation: number | null };

export function riskConsistency(trades: StatTrade[]): RiskStat {
  const xs = trades.filter((t) => t.riskAmount !== null && t.riskAmount > 0).map((t) => t.riskAmount as number);
  if (xs.length === 0) return { count: 0, avg: null, max: null, min: null, variation: null };
  const avg = sum(xs) / xs.length;
  const variance = sum(xs.map((x) => (x - avg) ** 2)) / xs.length;
  return { count: xs.length, avg, max: Math.max(...xs), min: Math.min(...xs), variation: avg > 0 ? (Math.sqrt(variance) / avg) * 100 : null };
}

// ---------- таблица по инструментам ----------
export type InstrumentRow = { instrument: string; count: number; winRate: number | null; pnl: number; avgR: number | null };

export function instrumentTable(trades: StatTrade[], limit = 10): InstrumentRow[] {
  const map = new Map<string, StatTrade[]>();
  for (const t of trades) map.set(t.instrument, [...(map.get(t.instrument) ?? []), t]);
  return [...map.entries()]
    .map(([instrument, xs]) => {
      const rs = rMultiples(xs);
      return { instrument, count: xs.length, winRate: pct(xs.filter((t) => t.pnl > 0).length, xs.length), pnl: sum(xs.map((t) => t.pnl)), avgR: rs.length ? sum(rs) / rs.length : null };
    })
    .sort((a, b) => b.count - a.count || b.pnl - a.pnl)
    .slice(0, limit);
}

// ---------- журнал: теги, оценка, ошибки, длительность ----------
export type GroupRow = { key: string; count: number; winRate: number | null; pnl: number; avgPnl: number };

function group(trades: StatTrade[], keysOf: (t: StatTrade) => string[]): GroupRow[] {
  const map = new Map<string, StatTrade[]>();
  for (const t of trades) for (const k of new Set(keysOf(t))) map.set(k, [...(map.get(k) ?? []), t]);
  return [...map.entries()].map(([key, xs]) => ({
    key,
    count: xs.length,
    winRate: pct(xs.filter((t) => t.pnl > 0).length, xs.length),
    pnl: sum(xs.map((t) => t.pnl)),
    avgPnl: sum(xs.map((t) => t.pnl)) / xs.length,
  }));
}

/** Результат по тегам. Сделка с несколькими тегами учитывается в каждом. Лучшие по итогу сверху. */
export function byTag(trades: StatTrade[]): GroupRow[] {
  return group(trades, (t) => (t.tags ?? []).map((x) => x.toLowerCase())).sort((a, b) => b.pnl - a.pnl);
}

/** Результат по оценке исполнения (A, B, C, D). Сделки без оценки не учитываются. */
export function byGrade(trades: StatTrade[]): GroupRow[] {
  return group(trades, (t) => (t.grade ? [t.grade] : [])).sort((a, b) => a.key.localeCompare(b.key));
}

/** Во что обошлась каждая категория ошибок: итог сделок с этой ошибкой. Самые убыточные сверху. */
export function mistakeCost(trades: StatTrade[]): GroupRow[] {
  return group(trades, (t) => t.mistakes ?? []).sort((a, b) => a.pnl - b.pnl);
}

/** Результат по длительности сделки. Сделки без времени закрытия не учитываются. */
export function byDuration(trades: StatTrade[]): (GroupRow & { bucket: DurationBucket })[] {
  const rows = group(trades, (t) => {
    const m = durationMinutes(t.tradedAt, t.closedAt);
    return m === null ? [] : [durationBucket(m)];
  });
  return DURATION_BUCKETS.flatMap((bucket) => {
    const r = rows.find((x) => x.key === bucket);
    return r ? [{ ...r, bucket }] : [];
  });
}

/** Средняя длительность сделок в минутах: прибыльных и убыточных отдельно. */
export function avgDuration(trades: StatTrade[]): { win: number | null; loss: number | null; count: number } {
  const w: number[] = [];
  const l: number[] = [];
  for (const t of trades) {
    const m = durationMinutes(t.tradedAt, t.closedAt);
    if (m === null) continue;
    if (t.pnl > 0) w.push(m);
    else if (t.pnl < 0) l.push(m);
  }
  return { win: w.length ? sum(w) / w.length : null, loss: l.length ? sum(l) / l.length : null, count: w.length + l.length };
}

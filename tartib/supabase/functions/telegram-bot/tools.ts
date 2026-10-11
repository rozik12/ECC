// Расчёты для публичных инструментов и команд бота. Файл без зависимостей: точная копия лежит в
// supabase/functions/telegram-bot/tools.ts (совпадение проверяет tests/tools.test.ts).

export type Fail = { ok: false };
const fin = (...xs: number[]) => xs.every((x) => Number.isFinite(x));
const FAIL: Fail = { ok: false };

// ---------- размер позиции ----------
export type SizeResult = { ok: true; direction: "long" | "short"; riskAmount: number; distance: number; units: number; value: number } | Fail;

export function positionSize(i: { balance: number; riskPct: number; entry: number; stop: number }): SizeResult {
  if (!fin(i.balance, i.riskPct, i.entry, i.stop)) return FAIL;
  if (i.balance <= 0 || i.riskPct <= 0 || i.riskPct > 100 || i.entry <= 0 || i.stop <= 0 || i.entry === i.stop) return FAIL;
  const riskAmount = (i.balance * i.riskPct) / 100;
  const distance = Math.abs(i.entry - i.stop);
  const units = riskAmount / distance;
  return { ok: true, direction: i.entry > i.stop ? "long" : "short", riskAmount, distance, units, value: units * i.entry };
}

// ---------- риск к прибыли ----------
export type RrResult = { ok: true; direction: "long" | "short"; risk: number; reward: number; rr: number; breakEvenWinRate: number; expectancyR: number | null } | Fail;

export function riskReward(i: { entry: number; stop: number; target: number; winRate?: number | null }): RrResult {
  if (!fin(i.entry, i.stop, i.target) || i.entry <= 0 || i.stop <= 0 || i.target <= 0 || i.entry === i.stop) return FAIL;
  const long = i.entry > i.stop;
  if (long ? i.target <= i.entry : i.target >= i.entry) return FAIL; // цель должна быть по ту сторону входа, где прибыль
  const risk = Math.abs(i.entry - i.stop);
  const reward = Math.abs(i.target - i.entry);
  const rr = reward / risk;
  const w = i.winRate;
  const expectancyR = w === null || w === undefined || !Number.isFinite(w) || w < 0 || w > 100 ? null : (w / 100) * rr - (1 - w / 100);
  return { ok: true, direction: long ? "long" : "short", risk, reward, rr, breakEvenWinRate: 100 / (1 + rr), expectancyR };
}

// ---------- восстановление после просадки ----------
export function drawdownRecovery(pct: number): number | null {
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return null;
  return (1 / (1 - pct / 100) - 1) * 100;
}

// ---------- серия убытков подряд ----------
export type StreakResult = { ok: true; single: number; atLeastOnce: number; drawdownPct: number; recoveryPct: number } | Fail;

/** Вероятность хотя бы одной серии из `streak` убытков подряд за `trades` сделок при проценте прибыльных `winRate`. */
export function lossStreak(i: { winRate: number; trades: number; streak: number; riskPct: number }): StreakResult {
  if (!fin(i.winRate, i.trades, i.streak, i.riskPct)) return FAIL;
  if (i.winRate < 0 || i.winRate > 100 || !Number.isInteger(i.trades) || !Number.isInteger(i.streak)) return FAIL;
  if (i.trades < 1 || i.trades > 10000 || i.streak < 1 || i.streak > 100 || i.riskPct <= 0 || i.riskPct >= 100) return FAIL;
  const p = i.winRate / 100;
  const q = 1 - p;
  const k = i.streak;
  let dp = new Array<number>(k).fill(0); // dp[j] — вероятность текущей серии убытков длиной j без достижения k
  dp[0] = 1;
  for (let t = 0; t < i.trades; t++) {
    const next = new Array<number>(k).fill(0);
    next[0] = dp.reduce((a, b) => a + b, 0) * p;
    for (let j = 0; j < k - 1; j++) next[j + 1] = dp[j] * q;
    dp = next;
  }
  const atLeastOnce = Math.min(1, Math.max(0, 1 - dp.reduce((a, b) => a + b, 0)));
  const drawdownPct = (1 - Math.pow(1 - i.riskPct / 100, k)) * 100;
  return { ok: true, single: Math.pow(q, k), atLeastOnce, drawdownPct, recoveryPct: drawdownRecovery(drawdownPct) ?? 0 };
}

// ---------- сложный процент ----------
export type CompoundResult = { ok: true; final: number; deposited: number; gain: number } | Fail;

export function compound(i: { start: number; monthlyPct: number; months: number; monthlyDeposit: number }): CompoundResult {
  if (!fin(i.start, i.monthlyPct, i.months, i.monthlyDeposit)) return FAIL;
  if (i.start < 0 || i.monthlyDeposit < 0 || !Number.isInteger(i.months) || i.months < 1 || i.months > 600) return FAIL;
  if (i.monthlyPct <= -100 || i.monthlyPct > 1000) return FAIL;
  let bal = i.start;
  for (let m = 0; m < i.months; m++) bal = bal * (1 + i.monthlyPct / 100) + i.monthlyDeposit;
  const deposited = i.start + i.monthlyDeposit * i.months;
  return { ok: true, final: bal, deposited, gain: bal - deposited };
}

// ---------- торговые сессии ----------
export type SessionDef = { id: "sydney" | "tokyo" | "london" | "newyork"; zone: string; open: number; close: number };

/** Часы по местному времени города (учитывают переход на летнее время). Выходные — суббота и воскресенье. */
export const SESSIONS: SessionDef[] = [
  { id: "sydney", zone: "Australia/Sydney", open: 8, close: 17 },
  { id: "tokyo", zone: "Asia/Tokyo", open: 9, close: 18 },
  { id: "london", zone: "Europe/London", open: 8, close: 17 },
  { id: "newyork", zone: "America/New_York", open: 8, close: 17 },
];

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localParts(now: Date, zone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: WEEKDAY[get("weekday")] ?? 0, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** open — идёт ли сессия; minutes — минут до закрытия (если идёт) или до следующего открытия. */
export function sessionStatus(now: Date, s: SessionDef): { open: boolean; minutes: number } {
  const { weekday, minutes } = localParts(now, s.zone);
  const isWork = (d: number) => d >= 1 && d <= 5;
  if (isWork(weekday) && minutes >= s.open * 60 && minutes < s.close * 60) return { open: true, minutes: s.close * 60 - minutes };
  for (let d = 0; d <= 7; d++) {
    if (!isWork((weekday + d) % 7)) continue;
    if (d === 0 && minutes >= s.open * 60) continue; // сегодня уже закрылась
    return { open: false, minutes: d * 1440 + s.open * 60 - minutes };
  }
  return { open: false, minutes: 0 };
}

// ---------- критерий Келли ----------
export type KellyResult = { ok: true; edge: number; kellyPct: number; halfPct: number; quarterPct: number } | Fail;

/** Доля капитала на сделку по критерию Келли: f = p − q / b, где b — отношение прибыли к риску. Отрицательное значение = ожидание ниже нуля, ставить нельзя. */
export function kelly(i: { winRate: number; rr: number }): KellyResult {
  if (!fin(i.winRate, i.rr) || i.winRate <= 0 || i.winRate >= 100 || i.rr <= 0 || i.rr > 1000) return FAIL;
  const p = i.winRate / 100;
  const f = p - (1 - p) / i.rr;
  const pct = Math.max(0, f * 100);
  return { ok: true, edge: p * i.rr - (1 - p), kellyPct: pct, halfPct: pct / 2, quarterPct: pct / 4 };
}

// ---------- риск разорения ----------
export type RuinResult = { ok: true; ruinPct: number; cushionR: number; expectancyR: number } | Fail;

/**
 * Вероятность когда-либо потерять `ruinDrawdown`% депозита при фиксированном риске на сделку.
 * Сделка: +rr с вероятностью p или −1 (в единицах риска). Убыток всегда ровно −1, поэтому вероятность дойти
 * до −U равна z^U, где z — корень уравнения p·z^rr + q/z = 1 (0 < z < 1). Запас U оценивается через сложный процент.
 * Это модель независимых сделок: приближение, а не прогноз.
 */
export function riskOfRuin(i: { winRate: number; rr: number; riskPct: number; ruinDrawdown: number }): RuinResult {
  if (!fin(i.winRate, i.rr, i.riskPct, i.ruinDrawdown)) return FAIL;
  if (i.winRate <= 0 || i.winRate >= 100 || i.rr <= 0 || i.rr > 1000 || i.riskPct <= 0 || i.riskPct >= 100 || i.ruinDrawdown <= 0 || i.ruinDrawdown >= 100) return FAIL;
  const p = i.winRate / 100;
  const q = 1 - p;
  const expectancyR = p * i.rr - q;
  const cushionR = Math.log(1 - i.ruinDrawdown / 100) / Math.log(1 - i.riskPct / 100);
  if (expectancyR <= 1e-12) return { ok: true, ruinPct: 100, cushionR, expectancyR };
  // f(z) = p·z^rr + q/z − 1: f(1)=0, f<0 чуть левее 1, f→∞ при z→0. Ищем корень в (0, 1) делением пополам.
  const f = (z: number) => p * Math.pow(z, i.rr) + q / z - 1;
  let lo = 1e-9;
  let hi = 1 - 1e-12;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const z = (lo + hi) / 2;
  return { ok: true, ruinPct: Math.min(100, Math.max(0, Math.pow(z, cushionR) * 100)), cushionR, expectancyR };
}

// ---------- цена ликвидации ----------
export type LiqResult = { ok: true; direction: "long" | "short"; price: number; distancePct: number; margin: number } | Fail;

/** Приблизительная цена ликвидации изолированной позиции: вход ∓ вход·(1/плечо − поддерживающая маржа). Биржи считают чуть иначе, сверяй с биржей. */
export function liquidation(i: { entry: number; leverage: number; direction: "long" | "short"; maintenancePct: number; size: number }): LiqResult {
  if (!fin(i.entry, i.leverage, i.maintenancePct, i.size) || i.entry <= 0 || i.leverage < 1 || i.leverage > 1000 || i.maintenancePct < 0 || i.size <= 0) return FAIL;
  const k = 1 / i.leverage - i.maintenancePct / 100;
  if (k <= 0) return FAIL; // при таком плече и поддерживающей марже позиция ликвидируется сразу
  const long = i.direction === "long";
  const price = long ? i.entry * (1 - k) : i.entry * (1 + k);
  return { ok: true, direction: i.direction, price, distancePct: k * 100, margin: (i.entry * i.size) / i.leverage };
}

// ---------- безубыток с учётом комиссии ----------
export type BreakevenResult = { ok: true; price: number; movePct: number; feeTotalPct: number } | Fail;

/** Цена, при которой сделка с комиссией за вход и выход выходит в ноль. */
export function feeBreakeven(i: { entry: number; feePct: number; direction: "long" | "short" }): BreakevenResult {
  if (!fin(i.entry, i.feePct) || i.entry <= 0 || i.feePct < 0 || i.feePct >= 50) return FAIL;
  const f = i.feePct / 100;
  const price = i.direction === "long" ? (i.entry * (1 + f)) / (1 - f) : (i.entry * (1 - f)) / (1 + f);
  return { ok: true, price, movePct: (Math.abs(price - i.entry) / i.entry) * 100, feeTotalPct: i.feePct * 2 };
}

// ---------- результат сделки ----------
export type ProfitResult = { ok: true; gross: number; fees: number; net: number; pctOfPosition: number; pctOfBalance: number | null } | Fail;

export function tradeProfit(i: { entry: number; exit: number; size: number; direction: "long" | "short"; feePct: number; balance?: number | null }): ProfitResult {
  if (!fin(i.entry, i.exit, i.size, i.feePct) || i.entry <= 0 || i.exit <= 0 || i.size <= 0 || i.feePct < 0 || i.feePct >= 50) return FAIL;
  const gross = (i.direction === "long" ? i.exit - i.entry : i.entry - i.exit) * i.size;
  const fees = ((i.entry + i.exit) * i.size * i.feePct) / 100;
  const net = gross - fees;
  const b = i.balance;
  return { ok: true, gross, fees, net, pctOfPosition: (net / (i.entry * i.size)) * 100, pctOfBalance: b !== null && b !== undefined && Number.isFinite(b) && b > 0 ? (net / b) * 100 : null };
}

// ---------- план цели ----------
export type GoalResult = { ok: true; months: number; years: number; deposited: number } | Fail;

/** Сколько месяцев нужно, чтобы дойти от `start` до `target` при ровной месячной доходности и пополнениях. Иллюстрация арифметики, не прогноз. */
export function goalPlan(i: { start: number; target: number; monthlyPct: number; monthlyDeposit: number }): GoalResult {
  if (!fin(i.start, i.target, i.monthlyPct, i.monthlyDeposit) || i.start < 0 || i.target <= i.start || i.monthlyDeposit < 0 || i.monthlyPct <= -100 || i.monthlyPct > 1000) return FAIL;
  if (i.monthlyPct <= 0 && i.monthlyDeposit <= 0) return FAIL;
  let bal = i.start;
  for (let m = 1; m <= 1200; m++) {
    bal = bal * (1 + i.monthlyPct / 100) + i.monthlyDeposit;
    if (bal >= i.target) return { ok: true, months: m, years: m / 12, deposited: i.start + i.monthlyDeposit * m };
  }
  return FAIL; // дольше 100 лет
}

// ---------- маржа ----------
export type MarginResult = { ok: true; margin: number; marginPctOfBalance: number | null; maxPosition: number | null } | Fail;

export function margin(i: { positionValue: number; leverage: number; balance?: number | null }): MarginResult {
  if (!fin(i.positionValue, i.leverage) || i.positionValue <= 0 || i.leverage < 1 || i.leverage > 1000) return FAIL;
  const m = i.positionValue / i.leverage;
  const b = i.balance;
  const ok = b !== null && b !== undefined && Number.isFinite(b) && b > 0;
  return { ok: true, margin: m, marginPctOfBalance: ok ? (m / b) * 100 : null, maxPosition: ok ? b * i.leverage : null };
}

// ---------- акции: размер позиции в штуках ----------
export type StockSizeResult = { ok: true; shares: number; riskAmount: number; plannedRisk: number; value: number; pctOfBalance: number; leverageNeeded: number; direction: "long" | "short"; commission: number } | Fail;

/**
 * Размер позиции по акциям: целое число штук, чтобы убыток на стопе не превысил выбранный риск.
 * Комиссия считается за сторону на штуку и входит в риск (вход, выход по стопу).
 */
export function stockSize(i: { balance: number; riskPct: number; entry: number; stop: number; feePerShare: number }): StockSizeResult {
  if (!fin(i.balance, i.riskPct, i.entry, i.stop, i.feePerShare)) return FAIL;
  if (i.balance <= 0 || i.riskPct <= 0 || i.riskPct > 100 || i.entry <= 0 || i.stop <= 0 || i.entry === i.stop || i.feePerShare < 0) return FAIL;
  const plannedRisk = (i.balance * i.riskPct) / 100;
  const perShare = Math.abs(i.entry - i.stop) + 2 * i.feePerShare;
  const shares = Math.floor(plannedRisk / perShare);
  const value = shares * i.entry;
  return {
    ok: true,
    shares,
    riskAmount: shares * perShare,
    plannedRisk,
    value,
    pctOfBalance: (value / i.balance) * 100,
    leverageNeeded: value / i.balance,
    direction: i.entry > i.stop ? "long" : "short",
    commission: shares * 2 * i.feePerShare,
  };
}

// ---------- фьючерсы: контракты ----------
/**
 * Стоимость одного пункта цены в долларах для популярных контрактов: индексы, золото, серебро, нефть и золото у форекс-брокеров.
 * Значения справочные: сверяйте со спецификацией контракта у биржи или брокера.
 * point = сколько долларов стоит движение цены на 1,00 для одного контракта (или одного лота).
 */
export const FUTURES_POINT_VALUE: Record<number, { name: string; point: number }> = {
  1: { name: "NQ", point: 20 },
  2: { name: "MNQ", point: 2 },
  3: { name: "ES", point: 50 },
  4: { name: "MES", point: 5 },
  5: { name: "GC", point: 100 },
  6: { name: "MGC", point: 10 },
  7: { name: "SI", point: 5000 },
  8: { name: "CL", point: 1000 },
  9: { name: "MCL", point: 100 },
  10: { name: "YM", point: 5 },
  11: { name: "MYM", point: 0.5 },
  12: { name: "RTY", point: 50 },
  13: { name: "M2K", point: 5 },
  14: { name: "XAUUSD", point: 100 }, // 1 лот золота у брокера = 100 унций
};

export type FuturesResult = { ok: true; contracts: number; riskPerContract: number; riskAmount: number; plannedRisk: number; points: number; pointValue: number; formSize: number; direction: "long" | "short"; commission: number } | Fail;

export function futuresRisk(i: { balance: number; riskPct: number; entry: number; stop: number; contract: number; feePerContract: number }): FuturesResult {
  const spec = FUTURES_POINT_VALUE[i.contract];
  if (!spec || !fin(i.balance, i.riskPct, i.entry, i.stop, i.feePerContract)) return FAIL;
  if (i.balance <= 0 || i.riskPct <= 0 || i.riskPct > 100 || i.entry <= 0 || i.stop <= 0 || i.entry === i.stop || i.feePerContract < 0) return FAIL;
  const points = Math.abs(i.entry - i.stop);
  const riskPerContract = points * spec.point + 2 * i.feePerContract;
  const plannedRisk = (i.balance * i.riskPct) / 100;
  const contracts = Math.floor(plannedRisk / riskPerContract);
  return {
    ok: true,
    contracts,
    riskPerContract,
    riskAmount: contracts * riskPerContract,
    plannedRisk,
    points,
    pointValue: spec.point,
    // В форме сделки размер = контракты × стоимость пункта: так прибыль и риск в Tartib считаются в долларах верно
    formSize: contracts * spec.point,
    direction: i.entry > i.stop ? "long" : "short",
    commission: contracts * 2 * i.feePerContract,
  };
}

// ---------- опционы: выплата на дату экспирации ----------
export type OptionResult =
  | { ok: true; breakeven: number; premiumTotal: number; maxProfit: number | null; maxLoss: number | null; pnlAtExpiry: number | null; moveToBreakevenPct: number | null; kind: "call" | "put"; side: "long" | "short" }
  | Fail;

/**
 * Результат опциона на дату экспирации. long — купленный опцион, short — проданный.
 * Премия указывается за единицу актива, множитель обычно 100 (одна акция × 100 на контракт).
 * Максимум null означает «не ограничен» (купленный колл вверх, проданный колл вниз).
 */
export function optionPayoff(i: { kind: number; side: number; strike: number; premium: number; contracts: number; multiplier: number; underlying: number | null }): OptionResult {
  const kind = i.kind === 1 ? "call" : i.kind === 2 ? "put" : null;
  const side = i.side === 1 ? "long" : i.side === 2 ? "short" : null;
  if (!kind || !side || !fin(i.strike, i.premium, i.contracts, i.multiplier)) return FAIL;
  if (i.strike <= 0 || i.premium < 0 || i.contracts <= 0 || i.multiplier <= 0) return FAIL;
  if (i.underlying !== null && (!Number.isFinite(i.underlying) || i.underlying < 0)) return FAIL;
  const q = i.contracts * i.multiplier;
  const premiumTotal = i.premium * q;
  const breakeven = kind === "call" ? i.strike + i.premium : i.strike - i.premium;
  // Самая большая выплата у пута: цена актива падает до нуля
  const putCap = Math.max(0, (i.strike - i.premium) * q);
  let maxProfit: number | null;
  let maxLoss: number | null;
  if (side === "long") { maxLoss = premiumTotal; maxProfit = kind === "call" ? null : putCap; }
  else { maxProfit = premiumTotal; maxLoss = kind === "call" ? null : putCap; }
  let pnlAtExpiry: number | null = null;
  let moveToBreakevenPct: number | null = null;
  if (i.underlying !== null) {
    const intrinsic = kind === "call" ? Math.max(i.underlying - i.strike, 0) : Math.max(i.strike - i.underlying, 0);
    pnlAtExpiry = (side === "long" ? intrinsic - i.premium : i.premium - intrinsic) * q;
    if (i.underlying > 0) moveToBreakevenPct = ((breakeven - i.underlying) / i.underlying) * 100;
  }
  return { ok: true, breakeven, premiumTotal, maxProfit, maxLoss, pnlAtExpiry, moveToBreakevenPct, kind, side };
}

// ---------- форекс: стоимость пункта, размер лота, маржа и спред ----------
export type ForexLotResult =
  | { ok: true; pipValue: number; riskAmount: number; lots: number; units: number; actualRisk: number; spreadCost: number; margin: number | null; direction: null }
  | Fail;

/**
 * Лот форекс по риску и стопу в пунктах для счёта в долларах. Стандартный лот = 100 000 единиц базовой валюты.
 * pairClass: 1 — доллар в конце пары (EUR/USD, GBP/USD), 2 — доллар в начале (USD/CHF, USD/CAD), 3 — иена в конце (USD/JPY), 4 — кросс без доллара (EUR/GBP): нужен курс котируемой валюты к доллару.
 * Размер округляется вниз до 0,01 лота, чтобы убыток по стопу не превысил выбранный риск.
 */
export function forexLot(i: { balance: number; riskPct: number; stopPips: number; pairClass: number; price: number; quoteToUsd: number | null; spreadPips: number; leverage: number | null }): ForexLotResult {
  if (!fin(i.balance, i.riskPct, i.stopPips, i.price, i.spreadPips) || i.balance <= 0 || i.riskPct <= 0 || i.riskPct > 100 || i.stopPips <= 0 || i.price <= 0 || i.spreadPips < 0) return FAIL;
  if (![1, 2, 3, 4].includes(i.pairClass)) return FAIL;
  if (i.leverage !== null && (!Number.isFinite(i.leverage) || i.leverage < 1 || i.leverage > 3000)) return FAIL;
  let pipValue: number;
  let baseToUsd: number;
  if (i.pairClass === 1) { pipValue = 10; baseToUsd = i.price; }
  else if (i.pairClass === 2) { pipValue = 10 / i.price; baseToUsd = 1; }
  else if (i.pairClass === 3) { pipValue = 1000 / i.price; baseToUsd = 1; }
  else {
    if (i.quoteToUsd === null || !Number.isFinite(i.quoteToUsd) || i.quoteToUsd <= 0) return FAIL;
    pipValue = 10 * i.quoteToUsd;
    baseToUsd = i.price * i.quoteToUsd;
  }
  const riskAmount = (i.balance * i.riskPct) / 100;
  const lots = Math.floor((riskAmount / (i.stopPips * pipValue)) * 100) / 100;
  const units = lots * 100_000;
  return {
    ok: true,
    pipValue,
    riskAmount,
    lots,
    units,
    actualRisk: lots * i.stopPips * pipValue,
    spreadCost: lots * i.spreadPips * pipValue,
    margin: i.leverage === null ? null : (units * baseToUsd) / i.leverage,
    direction: null,
  };
}

// ---------- усреднение: новая средняя цена после докупки ----------
export type AveragePriceResult = { ok: true; newAmount: number; newAvg: number; totalCost: number; avgChangePct: number; riseToBreakevenPct: number } | Fail;

/** Новая средняя цена, если докупить buyAmount по buyPrice к имеющимся amount по средней avgPrice. Комиссии не учитываются. */
export function averagePrice(i: { amount: number; avgPrice: number; buyAmount: number; buyPrice: number }): AveragePriceResult {
  if (!fin(i.amount, i.avgPrice, i.buyAmount, i.buyPrice) || i.amount < 0 || i.avgPrice < 0 || i.buyAmount <= 0 || i.buyPrice <= 0) return FAIL;
  const newAmount = i.amount + i.buyAmount;
  const totalCost = i.amount * i.avgPrice + i.buyAmount * i.buyPrice;
  const newAvg = totalCost / newAmount;
  return {
    ok: true,
    newAmount,
    newAvg,
    totalCost,
    avgChangePct: i.avgPrice > 0 ? ((newAvg - i.avgPrice) / i.avgPrice) * 100 : 0,
    riseToBreakevenPct: ((newAvg - i.buyPrice) / i.buyPrice) * 100,
  };
}

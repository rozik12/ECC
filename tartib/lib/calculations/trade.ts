// Формулы калькулятора риска. Чистые функции без зависимостей, чтобы их можно было тестировать.

export type Direction = "long" | "short";
export type Market = "crypto" | "forex" | "stocks" | "futures";

export const FOREX_LOT_SIZE = 100_000;

export type CalcInput = {
  balance: number;
  riskPercent: number;
  entry: number;
  stop: number;
  takeProfit: number | null;
  leverage: number;
  direction: Direction;
  market: Market;
};

export type CalcResult = {
  riskAmount: number;
  positionSize: number;
  potentialLoss: number;
  potentialProfit: number | null;
  riskReward: number | null;
  positionValue: number;
  margin: number;
  /** Только для Forex: 1 лот = 100 000 единиц */
  lots: number | null;
};

/** Ошибки — ключи словаря (calc.errors.*) */
export type CalcErrorKey =
  | "invalidNumbers"
  | "riskRange"
  | "leverageMin"
  | "stopSame"
  | "longStop"
  | "shortStop"
  | "longTp"
  | "shortTp"
  | "sizeZero";

export type CalcOutcome = { ok: true; result: CalcResult } | { ok: false; error: CalcErrorKey };

const isPositive = (n: number) => Number.isFinite(n) && n > 0;

export function calculatePosition(input: CalcInput): CalcOutcome {
  const { balance, riskPercent, entry, stop, takeProfit, leverage, direction, market } = input;

  if (![balance, riskPercent, entry, stop].every(isPositive)) return { ok: false, error: "invalidNumbers" };
  if (riskPercent > 100) return { ok: false, error: "riskRange" };
  if (!Number.isFinite(leverage) || leverage < 1) return { ok: false, error: "leverageMin" };
  if (entry === stop) return { ok: false, error: "stopSame" };

  if (direction === "long" && stop >= entry) return { ok: false, error: "longStop" };
  if (direction === "short" && stop <= entry) return { ok: false, error: "shortStop" };

  if (takeProfit !== null && takeProfit !== undefined) {
    if (!isPositive(takeProfit)) return { ok: false, error: "invalidNumbers" };
    if (direction === "long" && takeProfit <= entry) return { ok: false, error: "longTp" };
    if (direction === "short" && takeProfit >= entry) return { ok: false, error: "shortTp" };
  }

  const stopDistance = Math.abs(entry - stop);
  const riskAmount = (balance * riskPercent) / 100;
  let positionSize = riskAmount / stopDistance;

  // Акции торгуются целыми штуками
  if (market === "stocks") {
    positionSize = Math.floor(positionSize);
    if (positionSize < 1) return { ok: false, error: "sizeZero" };
  }

  const potentialLoss = stopDistance * positionSize;
  const potentialProfit = takeProfit == null ? null : Math.abs(takeProfit - entry) * positionSize;
  const riskReward = potentialProfit === null ? null : potentialProfit / potentialLoss;
  const positionValue = positionSize * entry;

  return {
    ok: true,
    result: {
      riskAmount,
      positionSize,
      potentialLoss,
      potentialProfit,
      riskReward,
      positionValue,
      margin: positionValue / leverage,
      lots: market === "forex" ? positionSize / FOREX_LOT_SIZE : null,
    },
  };
}

/** P&L сделки из цен входа, выхода и объёма (без комиссий). */
export function calculatePnl(direction: Direction, entry: number, exit: number, size: number): number {
  const diff = direction === "long" ? exit - entry : entry - exit;
  return diff * size;
}

/** Показатели сделки по введённым ценам: риск в деньгах, потенциальная прибыль/убыток, R:R. */
export function tradeMetrics(args: {
  entry: number;
  stop: number | null;
  takeProfit: number | null;
  size: number;
}) {
  const { entry, stop, takeProfit, size } = args;
  const potentialLoss = stop === null ? null : Math.abs(entry - stop) * size;
  const potentialProfit = takeProfit === null ? null : Math.abs(takeProfit - entry) * size;
  const riskReward =
    potentialLoss !== null && potentialLoss > 0 && potentialProfit !== null ? potentialProfit / potentialLoss : null;
  return { riskAmount: potentialLoss, potentialLoss, potentialProfit, riskReward };
}

// Копия формул из lib/calculations/trade.ts.

export type Direction = "long" | "short";

export function calculatePnl(direction: Direction, entry: number, exit: number, size: number): number {
  const diff = direction === "long" ? exit - entry : entry - exit;
  return diff * size;
}

export function tradeMetrics(args: { entry: number; stop: number | null; takeProfit: number | null; size: number }) {
  const { entry, stop, takeProfit, size } = args;
  const potentialLoss = stop === null ? null : Math.abs(entry - stop) * size;
  const potentialProfit = takeProfit === null ? null : Math.abs(takeProfit - entry) * size;
  const riskReward = potentialLoss !== null && potentialLoss > 0 && potentialProfit !== null ? potentialProfit / potentialLoss : null;
  return { riskAmount: potentialLoss, potentialLoss, potentialProfit, riskReward };
}

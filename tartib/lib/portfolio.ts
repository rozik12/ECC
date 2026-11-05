// Учёт портфеля монет по методу средней цены: покупки увеличивают среднюю, продажи фиксируют результат. Чистые функции без зависимостей от интерфейса.

export type Lot = { id?: string; symbol: string; side: "buy" | "sell"; amount: number; price: number; fee: number; occurredAt: string };

export type Position = {
  symbol: string;
  /** Сколько монет сейчас */
  amount: number;
  /** Средняя цена покупки оставшихся монет */
  avgPrice: number;
  /** Сколько вложено в оставшиеся монеты (с комиссиями) */
  cost: number;
  /** Зафиксировано продажами (после комиссий) */
  realized: number;
  /** Комиссии за всё время */
  fees: number;
  /** Продано больше, чем куплено (в записях ошибка) */
  oversold: boolean;
};

const STABLES = new Set(["USDT", "USDC", "FDUSD", "BUSD", "DAI", "TUSD"]);
export const isStable = (symbol: string) => STABLES.has(symbol);
const EPS = 1e-12;

/** Позиции по монетам. Записи сортируются по времени. */
export function positions(lots: Lot[]): Position[] {
  const bySymbol = new Map<string, Lot[]>();
  for (const l of lots) bySymbol.set(l.symbol, [...(bySymbol.get(l.symbol) ?? []), l]);
  const out: Position[] = [];
  for (const [symbol, xs] of bySymbol) {
    let amount = 0, cost = 0, realized = 0, fees = 0, oversold = false;
    for (const l of [...xs].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))) {
      fees += l.fee;
      if (l.side === "buy") {
        amount += l.amount;
        cost += l.amount * l.price + l.fee;
      } else {
        const q = Math.min(l.amount, amount);
        if (l.amount > amount + EPS) oversold = true;
        const avg = amount > EPS ? cost / amount : 0;
        realized += (l.price - avg) * q - l.fee;
        cost -= avg * q;
        amount -= q;
        if (amount < EPS) { amount = 0; cost = 0; }
      }
    }
    out.push({ symbol, amount, avgPrice: amount > EPS ? cost / amount : 0, cost, realized, fees, oversold });
  }
  return out.sort((a, b) => b.cost - a.cost || a.symbol.localeCompare(b.symbol));
}

export type Valued = Position & { price: number | null; value: number | null; unrealized: number | null; unrealizedPct: number | null; share: number | null };

/** Оценка по текущим ценам (в котируемой валюте, обычно USDT). Монеты без цены остаются без оценки и в итог не входят. */
export function valuate(ps: Position[], prices: Record<string, number>): { rows: Valued[]; totalValue: number; totalCost: number; totalUnrealized: number; totalRealized: number } {
  const priced = ps.map((p) => {
    const price = isStable(p.symbol) ? 1 : prices[p.symbol] ?? null;
    const value = price === null ? null : p.amount * price;
    return { p, price, value };
  });
  const totalValue = priced.reduce((s, x) => s + (x.value ?? 0), 0);
  const rows: Valued[] = priced.map(({ p, price, value }) => ({
    ...p,
    price,
    value,
    unrealized: value === null ? null : value - p.cost,
    unrealizedPct: value === null || p.cost <= 0 ? null : ((value - p.cost) / p.cost) * 100,
    share: value === null || totalValue <= 0 ? null : (value / totalValue) * 100,
  }));
  const withValue = rows.filter((r) => r.value !== null);
  return {
    rows,
    totalValue,
    totalCost: withValue.reduce((s, r) => s + r.cost, 0),
    totalUnrealized: withValue.reduce((s, r) => s + (r.unrealized ?? 0), 0),
    totalRealized: rows.reduce((s, r) => s + r.realized, 0),
  };
}

export type PriceSource = { kind: "okx"; pair: string } | { kind: "yahoo"; ticker: string } | { kind: "none" };

/**
 * Откуда брать цену актива: монета с парой к USDT на OKX; иначе акция, ETF, золото или индекс через Yahoo (если символ распознан); иначе цены нет.
 * Стейблкоины не оцениваются (их цена 1).
 */
export function classify(symbol: string, okxBases: Set<string>, toTicker: (s: string) => string | null): PriceSource {
  if (isStable(symbol)) return { kind: "none" };
  if (okxBases.has(symbol)) return { kind: "okx", pair: `${symbol}USDT` };
  const ticker = toTicker(symbol);
  return ticker ? { kind: "yahoo", ticker } : { kind: "none" };
}

// Крипто: комиссия по ставке биржи, проверка ликвидации против стопа. Чистые функции без зависимостей от интерфейса.
import { liquidation } from "./tools.ts";

export type CryptoKind = "spot" | "perp";
export type Liquidity = "maker" | "taker";

/**
 * Обычные базовые ставки комиссии в процентах (самый нижний уровень, без скидок за объём и за токен биржи).
 * Ставки справочные: у каждой биржи они меняются, свою точную ставку надо проверять в аккаунте.
 */
export const EXCHANGE_FEES: Record<string, Record<CryptoKind, Record<Liquidity, number>>> = {
  binance: { spot: { maker: 0.1, taker: 0.1 }, perp: { maker: 0.02, taker: 0.05 } },
  bybit: { spot: { maker: 0.1, taker: 0.1 }, perp: { maker: 0.02, taker: 0.055 } },
  okx: { spot: { maker: 0.08, taker: 0.1 }, perp: { maker: 0.02, taker: 0.05 } },
  bitget: { spot: { maker: 0.1, taker: 0.1 }, perp: { maker: 0.02, taker: 0.06 } },
  kucoin: { spot: { maker: 0.1, taker: 0.1 }, perp: { maker: 0.02, taker: 0.06 } },
};
export const EXCHANGES = Object.keys(EXCHANGE_FEES);

const round = (n: number, d = 6) => Math.round(n * 10 ** d) / 10 ** d;

/** Комиссия туда и обратно: ставка, умноженная на оборот входа и выхода. Если цены выхода ещё нет, считается как будто выход по цене входа. */
export function roundTripFee(i: { entry: number; exit: number | null; size: number; ratePct: number }): number | null {
  const { entry, size, ratePct } = i;
  const exit = i.exit ?? entry;
  if (![entry, exit, size, ratePct].every(Number.isFinite) || entry <= 0 || exit <= 0 || size <= 0 || ratePct < 0 || ratePct > 5) return null;
  return round(((entry * size + exit * size) * ratePct) / 100);
}

export const rateFor = (exchange: string, kind: CryptoKind, liquidity: Liquidity): number | null => EXCHANGE_FEES[exchange]?.[kind]?.[liquidity] ?? null;

export type LiqCheck = { price: number; distancePct: number; danger: "none" | "before_stop" | "close" };

/**
 * Цена ликвидации (приблизительно, изолированная маржа) и сравнение со стопом.
 * «before_stop»: ликвидация случится раньше стопа, то есть стоп не успеет сработать. «close»: стоп ближе к ликвидации, чем 20% её расстояния.
 * Для спота и плеча 1 ликвидации нет (null).
 */
export function liquidationCheck(i: { entry: number; stop: number | null; leverage: number; direction: "long" | "short"; maintenancePct?: number }): LiqCheck | null {
  if (i.leverage <= 1) return null;
  const liq = liquidation({ entry: i.entry, leverage: i.leverage, direction: i.direction, maintenancePct: i.maintenancePct ?? 0.5, size: 1 });
  if (!liq.ok) return null;
  const dist = Math.abs(i.entry - liq.price);
  let danger: LiqCheck["danger"] = "none";
  if (i.stop !== null && Number.isFinite(i.stop)) {
    const stopDist = i.direction === "long" ? i.entry - i.stop : i.stop - i.entry;
    if (stopDist > 0) {
      if (stopDist >= dist) danger = "before_stop";
      else if (stopDist >= dist * 0.8) danger = "close";
    }
  }
  return { price: liq.price, distancePct: liq.distancePct, danger };
}

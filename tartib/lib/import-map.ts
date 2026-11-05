// Сопоставление столбцов чужих таблиц (биржи, брокеры, Excel) с полями сделки Tartib.
// Чистые функции без зависимостей, чтобы их можно было тестировать.

export const IMPORT_FIELDS = [
  "date_time", "instrument", "market", "direction", "entry", "exit", "stop_loss", "take_profit", "size", "leverage",
  "risk_percent", "fees", "pnl", "emotion", "strategy", "violated_rules", "reason", "plan", "comment",
  "tags", "grade", "mistakes", "closed_at",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const REQUIRED_FIELDS: ImportField[] = ["instrument", "direction", "entry", "size"];

/** Колонка в файле (индекс) для каждого поля; null — поле не сопоставлено. */
export type ColumnMapping = Record<ImportField, number | null>;

const norm = (h: string) =>
  h.toLowerCase().replace(/\(.*?\)/g, "").trim().replace(/[\s\-.]+/g, "_").replace(/^_+|_+$/g, "");

/** Названия столбцов, которые встречаются у бирж, брокеров и в Excel. Порядок важен: раньше — точнее. */
const ALIASES: Record<ImportField, string[]> = {
  instrument: ["instrument", "symbol", "pair", "ticker", "contract", "contracts", "asset", "market_pair", "инструмент", "тикер", "символ"],
  direction: ["direction", "side", "position_side", "closing_direction", "type", "trade_type", "order_type", "направление", "тип"],
  entry: ["entry", "entry_price", "avg_entry_price", "open_price", "price_open", "buy_price", "вход", "цена_входа", "цена_открытия"],
  exit: ["exit", "exit_price", "avg_exit_price", "close_price", "price_close", "sell_price", "выход", "цена_выхода", "цена_закрытия"],
  size: ["size", "position_size", "qty", "quantity", "volume", "lots", "lot", "amount", "filled", "объём", "объем", "количество", "лоты"],
  pnl: ["pnl", "p&l", "net_profit", "net_pnl", "realized_pnl", "realized_profit", "closed_p&l", "closed_pnl", "profit", "profit/loss", "result", "прибыль", "результат"],
  fees: ["fees", "fee", "total_fee", "commission", "commissions", "комиссия", "комиссии"],
  date_time: ["date_time", "datetime", "closing_time", "close_time", "open_time", "opened", "entry_time", "trade_time", "date", "time", "timestamp", "created_at", "дата", "время"],
  stop_loss: ["stop_loss", "stoploss", "sl", "s/l", "stop", "стоп", "стоп_лосс"],
  take_profit: ["take_profit", "takeprofit", "tp", "t/p", "target", "тейк", "тейк_профит"],
  leverage: ["leverage", "lev", "плечо"],
  risk_percent: ["risk_percent", "risk_%", "risk", "риск"],
  market: ["market", "asset_class", "market_type", "рынок"],
  emotion: ["emotion", "mood", "эмоция"],
  strategy: ["strategy", "setup", "tag", "стратегия"],
  violated_rules: ["violated_rules", "rules_broken", "нарушенные_правила"],
  reason: ["reason", "entry_reason", "причина"],
  plan: ["plan", "trading_plan", "план"],
  comment: ["comment", "comments", "notes", "note", "комментарий", "заметки"],
  tags: ["tags", "labels", "теги", "метки"],
  grade: ["grade", "execution_grade", "оценка"],
  mistakes: ["mistakes", "errors", "ошибки"],
  closed_at: ["closed_at", "close_date_time", "closed", "время_закрытия"],
};

/** Порядок присвоения: важные поля выбирают столбцы первыми, чтобы один столбец не достался двум полям. */
const PRIORITY: ImportField[] = [
  "instrument", "direction", "entry", "exit", "size", "pnl", "fees", "stop_loss", "take_profit", "leverage", "risk_percent",
  "market", "emotion", "strategy", "violated_rules", "reason", "plan", "comment", "date_time",
  "tags", "grade", "mistakes", "closed_at",
];

export function autoMapColumns(header: string[]): ColumnMapping {
  const names = header.map(norm);
  const used = new Set<number>();
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null])) as ColumnMapping;
  // date_time выбираем последним, чтобы слово «time» не отняло столбец у других полей
  for (const field of PRIORITY) {
    for (const alias of ALIASES[field]) {
      const i = names.findIndex((n, idx) => n === norm(alias) && !used.has(idx));
      if (i !== -1) {
        mapping[field] = i;
        used.add(i);
        break;
      }
    }
  }
  return mapping;
}

/** Приводит buy/sell/лонг/шорт к long или short. Непонятное значение → null. */
export function normalizeDirection(value: string): "long" | "short" | null {
  const v = value.trim().toLowerCase();
  if (["long", "buy", "b", "l", "bull", "лонг", "покупка", "купить"].includes(v)) return "long";
  if (["short", "sell", "s", "bear", "шорт", "продажа", "продать"].includes(v)) return "short";
  if (v.startsWith("buy")) return "long";
  if (v.startsWith("sell")) return "short";
  return null;
}

/** Число из выгрузки: убирает валюту и знак процента («1 234,5 USDT», «$12.50», «3%»). */
export function parseLooseNumber(value: string): number | null {
  const cleaned = value
    .trim()
    .replace(/[\s ]/g, "")
    .replace(/^[^\d\-+.,]+|[^\d.,]+$/g, "")
    .replace(",", ".");
  if (cleaned === "" || cleaned === "-" || cleaned === "+") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Дата из выгрузки: ISO, «2026-10-01 10:30», «01.10.2026 10:30», «01/10/2026». Не получилось → null. */
export function parseDateTime(value: string): Date | null {
  const v = value.trim();
  if (v === "") return null;
  const dmy = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), Number(dmy[4] ?? 0), Number(dmy[5] ?? 0), Number(dmy[6] ?? 0));
    return isNaN(d.getTime()) ? null : d;
  }
  // «2026.10.01 10:30:00» (MetaTrader) и «2026/10/01»
  const ymd = /^(\d{4})[./](\d{1,2})[./](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), Number(ymd[4] ?? 0), Number(ymd[5] ?? 0), Number(ymd[6] ?? 0));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

const FIAT = "(EUR|USD|GBP|JPY|CHF|AUD|NZD|CAD|SEK|NOK|PLN|TRY|ZAR|MXN|CNH|CNY)";

/** Рынок по названию инструмента, если в файле нет столбца «рынок». */
export function inferMarket(instrument: string): "crypto" | "forex" | "stocks" | "futures" {
  const s = instrument.toUpperCase().replace(/[\s/_-]/g, "");
  if (new RegExp(`^(XAU|XAG|${FIAT.slice(1, -1)})${FIAT}$`).test(s)) return "forex";
  if (/(USDT|USDC|BUSD|BTC|ETH|PERP)$/.test(s)) return "crypto";
  if (/^(NQ|ES|YM|RTY|CL|GC|SI|ZB|ZN)[A-Z]?\d{0,2}$/.test(s)) return "futures";
  if (/^[A-Z]{1,5}$/.test(s)) return "stocks";
  return "crypto";
}

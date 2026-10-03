import { parseNumber } from "@/lib/format";
import { unsafeText } from "@/lib/csv";
import { directions, emotions, markets } from "@/lib/trading";
import { tradeSchema } from "@/lib/validations/trades";

/** Столбцы файла сделок: так же называются столбцы при экспорте. */
export const TRADE_COLUMNS = [
  "date_time", "instrument", "market", "direction", "entry", "exit", "stop_loss", "take_profit", "size", "leverage",
  "risk_percent", "pnl", "emotion", "strategy", "violated_rules", "reason", "plan", "comment", "account",
] as const;

const PLACEHOLDER_UUID = "00000000-0000-4000-8000-000000000000";
export const MAX_IMPORT_ROWS = 500;

export type ImportItem = {
  /** Номер строки в файле (с учётом заголовка) */
  line: number;
  /** Готовые данные сделки без accountId и violatedRuleIds */
  payload: Record<string, unknown> | null;
  violatedRuleNames: string[];
  /** Ключ словаря с причиной, если строка не подходит */
  error: string | null;
};

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_");

export function mapCsvRows(rows: string[][]): { items: ImportItem[]; missing: string[] } {
  if (rows.length === 0) return { items: [], missing: [] };
  const header = rows[0].map(norm);
  const missing = ["instrument", "direction", "entry", "size"].filter((c) => !header.includes(c));
  if (missing.length > 0) return { items: [], missing };

  const idx = (name: string) => header.indexOf(name);
  const cell = (row: string[], name: string) => {
    const i = idx(name);
    return i === -1 ? "" : (row[i] ?? "").trim();
  };
  const num = (row: string[], name: string) => parseNumber(cell(row, name));
  const text = (row: string[], name: string) => unsafeText(cell(row, name));

  const items = rows.slice(1, MAX_IMPORT_ROWS + 1).map((row, i): ImportItem => {
    const line = i + 2;
    const dateRaw = cell(row, "date_time");
    const date = dateRaw ? new Date(dateRaw.replace(" ", "T")) : new Date();
    const market = (cell(row, "market") || "crypto").toLowerCase();
    const direction = cell(row, "direction").toLowerCase();
    const emotion = (cell(row, "emotion") || "other").toLowerCase();

    const payload = {
      instrument: text(row, "instrument"),
      market: (markets as readonly string[]).includes(market) ? market : "crypto",
      direction,
      entryPrice: num(row, "entry"),
      exitPrice: num(row, "exit"),
      stopLoss: num(row, "stop_loss"),
      takeProfit: num(row, "take_profit"),
      positionSize: num(row, "size"),
      leverage: num(row, "leverage") ?? 1,
      riskPercent: num(row, "risk_percent"),
      pnl: num(row, "pnl"),
      emotion: (emotions as readonly string[]).includes(emotion) ? emotion : "other",
      strategy: text(row, "strategy"),
      reason: text(row, "reason"),
      plan: text(row, "plan"),
      comment: text(row, "comment"),
      tradedAt: isNaN(date.getTime()) ? "" : date.toISOString(),
    };

    let error: string | null = null;
    if (!(directions as readonly string[]).includes(direction)) error = "import.errDirection";
    else if (market && !(markets as readonly string[]).includes(market)) error = "import.errMarket";
    else {
      const check = tradeSchema.safeParse({ ...payload, accountId: PLACEHOLDER_UUID, violatedRuleIds: [] });
      if (!check.success) error = "import.errValues";
    }
    return {
      line,
      payload: error ? null : payload,
      violatedRuleNames: cell(row, "violated_rules").split("|").map((s) => unsafeText(s.trim())).filter(Boolean),
      error,
    };
  });
  return { items, missing: [] };
}

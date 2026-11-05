import { unsafeText } from "@/lib/csv";
import {
  autoMapColumns, inferMarket, normalizeDirection, parseDateTime, parseLooseNumber, REQUIRED_FIELDS,
  type ColumnMapping, type ImportField,
} from "@/lib/import-map";
import { GRADES, MISTAKES, parseTags } from "@/lib/journal";
import { emotions, markets } from "@/lib/trading";
import { tradeSchema } from "@/lib/validations/trades";

/** Столбцы файла Tartib при экспорте (при импорте подходят любые таблицы, столбцы сопоставляются). */
export const TRADE_COLUMNS = [
  "date_time", "instrument", "market", "direction", "entry", "exit", "stop_loss", "take_profit", "size", "leverage",
  "risk_percent", "fees", "pnl", "emotion", "strategy", "violated_rules", "reason", "plan", "comment", "account",
  "tags", "grade", "mistakes", "closed_at",
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

export type MappedImport = {
  items: ImportItem[];
  /** Обязательные поля, для которых не нашлось столбца */
  missing: ImportField[];
  mapping: ColumnMapping;
  header: string[];
};

export function mapCsvRows(rows: string[][], mappingOverride?: ColumnMapping): MappedImport {
  const header = rows[0] ?? [];
  const mapping = mappingOverride ?? autoMapColumns(header);
  const missing = REQUIRED_FIELDS.filter((f) => mapping[f] === null);
  if (rows.length === 0 || missing.length > 0) return { items: [], missing, mapping, header };

  const cell = (row: string[], field: ImportField) => {
    const i = mapping[field];
    return i === null ? "" : (row[i] ?? "").trim();
  };
  const num = (row: string[], field: ImportField) => parseLooseNumber(cell(row, field));
  const text = (row: string[], field: ImportField) => unsafeText(cell(row, field));

  const items = rows.slice(1, MAX_IMPORT_ROWS + 1).map((row, i): ImportItem => {
    const line = i + 2;
    const direction = normalizeDirection(cell(row, "direction"));
    const dateRaw = cell(row, "date_time");
    const date = dateRaw ? parseDateTime(dateRaw) : new Date();
    const instrument = text(row, "instrument");
    const closedRaw = cell(row, "closed_at");
    const closed = closedRaw ? parseDateTime(closedRaw) : null;
    const gradeRaw = cell(row, "grade").toUpperCase();
    const marketRaw = cell(row, "market").toLowerCase();
    const emotionRaw = cell(row, "emotion").toLowerCase();

    const payload = {
      instrument,
      market: (markets as readonly string[]).includes(marketRaw) ? marketRaw : inferMarket(instrument),
      direction,
      entryPrice: num(row, "entry"),
      exitPrice: num(row, "exit"),
      stopLoss: num(row, "stop_loss"),
      takeProfit: num(row, "take_profit"),
      positionSize: Math.abs(num(row, "size") ?? NaN),
      leverage: num(row, "leverage") ?? 1,
      riskPercent: num(row, "risk_percent"),
      fees: Math.abs(num(row, "fees") ?? 0),
      pnl: num(row, "pnl"),
      emotion: (emotions as readonly string[]).includes(emotionRaw) ? emotionRaw : "other",
      strategy: text(row, "strategy"),
      reason: text(row, "reason"),
      plan: text(row, "plan"),
      comment: text(row, "comment"),
      tradedAt: date ? date.toISOString() : "",
      tags: parseTags(unsafeText(cell(row, "tags"))),
      grade: (GRADES as readonly string[]).includes(gradeRaw) ? gradeRaw : null,
      mistakes: cell(row, "mistakes").split("|").map((s) => s.trim().toLowerCase()).filter((s) => (MISTAKES as readonly string[]).includes(s)),
      closedAt: closed && date && closed.getTime() >= date.getTime() ? closed.toISOString() : null,
    };

    let error: string | null = null;
    if (!direction) error = "import.errDirection";
    else if (!date) error = "import.errDate";
    else if (!tradeSchema.safeParse({ ...payload, accountId: PLACEHOLDER_UUID, violatedRuleIds: [] }).success) error = "import.errValues";

    return {
      line,
      payload: error ? null : payload,
      violatedRuleNames: cell(row, "violated_rules").split("|").map((s) => unsafeText(s.trim())).filter(Boolean),
      error,
    };
  });
  return { items, missing: [], mapping, header };
}

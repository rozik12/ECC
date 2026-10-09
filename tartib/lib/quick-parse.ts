// Разбор строки быстрого ввода: «BTC long 65000 стоп 64500 тп 66000 размер 0.1 плечо 5».
// Порядок слов не важен. Первое «голое» число — цена входа. Ничего не угадывается: что не распознано, остаётся пустым.

export type QuickParsed = {
  instrument: string;
  direction: "long" | "short" | null;
  entry: string;
  stop: string;
  tp: string;
  size: string;
  leverage: string;
  risk: string;
};

const LONG = new Set(["long", "buy", "лонг", "покупка", "купить", "bull"]);
const SHORT = new Set(["short", "sell", "шорт", "продажа", "продать", "bear"]);
const KEYS: Record<string, "stop" | "tp" | "size" | "leverage" | "risk"> = {
  stop: "stop", sl: "stop", стоп: "stop", stoploss: "stop",
  tp: "tp", take: "tp", takeprofit: "tp", тп: "tp", тейк: "tp", цель: "tp",
  size: "size", qty: "size", lot: "size", lots: "size", объём: "size", объем: "size", размер: "size", лот: "size", лоты: "size", hajm: "size",
  lev: "leverage", leverage: "leverage", плечо: "leverage", yelka: "leverage",
  risk: "risk", риск: "risk",
};

const NUM = /^[+-]?\d+(?:[.,]\d+)?$/;
const cleanNum = (s: string) => s.replace(",", ".");

export function parseQuickLine(input: string): QuickParsed {
  const out: QuickParsed = { instrument: "", direction: null, entry: "", stop: "", tp: "", size: "", leverage: "", risk: "" };
  const tokens = input.trim().slice(0, 200).replace(/[;]+/g, " ").split(/\s+/).filter(Boolean);
  let pendingKey: (typeof KEYS)[string] | null = null;

  for (const raw of tokens) {
    const tok = raw.toLowerCase().replace(/[:=]+$/, "");
    if (LONG.has(tok)) { out.direction = "long"; pendingKey = null; continue; }
    if (SHORT.has(tok)) { out.direction = "short"; pendingKey = null; continue; }

    // «5x», «x5» — плечо; «1%» — риск
    const lev = /^(?:(\d+(?:[.,]\d+)?)x|x(\d+(?:[.,]\d+)?))$/.exec(tok);
    if (lev) { out.leverage = cleanNum(lev[1] ?? lev[2]); pendingKey = null; continue; }
    const pct = /^(\d+(?:[.,]\d+)?)%$/.exec(tok);
    if (pct) { out.risk = cleanNum(pct[1]); pendingKey = null; continue; }

    // Слово-подсказка с числом внутри: «sl=64500», «стоп:64500»
    const glued = /^([a-zа-яё]+)[:=](\d+(?:[.,]\d+)?)$/i.exec(tok);
    if (glued && KEYS[glued[1]]) { out[KEYS[glued[1]]] = cleanNum(glued[2]); pendingKey = null; continue; }

    if (KEYS[tok]) { pendingKey = KEYS[tok]; continue; }

    if (NUM.test(tok)) {
      const value = cleanNum(tok).replace(/^\+/, "");
      if (pendingKey) { out[pendingKey] = value; pendingKey = null; }
      else if (!out.entry) out.entry = value;
      continue;
    }

    // Первое слово с буквами — инструмент
    if (!out.instrument && /[a-zа-яё]/i.test(tok) && /^[a-zа-яё0-9/._-]{2,20}$/i.test(raw)) out.instrument = raw.toUpperCase();
  }
  return out;
}

/** Адрес формы новой сделки с подставленными значениями. Пустые поля не передаются. */
export function quickToQuery(p: QuickParsed): string {
  const params = new URLSearchParams();
  if (p.instrument) params.set("instrument", p.instrument);
  if (p.direction) params.set("direction", p.direction);
  if (p.entry) params.set("entry", p.entry);
  if (p.stop) params.set("stop", p.stop);
  if (p.tp) params.set("tp", p.tp);
  if (p.size) params.set("size", p.size);
  if (p.leverage) params.set("leverage", p.leverage);
  if (p.risk) params.set("risk", p.risk);
  const qs = params.toString();
  return qs ? `/trades/new?${qs}` : "/trades/new";
}

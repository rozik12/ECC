// Разбор сообщения о сделке: «BTCUSDT long 65000 0.1 стоп 64500 тейк 67000».
// Чистая функция без зависимостей: её тестируют обычными тестами проекта.

export type ParsedTrade = {
  instrument: string;
  direction: "long" | "short";
  entry: number;
  size: number;
  stop: number | null;
  takeProfit: number | null;
  exit: number | null;
  leverage: number | null;
  emotion: string | null;
};

export type ParseResult = { ok: true; trade: ParsedTrade } | { ok: false; missing: "instrument" | "direction" | "entry" | "size" };

const DIRECTIONS: Record<string, "long" | "short"> = {
  long: "long", лонг: "long", buy: "long", купить: "long", покупка: "long", sotib: "long",
  short: "short", шорт: "short", sell: "short", продать: "short", продажа: "short", sotish: "short",
};

const KEYWORDS: Record<string, "entry" | "stop" | "tp" | "size" | "exit" | "lev"> = {
  entry: "entry", вход: "entry", in: "entry", "@": "entry", kirish: "entry",
  stop: "stop", стоп: "stop", sl: "stop", "стоп-лосс": "stop", стоплосс: "stop",
  tp: "tp", тейк: "tp", take: "tp", "тейк-профит": "tp", тейкпрофит: "tp",
  size: "size", объем: "size", объём: "size", qty: "size", кол: "size", количество: "size", hajm: "size",
  exit: "exit", выход: "exit", close: "exit", закрыл: "exit", закрытие: "exit", chiqish: "exit",
  lev: "lev", leverage: "lev", плечо: "lev", yelka: "lev",
};

const EMOTIONS: Record<string, string> = {
  calm: "calm", спокойствие: "calm", спокоен: "calm", tinch: "calm",
  fear: "fear", страх: "fear", qo: "fear",
  greed: "greed", жадность: "greed",
  fomo: "fomo", фомо: "fomo",
  revenge: "revenge", месть: "revenge", реванш: "revenge",
  confident: "confident", уверенность: "confident", уверен: "confident",
  uncertain: "uncertain", сомнение: "uncertain", неуверенность: "uncertain",
};

const NUMBER = /^\d+(\.\d+)?$/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2") // 65,5 → 65.5
    .replace(/[=:;]/g, " ")
    .replace(/@/g, " @ ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseTradeMessage(text: string): ParseResult {
  const tokens = normalize(text).split(" ").filter(Boolean);
  let instrument: string | null = null;
  let direction: "long" | "short" | null = null;
  const nums: Partial<Record<"entry" | "stop" | "tp" | "size" | "exit" | "lev", number>> = {};
  let emotion: string | null = null;
  const bare: number[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (DIRECTIONS[tk]) {
      direction = DIRECTIONS[tk];
      continue;
    }
    if (EMOTIONS[tk]) {
      emotion = EMOTIONS[tk];
      continue;
    }
    const kw = KEYWORDS[tk];
    if (kw) {
      const next = tokens[i + 1];
      if (next && NUMBER.test(next) && Number(next) > 0) {
        nums[kw] = Number(next);
        i++;
      }
      continue;
    }
    // x10, 10x — плечо
    const lev = /^x(\d{1,3})$|^(\d{1,3})x$/.exec(tk);
    if (lev) {
      nums.lev = Number(lev[1] ?? lev[2]);
      continue;
    }
    if (NUMBER.test(tk)) {
      if (Number(tk) > 0) bare.push(Number(tk));
      continue;
    }
    if (!instrument && /^[a-zа-я0-9._/-]{2,20}$/i.test(tk)) instrument = tk.replace(/\//g, "").toUpperCase();
  }

  // Числа без подписи: первое — цена входа, второе — объём
  for (const n of bare) {
    if (nums.entry === undefined) nums.entry = n;
    else if (nums.size === undefined) nums.size = n;
  }

  if (!instrument) return { ok: false, missing: "instrument" };
  if (!direction) return { ok: false, missing: "direction" };
  if (nums.entry === undefined) return { ok: false, missing: "entry" };
  if (nums.size === undefined) return { ok: false, missing: "size" };

  return {
    ok: true,
    trade: {
      instrument,
      direction,
      entry: nums.entry,
      size: nums.size,
      stop: nums.stop ?? null,
      takeProfit: nums.tp ?? null,
      exit: nums.exit ?? null,
      leverage: nums.lev ?? null,
      emotion,
    },
  };
}

/** Числа из аргумента команды: «5000 1 100 98» или «5000, 1, 100,5». Любой не-числовой кусок → null. */
export function parseNums(arg: string): number[] | null {
  const parts = arg.trim().split(/[\s;]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p.replace(",", "."));
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

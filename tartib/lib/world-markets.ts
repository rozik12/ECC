// Каталог мировых рынков для карточки «Рынки мира»: золото и металлы, нефть и газ, валюты, индексы, облигации, крипто.
// Символы Yahoo Finance. Названия берутся из словаря (worldmarkets.names.<ключ>).
export type WorldGroup = { id: "metals" | "energy" | "forex" | "usindices" | "world" | "rates" | "crypto"; items: { symbol: string; key: string }[] };

export const WORLD_GROUPS: WorldGroup[] = [
  { id: "metals", items: [{ symbol: "GC=F", key: "gold" }, { symbol: "SI=F", key: "silver" }, { symbol: "PL=F", key: "platinum" }, { symbol: "PA=F", key: "palladium" }, { symbol: "HG=F", key: "copper" }] },
  { id: "energy", items: [{ symbol: "CL=F", key: "wti" }, { symbol: "BZ=F", key: "brent" }, { symbol: "NG=F", key: "gas" }] },
  { id: "forex", items: [{ symbol: "EURUSD=X", key: "eurusd" }, { symbol: "GBPUSD=X", key: "gbpusd" }, { symbol: "USDJPY=X", key: "usdjpy" }, { symbol: "USDCHF=X", key: "usdchf" }, { symbol: "AUDUSD=X", key: "audusd" }, { symbol: "USDCAD=X", key: "usdcad" }, { symbol: "USDUZS=X", key: "usduzs" }, { symbol: "DX-Y.NYB", key: "dxy" }] },
  { id: "usindices", items: [{ symbol: "^NDX", key: "ndx" }, { symbol: "^IXIC", key: "ixic" }, { symbol: "^GSPC", key: "gspc" }, { symbol: "^DJI", key: "dji" }, { symbol: "^RUT", key: "rut" }, { symbol: "QQQ", key: "qqq" }, { symbol: "SPY", key: "spy" }, { symbol: "NQ=F", key: "nqf" }, { symbol: "ES=F", key: "esf" }, { symbol: "YM=F", key: "ymf" }] },
  { id: "world", items: [{ symbol: "^GDAXI", key: "dax" }, { symbol: "^FTSE", key: "ftse" }, { symbol: "^FCHI", key: "cac" }, { symbol: "^N225", key: "nikkei" }, { symbol: "^HSI", key: "hsi" }] },
  { id: "rates", items: [{ symbol: "^TNX", key: "tnx" }, { symbol: "^VIX", key: "vix" }] },
  { id: "crypto", items: [{ symbol: "BTC-USD", key: "btc" }, { symbol: "ETH-USD", key: "eth" }] },
];

export const ALL_WORLD_SYMBOLS = WORLD_GROUPS.flatMap((g) => g.items.map((i) => i.symbol));
/** Для этих символов рост не «хорошо» и не «плохо»: цвет не используется. */
export const NEUTRAL_SYMBOLS = new Set(["^VIX", "^TNX", "DX-Y.NYB"]);

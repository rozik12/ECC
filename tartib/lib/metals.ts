// Списки символов для страницы «Золото и металлы» (Yahoo Finance). Лежат отдельно, чтобы их могли читать и сервер, и браузер.
export const METAL_SYMBOLS = ["GC=F", "SI=F", "PL=F", "PA=F", "HG=F"] as const;
export const ETF_SYMBOLS = ["GLD", "IAU", "SLV", "GDX"] as const;
export const MACRO_SYMBOLS = ["DX-Y.NYB", "^TNX", "EURUSD=X", "USDUZS=X"] as const;
export const ALL_METALS_SYMBOLS: string[] = [...METAL_SYMBOLS, ...ETF_SYMBOLS, ...MACRO_SYMBOLS];

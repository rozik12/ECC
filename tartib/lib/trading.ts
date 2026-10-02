export const markets = ["crypto", "forex", "stocks", "futures"] as const;
export const directions = ["long", "short"] as const;
export const emotions = ["calm", "fear", "greed", "fomo", "revenge", "confident", "uncertain", "other"] as const;

export type MarketKey = (typeof markets)[number];
export type DirectionKey = (typeof directions)[number];
export type EmotionKey = (typeof emotions)[number];

"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { CandleView, TimeframeSwitch, useCandles } from "@/components/charts/candles";
import { priceDigits } from "@/components/charts/candles";
import { Button, Card, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { normalizePair, type Timeframe } from "@/lib/market-data";
import { normalizeTicker } from "@/lib/stock-data";
import { LiveBadge } from "@/components/market/LiveBadge";
import { useLiveCrypto, useLiveQuotes } from "@/components/market/useLive";

/** Золото, металлы, нефть, валюты, индексы и акции: символ Yahoo и ключ короткого названия в словаре */
const OTHER = [
  { symbol: "GC=F", key: "gold" }, { symbol: "SI=F", key: "silver" }, { symbol: "CL=F", key: "oil" }, { symbol: "EURUSD=X", key: "eurusd" }, { symbol: "USDJPY=X", key: "usdjpy" },
  { symbol: "^NDX", key: "ndx" }, { symbol: "^GSPC", key: "gspc" }, { symbol: "^DJI", key: "dji" }, { symbol: "AAPL", key: "aapl" }, { symbol: "NVDA", key: "nvda" }, { symbol: "TSLA", key: "tsla" },
];
const QUICK = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "TONUSDT"];

/** Раздел «Графики»: свежие свечи любой криптопары, без привязки к сделке. */
export function MarketChart({ initialPair = "BTCUSDT" }: { initialPair?: string }) {
  const { t, locale } = useI18n();
  const [pair, setPair] = useState(initialPair);
  const [input, setInput] = useState(initialPair);
  const [tf, setTf] = useState<Timeframe>("15m");
  const [refresh, setRefresh] = useState(0);
  const cryptoPair = normalizePair(pair);
  const ticker = cryptoPair ? null : normalizeTicker(pair, "auto");
  const normalized = cryptoPair;
  const supported = cryptoPair !== null || ticker !== null;

  // «live»: последние 120 свечей; «сейчас» берётся в момент запроса, а кнопка «Обновить» повторяет его
  const { candles, error: loadError, source } = useCandles(pair, tf, "live", supported, refresh, "auto");
  const error = loadError ?? (!supported ? "unsupported" : null);

  // Живая цена: у криптопар поток OKX (раз в секунду), у остальных запрос каждые 5 секунд. Последняя свеча подтягивается к ней.
  const crypto = useLiveCrypto(cryptoPair ? [cryptoPair.symbol] : []);
  const other = useLiveQuotes(ticker ? [ticker] : []);
  const livePrice = cryptoPair ? crypto.prices[cryptoPair.symbol]?.last : ticker ? other.quotes[ticker]?.price : undefined;
  const liveDir = cryptoPair ? crypto.prices[cryptoPair.symbol]?.dir : ticker ? other.quotes[ticker]?.dir : 0;
  const liveMode = cryptoPair ? crypto.mode : other.ok ? ("poll" as const) : ("connecting" as const);
  const view = useMemo(() => {
    if (!candles || candles.length === 0 || livePrice === undefined) return candles;
    const tail = candles[candles.length - 1];
    const updated = { ...tail, c: livePrice, h: Math.max(tail.h, livePrice), l: Math.min(tail.l, livePrice) };
    updated.range = [updated.l, updated.h];
    return [...candles.slice(0, -1), updated];
  }, [candles, livePrice]);
  const last = view?.[view.length - 1];
  const first = view?.[0];
  const change = last && first && first.o > 0 ? ((last.c - first.o) / first.o) * 100 : null;
  const apply = (value: string) => {
    setPair(value);
    setInput(value);
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("charts.quick")}>
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              aria-pressed={normalized?.symbol === q}
              onClick={() => apply(q)}
              className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors", normalized?.symbol === q ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-foreground")}
            >
              {q.replace(/USDT$/, "")}
              <span className="text-xs opacity-60">/USDT</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("charts.quickOther")}>
          {OTHER.map((o) => (
            <button
              key={o.symbol}
              type="button"
              aria-pressed={ticker === o.symbol}
              onClick={() => apply(o.symbol)}
              className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors", ticker === o.symbol ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-foreground")}
            >
              {t(`charts.short.${o.key}`)}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPair(input.trim());
          }}
        >
          <div className="flex-1">
            <Input id="chart-pair" label={t("charts.pair")} value={input} maxLength={14} autoComplete="off" autoCapitalize="characters" onChange={(e) => setInput(e.target.value)} hint={t("charts.pairHint")} />
          </div>
          <Button type="submit" variant="secondary" className="mb-[1.375rem]">{t("charts.show")}</Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{normalized ? `${normalized.base}/${normalized.quote}` : ticker ?? (pair || "—")}</h2>
            {last && (
              <p className="mt-0.5 flex items-baseline gap-2 tabular-nums">
                <span key={last.c} className={cn("text-lg font-semibold", liveDir === 1 && "tick-up", liveDir === -1 && "tick-down")}>{formatNumber(last.c, locale, priceDigits(last.c) + 2)}</span>
                {change !== null && <span className={cn("text-sm font-medium", change >= 0 ? "text-success" : "text-danger")}>{change >= 0 ? "+" : ""}{formatNumber(change, locale, 2)}%</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {supported && <LiveBadge mode={liveMode} />}
            <TimeframeSwitch value={tf} onChange={setTf} label={t("chart.timeframe")} />
            <Button type="button" variant="ghost" size="sm" aria-label={t("charts.refresh")} title={t("charts.refresh")} onClick={() => setRefresh((n) => n + 1)}>
              <RefreshCw className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>

        {error ? (
          <div className="space-y-3 py-8 text-center">
            <p className="text-sm text-muted">{t(error === "unsupported" ? "charts.unsupported" : `chart.${error}`)}</p>
            {error === "unavailable" && <Button type="button" variant="secondary" size="sm" onClick={() => setRefresh((n) => n + 1)}>{t("chart.retry")}</Button>}
          </div>
        ) : !candles ? (
          <div className="h-80 animate-pulse rounded-xl bg-surface-muted" aria-label={t("chart.loading")} />
        ) : (
          <>
            <CandleView candles={view ?? candles} tf={tf} height="h-80" label={t("charts.title")} />
            <p className="text-xs text-muted">{t(ticker ? "charts.noteOther" : "charts.note", { source })}</p>
          </>
        )}
      </Card>
    </div>
  );
}

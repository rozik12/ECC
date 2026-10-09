"use client";

import { useCallback, useState } from "react";
import { CandleView, TimeframeSwitch, useCandles, type Level } from "@/components/charts/candles";
import { Button, Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { normalizePair, type Timeframe } from "@/lib/market-data";

type Props = { instrument: string; tradedAt: string; direction: "long" | "short"; entry: number; exit: number | null; stop: number | null; takeProfit: number | null };

/** График цены вокруг сделки со входом, стопом, целью и выходом. Данные: OKX, Kraken, Coinbase или Binance, без ключей. */
export function TradeChart({ instrument, tradedAt, entry, exit, stop, takeProfit }: Props) {
  const { t } = useI18n();
  const supported = normalizePair(instrument) !== null;
  const [tf, setTf] = useState<Timeframe>("1h");
  const [attempt, setAttempt] = useState(0);
  const [hidden, setHidden] = useState(0);
  const onHidden = useCallback((n: number) => setHidden(n), []);
  const { candles, error: loadError, source } = useCandles(instrument, tf, tradedAt, supported, attempt);
  const error = loadError ?? (!supported ? "unsupported" : null);

  const levels: Level[] = [
    { id: "entry", price: entry, color: "var(--primary)" },
    ...(stop !== null ? [{ id: "stop" as const, price: stop, color: "var(--danger)", dash: "4 4" }] : []),
    ...(takeProfit !== null ? [{ id: "tp" as const, price: takeProfit, color: "var(--success)", dash: "4 4" }] : []),
    ...(exit !== null ? [{ id: "exit" as const, price: exit, color: "var(--muted)", dash: "2 4" }] : []),
  ];

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t("chart.title")}</h2>
        {supported && <TimeframeSwitch value={tf} onChange={setTf} label={t("chart.timeframe")} />}
      </div>

      {error ? (
        <div className="space-y-3 py-6 text-center">
          <p className="text-sm text-muted">{t(`chart.${error}`)}</p>
          {error === "unavailable" && <Button type="button" variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>{t("chart.retry")}</Button>}
        </div>
      ) : !candles ? (
        <div className="h-72 animate-pulse rounded-xl bg-surface-muted" aria-label={t("chart.loading")} />
      ) : (
        <>
          <CandleView candles={candles} tf={tf} levels={levels} markAt={new Date(tradedAt).getTime()} label={t("chart.title")} onHidden={onHidden} />
          {hidden > 0 && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm">{t("chart.offChart")}</p>}
          <p className="text-xs text-muted">{t("chart.note", { symbol: normalizePair(instrument)?.symbol ?? instrument, source })}</p>
        </>
      )}
    </Card>
  );
}

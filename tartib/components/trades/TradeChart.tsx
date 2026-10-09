"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { normalizePair, TIMEFRAMES, type Timeframe } from "@/lib/market-data";

type Datum = { t: number; o: number; h: number; l: number; c: number; v: number; range: [number, number] };
type Loaded = { key: string; candles: Datum[]; source: string } | { key: string; error: "unsupported" | "no_data" | "unavailable" };

/** Сколько знаков после запятой показывать у цены: у дорогих активов меньше, у дешёвых больше. */
const priceDigits = (v: number) => (Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 10 ? 2 : Math.abs(v) >= 1 ? 3 : 6);

type ShapeProps = { x?: number; y?: number; width?: number; height?: number; payload?: Datum };

/** Свеча: тонкая линия от минимума до максимума и тело от открытия до закрытия. */
function Candle({ x = 0, y = 0, width = 0, height = 0, payload }: ShapeProps) {
  if (!payload) return null;
  const { o, h, l, c } = payload;
  const color = c >= o ? "var(--success)" : "var(--danger)";
  const span = h - l;
  const py = (v: number) => (span === 0 ? y : y + ((h - v) / span) * height);
  const top = py(Math.max(o, c));
  const bottom = py(Math.min(o, c));
  const cx = x + width / 2;
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1.5} />
      <rect x={x + width * 0.15} y={top} width={Math.max(1, width * 0.7)} height={Math.max(1.5, bottom - top)} fill={color} />
    </g>
  );
}

type Props = { instrument: string; tradedAt: string; direction: "long" | "short"; entry: number; exit: number | null; stop: number | null; takeProfit: number | null };

/** График цены вокруг сделки со входом, стопом, целью и выходом. Данные: Binance или OKX, без ключей. */
export function TradeChart({ instrument, tradedAt, entry, exit, stop, takeProfit }: Props) {
  const { t, locale } = useI18n();
  const supported = normalizePair(instrument) !== null;
  const [tf, setTf] = useState<Timeframe>("1h");
  const key = `${instrument}|${tradedAt}|${tf}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!supported) return;
    const ctrl = new AbortController();
    fetch(`/api/market/candles?${new URLSearchParams({ instrument, tf, at: tradedAt })}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (res.ok) {
          const body = (await res.json()) as { source: string; candles: number[][] };
          const candles = body.candles.map(([ts, o, h, l, c, v]) => ({ t: ts, o, h, l, c, v, range: [l, h] as [number, number] }));
          setLoaded({ key, candles, source: body.source });
        } else {
          const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
          setLoaded({ key, error: code === "unsupported" ? "unsupported" : code === "no_data" ? "no_data" : "unavailable" });
        }
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setLoaded({ key, error: "unavailable" });
      });
    return () => ctrl.abort();
  }, [key, supported, instrument, tf, tradedAt]);

  const ready = loaded && loaded.key === key ? loaded : null;
  const candles = ready && "candles" in ready ? ready.candles : null;
  const error = ready && "error" in ready ? ready.error : !supported ? "unsupported" : null;
  const at = new Date(tradedAt).getTime();
  const entryCandle = candles?.find((c) => c.t <= at && at < c.t + TIMEFRAMES[tf])?.t;
  const intl = { ru: "ru-RU", uz: "uz-UZ", en: "en-US" }[locale];

  const levels = useMemo(
    () =>
      [
        { id: "entry", price: entry, color: "var(--primary)", dash: undefined as string | undefined },
        stop !== null ? { id: "stop", price: stop, color: "var(--danger)", dash: "4 4" } : null,
        takeProfit !== null ? { id: "tp", price: takeProfit, color: "var(--success)", dash: "4 4" } : null,
        exit !== null ? { id: "exit", price: exit, color: "var(--muted)", dash: "2 4" } : null,
      ].filter((x): x is NonNullable<typeof x> => x !== null),
    [entry, stop, takeProfit, exit],
  );
  // Уровни далеко от рынка (опечатка в цене, не тот инструмент или время) не растягивают график, а помечаются подсказкой
  const view = useMemo(() => {
    if (!candles || candles.length === 0) return null;
    const lo = Math.min(...candles.map((c) => c.l));
    const hi = Math.max(...candles.map((c) => c.h));
    const pad = Math.max((hi - lo) * 0.5, hi * 0.02);
    const near = (p: number) => p >= lo - pad && p <= hi + pad;
    const shown = levels.filter((l) => near(l.price));
    const prices = [lo, hi, ...shown.map((l) => l.price)];
    const span = Math.max(...prices) - Math.min(...prices);
    return { shown, off: levels.length - shown.length, domain: [Math.min(...prices) - span * 0.04, Math.max(...prices) + span * 0.04] as [number, number] };
  }, [candles, levels]);
  const fmtTime = (ts: number) => new Intl.DateTimeFormat(intl, tf === "1d" ? { day: "2-digit", month: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ts));

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t("chart.title")}</h2>
        {supported && (
          <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label={t("chart.timeframe")}>
            {(Object.keys(TIMEFRAMES) as Timeframe[]).map((x) => (
              <button key={x} type="button" aria-pressed={x === tf} onClick={() => setTf(x)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", x === tf ? "bg-primary-soft text-primary" : "text-muted hover:text-foreground")}>{x}</button>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <p className="py-6 text-center text-sm text-muted">{t(`chart.${error}`)}</p>
      ) : !candles ? (
        <div className="h-72 animate-pulse rounded-xl bg-surface-muted" aria-label={t("chart.loading")} />
      ) : (
        <>
          <div className="h-72 w-full" role="img" aria-label={t("chart.title")}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={candles} margin={{ top: 8, right: 56, bottom: 0, left: 0 }} barCategoryGap="20%">
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="t" tickFormatter={fmtTime} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={48} />
                <YAxis orientation="right" domain={view?.domain ?? ["auto", "auto"]} allowDataOverflow tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => formatNumber(v, locale, priceDigits(v))} />
                <Tooltip
                  cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as Datum;
                    return (
                      <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md">
                        <p className="font-medium">{fmtTime(d.t)}</p>
                        <p className="text-muted">O {formatNumber(d.o, locale, 8)} · H {formatNumber(d.h, locale, 8)}</p>
                        <p className="text-muted">L {formatNumber(d.l, locale, 8)} · C {formatNumber(d.c, locale, 8)}</p>
                      </div>
                    );
                  }}
                />
                {(view?.shown ?? levels).map((lv) => (
                  <ReferenceLine key={lv.id} y={lv.price} stroke={lv.color} strokeDasharray={lv.dash} ifOverflow="hidden" label={{ value: t(`chart.${lv.id}`), position: "right", fill: lv.color, fontSize: 11 }} />
                ))}
                {entryCandle !== undefined && <ReferenceLine x={entryCandle} stroke="var(--primary)" strokeDasharray="2 4" />}
                <Bar dataKey="range" shape={<Candle />} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {view && view.off > 0 && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm">{t("chart.offChart")}</p>}
          <p className="text-xs text-muted">{t("chart.note", { symbol: normalizePair(instrument)?.symbol ?? instrument, source: ready && "source" in ready ? ready.source : "" })}</p>
        </>
      )}
    </Card>
  );
}

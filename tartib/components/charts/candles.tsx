"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { TIMEFRAMES, type Timeframe } from "@/lib/market-data";

export type Datum = { t: number; o: number; h: number; l: number; c: number; v: number; range: [number, number] };
export type ChartError = "unsupported" | "no_data" | "unavailable";
export type Level = { id: "entry" | "stop" | "tp" | "exit"; price: number; color: string; dash?: string };

type Loaded = { key: string; candles: Datum[]; source: string } | { key: string; error: ChartError };

export const SOURCE_NAME: Record<string, string> = { okx: "OKX", kraken: "Kraken", coinbase: "Coinbase", binance: "Binance" };

/** Сколько знаков после запятой показывать у цены: у дорогих активов меньше, у дешёвых больше. */
export const priceDigits = (v: number) => (Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 10 ? 2 : Math.abs(v) >= 1 ? 3 : 6);

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

/**
 * Загружает свечи через наш API. `at` — время, вокруг которого строится окно (40 свечей до него и до 80 после, но не позже «сейчас»).
 * "live" — последние 120 свечей до текущего момента (время берётся в момент запроса).
 * Результат относится к своему ключу, поэтому при смене пары или масштаба старые данные не показываются.
 */
export function useCandles(instrument: string, tf: Timeframe, at: string | "live", enabled: boolean, attempt = 0) {
  const key = `${instrument}|${at}|${tf}|${attempt}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    const when = at === "live" ? new Date(Date.now() - 80 * TIMEFRAMES[tf]).toISOString() : at;
    fetch(`/api/market/candles?${new URLSearchParams({ instrument, tf, at: when })}`, { signal: ctrl.signal })
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
  }, [key, enabled, instrument, tf, at]);

  const ready = loaded && loaded.key === key ? loaded : null;
  return {
    candles: ready && "candles" in ready ? ready.candles : null,
    error: ready && "error" in ready ? ready.error : null,
    source: ready && "source" in ready ? (SOURCE_NAME[ready.source] ?? ready.source) : "",
  };
}

type ViewProps = { candles: Datum[]; tf: Timeframe; levels?: Level[]; markAt?: number; height?: string; label: string };

/** Свечной график. Уровни (вход, стоп, цель, выход) далеко от рынка не растягивают график: о них сообщает onOff через число скрытых. */
export function CandleView({ candles, tf, levels = [], markAt, height = "h-72", label, onHidden }: ViewProps & { onHidden?: (n: number) => void }) {
  const { t, locale } = useI18n();
  const intl = { ru: "ru-RU", uz: "uz-UZ", en: "en-US" }[locale];
  const view = useMemo(() => {
    const lo = Math.min(...candles.map((c) => c.l));
    const hi = Math.max(...candles.map((c) => c.h));
    const pad = Math.max((hi - lo) * 0.5, hi * 0.02);
    const shown = levels.filter((l) => l.price >= lo - pad && l.price <= hi + pad);
    const prices = [lo, hi, ...shown.map((l) => l.price)];
    const span = Math.max(...prices) - Math.min(...prices);
    return { shown, hidden: levels.length - shown.length, domain: [Math.min(...prices) - span * 0.04, Math.max(...prices) + span * 0.04] as [number, number] };
  }, [candles, levels]);

  useEffect(() => {
    onHidden?.(view.hidden);
  }, [view.hidden, onHidden]);

  const markCandle = markAt === undefined ? undefined : candles.find((c) => c.t <= markAt && markAt < c.t + TIMEFRAMES[tf])?.t;
  const fmtTime = (ts: number) =>
    new Intl.DateTimeFormat(intl, tf === "1d" ? { day: "2-digit", month: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ts));

  return (
    <div className={`${height} w-full`} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={candles} margin={{ top: 8, right: 56, bottom: 0, left: 0 }} barCategoryGap="20%">
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="t" tickFormatter={fmtTime} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={48} />
          <YAxis orientation="right" domain={view.domain} allowDataOverflow tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => formatNumber(v, locale, priceDigits(v))} />
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
          {view.shown.map((lv) => (
            <ReferenceLine key={lv.id} y={lv.price} stroke={lv.color} strokeDasharray={lv.dash} ifOverflow="hidden" label={{ value: t(`chart.${lv.id}`), position: "right", fill: lv.color, fontSize: 11 }} />
          ))}
          {markCandle !== undefined && <ReferenceLine x={markCandle} stroke="var(--primary)" strokeDasharray="2 4" />}
          <Bar dataKey="range" shape={<Candle />} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Кнопки выбора масштаба свечей. */
export function TimeframeSwitch({ value, onChange, label }: { value: Timeframe; onChange: (tf: Timeframe) => void; label: string }) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label={label}>
      {(Object.keys(TIMEFRAMES) as Timeframe[]).map((x) => (
        <button
          key={x}
          type="button"
          aria-pressed={x === value}
          onClick={() => onChange(x)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${x === value ? "bg-primary-soft text-primary" : "text-muted hover:text-foreground"}`}
        >
          {x}
        </button>
      ))}
    </div>
  );
}

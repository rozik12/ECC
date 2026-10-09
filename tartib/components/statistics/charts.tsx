"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatCompact, formatMoney, formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/provider";

/** Подписи осей: обычные числа, а миллионы сокращаются. */
const axisNumber = (v: number, locale: Locale) =>
  Math.abs(v) >= 1_000_000 ? formatCompact(v, locale) : formatNumber(v, locale, 0);

const axisTick = { fill: "var(--muted)", fontSize: 12 };
const gridStroke = "var(--border)";

function TooltipBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{title}</p>
      {lines.map((l) => (
        <p key={l} className="text-muted">{l}</p>
      ))}
    </div>
  );
}

function EmptyChart() {
  const { t } = useI18n();
  return <p className="py-10 text-center text-sm text-muted">{t("stats.charts.noData")}</p>;
}

export type EquityPointView = { ts: number; balance: number };

/** Кривая депозита. Одна линия — легенда не нужна, название графика задаёт заголовок карточки. */
export function EquityChart({ data, currency }: { data: EquityPointView[]; currency: string }) {
  const { t, locale } = useI18n();
  if (data.length === 0) return <EmptyChart />;
  const dateFmt = new Intl.DateTimeFormat(locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "2-digit" });
  const dateTimeFmt = new Intl.DateTimeFormat(locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="h-64 w-full" role="img" aria-label={t("stats.charts.equity")}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} tick={axisTick} tickLine={false}
            axisLine={{ stroke: gridStroke }} tickFormatter={(v: number) => dateFmt.format(new Date(v))} minTickGap={32} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} domain={["auto", "auto"]}
            tickFormatter={(v: number) => axisNumber(v, locale)} />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as EquityPointView;
              return <TooltipBox title={dateTimeFmt.format(new Date(p.ts))} lines={[`${t("stats.charts.balance")}: ${formatMoney(p.balance, currency, locale)}`]} />;
            }}
          />
          <Line type="linear" dataKey="balance" stroke="var(--primary)" strokeWidth={2} dot={data.length <= 40 ? { r: 3, fill: "var(--primary)", stroke: "var(--surface)", strokeWidth: 2 } : false}
            activeDot={{ r: 5, fill: "var(--primary)", stroke: "var(--surface)", strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export type BarView = { name: string; value: number; count?: number };

/**
 * Столбцы P&L: зелёные — прибыль, красные — убыток (знак читается и по оси, и в подсказке).
 * layout="rows" — горизонтальные полосы (категории слева), "columns" — вертикальные столбцы.
 */
export function PnlBars({ data, currency, layout = "columns", label }: { data: BarView[]; currency: string; layout?: "rows" | "columns"; label: string }) {
  const { t, locale } = useI18n();
  if (data.length === 0) return <EmptyChart />;
  const rows = layout === "rows";
  const height = rows ? Math.max(120, data.length * 40 + 24) : 240;

  const tooltip = (
    <Tooltip
      cursor={{ fill: "var(--surface-muted)", opacity: 0.6 }}
      content={({ active, payload }) => {
        if (!active || !payload?.length) return null;
        const p = payload[0].payload as BarView;
        const lines = [`${t("stats.charts.pnl")}: ${formatMoney(p.value, currency, locale, true)}`];
        if (p.count !== undefined) lines.push(t("stats.charts.tradesCount", { n: p.count }));
        return <TooltipBox title={p.name} lines={lines} />;
      }}
    />
  );
  const cells = data.map((d) => <Cell key={d.name} fill={d.value >= 0 ? "var(--success)" : "var(--danger)"} />);

  return (
    <div className="w-full" style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {rows ? (
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap={10}>
            <CartesianGrid stroke={gridStroke} horizontal={false} />
            <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => axisNumber(v, locale)} />
            <YAxis type="category" dataKey="name" tick={axisTick} tickLine={false} axisLine={false} width={112} />
            <ReferenceLine x={0} stroke="var(--muted)" />
            {tooltip}
            <Bar dataKey="value" radius={4} maxBarSize={22}>{cells}</Bar>
          </BarChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={gridStroke} vertical={false} />
            <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={{ stroke: gridStroke }} minTickGap={12} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => axisNumber(v, locale)} />
            <ReferenceLine y={0} stroke="var(--muted)" />
            {tooltip}
            <Bar dataKey="value" radius={4} maxBarSize={28}>{cells}</Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export type CountBarView = { name: string; count: number; tone: "bad" | "good" | "neutral" };

/** Столбцы с количеством сделок (например, распределение результатов в R). */
export function CountBars({ data, label }: { data: CountBarView[]; label: string }) {
  const { t, locale } = useI18n();
  if (data.every((d) => d.count === 0)) return <EmptyChart />;
  const fill = { bad: "var(--danger)", good: "var(--success)", neutral: "var(--muted)" } as const;
  return (
    <div className="h-56 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={{ stroke: gridStroke }} interval={0} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} allowDecimals={false} tickFormatter={(v: number) => formatNumber(v, locale, 0)} />
          <Tooltip
            cursor={{ fill: "var(--surface-muted)", opacity: 0.6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as CountBarView;
              return <TooltipBox title={p.name} lines={[t("stats.charts.tradesCount", { n: p.count })]} />;
            }}
          />
          <Bar dataKey="count" radius={4} maxBarSize={36}>
            {data.map((d) => <Cell key={d.name} fill={fill[d.tone]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type DrawdownView = { ts: number; drawdown: number; percent: number };

/** Просадка от максимума баланса: чем ниже, тем глубже. */
export function DrawdownChart({ data, currency, label }: { data: DrawdownView[]; currency: string; label: string }) {
  const { locale } = useI18n();
  if (data.length < 2) return <EmptyChart />;
  const intl = locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US";
  const dateFmt = new Intl.DateTimeFormat(intl, { day: "2-digit", month: "2-digit" });
  const dateTimeFmt = new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="h-56 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} tick={axisTick} tickLine={false} axisLine={{ stroke: gridStroke }}
            tickFormatter={(v: number) => dateFmt.format(new Date(v))} minTickGap={32} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} domain={["auto", 0]} tickFormatter={(v: number) => axisNumber(v, locale)} />
          <ReferenceLine y={0} stroke="var(--muted)" />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as DrawdownView;
              return <TooltipBox title={dateTimeFmt.format(new Date(p.ts))} lines={[`${formatMoney(p.drawdown, currency, locale)} (${formatNumber(p.percent, locale, 1)}%)`]} />;
            }}
          />
          <Area type="linear" dataKey="drawdown" stroke="var(--danger)" strokeWidth={2} fill="var(--danger)" fillOpacity={0.15} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

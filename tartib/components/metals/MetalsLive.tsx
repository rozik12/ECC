"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui";
import { useLiveQuotes } from "@/components/market/useLive";
import { cn } from "@/lib/cn";
import { formatNumber, pnlTone } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { ALL_METALS_SYMBOLS, ETF_SYMBOLS, METAL_SYMBOLS } from "@/lib/metals";
import { TROY_OZ_GRAMS } from "@/lib/tools";

export type MetalQuote = { symbol: string; price: number; changePct: number };
const CURRENCIES = ["USD", "EUR", "UZS"] as const;

/** Золото и металлы: цены обновляются сами, пересчёт в граммы и килограммы, выбор валюты, отношение золото/серебро. */
export function MetalsLive({ initial, names }: { initial: MetalQuote[]; names: Record<string, string> }) {
  const { t, locale } = useI18n();
  const [cur, setCur] = useState<(typeof CURRENCIES)[number]>("USD");
  const { quotes, ok } = useLiveQuotes(ALL_METALS_SYMBOLS, Object.fromEntries(initial.map((q) => [q.symbol, q])));
  const eur = quotes["EURUSD=X"]?.price;
  const uzs = quotes["USDUZS=X"]?.price;
  // Курс: сколько выбранной валюты за 1 доллар
  const rate = cur === "USD" ? 1 : cur === "EUR" ? (eur ? 1 / eur : null) : (uzs ?? null);
  const fmt = (v: number, d = 2) => formatNumber(v, locale, d);
  const gold = quotes["GC=F"]?.price;
  const silver = quotes["SI=F"]?.price;
  const platinum = quotes["PL=F"]?.price;
  const ratio = gold && silver ? gold / silver : null;
  const goldPlat = gold && platinum ? gold / platinum : null;
  const money = (usd: number, d = 2) => (rate === null ? t("worldmarkets.none") : `${fmt(usd * rate, cur === "UZS" ? 0 : d)} ${cur}`);

  return (
    <div className="space-y-6">
      <p className="flex items-center gap-2 text-xs text-muted" role="status">
        <span className={cn("inline-block h-2 w-2 rounded-full", ok ? "bg-success" : "bg-warning")} aria-hidden />
        {ok ? t("live.every15") : t("live.paused")}
      </p>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("metals.currency")}>
        <span className="text-sm text-muted">{t("metals.currency")}:</span>
        {CURRENCIES.map((c) => (
          <button key={c} type="button" onClick={() => setCur(c)} aria-pressed={cur === c}
            className={cn("rounded-lg border px-3 py-1.5 text-sm", cur === c ? "border-primary bg-primary/10 font-semibold" : "border-border text-muted hover:text-foreground")}>{c}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {METAL_SYMBOLS.map((s) => {
          const q = quotes[s];
          const pound = s === "HG=F"; // медь котируется в долларах за фунт
          const perOz = q ? q.price : null;
          return (
            <Card key={s} className="min-w-0 space-y-3 p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/charts?pair=${encodeURIComponent(s)}`} className="font-semibold hover:underline">{names[s]}</Link>
                {q ? <span className={cn("text-sm font-medium tabular-nums", pnlTone(q.changePct))}>{q.changePct > 0 ? "+" : ""}{fmt(q.changePct)}%</span> : null}
              </div>
              {q && perOz !== null ? (
                <>
                  <p className="text-2xl font-bold tabular-nums"><span key={q.price} className={q.dir > 0 ? "tick-up" : q.dir < 0 ? "tick-down" : ""}>{fmt(q.price, q.price >= 10 ? 2 : 4)}</span> <span className="text-sm font-normal text-muted">{pound ? t("metals.perLb") : t("metals.perOz")}</span></p>
                  {pound ? (
                    <p className="text-sm text-muted tabular-nums">{t("metals.perKg")}: {money(q.price / 0.45359237)}</p>
                  ) : (
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm tabular-nums">
                      <dt className="text-muted">{t("metals.perGram")}</dt><dd className="text-right">{money(perOz / TROY_OZ_GRAMS)}</dd>
                      <dt className="text-muted">{t("metals.perKg")}</dt><dd className="text-right">{money((perOz / TROY_OZ_GRAMS) * 1000, 0)}</dd>
                    </dl>
                  )}
                </>
              ) : <p className="text-muted">{t("worldmarkets.none")}</p>}
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="min-w-0 space-y-2 p-4 sm:p-5">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted">{t("metals.ratios")}</h3>
          <dl className="space-y-1 text-sm tabular-nums">
            <div className="flex justify-between gap-3"><dt>{t("metals.goldSilver")}</dt><dd className="font-semibold">{ratio ? fmt(ratio, 1) : t("worldmarkets.none")}</dd></div>
            <div className="flex justify-between gap-3"><dt>{t("metals.goldPlatinum")}</dt><dd className="font-semibold">{goldPlat ? fmt(goldPlat, 2) : t("worldmarkets.none")}</dd></div>
          </dl>
          <p className="text-xs text-muted">{t("metals.ratioNote")}</p>
        </Card>
        <Card className="min-w-0 space-y-1 p-4 sm:p-5">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted">{t("metals.influence")}</h3>
          <ul className="divide-y divide-border">
            {(["DX-Y.NYB", "^TNX", "EURUSD=X", "USDUZS=X"] as const).map((s) => {
              const q = quotes[s];
              return (
                <li key={s} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/charts?pair=${encodeURIComponent(s)}`} className="min-w-0 truncate hover:underline">{names[s]}</Link>
                  {q ? <span className="flex shrink-0 gap-3 tabular-nums"><span>{fmt(q.price, 4)}</span><span className="w-16 text-right text-muted">{q.changePct > 0 ? "+" : ""}{fmt(q.changePct)}%</span></span> : <span className="text-muted">{t("worldmarkets.none")}</span>}
                </li>
              );
            })}
          </ul>
          <p className="pt-1 text-xs text-muted">{t("metals.influenceNote")}</p>
        </Card>
      </div>

      <Card className="min-w-0 space-y-1 p-4 sm:p-5">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted">{t("metals.etfs")}</h3>
        <ul className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 sm:gap-x-6">
          {ETF_SYMBOLS.map((s) => {
            const q = quotes[s];
            return (
              <li key={s} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link href={`/charts?pair=${encodeURIComponent(s)}`} className="min-w-0 truncate hover:underline">{names[s]}</Link>
                {q ? <span className="flex shrink-0 gap-3 tabular-nums"><span>{fmt(q.price)}</span><span className={cn("w-16 text-right font-medium", pnlTone(q.changePct))}>{q.changePct > 0 ? "+" : ""}{fmt(q.changePct)}%</span></span> : <span className="text-muted">{t("worldmarkets.none")}</span>}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

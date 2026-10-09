"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { addWatchAction, removeWatchAction } from "@/app/actions/market";
import { Alert, Button, Card, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

type Prices = Record<string, { last: number; change: number }>;
const digits = (v: number) => (v >= 1000 ? 0 : v >= 10 ? 2 : v >= 1 ? 3 : 6);

/** Список наблюдения: цены обновляются раз в 30 секунд, пока страница открыта. */
export function WatchlistCard({ symbols }: { symbols: string[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [prices, setPrices] = useState<Prices>({});
  const [failed, setFailed] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const key = symbols.join(",");

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const load = () =>
      fetch(`/api/market/prices?symbols=${key}`, { signal: ctrl.signal })
        .then(async (r) => {
          if (!r.ok) return setFailed(true);
          setPrices(((await r.json()) as { prices: Prices }).prices);
          setFailed(false);
        })
        .catch(() => {});
    void load();
    const id = setInterval(() => document.visibilityState === "visible" && void load(), 30_000);
    return () => {
      ctrl.abort();
      clearInterval(id);
    };
  }, [key]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "errors.generic");
      else {
        setInput("");
        router.refresh();
      }
    });
  };

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">{t("market.watch.title")}</h2>
      {error && <Alert tone="danger">{t(error)}</Alert>}
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (input.trim()) run(() => addWatchAction(input)); }}>
        <div className="flex-1"><Input id="watch-add" label={t("market.watch.add")} placeholder="ETH, SOLUSDT" value={input} maxLength={30} autoComplete="off" onChange={(e) => setInput(e.target.value)} /></div>
        <Button type="submit" variant="secondary" disabled={pending || !input.trim()} className="mb-[1.375rem]">{t("market.watch.addButton")}</Button>
      </form>
      {symbols.length === 0 ? (
        <p className="text-sm text-muted">{t("market.watch.empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {symbols.map((s) => {
            const p = prices[s];
            return (
              <li key={s} className="flex items-center gap-3 py-2">
                <Link href={`/charts?pair=${s}`} className="min-w-0 flex-1 text-sm font-medium hover:text-primary">{s}</Link>
                {p ? (
                  <span className="flex items-baseline gap-3 tabular-nums">
                    <span className="text-sm">{formatNumber(p.last, locale, digits(p.last))}</span>
                    <span className={cn("w-16 text-right text-sm font-semibold", p.change >= 0 ? "text-success" : "text-danger")}>{p.change >= 0 ? "+" : ""}{formatNumber(p.change, locale, 2)}%</span>
                  </span>
                ) : (
                  <span className="text-sm text-muted">{failed ? t("market.watch.noPrice") : "…"}</span>
                )}
                <button type="button" aria-label={t("market.watch.remove", { symbol: s })} title={t("market.watch.remove", { symbol: s })} disabled={pending} onClick={() => run(() => removeWatchAction(s))} className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-danger">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

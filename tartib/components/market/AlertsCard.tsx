"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createAlertAction, deleteAlertAction } from "@/app/actions/market";
import { Alert, Button, Card, Input, Select } from "@/components/ui";
import { formatNumber, parseNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

export type AlertView = { id: string; symbol: string; direction: "above" | "below"; price: number; note: string; active: boolean; triggeredAt: string | null; triggeredPrice: number | null };

/** Ценовые алерты: когда цена достигнет уровня, придёт уведомление на сайте и в Telegram. */
export function AlertsCard({ alerts }: { alerts: AlertView[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [price, setPrice] = useState("");
  const [direction, setDirection] = useState<"auto" | "above" | "below">("auto");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const value = parseNumber(price);
  const active = alerts.filter((a) => a.active);
  const done = alerts.filter((a) => !a.active).slice(0, 5);
  const fmt = (n: number) => formatNumber(n, locale, n >= 1000 ? 2 : n >= 1 ? 4 : 8);
  const dir = (d: "above" | "below") => t(d === "above" ? "market.alerts.aboveShort" : "market.alerts.belowShort");

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{t("market.alerts.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("market.alerts.subtitle")}</p>
      </div>
      {error && <Alert tone="danger">{t(error)}</Alert>}
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_9rem]"
        onSubmit={(e) => {
          e.preventDefault();
          if (value === null) return;
          setError(null);
          startTransition(async () => {
            const r = await createAlertAction({ symbol, price: value, direction, note });
            if (!r.ok) return setError(r.error);
            setPrice("");
            setNote("");
            router.refresh();
          });
        }}
      >
        <Input id="alert-symbol" label={t("market.alerts.symbol")} value={symbol} maxLength={30} autoComplete="off" onChange={(e) => setSymbol(e.target.value)} />
        <Input id="alert-price" label={t("market.alerts.price")} inputMode="decimal" value={price} autoComplete="off" onChange={(e) => setPrice(e.target.value)} />
        <Select id="alert-direction" label={t("market.alerts.direction")} value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
          <option value="auto">{t("market.alerts.auto")}</option>
          <option value="above">{t("market.alerts.above")}</option>
          <option value="below">{t("market.alerts.below")}</option>
        </Select>
        <div className="sm:col-span-3"><Input id="alert-note" label={t("market.alerts.note")} value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="sm:col-span-3"><Button type="submit" disabled={pending || value === null || value <= 0 || !symbol.trim()}>{t("market.alerts.create")}</Button></div>
      </form>

      {active.length === 0 ? (
        <p className="text-sm text-muted">{t("market.alerts.empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {active.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 text-sm"><span className="font-medium">{a.symbol}</span> {dir(a.direction)} <span className="font-semibold tabular-nums">{fmt(a.price)}</span>{a.note && <span className="block truncate text-xs text-muted">{a.note}</span>}</span>
              <button type="button" aria-label={t("market.alerts.delete")} title={t("market.alerts.delete")} disabled={pending} onClick={() => startTransition(async () => { await deleteAlertAction(a.id); router.refresh(); })} className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-danger">
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium text-muted">{t("market.alerts.triggered")}</h3>
          <ul className="space-y-1 text-sm text-muted">
            {done.map((a) => (
              <li key={a.id}>{a.symbol} {dir(a.direction)} {fmt(a.price)}{a.triggeredPrice !== null && ` (${fmt(a.triggeredPrice)})`}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

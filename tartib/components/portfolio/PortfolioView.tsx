"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { addLotAction, deleteLotAction } from "@/app/actions/portfolio";
import { LiveBadge } from "@/components/market/LiveBadge";
import { useLiveCrypto } from "@/components/market/useLive";
import { Alert, Button, Card, Input, Select, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { cn } from "@/lib/cn";
import { dateFormat, formatNumber, parseNumber, pnlTone } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { isStable, positions, valuate } from "@/lib/portfolio";

export type LotView = { id: string; symbol: string; side: "buy" | "sell"; amount: number; price: number; fee: number; note: string; occurredAt: string };

const digits = (v: number) => (v >= 1000 ? 2 : v >= 1 ? 4 : 6);

/** Портфель: позиции с живыми ценами, итоги, форма записи покупки или продажи и история. */
export function PortfolioView({ lots, initialPrices }: { lots: LotView[]; initialPrices: Record<string, { last: number; change: number }> }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ symbol: "", side: "buy", amount: "", price: "", fee: "", note: "" });

  const pos = useMemo(() => positions(lots), [lots]);
  const pairs = useMemo(() => pos.filter((p) => p.amount > 0 && !isStable(p.symbol)).map((p) => `${p.symbol}USDT`), [pos]);
  const { prices: live, mode } = useLiveCrypto(pairs, initialPrices);
  const priceBySymbol = useMemo(() => Object.fromEntries(Object.entries(live).map(([k, v]) => [k.replace(/USDT$/, ""), v.last])), [live]);
  const v = useMemo(() => valuate(pos, priceBySymbol), [pos, priceBySymbol]);
  const num = (x: number, d = 2) => formatNumber(x, locale, d);
  const signed = (x: number, d = 2) => `${x > 0 ? "+" : ""}${num(x, d)}`;
  const day = dateFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await addLotAction({ symbol: form.symbol, side: form.side, amount: parseNumber(form.amount), price: parseNumber(form.price), fee: parseNumber(form.fee) ?? 0, note: form.note });
      if (!r.ok) return setError(r.error ?? "errors.generic");
      setForm({ symbol: "", side: form.side, amount: "", price: "", fee: "", note: "" });
      router.refresh();
    });
  };

  const open = v.rows.filter((r) => r.amount > 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [t("portfolio.value"), num(v.totalValue), ""],
          [t("portfolio.invested"), num(v.totalCost), ""],
          [t("portfolio.unrealized"), signed(v.totalUnrealized), pnlTone(v.totalUnrealized)],
          [t("portfolio.realized"), signed(v.totalRealized), pnlTone(v.totalRealized)],
        ].map(([label, value, tone]) => (
          <Card key={label} className="p-4 sm:p-4">
            <p className="text-sm text-muted">{label}</p>
            <p className={cn("mt-1 text-xl font-bold tabular-nums", tone)}>{value} <span className="text-xs font-normal text-muted">USDT</span></p>
          </Card>
        ))}
      </div>

      <Card className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">{t("portfolio.positions")}</h2>
          {pairs.length > 0 && <LiveBadge mode={mode} />}
        </div>
        {open.length === 0 ? (
          <p className="text-sm text-muted">{t("portfolio.empty")}</p>
        ) : (
          <Table>
            <THead>
              <Tr><Th>{t("portfolio.coin")}</Th><Th>{t("portfolio.amount")}</Th><Th>{t("portfolio.avg")}</Th><Th>{t("portfolio.price")}</Th><Th>{t("portfolio.valueCol")}</Th><Th>{t("portfolio.pnl")}</Th><Th>{t("portfolio.share")}</Th></Tr>
            </THead>
            <TBody>
              {open.map((r) => (
                <Tr key={r.symbol}>
                  <Td label={t("portfolio.coin")} className="font-medium">{r.symbol}{r.oversold && <span className="ml-2 text-xs text-warning" title={t("portfolio.oversold")}>⚠</span>}</Td>
                  <Td label={t("portfolio.amount")} className="tabular-nums">{num(r.amount, 8)}</Td>
                  <Td label={t("portfolio.avg")} className="tabular-nums">{num(r.avgPrice, digits(r.avgPrice))}</Td>
                  <Td label={t("portfolio.price")} className="tabular-nums">{r.price === null ? "—" : num(r.price, digits(r.price))}</Td>
                  <Td label={t("portfolio.valueCol")} className="tabular-nums">{r.value === null ? "—" : num(r.value)}</Td>
                  <Td label={t("portfolio.pnl")} className={cn("tabular-nums", r.unrealized === null ? "text-muted" : pnlTone(r.unrealized))}>{r.unrealized === null ? t("portfolio.noPrice") : `${signed(r.unrealized)} (${signed(r.unrealizedPct ?? 0, 1)}%)`}</Td>
                  <Td label={t("portfolio.share")} className="tabular-nums">{r.share === null ? "—" : `${num(r.share, 1)}%`}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">{t("portfolio.add")}</h2>
        {error && <Alert tone="danger">{t(error)}</Alert>}
        <form onSubmit={submit} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Input id="pf-symbol" label={t("portfolio.coin")} placeholder="BTC" value={form.symbol} maxLength={24} autoCapitalize="characters" autoComplete="off" onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
          <Select id="pf-side" label={t("portfolio.side")} value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })}>
            <option value="buy">{t("portfolio.buy")}</option>
            <option value="sell">{t("portfolio.sell")}</option>
          </Select>
          <Input id="pf-amount" inputMode="decimal" label={t("portfolio.amount")} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Input id="pf-price" inputMode="decimal" label={t("portfolio.priceUsdt")} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          <Input id="pf-fee" inputMode="decimal" label={t("portfolio.fee")} value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
          <div className="flex items-end"><Button type="submit" disabled={pending || !form.symbol || !form.amount || !form.price} className="w-full">{t("portfolio.save")}</Button></div>
        </form>
      </Card>

      {lots.length > 0 && (
        <Card className="space-y-3">
          <h2 className="font-semibold">{t("portfolio.history")}</h2>
          <ul className="divide-y divide-border text-sm">
            {lots.slice(0, 100).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className={cn("font-medium", l.side === "buy" ? "text-success" : "text-danger")}>{t(l.side === "buy" ? "portfolio.buy" : "portfolio.sell")}</span>{" "}
                  {num(l.amount, 8)} {l.symbol} · {num(l.price, digits(l.price))}
                  <span className="block text-xs text-muted">{day.format(new Date(l.occurredAt))}{l.fee > 0 ? ` · ${t("portfolio.fee")}: ${num(l.fee, 4)}` : ""}</span>
                </span>
                <button type="button" disabled={pending} aria-label={t("common.delete")} title={t("common.delete")} onClick={() => startTransition(async () => { await deleteLotAction(l.id); router.refresh(); })} className="rounded-lg p-2 text-muted hover:bg-surface-muted hover:text-danger">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

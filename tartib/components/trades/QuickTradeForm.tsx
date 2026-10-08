"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTradeAction } from "@/app/actions/trades";
import { Alert, Button, Card, Input, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { parseNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { inferMarket } from "@/lib/import-map";
import { emotions, type DirectionKey, type EmotionKey } from "@/lib/trading";
import type { AccountWithBalance } from "@/types";

/** Быстрая запись: только главное. Правила проверяются так же, как в полной форме. */
export function QuickTradeForm({ accounts }: { accounts: AccountWithBalance[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [instrument, setInstrument] = useState("");
  const [direction, setDirection] = useState<DirectionKey>("long");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [size, setSize] = useState("");
  const [exit, setExit] = useState("");
  const [emotion, setEmotion] = useState<EmotionKey>("calm");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const entryN = parseNumber(entry);
    const sizeN = parseNumber(size);
    const stopN = stop.trim() ? parseNumber(stop) : null;
    const exitN = exit.trim() ? parseNumber(exit) : null;
    if (!instrument.trim() || !entryN || entryN <= 0 || !sizeN || sizeN <= 0 || (stop.trim() && !stopN) || (exit.trim() && !exitN)) {
      return setError("quick.invalid");
    }
    startTransition(async () => {
      const result = await saveTradeAction(null, {
        accountId,
        instrument: instrument.trim().toUpperCase(),
        market: inferMarket(instrument),
        direction,
        entryPrice: entryN,
        exitPrice: exitN,
        stopLoss: stopN,
        takeProfit: null,
        positionSize: sizeN,
        leverage: 1,
        fees: 0,
        riskPercent: null,
        pnl: null,
        emotion,
        strategy: "",
        violatedRuleIds: [],
        reason: "",
        plan: "",
        comment: "",
        tradedAt: new Date().toISOString(),
      });
      if (!result.ok) return setError(result.error);
      router.push(result.id ? `/trades/${result.id}` : "/trades");
    });
  }

  return (
    <Card className="mx-auto max-w-xl">
      <form onSubmit={submit} method="post" className="space-y-4">
        {error && <Alert tone="danger">{t(error)}</Alert>}
        {accounts.length > 1 && (
          <Select id="q-account" label={t("trades.form.account")} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
          </Select>
        )}
        <Input id="q-instrument" label={t("trades.form.instrument")} placeholder="BTCUSDT" value={instrument} onChange={(e) => setInstrument(e.target.value)} />
        <div role="group" aria-label={t("trades.form.direction")} className="grid grid-cols-2 gap-2">
          {(["long", "short"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={direction === d}
              onClick={() => setDirection(d)}
              className={cn("h-11 rounded-xl border text-sm font-semibold", direction === d ? (d === "long" ? "border-success bg-success-soft text-success" : "border-danger bg-danger-soft text-danger") : "border-border bg-surface text-muted")}
            >
              {t(`directions.${d}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 items-end gap-3">
          <Input id="q-entry" inputMode="decimal" label={t("trades.form.entry")} value={entry} onChange={(e) => setEntry(e.target.value)} />
          <Input id="q-size" inputMode="decimal" label={t("trades.form.size")} value={size} onChange={(e) => setSize(e.target.value)} />
          <Input id="q-stop" inputMode="decimal" label={t("trades.form.stop")} value={stop} onChange={(e) => setStop(e.target.value)} />
          <Input id="q-exit" inputMode="decimal" label={t("trades.form.exit")} value={exit} onChange={(e) => setExit(e.target.value)} />
        </div>
        <Select id="q-emotion" label={t("trades.form.emotion")} value={emotion} onChange={(e) => setEmotion(e.target.value as EmotionKey)}>
          {emotions.map((x) => (<option key={x} value={x}>{t(`emotions.${x}`)}</option>))}
        </Select>
        <p className="text-sm text-muted">{t("quick.hint")}</p>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>{t("trades.form.save")}</Button>
      </form>
    </Card>
  );
}

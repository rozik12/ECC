"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { parseQuickLine, quickToQuery } from "@/lib/quick-parse";

/** Быстрый ввод одной строкой: «BTC long 65000 стоп 64500 тп 66000 размер 0.1». Открывает полную форму с заполненными полями. */
export function QuickLine() {
  const { t } = useI18n();
  const router = useRouter();
  const [text, setText] = useState("");
  const parsed = parseQuickLine(text);
  const found = [parsed.instrument, parsed.direction, parsed.entry, parsed.stop, parsed.tp, parsed.size].filter(Boolean).length;

  return (
    <Card className="mx-auto max-w-xl space-y-3">
      <form
        onSubmit={(e) => { e.preventDefault(); if (found > 0) router.push(quickToQuery(parsed)); }}
        className="space-y-3"
        noValidate
      >
        <Input id="quick-line" label={t("quick.line")} hint={t("quick.lineHint")} placeholder="BTCUSDT long 65000 stop 64500 tp 66000 size 0.1" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
        {found > 0 && (
          <p className="text-xs text-muted" aria-live="polite">
            {t("quick.lineFound")}: {[parsed.instrument, parsed.direction && t(`directions.${parsed.direction}`), parsed.entry && `${t("trades.form.entry")} ${parsed.entry}`, parsed.stop && `${t("trades.form.stop")} ${parsed.stop}`, parsed.tp && `${t("trades.form.takeProfit")} ${parsed.tp}`, parsed.size && `${t("trades.form.size")} ${parsed.size}`, parsed.leverage && `${t("trades.form.leverage")} ${parsed.leverage}`, parsed.risk && `${t("trades.form.riskPercent")} ${parsed.risk}`].filter(Boolean).join(" · ")}
          </p>
        )}
        <Button type="submit" disabled={found === 0}>{t("quick.lineOpen")} <ArrowRight className="h-4 w-4" aria-hidden /></Button>
      </form>
    </Card>
  );
}

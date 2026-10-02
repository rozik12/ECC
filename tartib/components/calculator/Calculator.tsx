"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Info } from "lucide-react";
import { Alert, Button, Card, Input, Modal, Select } from "@/components/ui";
import { evaluateRules, scoreChecks, type RuleCheck, type RuleLike } from "@/lib/calculations/rules";
import { calculatePosition, type Direction, type Market } from "@/lib/calculations/trade";
import { cn } from "@/lib/cn";
import { formatMoney, formatNumber, parseNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { markets } from "@/lib/trading";
import type { AccountWithBalance } from "@/types";

type Props = {
  accounts: AccountWithBalance[];
  rules: RuleLike[];
  /** Сколько сделок уже есть за сегодня */
  tradesToday: number;
};

export function Calculator({ accounts, rules, tradesToday }: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const first = accounts[0];

  const [accountId, setAccountId] = useState(first?.id ?? "");
  const [balance, setBalance] = useState(first ? String(first.balance) : "");
  const [riskPercent, setRiskPercent] = useState("1");
  const [instrument, setInstrument] = useState("");
  const [market, setMarket] = useState<Market>("crypto");
  const [direction, setDirection] = useState<Direction>("long");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [leverage, setLeverage] = useState("1");
  const [warningOpen, setWarningOpen] = useState(false);

  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? "USD";
  const money = (n: number) => formatMoney(n, currency, locale);
  const num = (n: number, d = 4) => formatNumber(n, locale, d);

  const parsed = {
    balance: parseNumber(balance),
    risk: parseNumber(riskPercent),
    entry: parseNumber(entry),
    stop: parseNumber(stop),
    tp: parseNumber(takeProfit),
    leverage: parseNumber(leverage),
  };
  const ready = parsed.balance !== null && parsed.risk !== null && parsed.entry !== null && parsed.stop !== null;
  const tpInvalid = takeProfit.trim() !== "" && parsed.tp === null;

  const outcome = useMemo(() => {
    if (!ready) return null;
    return calculatePosition({
      balance: parsed.balance!,
      riskPercent: parsed.risk!,
      entry: parsed.entry!,
      stop: parsed.stop!,
      takeProfit: parsed.tp,
      leverage: parsed.leverage ?? 1,
      direction,
      market,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance, riskPercent, entry, stop, takeProfit, leverage, direction, market]);

  const result = outcome && outcome.ok ? outcome.result : null;

  const checks: RuleCheck[] = useMemo(() => {
    if (!result || parsed.balance === null) return [];
    return evaluateRules(rules, {
      riskPercent: (result.potentialLoss / parsed.balance) * 100,
      riskReward: result.riskReward,
      leverage: parsed.leverage ?? 1,
      hasStopLoss: true,
      tradesToday: tradesToday + 1,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, rules, tradesToday, leverage, balance]);

  const activeRules = rules.filter((r) => r.is_active);
  const { score } = scoreChecks(checks);
  const violated = checks.filter((c) => c.status === "violated");

  const reasonText = (c: RuleCheck) => {
    const type = c.rule.rule_type;
    const vars = {
      name: c.rule.name,
      limit: c.limit === null ? "" : num(c.limit, 2),
      actual: c.actual === null ? "" : num(c.actual, 2),
    };
    if (c.status === "manual") return t("calc.reasons.custom.manual", vars);
    return t(`calc.reasons.${type}.${c.status === "violated" ? "violated" : "ok"}`, vars);
  };

  function goToTrade() {
    if (!result) return;
    const p = new URLSearchParams({
      account: accountId,
      instrument: instrument.trim(),
      market,
      direction,
      entry: String(parsed.entry),
      stop: String(parsed.stop),
      size: String(Number(result.positionSize.toFixed(8))),
      leverage: String(parsed.leverage ?? 1),
      risk: String(Number(((result.potentialLoss / parsed.balance!) * 100).toFixed(4))),
    });
    if (parsed.tp !== null) p.set("tp", String(parsed.tp));
    router.push(`/trades/new?${p.toString()}`);
  }

  function onSave() {
    if (violated.length > 0) setWarningOpen(true);
    else goToTrade();
  }

  const row = (label: string, value: string, strong = false) => (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={cn("text-right tabular-nums", strong ? "text-lg font-bold" : "font-medium")}>{value}</dd>
    </div>
  );

  const segment = (value: Direction, label: string, tone: string) => (
    <button
      type="button"
      onClick={() => setDirection(value)}
      aria-pressed={direction === value}
      className={cn(
        "h-11 flex-1 rounded-xl border text-sm font-semibold transition-colors",
        direction === value ? tone : "border-border bg-surface text-muted hover:bg-surface-muted",
      )}
    >
      {label}
    </button>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold sm:text-3xl">{t("calc.title")}</h1>
      <p className="mt-1 text-muted">{t("calc.subtitle")}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          {accounts.length > 0 ? (
            <Select
              id="calc-account"
              label={t("calc.account")}
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                const a = accounts.find((x) => x.id === e.target.value);
                if (a) setBalance(String(a.balance));
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          ) : (
            <Alert tone="warning">{t("calc.noAccount")}</Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input id="calc-balance" inputMode="decimal" label={`${t("calc.balance")}, ${currency}`} value={balance} onChange={(e) => setBalance(e.target.value)} />
            <Input id="calc-risk" inputMode="decimal" label={t("calc.riskPercent")} value={riskPercent} onChange={(e) => setRiskPercent(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input id="calc-instrument" label={t("calc.instrument")} placeholder="BTC/USDT" value={instrument} onChange={(e) => setInstrument(e.target.value)} />
            <Select id="calc-market" label={t("calc.market")} value={market} onChange={(e) => setMarket(e.target.value as Market)}>
              {markets.map((m) => (
                <option key={m} value={m}>{t(`markets.${m}`)}</option>
              ))}
            </Select>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium">{t("calc.direction")}</p>
            <div className="flex gap-3">
              {segment("long", t("directions.long"), "border-success bg-success-soft text-success")}
              {segment("short", t("directions.short"), "border-danger bg-danger-soft text-danger")}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input id="calc-entry" inputMode="decimal" label={t("calc.entry")} value={entry} onChange={(e) => setEntry(e.target.value)} />
            <Input id="calc-stop" inputMode="decimal" label={t("calc.stop")} value={stop} onChange={(e) => setStop(e.target.value)} />
            <Input id="calc-tp" inputMode="decimal" label={t("calc.takeProfit")} value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} error={tpInvalid ? t("errors.number") : undefined} />
            <Input id="calc-leverage" inputMode="decimal" label={t("calc.leverage")} value={leverage} onChange={(e) => setLeverage(e.target.value)} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold">{t("calc.results.title")}</h2>
            {outcome === null ? (
              <p className="mt-3 text-sm text-muted">{t("calc.results.empty")}</p>
            ) : !outcome.ok ? (
              <Alert tone="danger" className="mt-3">{t(`calc.errors.${outcome.error}`)}</Alert>
            ) : (
              <dl className="mt-2 divide-y divide-border">
                {row(t("calc.results.riskAmount"), money(outcome.result.riskAmount))}
                {row(
                  market === "stocks" ? t("calc.results.shares") : t("calc.results.positionSize"),
                  num(outcome.result.positionSize, market === "stocks" ? 0 : 6),
                  true,
                )}
                {outcome.result.lots !== null && row(t("calc.results.lots"), num(outcome.result.lots, 4))}
                {row(t("calc.results.potentialLoss"), `−${money(outcome.result.potentialLoss)}`)}
                {outcome.result.potentialProfit !== null && row(t("calc.results.potentialProfit"), `+${money(outcome.result.potentialProfit)}`)}
                {outcome.result.riskReward !== null && row(t("calc.results.riskReward"), `1 : ${num(outcome.result.riskReward, 2)}`, true)}
                {row(t("calc.results.positionValue"), money(outcome.result.positionValue))}
                {row(t("calc.results.margin"), money(outcome.result.margin))}
              </dl>
            )}
          </Card>

          {result && (
            <Card>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold">{t("calc.score.title")}</h2>
                {score !== null && (
                  <p className={cn("text-2xl font-bold tabular-nums", score >= 8 ? "text-success" : score >= 5 ? "text-warning" : "text-danger")}>
                    {score} <span className="text-sm font-normal text-muted">{t("calc.score.of")}</span>
                  </p>
                )}
              </div>
              {activeRules.length === 0 ? (
                <div className="mt-3 text-sm text-muted">
                  <p>{t("calc.score.noRules")}</p>
                  <Link href="/rules" className="mt-2 inline-block font-medium text-primary hover:underline">{t("calc.score.createRules")}</Link>
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {checks
                    .filter((c) => c.status !== "unknown")
                    .map((c) => (
                      <li key={c.rule.id} className="flex gap-2 text-sm">
                        {c.status === "ok" ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="✓" />
                        ) : c.status === "violated" ? (
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-label="⚠" />
                        ) : (
                          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                        )}
                        <span className={c.status === "violated" ? "text-foreground" : "text-muted"}>{reasonText(c)}</span>
                      </li>
                    ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-muted">{t("calc.score.note")}</p>
            </Card>
          )}

          <Button size="lg" className="w-full" disabled={!result || !account} onClick={onSave}>
            {t("calc.saveAsTrade")}
          </Button>
        </div>
      </div>

      <Modal
        open={warningOpen}
        onClose={() => setWarningOpen(false)}
        title={t("calc.warning.title")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setWarningOpen(false)}>{t("calc.warning.cancel")}</Button>
            <Button
              onClick={() => {
                setWarningOpen(false);
                goToTrade();
              }}
            >
              {t("calc.warning.proceed")}
            </Button>
          </>
        }
      >
        <ul className="space-y-2">
          {violated.map((c) => (
            <li key={c.rule.id} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span>{reasonText(c)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-muted">{t("calc.warning.text")}</p>
      </Modal>
    </div>
  );
}

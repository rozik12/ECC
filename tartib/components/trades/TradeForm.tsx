"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTradeAction } from "@/app/actions/trades";
import { Alert, Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { evaluateRules, type RuleLike } from "@/lib/calculations/rules";
import { calculatePnl, tradeMetrics } from "@/lib/calculations/trade";
import { cn } from "@/lib/cn";
import { parseNumber, toLocalInput } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { emotions, markets, type DirectionKey, type EmotionKey, type MarketKey } from "@/lib/trading";
import { tradeSchema } from "@/lib/validations/trades";
import type { AccountWithBalance } from "@/types";

export type TradeFormValues = {
  accountId: string;
  instrument: string;
  market: MarketKey;
  direction: DirectionKey;
  entry: string;
  exit: string;
  stop: string;
  takeProfit: string;
  size: string;
  leverage: string;
  risk: string;
  pnl: string;
  emotion: EmotionKey;
  reason: string;
  plan: string;
  comment: string;
  /** Дата сделки в формате ISO. В поле она подставляется уже в браузере, в часовом поясе пользователя. */
  tradedAt: string;
};

type Props = {
  accounts: AccountWithBalance[];
  rules: (RuleLike & { description?: string })[];
  /** Сколько других сделок уже есть в день этой сделки */
  tradesOthersToday: number;
  initial: TradeFormValues;
  /** pnl уже сохранён вручную (при редактировании) */
  pnlIsManual?: boolean;
  initialViolationIds?: string[];
  tradeId?: string | null;
  fromCalculator?: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function TradeForm({
  accounts,
  rules,
  tradesOthersToday,
  initial,
  pnlIsManual = false,
  initialViolationIds = [],
  tradeId = null,
  fromCalculator = false,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState<TradeFormValues>({ ...initial, tradedAt: "" });
  useEffect(() => {
    const date = initial.tradedAt ? new Date(initial.tradedAt) : new Date();
    // Время зависит от часового пояса браузера, поэтому подставляем его только после загрузки страницы
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setV((prev) => (prev.tradedAt ? prev : { ...prev, tradedAt: toLocalInput(date) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pnlTouched, setPnlTouched] = useState(pnlIsManual);
  // Правила, проверяемые по цифрам, определяются заново. Вручную сохраняем только «свои» правила.
  const [manualIds, setManualIds] = useState<Set<string>>(
    () => new Set(initialViolationIds.filter((id) => rules.find((r) => r.id === id)?.rule_type === "custom")),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof TradeFormValues>(key: K, value: TradeFormValues[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const bind = (key: keyof TradeFormValues) => ({
    value: v[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      set(key, e.target.value as never),
  });
  const err = (key: string) => (errors[key] ? t(errors[key]) : undefined);

  const account = accounts.find((a) => a.id === v.accountId);
  const n = {
    entry: parseNumber(v.entry),
    exit: parseNumber(v.exit),
    stop: parseNumber(v.stop),
    tp: parseNumber(v.takeProfit),
    size: parseNumber(v.size),
    leverage: parseNumber(v.leverage),
    risk: parseNumber(v.risk),
  };

  // P&L считается сам, пока пользователь не изменил его вручную
  const autoPnl = n.entry !== null && n.exit !== null && n.size !== null ? round2(calculatePnl(v.direction, n.entry, n.exit, n.size)) : null;
  const pnlShown = pnlTouched ? v.pnl : autoPnl === null ? "" : String(autoPnl);

  // Правила, нарушенные по цифрам
  const autoViolated = useMemo(() => {
    if (n.entry === null || n.size === null) return new Set<string>();
    const m = tradeMetrics({ entry: n.entry, stop: n.stop, takeProfit: n.tp, size: n.size });
    let riskPercent = n.risk;
    if (riskPercent === null && m.riskAmount !== null && account && account.balance > 0) {
      riskPercent = (m.riskAmount / account.balance) * 100;
    }
    const checks = evaluateRules(rules, {
      riskPercent,
      riskReward: m.riskReward,
      leverage: n.leverage ?? 1,
      hasStopLoss: n.stop !== null,
      tradesToday: tradesOthersToday + 1,
    });
    return new Set(checks.filter((c) => c.status === "violated").map((c) => c.rule.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.entry, v.stop, v.takeProfit, v.size, v.leverage, v.risk, v.accountId, rules, tradesOthersToday]);

  const listedRules = rules.filter((r) => r.is_active || initialViolationIds.includes(r.id));

  function toggleRule(id: string) {
    setManualIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const tradedDate = new Date(v.tradedAt);
    const payload = {
      accountId: v.accountId,
      instrument: v.instrument,
      market: v.market,
      direction: v.direction,
      entryPrice: n.entry,
      exitPrice: n.exit,
      stopLoss: n.stop,
      takeProfit: n.tp,
      positionSize: n.size,
      leverage: n.leverage ?? 1,
      riskPercent: n.risk,
      pnl: parseNumber(pnlShown),
      emotion: v.emotion,
      violatedRuleIds: [...new Set([...manualIds, ...autoViolated])],
      reason: v.reason,
      plan: v.plan,
      comment: v.comment,
      tradedAt: isNaN(tradedDate.getTime()) ? "" : tradedDate.toISOString(),
    };
    const parsed = tradeSchema.safeParse(payload);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!map[key]) map[key] = issue.message;
      }
      setErrors(map);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await saveTradeAction(tradeId, payload);
      if (!result.ok) return setFormError(result.error);
      router.push(result.id ? `/trades/${result.id}` : "/trades");
      router.refresh();
    });
  }

  const dirButton = (value: DirectionKey, tone: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={v.direction === value}
      onClick={() => set("direction", value)}
      className={cn(
        "h-11 flex-1 rounded-xl border text-sm font-semibold transition-colors",
        v.direction === value ? tone : "border-border bg-surface text-muted hover:bg-surface-muted",
      )}
    >
      {t(`directions.${value}`)}
    </button>
  );

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{tradeId ? t("trades.form.editTitle") : t("trades.form.newTitle")}</h1>
      {fromCalculator && <Alert tone="info">{t("trades.form.fromCalculator")}</Alert>}
      {formError && <Alert tone="danger">{t(formError)}</Alert>}

      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select id="t-account" label={t("trades.form.account")} error={err("accountId")} {...bind("accountId")}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <Input id="t-instrument" label={t("trades.form.instrument")} placeholder="BTC/USDT" error={err("instrument")} {...bind("instrument")} />
          <Select id="t-market" label={t("trades.form.market")} {...bind("market")}>
            {markets.map((m) => <option key={m} value={m}>{t(`markets.${m}`)}</option>)}
          </Select>
          <div>
            <p className="mb-1.5 text-sm font-medium">{t("trades.form.direction")}</p>
            <div className="flex gap-3">
              {dirButton("long", "border-success bg-success-soft text-success")}
              {dirButton("short", "border-danger bg-danger-soft text-danger")}
            </div>
          </div>
        </div>
        <Input id="t-date" type="datetime-local" label={t("trades.form.tradedAt")} error={err("tradedAt")} {...bind("tradedAt")} />
      </Card>

      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Input id="t-entry" inputMode="decimal" label={t("trades.form.entry")} error={err("entryPrice")} {...bind("entry")} />
          <Input id="t-exit" inputMode="decimal" label={t("trades.form.exit")} error={err("exitPrice")} {...bind("exit")} />
          <Input id="t-size" inputMode="decimal" label={t("trades.form.size")} error={err("positionSize")} {...bind("size")} />
          <Input id="t-stop" inputMode="decimal" label={t("trades.form.stop")} error={err("stopLoss")} {...bind("stop")} />
          <Input id="t-tp" inputMode="decimal" label={t("trades.form.takeProfit")} error={err("takeProfit")} {...bind("takeProfit")} />
          <Input id="t-leverage" inputMode="decimal" label={t("trades.form.leverage")} error={err("leverage")} {...bind("leverage")} />
          <Input id="t-risk" inputMode="decimal" label={t("trades.form.riskPercent")} error={err("riskPercent")} {...bind("risk")} />
        </div>
        <Input
          id="t-pnl"
          inputMode="decimal"
          label={`${t("trades.form.pnl")}${account ? `, ${account.currency}` : ""}`}
          hint={t("trades.form.pnlHint")}
          error={err("pnl")}
          value={pnlShown}
          onChange={(e) => {
            setPnlTouched(true);
            set("pnl", e.target.value);
          }}
        />
      </Card>

      <Card className="space-y-4">
        <Select id="t-emotion" label={t("trades.form.emotion")} {...bind("emotion")}>
          {emotions.map((em) => <option key={em} value={em}>{t(`emotions.${em}`)}</option>)}
        </Select>

        <fieldset>
          <legend className="text-sm font-medium">{t("trades.form.violated")}</legend>
          <p className="mt-1 text-sm text-muted">{t("trades.form.violatedHint")}</p>
          {listedRules.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("trades.form.noActiveRules")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {listedRules.map((r) => {
                const auto = autoViolated.has(r.id);
                const checked = auto || manualIds.has(r.id);
                return (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 text-sm has-[:checked]:border-warning has-[:checked]:bg-warning-soft">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[var(--primary)]"
                        checked={checked}
                        disabled={auto}
                        onChange={() => toggleRule(r.id)}
                      />
                      <span className="flex-1">{r.name}</span>
                      {auto && <Badge tone="warning">{t("trades.form.auto")}</Badge>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      </Card>

      <Card className="space-y-4">
        <Textarea id="t-reason" label={t("trades.form.reason")} error={err("reason")} {...bind("reason")} />
        <Textarea id="t-plan" label={t("trades.form.plan")} error={err("plan")} {...bind("plan")} />
        <Textarea id="t-comment" label={t("trades.form.comment")} error={err("comment")} {...bind("comment")} />
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="lg" onClick={() => router.back()}>{t("common.cancel")}</Button>
        <Button type="submit" size="lg" disabled={pending || !account}>{t("trades.form.save")}</Button>
      </div>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addChallengeAction } from "@/app/actions/prop";
import { Alert, Button, Card, Input, Select, Switch } from "@/components/ui";
import { parseNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

/** Форма нового проп-челленджа: правила фирмы переносятся сюда один раз, дальше всё считается по журналу. */
export function PropForm({ accounts, today }: { accounts: { id: string; name: string }[]; today: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", accountId: "", balance: "10000", target: "10", daily: "5", total: "10", days: "4", start: today, end: "", trailing: false });
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await addChallengeAction({
        name: f.name, accountId: f.accountId || null, startBalance: parseNumber(f.balance), profitTargetPct: parseNumber(f.target), maxDailyLossPct: parseNumber(f.daily), maxTotalLossPct: parseNumber(f.total),
        trailing: f.trailing, minTradingDays: parseNumber(f.days) ?? 0, startDate: f.start, endDate: f.end || null,
      });
      if (!r.ok) return setError(r.error ?? "errors.generic");
      setF((p) => ({ ...p, name: "" }));
      router.refresh();
    });
  };

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">{t("prop.add")}</h2>
      {error && <Alert tone="danger">{t(error)}</Alert>}
      <form onSubmit={submit} className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1"><Input id="pc-name" label={t("prop.name")} placeholder="FTMO 10k" maxLength={40} value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <Select id="pc-account" label={t("prop.account")} value={f.accountId} onChange={(e) => set("accountId", e.target.value)}>
          <option value="">{t("prop.allAccounts")}</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Input id="pc-balance" inputMode="decimal" label={t("prop.balance")} value={f.balance} onChange={(e) => set("balance", e.target.value)} />
        <Input id="pc-target" inputMode="decimal" label={t("prop.target")} value={f.target} onChange={(e) => set("target", e.target.value)} />
        <Input id="pc-daily" inputMode="decimal" label={t("prop.daily")} value={f.daily} onChange={(e) => set("daily", e.target.value)} />
        <Input id="pc-total" inputMode="decimal" label={t("prop.total")} value={f.total} onChange={(e) => set("total", e.target.value)} />
        <Input id="pc-days" inputMode="numeric" label={t("prop.minDays")} value={f.days} onChange={(e) => set("days", e.target.value)} />
        <Input id="pc-start" type="date" label={t("prop.start")} value={f.start} onChange={(e) => set("start", e.target.value)} />
        <Input id="pc-end" type="date" label={t("prop.end")} value={f.end} onChange={(e) => set("end", e.target.value)} />
        <label className="col-span-2 flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
          <Switch checked={f.trailing} onChange={(v) => set("trailing", v)} label={t("prop.trailing")} />
          {t("prop.trailing")}
        </label>
        <div className="col-span-2 sm:col-span-3"><Button type="submit" disabled={pending || !f.name.trim()}>{t("prop.create")}</Button></div>
      </form>
      <p className="text-xs text-muted">{t("prop.formNote")}</p>
    </Card>
  );
}

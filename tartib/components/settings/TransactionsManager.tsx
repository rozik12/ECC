"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addTransactionAction, deleteTransactionAction } from "@/app/actions/settings";
import { Alert, Badge, Button, Card, Input, Select } from "@/components/ui";
import { formatDateTime, formatMoney, parseNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { transactionSchema } from "@/lib/validations/settings";
import type { Transaction } from "@/lib/data";

type Account = { id: string; name: string; currency: string };

/** Пополнения и выводы: меняют баланс счёта, но не попадают в результат торговли и просадку. */
export function TransactionsManager({ accounts, transactions, timeZone }: { accounts: Account[]; transactions: Transaction[]; timeZone: string }) {
  const { t, locale } = useI18n();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [kind, setKind] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const accountOf = (id: string) => accounts.find((a) => a.id === id);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const when = date ? new Date(`${date}T12:00`) : new Date();
    const payload = {
      accountId,
      kind,
      amount: parseNumber(amount),
      occurredAt: isNaN(when.getTime()) ? "" : when.toISOString(),
      note,
    };
    const parsed = transactionSchema.safeParse(payload);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) map[String(issue.path[0])] ??= issue.message;
      return setErrors(map);
    }
    setErrors({});
    startTransition(async () => {
      const result = await addTransactionAction(payload);
      if (!result.ok) return setError(result.error);
      setAmount("");
      setNote("");
      setDate("");
    });
  }

  if (accounts.length === 0) return null;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{t("settings.transactions.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("settings.transactions.text")}</p>
      </div>
      {error && <Alert tone="danger">{t(error)}</Alert>}
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Select id="tx-kind" label={t("settings.transactions.kind")} value={kind} onChange={(e) => setKind(e.target.value as "deposit" | "withdrawal")}>
          <option value="deposit">{t("settings.transactions.deposit")}</option>
          <option value="withdrawal">{t("settings.transactions.withdrawal")}</option>
        </Select>
        {accounts.length > 1 ? (
          <Select id="tx-account" label={t("trades.form.account")} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        ) : (
          <div />
        )}
        <Input id="tx-amount" inputMode="decimal" label={`${t("settings.transactions.amount")}, ${accountOf(accountId)?.currency ?? ""}`} value={amount}
          error={errors.amount ? t(errors.amount) : undefined} onChange={(e) => setAmount(e.target.value)} />
        <Input id="tx-date" type="date" label={t("settings.transactions.date")} hint={t("settings.transactions.dateHint")} value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="sm:col-span-2">
          <Input id="tx-note" label={t("settings.transactions.note")} value={note} error={errors.note ? t(errors.note) : undefined} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>{t("settings.transactions.add")}</Button>
        </div>
      </form>

      {transactions.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {transactions.slice(0, 15).map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={x.kind === "deposit" ? "success" : "warning"}>{t(`settings.transactions.${x.kind}`)}</Badge>
                  <span className="font-medium tabular-nums">
                    {formatMoney(x.kind === "deposit" ? x.amount : -x.amount, accountOf(x.accountId)?.currency ?? "USD", locale, true)}
                  </span>
                </div>
                <p className="mt-1 text-muted">
                  {formatDateTime(x.occurredAt, locale, timeZone)}
                  {x.note ? ` · ${x.note}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("common.delete")}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const result = await deleteTransactionAction(x.id);
                    if (!result.ok) return setError(result.error);
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

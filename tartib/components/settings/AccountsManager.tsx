"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { createAccountAction, renameAccountAction } from "@/app/actions/settings";
import { Alert, Button, Card, Input, Modal, Select } from "@/components/ui";
import { currencies } from "@/lib/constants";
import { formatMoney, parseNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { accountSchema, renameAccountSchema } from "@/lib/validations/settings";
import type { AccountWithBalance } from "@/types";

type Draft = { id: string | null; name: string; balance: string; currency: string };

export function AccountsManager({ accounts }: { accounts: AccountWithBalance[] }) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open(account?: AccountWithBalance) {
    setErrors({});
    setError(null);
    setDraft(account ? { id: account.id, name: account.name, balance: "", currency: account.currency } : { id: null, name: "", balance: "", currency: accounts[0]?.currency ?? "USD" });
  }

  function submit() {
    if (!draft) return;
    const payload = draft.id
      ? { name: draft.name }
      : { name: draft.name, startingBalance: parseNumber(draft.balance), currency: draft.currency };
    const parsed = (draft.id ? renameAccountSchema : accountSchema).safeParse(payload);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) map[String(issue.path[0])] = issue.message;
      return setErrors(map);
    }
    setErrors({});
    startTransition(async () => {
      const result = draft.id ? await renameAccountAction(draft.id, payload) : await createAccountAction(payload);
      if (!result.ok) return setError(result.error);
      setDraft(null);
    });
  }

  const err = (k: string) => (errors[k] ? t(errors[k]) : undefined);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{t("settings.accounts")}</h2>
        <Button variant="secondary" size="sm" onClick={() => open()}>
          <Plus className="h-4 w-4" aria-hidden /> {t("settings.addAccount")}
        </Button>
      </div>
      <ul className="mt-3 divide-y divide-border">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{a.name}</p>
              <p className="text-sm text-muted">
                {t("calc.balance")}: {formatMoney(a.balance, a.currency, locale)}
              </p>
            </div>
            <Button variant="ghost" size="sm" aria-label={t("common.edit")} onClick={() => open(a)}>
              <Pencil className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? t("settings.renameAccount") : t("settings.addAccount")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>{t("common.cancel")}</Button>
            <Button onClick={submit} disabled={pending}>{t("common.save")}</Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            {error && <Alert tone="danger">{t(error)}</Alert>}
            <Input id="a-name" label={t("onboarding.accountName")} value={draft.name} error={err("name")} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            {!draft.id && (
              <>
                <Input id="a-balance" inputMode="decimal" label={t("onboarding.startingBalance")} value={draft.balance} error={err("startingBalance")}
                  onChange={(e) => setDraft({ ...draft, balance: e.target.value })} />
                <Select id="a-currency" label={t("onboarding.currency")} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
                  {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}

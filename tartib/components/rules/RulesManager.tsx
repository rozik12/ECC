"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { addPresetRuleAction, deleteRuleAction, saveRuleAction, setRuleActiveAction } from "@/app/actions/rules";
import { Alert, Badge, Button, Card, Input, Modal, Select, Switch, Textarea } from "@/components/ui";
import type { RuleType } from "@/lib/calculations/rules";
import { parseNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { rulePresets, ruleTypeList, ruleTypes } from "@/lib/rules/config";
import { ruleSchema } from "@/lib/validations/rules";
import type { Rule } from "@/types";

type FormState = {
  id: string | null;
  name: string;
  description: string;
  ruleType: RuleType;
  value: string;
  isActive: boolean;
};

const emptyForm: FormState = { id: null, name: "", description: "", ruleType: "max_risk_percent", value: "", isActive: true };

export function RulesManager({ rules }: { rules: Rule[] }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  // Бегунок меняется сразу, не дожидаясь ответа сервера; при ошибке вернётся обратно
  const [shown, setShown] = useOptimistic(rules, (state, change: { id: string; active: boolean }) =>
    state.map((r) => (r.id === change.id ? { ...r, is_active: change.active } : r)),
  );
  const [form, setForm] = useState<FormState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<Rule | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) return setError(result.error ?? "errors.generic");
      onOk?.();
    });
  };

  const toggle = (id: string, active: boolean) => {
    setError(null);
    startTransition(async () => {
      setShown({ id, active });
      const result = await setRuleActiveAction(id, active);
      if (!result.ok) setError(result.error ?? "errors.generic");
    });
  };

  function openForm(rule?: Rule) {
    setFieldErrors({});
    setError(null);
    setForm(
      rule
        ? { id: rule.id, name: rule.name, description: rule.description, ruleType: rule.rule_type, value: rule.value === null ? "" : String(rule.value), isActive: rule.is_active }
        : emptyForm,
    );
  }

  function submit() {
    if (!form) return;
    const config = ruleTypes[form.ruleType];
    const payload = {
      name: form.name,
      description: form.description,
      ruleType: form.ruleType,
      value: config.hasValue ? parseNumber(form.value) : null,
      isActive: form.isActive,
    };
    const parsed = ruleSchema.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      return setFieldErrors(errs);
    }
    setFieldErrors({});
    run(() => saveRuleAction(form.id, payload), () => setForm(null));
  }

  const describe = (rule: Rule) =>
    t(`rules.describe.${rule.rule_type}`, { value: rule.value === null ? "" : String(rule.value) });
  const errText = (key?: string) => (key ? t(key) : undefined);

  const presets = rulePresets.filter((p) => !rules.some((r) => r.rule_type === p.type));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{t("rules.title")}</h1>
          <p className="mt-1 text-muted">{t("rules.subtitle")}</p>
        </div>
        <Button onClick={() => openForm()}>
          <Plus className="h-4 w-4" aria-hidden /> {t("rules.add")}
        </Button>
      </div>

      {error && !form && <Alert tone="danger">{t(error)}</Alert>}

      {rules.length === 0 ? (
        <Card className="py-10 text-center">
          <p className="text-lg font-semibold">{t("rules.empty.title")}</p>
          <p className="mx-auto mt-2 max-w-md text-muted">{t("rules.empty.text")}</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((rule) => (
            <li key={rule.id}>
              <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={rule.is_active ? "font-semibold" : "font-semibold text-muted line-through"}>{rule.name}</p>
                    <Badge tone={ruleTypes[rule.rule_type].auto ? "primary" : "neutral"}>
                      {ruleTypes[rule.rule_type].auto ? t("rules.auto") : t("rules.manual")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{describe(rule)}</p>
                  {rule.description && <p className="mt-1 text-sm text-muted">{rule.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={rule.is_active}
                    label={rule.is_active ? t("rules.on") : t("rules.off")}
                    onChange={(v) => toggle(rule.id, v)}
                  />
                  <Button variant="ghost" size="sm" aria-label={t("common.edit")} onClick={() => openForm(rule)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={t("common.delete")} onClick={() => setToDelete(rule)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {presets.length > 0 && (
        <Card>
          <h2 className="font-semibold">{t("rules.presets.title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("rules.presets.text")}</p>
          <ul className="mt-4 divide-y divide-border">
            {presets.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t(`rules.presets.${p.key}.name`)}</p>
                  <p className="text-sm text-muted">{t(`rules.presets.${p.key}.description`)}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => addPresetRuleAction(p.key, t(`rules.presets.${p.key}.name`), t(`rules.presets.${p.key}.description`)))
                  }
                >
                  <Plus className="h-4 w-4" aria-hidden /> {t("rules.presets.add")}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? t("rules.form.editTitle") : t("rules.form.createTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>{t("common.cancel")}</Button>
            <Button onClick={submit} disabled={pending}>{t("rules.form.save")}</Button>
          </>
        }
      >
        {form && (
          <div className="flex flex-col gap-4">
            {error && <Alert tone="danger">{t(error)}</Alert>}
            <Select
              id="rule-type"
              label={t("rules.form.type")}
              value={form.ruleType}
              onChange={(e) => setForm({ ...form, ruleType: e.target.value as RuleType })}
            >
              {ruleTypeList.map((type) => (
                <option key={type} value={type}>{t(`rules.types.${type}`)}</option>
              ))}
            </Select>
            <Input
              id="rule-name"
              label={t("rules.form.name")}
              value={form.name}
              error={errText(fieldErrors.name)}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {ruleTypes[form.ruleType].hasValue && (
              <Input
                id="rule-value"
                inputMode="decimal"
                label={t(`rules.valueLabels.${form.ruleType}`)}
                value={form.value}
                error={errText(fieldErrors.value)}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            )}
            <Textarea
              id="rule-description"
              label={t("rules.form.description")}
              value={form.description}
              error={errText(fieldErrors.description)}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label={t("rules.form.active")} />
              {t("rules.form.active")}
            </label>
          </div>
        )}
      </Modal>

      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={t("rules.deleteTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)}>{t("common.cancel")}</Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => toDelete && run(() => deleteRuleAction(toDelete.id), () => setToDelete(null))}
            >
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <p>{t("rules.deleteText")}</p>
        {toDelete && <p className="mt-2 font-medium">{toDelete.name}</p>}
        {error && <Alert tone="danger" className="mt-3">{t(error)}</Alert>}
      </Modal>
    </div>
  );
}

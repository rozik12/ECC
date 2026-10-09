"use client";

import { useState, useSyncExternalStore } from "react";
import { Card, Input, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNumber, parseNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { DICT_KEY, TOOL_DEFS, type Row, type ToolSlug } from "@/lib/tool-defs";

/** Универсальный калькулятор: поля и формулы берутся из lib/tool-defs.ts, подписи — из словаря. */
export function ToolRunner({ slug }: { slug: ToolSlug }) {
  const { t, locale } = useI18n();
  // Результаты показываем только в браузере: формат чисел зависит от языковых данных браузера и сервера
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const def = TOOL_DEFS[slug];
  const dict = DICT_KEY[slug];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(def.fields.map((f) => [f.id, f.def])));

  const parsed: Record<string, number | null> = {};
  let incomplete = false;
  for (const f of def.fields) {
    const raw = values[f.id] ?? "";
    parsed[f.id] = parseNumber(raw);
    if (raw.trim() === "" ? !f.optional : parsed[f.id] === null) incomplete = true;
  }
  const rows = incomplete ? null : def.compute(parsed);

  const show = (r: Row) => {
    switch (r.fmt) {
      case "pct": return `${formatNumber(r.value as number, locale, 2)}%`;
      case "ratio": return `1 : ${formatNumber(r.value as number, locale, 2)}`;
      case "text": return t(`tools.${r.value}`);
      default: return formatNumber(r.value as number, locale, 4);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="space-y-4">
        {def.fields.map((f) => f.choices ? (
          <Select
            key={f.id}
            id={`tool-${f.id}`}
            label={t(`tools.${dict}.f.${f.id}`)}
            value={values[f.id] ?? f.def}
            onChange={(e) => setValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
          >
            {f.choices.map((c) => <option key={c} value={String(c)}>{t(c === 2 ? "tools.short" : "tools.long")}</option>)}
          </Select>
        ) : (
          <Input
            key={f.id}
            id={`tool-${f.id}`}
            label={t(`tools.${dict}.f.${f.id}`)}
            inputMode="decimal"
            autoComplete="off"
            value={values[f.id] ?? ""}
            onChange={(e) => setValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
          />
        ))}
      </Card>
      <Card aria-live="polite">
        <h2 className="font-semibold">{t("tools.result")}</h2>
        {!mounted ? (
          <div className="mt-3 h-32" aria-hidden />
        ) : rows ? (
          <dl className="mt-3 divide-y divide-border">
            {rows.map((r) => (
              <div key={r.key} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-sm text-muted">{t(`tools.${dict}.o.${r.key}`)}</dt>
                <dd className={cn("text-right font-semibold tabular-nums", r.tone === "good" && "text-success", r.tone === "bad" && "text-danger")}>{show(r)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className={cn("mt-3 text-sm", incomplete ? "text-muted" : "text-danger")}>{incomplete ? t("tools.fillIn") : t("tools.invalid")}</p>
        )}
      </Card>
    </div>
  );
}

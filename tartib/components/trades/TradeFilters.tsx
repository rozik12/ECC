"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button, Card, Input, Select } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { GRADES, MISTAKES } from "@/lib/journal";
import { directions, emotions } from "@/lib/trading";

export type TradeFilterValues = {
  from: string; to: string; instrument: string; direction: string; result: string; emotion: string; rules: string;
  q: string; tag: string; grade: string; mistake: string;
};

export function TradeFilters({ initial }: { initial: TradeFilterValues }) {
  const { t } = useI18n();
  const router = useRouter();
  const [f, setF] = useState(initial);
  const bind = (key: keyof TradeFilterValues) => ({
    value: f[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [key]: e.target.value }),
  });

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [k, val] of Object.entries(f)) if (val) params.set(k, val);
    const qs = params.toString();
    router.push(qs ? `/trades?${qs}` : "/trades");
  }

  function reset() {
    setF({ from: "", to: "", instrument: "", direction: "", result: "", emotion: "", rules: "", q: "", tag: "", grade: "", mistake: "" });
    router.push("/trades");
  }

  const active = Object.values(initial).filter(Boolean).length;
  const all = <option value="">{t("trades.filters.all")}</option>;
  return (
    <Card padded={false}>
      <details open={active > 0} className="group">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium sm:px-6">
          <SlidersHorizontal className="h-4 w-4 text-muted" aria-hidden />
          {t("trades.filters.title")}
          {active > 0 && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">{active}</span>}
          <ChevronDown className="ml-auto h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
      <form onSubmit={apply} className="grid grid-cols-2 gap-3 px-4 pb-4 sm:px-6 sm:pb-6 lg:grid-cols-4">
        <Input id="f-from" type="date" label={t("trades.filters.from")} {...bind("from")} />
        <Input id="f-to" type="date" label={t("trades.filters.to")} {...bind("to")} />
        <Input id="f-instrument" label={t("trades.filters.instrument")} {...bind("instrument")} />
        <Select id="f-direction" label={t("trades.filters.direction")} {...bind("direction")}>
          {all}
          {directions.map((d) => <option key={d} value={d}>{t(`directions.${d}`)}</option>)}
        </Select>
        <Select id="f-result" label={t("trades.filters.result")} {...bind("result")}>
          {all}
          <option value="profit">{t("trades.filters.profit")}</option>
          <option value="loss">{t("trades.filters.loss")}</option>
        </Select>
        <Select id="f-emotion" label={t("trades.filters.emotion")} {...bind("emotion")}>
          {all}
          {emotions.map((em) => <option key={em} value={em}>{t(`emotions.${em}`)}</option>)}
        </Select>
        <Select id="f-rules" label={t("trades.filters.rules")} {...bind("rules")}>
          {all}
          <option value="followed">{t("trades.rulesFollowed")}</option>
          <option value="violated">{t("trades.rulesViolated")}</option>
        </Select>
        <Input id="f-q" label={t("journal.search")} placeholder={t("journal.searchHint")} className="col-span-2" {...bind("q")} />
        <Input id="f-tag" label={t("journal.tag")} {...bind("tag")} />
        <Select id="f-grade" label={t("journal.grade")} {...bind("grade")}>
          {all}
          {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>
        <Select id="f-mistake" label={t("journal.mistake")} {...bind("mistake")}>
          {all}
          {MISTAKES.map((m) => <option key={m} value={m}>{t(`journal.mistakeNames.${m}`)}</option>)}
        </Select>
        <div className="col-span-2 flex items-end gap-2 lg:col-span-1">
          <Button type="submit" className="flex-1">{t("trades.filters.apply")}</Button>
          <Button variant="secondary" onClick={reset}>{t("trades.filters.reset")}</Button>
        </div>
      </form>
      </details>
    </Card>
  );
}

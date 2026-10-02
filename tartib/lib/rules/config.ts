import type { RuleType } from "@/lib/calculations/rules";

/** Описание типов правил. Новый тип = новая запись здесь + словарь + ветка в evaluateRules. */
export const ruleTypes: Record<RuleType, { hasValue: boolean; auto: boolean; max?: number }> = {
  max_risk_percent: { hasValue: true, auto: true, max: 100 },
  min_risk_reward: { hasValue: true, auto: true },
  max_leverage: { hasValue: true, auto: true },
  require_stop_loss: { hasValue: false, auto: true },
  max_trades_per_day: { hasValue: true, auto: true },
  custom: { hasValue: false, auto: false },
};

export const ruleTypeList = Object.keys(ruleTypes) as RuleType[];

/** Готовые примеры для быстрого добавления. Тексты — в словаре: rules.presets.<key> */
export const rulePresets: { key: string; type: RuleType; value: number | null }[] = [
  { key: "risk1", type: "max_risk_percent", value: 1 },
  { key: "rr2", type: "min_risk_reward", value: 2 },
  { key: "lev10", type: "max_leverage", value: 10 },
  { key: "sl", type: "require_stop_loss", value: null },
  { key: "trades3", type: "max_trades_per_day", value: 3 },
];

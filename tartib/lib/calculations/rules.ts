// Проверка сделки по правилам пользователя. Оценка — только про соблюдение правил, не про рынок.

export type RuleType =
  | "max_risk_percent"
  | "min_risk_reward"
  | "max_leverage"
  | "require_stop_loss"
  | "max_trades_per_day"
  | "max_daily_loss_percent"
  | "custom";

export type RuleLike = {
  id: string;
  name: string;
  rule_type: RuleType;
  value: number | null;
  is_active: boolean;
};

export type TradeFacts = {
  riskPercent: number | null;
  riskReward: number | null;
  leverage: number | null;
  hasStopLoss: boolean;
  /** Сколько сделок за день, считая эту */
  tradesToday: number;
  /** Какой убыток за день (в % от баланса на начало дня) уже накоплен ДО этой сделки. null — неизвестно. */
  dayLossPercent?: number | null;
};

export type RuleStatus = "ok" | "violated" | "manual" | "unknown";

export type RuleCheck = {
  rule: RuleLike;
  status: RuleStatus;
  actual: number | null;
  limit: number | null;
};

const EPS = 1e-9;

export function evaluateRules(rules: RuleLike[], facts: TradeFacts): RuleCheck[] {
  return rules
    .filter((r) => r.is_active)
    .map((rule): RuleCheck => {
      const limit = rule.value;
      const make = (status: RuleStatus, actual: number | null): RuleCheck => ({ rule, status, actual, limit });

      switch (rule.rule_type) {
        case "max_risk_percent":
          if (facts.riskPercent === null || limit === null) return make("unknown", null);
          return make(facts.riskPercent > limit + EPS ? "violated" : "ok", facts.riskPercent);
        case "min_risk_reward":
          if (facts.riskReward === null || limit === null) return make("unknown", null);
          return make(facts.riskReward < limit - EPS ? "violated" : "ok", facts.riskReward);
        case "max_leverage":
          if (facts.leverage === null || limit === null) return make("unknown", null);
          return make(facts.leverage > limit + EPS ? "violated" : "ok", facts.leverage);
        case "require_stop_loss":
          return make(facts.hasStopLoss ? "ok" : "violated", null);
        case "max_trades_per_day":
          if (limit === null) return make("unknown", null);
          return make(facts.tradesToday > limit ? "violated" : "ok", facts.tradesToday);
        case "max_daily_loss_percent":
          if (facts.dayLossPercent == null || limit === null) return make("unknown", null);
          // Нарушение — войти в сделку, когда дневной лимит убытка уже исчерпан
          return make(facts.dayLossPercent >= limit - EPS ? "violated" : "ok", facts.dayLossPercent);
        case "custom":
          return make("manual", null);
      }
    });
}

/** Оценка X/10 по правилам, которые можно проверить автоматически. null — если проверять нечего. */
export function scoreChecks(checks: RuleCheck[]): { score: number | null; passed: number; total: number } {
  const counted = checks.filter((c) => c.status === "ok" || c.status === "violated");
  const passed = counted.filter((c) => c.status === "ok").length;
  if (counted.length === 0) return { score: null, passed: 0, total: 0 };
  return { score: Math.round((10 * passed) / counted.length), passed, total: counted.length };
}

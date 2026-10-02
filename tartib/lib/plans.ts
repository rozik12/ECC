export type Plan = "free" | "pro";

export const PLAN_LIMITS: Record<Plan, { trades: number; rules: number }> = {
  free: { trades: 30, rules: 5 },
  pro: { trades: Infinity, rules: Infinity },
};

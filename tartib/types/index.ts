import type { RuleType } from "@/lib/calculations/rules";
import type { DirectionKey, EmotionKey, MarketKey } from "@/lib/trading";

export type AccountWithBalance = {
  id: string;
  name: string;
  currency: string;
  starting_balance: number;
  balance: number;
};

export type Rule = {
  id: string;
  name: string;
  description: string;
  rule_type: RuleType;
  value: number | null;
  is_active: boolean;
  created_at: string;
};

export type Trade = {
  id: string;
  account_id: string;
  instrument: string;
  market: MarketKey;
  direction: DirectionKey;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  position_size: number;
  leverage: number;
  risk_percent: number | null;
  risk_amount: number | null;
  potential_profit: number | null;
  potential_loss: number | null;
  pnl: number;
  emotion: EmotionKey;
  rules_followed: boolean;
  reason: string;
  plan: string;
  comment: string;
  traded_at: string;
};

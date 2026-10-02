import { z } from "zod";
import { directions, emotions, markets } from "@/lib/trading";

const optionalPositive = z.number({ error: "errors.number" }).positive("errors.positive").nullable();

export const tradeSchema = z.object({
  accountId: z.uuid("errors.generic"),
  instrument: z.string().trim().min(1, "errors.required").max(30, "errors.nameMax"),
  market: z.enum(markets),
  direction: z.enum(directions),
  entryPrice: z.number({ error: "errors.number" }).positive("errors.positive"),
  exitPrice: optionalPositive,
  stopLoss: optionalPositive,
  takeProfit: optionalPositive,
  positionSize: z.number({ error: "errors.number" }).positive("errors.positive"),
  leverage: z.number({ error: "errors.number" }).min(1, "errors.leverageMin").max(1000, "errors.tooLarge"),
  riskPercent: z.number({ error: "errors.number" }).min(0, "errors.positive").max(100, "errors.tooLarge").nullable(),
  /** null — посчитать из цен автоматически */
  pnl: z.number({ error: "errors.number" }).finite().nullable(),
  emotion: z.enum(emotions),
  violatedRuleIds: z.array(z.uuid("errors.generic")).max(50),
  reason: z.string().trim().max(2000, "errors.textMax").default(""),
  plan: z.string().trim().max(2000, "errors.textMax").default(""),
  comment: z.string().trim().max(2000, "errors.textMax").default(""),
  tradedAt: z.iso.datetime({ offset: true, error: "errors.required" }),
});

export type TradeInput = z.input<typeof tradeSchema>;

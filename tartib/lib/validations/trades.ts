import { z } from "zod";
import { GRADES, MISTAKES } from "@/lib/journal";
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
  fees: z.number({ error: "errors.number" }).min(0, "errors.nonNegative").max(1_000_000_000, "errors.tooLarge").default(0),
  riskPercent: z.number({ error: "errors.number" }).min(0, "errors.positive").max(100, "errors.tooLarge").nullable(),
  /** null — посчитать из цен автоматически */
  pnl: z.number({ error: "errors.number" }).finite().nullable(),
  emotion: z.enum(emotions),
  strategy: z.string().trim().max(40, "errors.nameMax").default(""),
  violatedRuleIds: z.array(z.uuid("errors.generic")).max(50),
  reason: z.string().trim().max(2000, "errors.textMax").default(""),
  plan: z.string().trim().max(2000, "errors.textMax").default(""),
  comment: z.string().trim().max(2000, "errors.textMax").default(""),
  tradedAt: z.iso.datetime({ offset: true, error: "errors.required" }),
  tags: z.array(z.string().trim().min(1).max(30, "errors.nameMax")).max(10, "errors.tooLarge").default([]),
  grade: z.enum(GRADES).nullable().default(null),
  mistakes: z.array(z.enum(MISTAKES)).max(10).default([]),
  /** Время закрытия; без цены выхода не сохраняется */
  closedAt: z.iso.datetime({ offset: true, error: "errors.required" }).nullable().default(null),
}).refine((v) => !v.closedAt || Date.parse(v.closedAt) >= Date.parse(v.tradedAt), { path: ["closedAt"], message: "journal.errClosedBefore" });

export type TradeInput = z.input<typeof tradeSchema>;

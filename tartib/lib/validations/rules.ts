import { z } from "zod";
import { ruleTypeList, ruleTypes } from "@/lib/rules/config";

export const ruleSchema = z
  .object({
    name: z.string().trim().min(1, "errors.required").max(80, "errors.nameMax"),
    description: z.string().trim().max(300, "errors.nameMax").default(""),
    ruleType: z.enum(ruleTypeList as [string, ...string[]]),
    value: z.number({ error: "errors.number" }).nullable(),
    isActive: z.boolean(),
  })
  .superRefine((rule, ctx) => {
    const config = ruleTypes[rule.ruleType as keyof typeof ruleTypes];
    if (!config.hasValue) return;
    if (rule.value === null || !(rule.value > 0)) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "errors.positive" });
    } else if (config.max !== undefined && rule.value > config.max) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "errors.tooLarge" });
    }
  });

export type RuleInput = z.input<typeof ruleSchema>;

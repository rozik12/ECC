import { z } from "zod";
import { currencies } from "@/lib/constants";
import { locales } from "@/lib/i18n/config";
import { safeTimeZone } from "@/lib/time";

export const profileSchema = z.object({
  name: z.string().trim().min(1, "errors.required").max(60, "errors.nameMax"),
});

export const settingsSchema = z.object({
  language: z.enum(locales),
  currency: z.enum(currencies),
  timezone: z
    .string()
    .trim()
    .min(1, "errors.required")
    .max(64, "errors.nameMax")
    .refine((tz) => safeTimeZone(tz) === tz, "settings.badTimezone"),
});

export const accountSchema = z.object({
  name: z.string().trim().min(1, "errors.required").max(60, "errors.nameMax"),
  startingBalance: z.number({ error: "errors.number" }).min(0, "errors.balanceMin").max(1_000_000_000, "errors.balanceMax"),
  currency: z.enum(currencies),
});

export const renameAccountSchema = accountSchema.pick({ name: true });

export const checklistSchema = z.object({
  enabled: z.boolean(),
  items: z.array(z.string().trim().min(1).max(120, "errors.nameMax")).max(10, "settings.checklistMax"),
});

export const transactionSchema = z.object({
  accountId: z.uuid("errors.generic"),
  kind: z.enum(["deposit", "withdrawal"]),
  amount: z.number({ error: "errors.number" }).positive("errors.positive").max(1_000_000_000, "errors.tooLarge"),
  occurredAt: z.iso.datetime({ offset: true, error: "errors.required" }),
  note: z.string().trim().max(200, "errors.nameMax").default(""),
});

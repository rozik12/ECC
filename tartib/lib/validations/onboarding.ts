import { z } from "zod";
import { currencies } from "@/lib/constants";
import { locales } from "@/lib/i18n/config";

export const onboardingSchema = z.object({
  name: z.string().trim().min(1, "errors.required").max(60, "errors.nameMax"),
  language: z.enum(locales),
  currency: z.enum(currencies),
  accountName: z.string().trim().min(1, "errors.required").max(60, "errors.nameMax"),
  startingBalance: z.number({ error: "errors.number" }).min(0, "errors.balanceMin").max(1_000_000_000, "errors.balanceMax"),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;

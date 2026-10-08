import { z } from "zod";
import { isWeakPassword } from "@/lib/password";

// Сообщения — ключи словаря. Компонент переводит их через t().
export const loginSchema = z.object({
  email: z.string().trim().min(1, "errors.required").pipe(z.email("errors.email")),
  password: z.string().min(1, "errors.required"),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, "errors.required").max(60, "errors.nameMax"),
  email: z.string().trim().min(1, "errors.required").pipe(z.email("errors.email")),
  password: z.string().min(8, "errors.passwordMin").max(72, "errors.passwordMax"),
}).superRefine((v, ctx) => {
  if (v.password.length >= 8 && isWeakPassword(v.password, v.email)) ctx.addIssue({ code: "custom", path: ["password"], message: "errors.passwordWeak" });
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;

export const forgotSchema = z.object({
  email: z.string().trim().min(1, "errors.required").pipe(z.email("errors.email")),
});

export const resetSchema = z.object({
  password: z.string().min(8, "errors.passwordMin").max(72, "errors.passwordMax").refine((p) => !isWeakPassword(p), "errors.passwordWeak"),
});

export type ForgotValues = z.infer<typeof forgotSchema>;
export type ResetValues = z.infer<typeof resetSchema>;

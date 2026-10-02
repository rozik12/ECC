import { z } from "zod";

// Сообщения — ключи словаря. Компонент переводит их через t().
export const loginSchema = z.object({
  email: z.string().trim().min(1, "errors.required").pipe(z.email("errors.email")),
  password: z.string().min(1, "errors.required"),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, "errors.required").max(60, "errors.nameMax"),
  email: z.string().trim().min(1, "errors.required").pipe(z.email("errors.email")),
  password: z.string().min(8, "errors.passwordMin").max(72, "errors.passwordMax"),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;

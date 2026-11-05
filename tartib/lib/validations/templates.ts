import { z } from "zod";
import { directions, emotions, markets } from "@/lib/trading";

/** Что хранится в шаблоне: поля сделки без цен и без времени. Всё необязательно. */
export const templateDataSchema = z.object({
  instrument: z.string().trim().max(30).optional(),
  market: z.enum(markets).optional(),
  direction: z.enum(directions).optional(),
  leverage: z.string().trim().max(10).optional(),
  risk: z.string().trim().max(10).optional(),
  strategy: z.string().trim().max(40).optional(),
  emotion: z.enum(emotions).optional(),
  tags: z.string().trim().max(200).optional(),
});
export type TemplateData = z.infer<typeof templateDataSchema>;

export const templateNameSchema = z.string().trim().min(1, "errors.required").max(40, "errors.nameMax");

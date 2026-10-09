import { z } from "zod";
import { isDay } from "../diary.ts";

const scale = z.number().int().min(1).max(5).nullable();

export const diarySchema = z.object({
  day: z.string().refine(isDay, "errors.required"),
  mood: scale,
  energy: scale,
  plan: z.string().max(2000, "errors.textMax"),
  review: z.string().max(2000, "errors.textMax"),
  lesson: z.string().max(500, "errors.textMax"),
  followedPlan: z.boolean().nullable(),
});
export type DiaryInput = z.infer<typeof diarySchema>;

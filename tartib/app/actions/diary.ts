"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isDay, localDay, shiftDay } from "@/lib/diary";
import { safeTimeZone } from "@/lib/time";
import { diarySchema } from "@/lib/validations/diary";
import type { ActionResult } from "./auth";

const isNextControlFlow = (e: unknown) => !!e && typeof e === "object" && "digest" in e;

/** Создаёт или обновляет запись дневника за день. Править можно сегодня и прошлые 14 дней; в будущее писать нельзя. */
export async function saveDiaryAction(input: unknown): Promise<ActionResult> {
  const parsed = diarySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.generic" };
  const v = parsed.data;
  try {
    const { supabase, user, profile } = await requireUser();
    const today = localDay(new Date(), safeTimeZone(profile?.timezone));
    if (v.day > shiftDay(today, 1) || v.day < shiftDay(today, -14)) return { ok: false, error: "diary.errDay" };
    const row = { mood: v.mood, energy: v.energy, plan: v.plan.trim(), review: v.review.trim(), lesson: v.lesson.trim(), followed_plan: v.followedPlan };
    const { data: existing } = await supabase.from("diary_entries").select("id").eq("user_id", user.id).eq("day", v.day).maybeSingle();
    const { error } = existing
      ? await supabase.from("diary_entries").update(row).eq("id", existing.id).eq("user_id", user.id)
      : await supabase.from("diary_entries").insert({ ...row, user_id: user.id, day: v.day });
    if (error) return { ok: false, error: "errors.generic" };
    revalidatePath("/diary");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { ok: false, error: "errors.generic" };
  }
}

/** Удаляет запись дневника за день (только свою). */
export async function deleteDiaryAction(day: unknown): Promise<ActionResult> {
  if (typeof day !== "string" || !isDay(day)) return { ok: false, error: "errors.generic" };
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("diary_entries").delete().eq("user_id", user.id).eq("day", day);
    if (error) return { ok: false, error: "errors.generic" };
    revalidatePath("/diary");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { ok: false, error: "errors.generic" };
  }
}

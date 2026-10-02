"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getPlan } from "@/lib/data";
import { PLAN_LIMITS } from "@/lib/plans";
import { rulePresets, ruleTypes } from "@/lib/rules/config";
import { ruleSchema } from "@/lib/validations/rules";
import type { ActionResult } from "./auth";

const FAIL: ActionResult = { ok: false, error: "rules.saveFailed" };

function isNextControlFlow(e: unknown) {
  return !!e && typeof e === "object" && "digest" in e;
}

async function ruleCount(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]) {
  const { count } = await supabase.from("rules").select("id", { count: "exact", head: true });
  return count ?? 0;
}

export async function saveRuleAction(id: string | null, input: unknown): Promise<ActionResult> {
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  const rule = parsed.data;
  const config = ruleTypes[rule.ruleType as keyof typeof ruleTypes];
  const row = {
    name: rule.name,
    description: rule.description,
    rule_type: rule.ruleType,
    value: config.hasValue ? rule.value : null,
    is_active: rule.isActive,
  };

  try {
    const { supabase, user } = await requireUser();
    if (id) {
      const { error } = await supabase.from("rules").update(row).eq("id", id).eq("user_id", user.id);
      if (error) return FAIL;
    } else {
      const plan = await getPlan(supabase, user.id);
      if ((await ruleCount(supabase)) >= PLAN_LIMITS[plan].rules) return { ok: false, error: "errors.limitRules" };
      const { error } = await supabase.from("rules").insert({ ...row, user_id: user.id });
      if (error) return FAIL;
    }
    revalidatePath("/rules");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function setRuleActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("rules").update({ is_active: !!isActive }).eq("id", id).eq("user_id", user.id);
    if (error) return FAIL;
    revalidatePath("/rules");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function deleteRuleAction(id: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("rules").delete().eq("id", id).eq("user_id", user.id);
    if (error) return { ok: false, error: "rules.deleteFailed" };
    revalidatePath("/rules");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { ok: false, error: "rules.deleteFailed" };
  }
}

/** Добавляет готовый пример правила. Название и описание передаёт клиент на языке пользователя. */
export async function addPresetRuleAction(presetKey: string, name: string, description: string): Promise<ActionResult> {
  const preset = rulePresets.find((p) => p.key === presetKey);
  if (!preset) return { ok: false, error: "errors.generic" };
  return saveRuleAction(null, {
    name,
    description,
    ruleType: preset.type,
    value: preset.value,
    isActive: true,
  });
}

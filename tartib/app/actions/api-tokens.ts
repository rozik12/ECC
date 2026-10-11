"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { generateToken, hashToken, tokenPrefix } from "@/lib/api-token";
import type { ActionResult } from "./auth";

export type CreateTokenResult = { ok: true; token: string } | { ok: false; error: string };

/** Создаёт личный ключ. Сам ключ возвращается один раз и нигде не хранится: в базе остаётся только хэш. */
export async function createApiTokenAction(name: string): Promise<CreateTokenResult> {
  const parsed = z.string().trim().min(1).max(40).safeParse(name);
  if (!parsed.success) return { ok: false, error: "apitoken.invalid" };
  try {
    const { supabase, user } = await requireUser();
    const token = generateToken();
    const { error } = await supabase.from("api_tokens").insert({ user_id: user.id, name: parsed.data, prefix: tokenPrefix(token), token_hash: await hashToken(token) });
    if (error) return { ok: false, error: /limit_tokens/.test(error.message) ? "apitoken.limit" : "errors.generic" };
    revalidatePath("/settings");
    return { ok: true, token };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: "errors.generic" };
  }
}

export async function deleteApiTokenAction(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "errors.generic" };
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("api_tokens").delete().eq("id", id).eq("user_id", user.id);
    if (error) return { ok: false, error: "errors.generic" };
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: "errors.generic" };
  }
}

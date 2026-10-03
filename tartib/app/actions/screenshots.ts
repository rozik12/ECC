"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "./auth";

const BUCKET = "trade-screenshots";
const MAX_BYTES = 5 * 1024 * 1024;

/** Определяет тип по первым байтам файла, а не по расширению, которое можно подделать. */
function detectImage(bytes: Uint8Array): { ext: string; mime: string } | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
    return { ext: "webp", mime: "image/webp" };
  return null;
}

function isNextControlFlow(e: unknown) {
  return !!e && typeof e === "object" && "digest" in e;
}

export async function uploadScreenshotAction(tradeId: string, formData: FormData): Promise<ActionResult> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "screenshot.invalid" };
    if (file.size > MAX_BYTES) return { ok: false, error: "screenshot.tooBig" };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = detectImage(bytes);
    if (!kind) return { ok: false, error: "screenshot.invalid" };

    const { supabase, user } = await requireUser();
    const { data: trade } = await supabase.from("trades").select("id, screenshot_path").eq("id", tradeId).eq("user_id", user.id).maybeSingle();
    if (!trade) return { ok: false, error: "trades.notFound" };

    const path = `${user.id}/${tradeId}/${crypto.randomUUID()}.${kind.ext}`;
    const { error: upError } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: kind.mime });
    if (upError) return { ok: false, error: "screenshot.failed" };

    const { error } = await supabase.from("trades").update({ screenshot_path: path }).eq("id", tradeId).eq("user_id", user.id);
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      return { ok: false, error: "screenshot.failed" };
    }
    if (trade.screenshot_path) await supabase.storage.from(BUCKET).remove([trade.screenshot_path]);
    revalidatePath(`/trades/${tradeId}`);
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { ok: false, error: "screenshot.failed" };
  }
}

export async function removeScreenshotAction(tradeId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { data: trade } = await supabase.from("trades").select("screenshot_path").eq("id", tradeId).eq("user_id", user.id).maybeSingle();
    if (!trade) return { ok: false, error: "trades.notFound" };
    const { error } = await supabase.from("trades").update({ screenshot_path: null }).eq("id", tradeId).eq("user_id", user.id);
    if (error) return { ok: false, error: "screenshot.failed" };
    if (trade.screenshot_path) await supabase.storage.from(BUCKET).remove([trade.screenshot_path]);
    revalidatePath(`/trades/${tradeId}`);
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return { ok: false, error: "screenshot.failed" };
  }
}

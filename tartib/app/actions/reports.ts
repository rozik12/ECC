"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getPlan } from "@/lib/data";
import { safeTimeZone } from "@/lib/time";
import { buildAndSaveWeeklyReport } from "@/services/reports";
import type { ActionResult } from "./auth";

export async function generateWeeklyReportAction(): Promise<ActionResult> {
  try {
    const { supabase, user, profile } = await requireUser();
    // Недельные отчёты — функция тарифа PRO. Проверяем на сервере.
    if ((await getPlan(supabase, user.id)) !== "pro") return { ok: false, error: "reports.proOnly" };
    await buildAndSaveWeeklyReport(supabase, user.id, safeTimeZone(profile?.timezone));
    revalidatePath("/statistics");
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: "reports.failed" };
  }
}

"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { safeTimeZone } from "@/lib/time";
import { requireUser } from "@/lib/auth";
import { onboardingSchema } from "@/lib/validations/onboarding";
import type { ActionResult } from "./auth";

export async function completeOnboardingAction(input: unknown): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  const { name, language, currency, accountName, startingBalance, timezone } = parsed.data;

  try {
    const { supabase, user } = await requireUser();

    const { data: existing } = await supabase
      .from("trading_accounts")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (!existing || existing.length === 0) {
      const { error } = await supabase.from("trading_accounts").insert({
        user_id: user.id,
        name: accountName,
        starting_balance: startingBalance,
        currency,
      });
      if (error) return { ok: false, error: "errors.generic" };
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ name, language, currency, onboarded: true, timezone: safeTimeZone(timezone) })
      .eq("id", user.id);
    if (profileError) return { ok: false, error: "errors.generic" };

    if (isLocale(language)) {
      (await cookies()).set(LOCALE_COOKIE, language, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    }
    return { ok: true };
  } catch (e) {
    // redirect() внутри requireUser — это служебное исключение Next.js, его нельзя глотать
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: "errors.generic" };
  }
}

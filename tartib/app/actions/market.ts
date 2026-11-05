"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getTickers, defaultDirection } from "@/lib/market-feed";
import { normalizePair } from "@/lib/market-data";
import type { ActionResult } from "./auth";

const FAIL = { ok: false, error: "errors.generic" } as const;
const isNextControlFlow = (e: unknown) => !!e && typeof e === "object" && "digest" in e;

/** «BTC», «btc/usdt», «ETHUSDT» → BTCUSDT; без указанной валюты котировки берётся USDT. */
function toSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (/^[A-Z0-9]{2,12}$/.test(s) && !normalizePair(s)) return normalizePair(`${s}USDT`)?.symbol ?? null;
  return normalizePair(s)?.symbol ?? null;
}

/** Пара должна существовать на бирже. Если биржа сейчас не отвечает, проверить нельзя и пара принимается. */
async function pairExists(symbol: string): Promise<boolean> {
  const tickers = await getTickers();
  return tickers.length === 0 || tickers.some((t) => t.symbol === symbol);
}

function limitError(message: string): string | null {
  if (message.includes("limit_watchlist")) return "market.limitWatch";
  if (message.includes("limit_alerts")) return "market.limitAlerts";
  return null;
}

export async function addWatchAction(raw: unknown): Promise<ActionResult> {
  const symbol = typeof raw === "string" ? toSymbol(raw.slice(0, 30)) : null;
  if (!symbol || !(await pairExists(symbol))) return { ok: false, error: "market.badSymbol" };
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("watchlist").insert({ user_id: user.id, symbol });
    if (error && error.code !== "23505") return { ok: false, error: limitError(error.message) ?? "errors.generic" };
    revalidatePath("/market");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function removeWatchAction(raw: unknown): Promise<ActionResult> {
  const symbol = z.string().regex(/^[A-Z0-9]{4,24}$/).safeParse(raw);
  if (!symbol.success) return FAIL;
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("watchlist").delete().eq("user_id", user.id).eq("symbol", symbol.data);
    if (error) return FAIL;
    revalidatePath("/market");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

const alertSchema = z.object({ symbol: z.string().min(2).max(30), price: z.number().positive().max(1e12), direction: z.enum(["above", "below", "auto"]), note: z.string().max(100).default("") });

export async function createAlertAction(input: unknown): Promise<ActionResult> {
  const parsed = alertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "market.badAlert" };
  const symbol = toSymbol(parsed.data.symbol);
  if (!symbol || !(await pairExists(symbol))) return { ok: false, error: "market.badSymbol" };
  try {
    const { supabase, user } = await requireUser();
    let direction = parsed.data.direction;
    if (direction === "auto") {
      const last = (await getTickers()).find((t) => t.symbol === symbol)?.last;
      if (!last) return { ok: false, error: "market.noPrice" };
      direction = defaultDirection(parsed.data.price, last);
    }
    const { error } = await supabase.from("price_alerts").insert({ user_id: user.id, symbol, direction, price: parsed.data.price, note: parsed.data.note.trim() });
    if (error) return { ok: false, error: limitError(error.message) ?? "errors.generic" };
    revalidatePath("/market");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

export async function deleteAlertAction(id: unknown): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return FAIL;
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("price_alerts").delete().eq("id", parsed.data).eq("user_id", user.id);
    if (error) return FAIL;
    revalidatePath("/market");
    return { ok: true };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    return FAIL;
  }
}

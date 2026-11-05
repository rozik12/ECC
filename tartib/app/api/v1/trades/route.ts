import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { looksLikeToken } from "@/lib/api-token";
import { getSupabaseEnv } from "@/lib/supabase/env";

const H = { "cache-control": "no-store" };
const err = (status: number, code: string) => NextResponse.json({ error: code }, { status, headers: H });

/**
 * Запись сделки роботом или скриптом.
 * POST /api/v1/trades с заголовком Authorization: Bearer tt_… и JSON: instrument, direction ("long"/"short"), entry_price, position_size
 * и по желанию exit_price, market, fees, funding, leverage, pnl, traded_at, closed_at, strategy, comment, account.
 * Ключ создаётся в «Настройках». Проверка торговых правил для таких сделок не выполняется, они помечены тегом «api».
 */
export async function POST(request: Request) {
  const env = getSupabaseEnv();
  if (!env) return err(503, "not_configured");
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!looksLikeToken(token)) return err(401, "invalid_token");
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 20_000) return err(413, "payload_too_large");
  let body: unknown;
  try { body = await request.json(); } catch { return err(400, "invalid_json"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return err(400, "invalid_payload");

  const supabase = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("api_log_trade", { p_token: token, p: body });
  if (error) {
    const m = error.message;
    if (/invalid_token/.test(m)) return err(401, "invalid_token");
    if (/rate_limited/.test(m)) return err(429, "rate_limited");
    if (/invalid_payload/.test(m)) return err(400, "invalid_payload");
    if (/no_account/.test(m)) return err(422, "no_account");
    return err(500, "failed");
  }
  return NextResponse.json({ id: data }, { status: 201, headers: H });
}

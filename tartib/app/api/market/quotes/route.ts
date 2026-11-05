import { NextResponse } from "next/server";
import { isSignedIn } from "@/lib/api-auth";
import { sharedJson } from "@/lib/edge-cache";
import { fetchQuotes, normalizeTicker } from "@/lib/stock-data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { ALL_WORLD_SYMBOLS } from "@/lib/world-markets";

const KNOWN = new Set(ALL_WORLD_SYMBOLS);
/** Сколько секунд один ответ источника служит всем пользователям сразу */
const SHARED_SECONDS = 10;

/**
 * Котировки золота, индексов, валют, нефти и акций для страниц «Рынок» и «Графики».
 * GET ?symbols=GC=F,EURUSD=X (не больше 40; источнику они уходят пачками по 20). Только для вошедших; адрес не отдаёт ничего, кроме разрешённых символов.
 * Источник опрашивается не чаще одного раза в 10 секунд на дата-центр, сколько бы людей ни было на сайте.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!(await isSignedIn(await createClient()))) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });

  const raw = (new URL(request.url).searchParams.get("symbols") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 40);
  const symbols = [...new Set(raw.filter((s) => KNOWN.has(s) || normalizeTicker(s, "auto") === s))];
  if (symbols.length === 0) return NextResponse.json({ quotes: [] }, { headers: { "cache-control": "no-store" } });

  const quotes = await sharedJson(`quotes:${[...symbols].sort().join(",")}`, SHARED_SECONDS, async () => {
    const q = await fetchQuotes(symbols, fetch, SHARED_SECONDS);
    return q.length > 0 ? q.map((x) => ({ symbol: x.symbol, price: x.price, changePct: x.changePct })) : null;
  });
  if (!quotes) return NextResponse.json({ error: "unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ quotes }, { headers: { "cache-control": "no-store" } });
}

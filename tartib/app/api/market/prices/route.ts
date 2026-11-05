import { NextResponse } from "next/server";
import { isSignedIn } from "@/lib/api-auth";
import { sharedJson } from "@/lib/edge-cache";
import { getTickers, priceMap } from "@/lib/market-feed";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Цены криптопар для списка наблюдения и лидеров, когда не работает живой поток OKX. GET ?symbols=BTCUSDT,ETHUSDT (не больше 30). Только для вошедших.
 * Разбор большого списка пар делается не чаще раза в 10 секунд на дата-центр, а не при каждом опросе.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!(await isSignedIn(await createClient()))) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });

  const symbols = (new URL(request.url).searchParams.get("symbols") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9]{4,24}$/.test(s)).slice(0, 30);
  if (symbols.length === 0) return NextResponse.json({ prices: {} }, { headers: { "cache-control": "no-store" } });
  const prices = await sharedJson(`prices:${[...symbols].sort().join(",")}`, 10, async () => {
    const tickers = await getTickers(fetch, 10);
    return tickers.length === 0 ? null : priceMap(tickers, symbols);
  });
  if (!prices) return NextResponse.json({ error: "unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ prices }, { headers: { "cache-control": "no-store" } });
}

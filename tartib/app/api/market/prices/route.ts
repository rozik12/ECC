import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { getTickers, priceMap } from "@/lib/market-feed";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Живые цены для списка наблюдения. GET ?symbols=BTCUSDT,ETHUSDT (не больше 30). Только для вошедших пользователей. */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const user = await getApiUser(await createClient());
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });

  const symbols = (new URL(request.url).searchParams.get("symbols") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9]{4,24}$/.test(s)).slice(0, 30);
  if (symbols.length === 0) return NextResponse.json({ prices: {} }, { headers: { "cache-control": "no-store" } });
  const tickers = await getTickers(fetch, 10);
  if (tickers.length === 0) return NextResponse.json({ error: "unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ prices: priceMap(tickers, symbols) }, { headers: { "cache-control": "private, max-age=5" } });
}

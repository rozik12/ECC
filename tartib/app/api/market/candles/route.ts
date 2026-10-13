import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { candleWindow, fetchCandles, isTimeframe, normalizePair, TIMEFRAMES } from "@/lib/market-data";
import { fetchStockCandles, normalizeTicker } from "@/lib/stock-data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const JSON_HEADERS = { "cache-control": "private, max-age=60" };

/**
 * Свечи для графика сделки. Только для вошедших пользователей (чтобы адрес не стал открытым прокси к бирже)
 * и только для криптопар; всё остальное проверяется и отклоняется.
 * GET ?instrument=BTCUSDT&tf=1h&at=2026-10-01T10:00:00Z
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const user = await getApiUser(await createClient());
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });

  const q = new URL(request.url).searchParams;
  const tf = q.get("tf") ?? "1h";
  const at = Date.parse(q.get("at") ?? "");
  const instrument = (q.get("instrument") ?? "").slice(0, 40);
  const market = q.get("market") ?? "crypto";
  if (!["crypto", "forex", "stocks", "futures", "options", "metals", "auto"].includes(market)) return NextResponse.json({ error: "bad_request" }, { status: 400, headers: JSON_HEADERS });
  // «auto» (раздел «Графики»): сначала криптопара, потом акции, индексы, металлы, нефть и валюты
  const cryptoFirst = market === "auto" ? normalizePair(instrument) : null;
  const ticker = cryptoFirst || market === "crypto" ? null : normalizeTicker(instrument, market);
  const pair = ticker ? null : (cryptoFirst ?? normalizePair(instrument));
  if (!isTimeframe(tf) || !Number.isFinite(at) || at < Date.UTC(2017, 0, 1) || at > Date.now() + 86_400_000) return NextResponse.json({ error: "bad_request" }, { status: 400, headers: JSON_HEADERS });
  if (!pair && !ticker) return NextResponse.json({ error: "unsupported" }, { status: 404, headers: JSON_HEADERS });

  // «Живой» график без привязки к сделке: последние 120 свечей до сейчас; у бирж с перерывами (акции, металлы) окно шире, чтобы захватить выходные
  const live = q.get("live") === "1";
  const lookback = live ? (ticker ? 400 : 120) * TIMEFRAMES[tf] : 0;
  const { start, end } = live ? { start: Date.now() - lookback, end: Date.now() } : candleWindow(at, tf);
  const tail = <T,>(xs: T[]) => (live ? xs.slice(-120) : xs);
  if (ticker) {
    const r = await fetchStockCandles(ticker, tf, start, end);
    if (r.candles === null) return NextResponse.json({ error: "unavailable", attempts: [{ source: "yahoo", status: r.status }] }, { status: 502, headers: { "cache-control": "no-store" } });
    if (r.candles.length === 0) return NextResponse.json({ error: "no_data" }, { status: 404, headers: JSON_HEADERS });
    return NextResponse.json({ symbol: ticker, tf, source: "yahoo", candles: tail(r.candles).map((c) => [c.t, c.o, c.h, c.l, c.c, c.v]) }, { headers: JSON_HEADERS });
  }
  if (!pair) return NextResponse.json({ error: "unsupported" }, { status: 404, headers: JSON_HEADERS });
  const result = await fetchCandles(pair, tf, start, end);
  if (result.candles === null) return NextResponse.json({ error: "unavailable", attempts: result.attempts }, { status: 502, headers: { "cache-control": "no-store" } });
  if (result.candles.length === 0) return NextResponse.json({ error: "no_data" }, { status: 404, headers: JSON_HEADERS });
  return NextResponse.json({ symbol: pair.symbol, tf, source: result.source, candles: tail(result.candles).map((c) => [c.t, c.o, c.h, c.l, c.c, c.v]) }, { headers: JSON_HEADERS });
}

import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { fetchQuotes, normalizeTicker, type Quote } from "@/lib/stock-data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { ALL_WORLD_SYMBOLS } from "@/lib/world-markets";

const KNOWN = new Set(ALL_WORLD_SYMBOLS);
// Короткая память на сервере: если несколько вкладок спрашивают одно и то же, источник тревожим раз в несколько секунд
const memo = new Map<string, { at: number; quotes: Quote[] }>();
const MEMO_MS = 4000;

/**
 * Живые котировки золота, индексов, валют, нефти и акций для страниц «Рынок» и «Графики».
 * GET ?symbols=GC=F,EURUSD=X (не больше 20). Только для вошедших; адрес не отдаёт ничего, кроме разрешённых символов.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const user = await getApiUser(await createClient());
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });

  const raw = (new URL(request.url).searchParams.get("symbols") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);
  const symbols = [...new Set(raw.filter((s) => KNOWN.has(s) || normalizeTicker(s, "auto") === s))];
  if (symbols.length === 0) return NextResponse.json({ quotes: [] }, { headers: { "cache-control": "no-store" } });

  const key = [...symbols].sort().join(",");
  const hit = memo.get(key);
  let quotes: Quote[];
  if (hit && Date.now() - hit.at < MEMO_MS) quotes = hit.quotes;
  else {
    quotes = await fetchQuotes(symbols, fetch, 3);
    if (quotes.length > 0) {
      memo.set(key, { at: Date.now(), quotes });
      if (memo.size > 50) memo.delete(memo.keys().next().value as string);
    }
  }
  if (quotes.length === 0) return NextResponse.json({ error: "unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ quotes: quotes.map((q) => ({ symbol: q.symbol, price: q.price, changePct: q.changePct })) }, { headers: { "cache-control": "no-store" } });
}

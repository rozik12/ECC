import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { alertTriggered, classifyFng, clearMarketCache, defaultDirection, getCalendar, getTickers, isFearGreed, parseCachedCalendar, parseCalendar, parseDominance, parseFearGreed, parseOkxTickers, priceMap, topMovers, upcomingEvents } from "../lib/market-feed.ts";

test("данные рынка: копия в боте совпадает с сайтом", () => {
  assert.equal(readFileSync("supabase/functions/telegram-bot/feed.ts", "utf8"), readFileSync("lib/market-feed.ts", "utf8"));
});

test("страх и жадность: границы категорий и разбор ответа", () => {
  for (const [v, l] of [[0, "extreme_fear"], [24, "extreme_fear"], [25, "fear"], [44, "fear"], [45, "neutral"], [55, "neutral"], [56, "greed"], [75, "greed"], [76, "extreme_greed"], [100, "extreme_greed"]] as const) assert.equal(classifyFng(v), l, String(v));
  const r = parseFearGreed({ data: [{ value: "59", timestamp: "1791504000" }, { value: "52" }] });
  assert.deepEqual(r, { value: 59, label: "greed", previous: 52, at: 1791504000000 });
  assert.equal(parseFearGreed({ data: [{ value: "abc" }] }), null);
  assert.equal(parseFearGreed({ data: [{ value: "150" }] }), null);
  assert.equal(parseFearGreed(null), null);
  assert.equal(parseFearGreed({ data: [] }), null);
  assert.equal(parseFearGreed({ data: [{ value: "40", timestamp: "1" }] })?.previous, null);
});

const row = (instId: string, last: string, open: string, vol: string) => ({ instId, last, open24h: open, volCcy24h: vol });
const TICKERS = { code: "0", data: [row("BTC-USDT", "110", "100", "9000000"), row("ETH-USDT", "90", "100", "8000000"), row("PEPE-USDT", "3", "1", "100"), row("SOL-USDT", "104", "100", "5000000"), row("USDC-USDT", "1.0001", "1", "9999999"), row("BTC-EUR", "100", "100", "9000000"), row("BAD-USDT", "0", "1", "1"), row("XRP-USDT", "99", "100", "3000000")] };

test("тикеры: разбор, изменение за сутки, мусор отбрасывается", () => {
  const t = parseOkxTickers(TICKERS);
  assert.equal(t.length, 7); // строка с нулевой ценой отброшена
  const btc = t.find((x) => x.symbol === "BTCUSDT")!;
  assert.equal(btc.base, "BTC");
  assert.equal(btc.quote, "USDT");
  assert.ok(Math.abs(btc.change - 10) < 1e-9);
  assert.deepEqual(parseOkxTickers({ code: "1", data: [] }), []);
  assert.deepEqual(parseOkxTickers(null), []);
});

test("лидеры: только ликвидные пары к USDT, стейблы и «пыль» не попадают", () => {
  const m = topMovers(parseOkxTickers(TICKERS), { minVolume: 2_000_000, limit: 3 });
  assert.deepEqual(m.gainers.map((x) => x.symbol), ["BTCUSDT", "SOLUSDT"]); // только растущие
  assert.deepEqual(m.losers.map((x) => x.symbol), ["ETHUSDT", "XRPUSDT"]); // только падающие
  assert.equal(m.gainers.some((x) => x.symbol === "PEPEUSDT"), false); // оборот слишком мал
  assert.equal(m.gainers.some((x) => x.base === "USDC"), false);
  assert.equal(m.gainers.some((x) => x.quote === "EUR"), false);
  assert.equal(m.gainers[0].symbol, "BTCUSDT");
  assert.equal(m.losers[0].symbol, "ETHUSDT");
  assert.deepEqual(priceMap(parseOkxTickers(TICKERS), ["ETHUSDT", "NOPE"]), { ETHUSDT: { last: 90, change: -10 } });
});

test("алерты: срабатывание и направление по умолчанию", () => {
  assert.equal(alertTriggered("above", 100, 100), true);
  assert.equal(alertTriggered("above", 100, 99.99), false);
  assert.equal(alertTriggered("below", 100, 100), true);
  assert.equal(alertTriggered("below", 100, 100.01), false);
  assert.equal(defaultDirection(110, 100), "above");
  assert.equal(defaultDirection(90, 100), "below");
});

test("календарь: разбор, сортировка, предстоящие и фильтр по важности", () => {
  const body = [
    { title: "CPI m/m", country: "USD", date: "2026-10-09T08:30:00-04:00", impact: "High", forecast: "0.3%", previous: "0.2%" },
    { title: "Bank Holiday", country: "AUD", date: "2026-10-08T00:00:00-04:00", impact: "Holiday", forecast: "", previous: "" },
    { title: "Speech", country: "EUR", date: "2026-10-09T10:00:00-04:00", impact: "Low" },
    { title: "Rate decision", country: "GBP", date: "2026-10-09T07:00:00-04:00", impact: "Medium" },
    { title: "", country: "X", date: "2026-10-09T07:00:00-04:00", impact: "High" },
    { title: "Bad date", country: "X", date: "not a date", impact: "High" },
    { title: "Unknown impact", country: "X", date: "2026-10-09T07:00:00-04:00", impact: "???" },
  ];
  const ev = parseCalendar(body);
  assert.deepEqual(ev.map((e) => e.title), ["Bank Holiday", "Rate decision", "CPI m/m", "Speech"]);
  assert.equal(ev[2].at, Date.parse("2026-10-09T12:30:00Z"));
  const now = Date.parse("2026-10-09T11:20:00Z"); // 07:20 по Нью-Йорку: «Rate decision» (07:00) вышло 20 минут назад
  assert.deepEqual(upcomingEvents(ev, now).map((e) => e.title), ["Rate decision", "CPI m/m"]); // Rate decision вышло 20 минут назад, ещё в запасе
  assert.deepEqual(upcomingEvents(ev, now, { impacts: ["high"] }).map((e) => e.title), ["CPI m/m"]);
  assert.deepEqual(upcomingEvents(ev, now + 3 * 3600_000).map((e) => e.title), []);
  assert.deepEqual(parseCalendar("oops"), []);
});

test("доминирование BTC и загрузка с запасным ответом", async () => {
  clearMarketCache();
  assert.equal(parseDominance({ data: { market_cap_percentage: { btc: 58.31 } } }), 58.31);
  assert.equal(parseDominance({ data: {} }), null);
  assert.equal(parseDominance({ data: { market_cap_percentage: { btc: 250 } } }), null);
  assert.deepEqual(await getTickers(() => Promise.reject(new Error("net"))), []);
  assert.deepEqual(await getTickers(() => Promise.resolve(new Response("x", { status: 500 }))), []);
  assert.equal((await getTickers(() => Promise.resolve(new Response(JSON.stringify(TICKERS))))).length, 7);
});

import { parseAlertArgs, toSymbol } from "../supabase/functions/telegram-bot/feedcmd.ts";

test("бот: копия данных о парах совпадает с сайтом", () => {
  assert.equal(readFileSync("supabase/functions/telegram-bot/marketdata.ts", "utf8"), readFileSync("lib/market-data.ts", "utf8"));
});

test("бот: название пары и аргументы /alert", () => {
  assert.equal(toSymbol("btc"), "BTCUSDT");
  assert.equal(toSymbol("ETH/USDT"), "ETHUSDT");
  assert.equal(toSymbol("solusdt"), "SOLUSDT");
  assert.equal(toSymbol("!!"), null);
  assert.equal(toSymbol("BTC;DROP"), null);
  assert.deepEqual(parseAlertArgs("BTC 70000"), { symbol: "BTCUSDT", price: 70000, direction: null });
  assert.deepEqual(parseAlertArgs("eth 3 500,5 ниже".replace("3 500,5", "3500,5")), { symbol: "ETHUSDT", price: 3500.5, direction: "below" });
  assert.deepEqual(parseAlertArgs("SOLUSDT 150 above"), { symbol: "SOLUSDT", price: 150, direction: "above" });
  assert.deepEqual(parseAlertArgs("BTC 70000 yuqori"), { symbol: "BTCUSDT", price: 70000, direction: "above" });
  for (const bad of ["", "BTC", "BTC abc", "BTC -5", "BTC 0", "BTC 1 sideways", "BTC 1 above extra", "BTC 1e15"]) assert.equal(parseAlertArgs(bad), null, bad);
});

test("календарь: следующая неделя подгружается, повторы убираются, 404 не мешает", async () => {
  clearMarketCache();
  const ev = (title: string, date: string) => ({ title, country: "USD", date, impact: "High" });
  const both = (u: string) => Promise.resolve(new Response(JSON.stringify(u.includes("nextweek") ? [ev("B", "2026-10-12T08:30:00Z"), ev("A", "2026-10-09T08:30:00Z")] : [ev("A", "2026-10-09T08:30:00Z")])));
  assert.deepEqual((await getCalendar(both)).map((e) => e.title), ["A", "B"]);
  clearMarketCache();
  const only = (u: string) => Promise.resolve(u.includes("nextweek") ? new Response("<html>404</html>", { status: 404 }) : new Response(JSON.stringify([ev("A", "2026-10-09T08:30:00Z")])));
  assert.deepEqual((await getCalendar(only)).map((e) => e.title), ["A"]);
  clearMarketCache();
  assert.deepEqual(await getCalendar(() => Promise.reject(new Error("net"))), []);
});

test("кэш: при отказе источника отдаются последние известные данные, а пустой ответ не затирает их", async () => {
  clearMarketCache();
  const ok = () => Promise.resolve(new Response(JSON.stringify(TICKERS)));
  const bad = () => Promise.resolve(new Response("x", { status: 429 }));
  assert.equal((await getTickers(ok, 0)).length, 7);
  assert.equal((await getTickers(bad, 0)).length, 7); // ttl 0 — запрос идёт заново, источник отказал, берём прежние данные
  assert.equal((await getTickers(bad, 600)).length, 7); // свежие данные из памяти, источник не вызывается
  clearMarketCache();
  assert.equal((await getTickers(bad, 0)).length, 0); // ничего не запомнено — честная пустота
});

test("кэш рынка: данные из базы проверяются по форме и обрезаются", () => {
  const good = { title: "CPI", country: "USD", at: 1000, impact: "high", forecast: "0.3%", previous: "0.2%" };
  const cleaned = parseCachedCalendar([{ ...good, at: 3000 }, good, { title: 5, at: 1, impact: "high" }, { ...good, impact: "evil" }, { ...good, at: "x" }, null, "str", { ...good, title: "T".repeat(500), at: 2000 }]);
  assert.deepEqual(cleaned.map((e) => e.at), [1000, 2000, 3000]);
  assert.equal(cleaned[1].title.length, 140);
  assert.deepEqual(parseCachedCalendar({ not: "array" }), []);
  assert.equal(isFearGreed({ value: 50, label: "neutral", previous: null, at: 0 }), true);
  assert.equal(isFearGreed({ value: 500, label: "neutral" }), false);
  assert.equal(isFearGreed({ value: 50, label: "<script>" }), false);
  assert.equal(isFearGreed(null), false);
});

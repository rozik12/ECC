import test from "node:test";
import assert from "node:assert/strict";
import { instIdOf, OkxLive, parseOkxTick, type LiveStatus, type LiveTick } from "../lib/live-feed.ts";

const msg = (instId: string, last: string, open24h: string) => JSON.stringify({ arg: { channel: "tickers", instId }, data: [{ instId, last, open24h }] });

test("разбор сообщений потока OKX", () => {
  const t = parseOkxTick(msg("BTC-USDT", "110", "100"));
  assert.ok(t && t.instId === "BTC-USDT" && t.last === 110 && Math.abs(t.change - 10) < 1e-9);
  assert.equal(parseOkxTick("pong"), null);
  assert.equal(parseOkxTick(JSON.stringify({ event: "subscribe", arg: { channel: "tickers" } })), null);
  assert.equal(parseOkxTick(msg("BTC-USDT", "abc", "100")), null);
  assert.equal(parseOkxTick(msg("BTC-USDT", "10", "0")), null);
  assert.equal(parseOkxTick(123 as never), null);
  assert.equal(parseOkxTick("x".repeat(30_000)), null);
});

test("названия пар", () => {
  assert.equal(instIdOf("btcusdt"), "BTC-USDT");
  assert.equal(instIdOf("ETH/USDT"), "ETH-USDT");
  assert.equal(instIdOf("AAPL"), null);
});

class FakeWs {
  static last: FakeWs | null = null;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;
  constructor(url: string) { this.url = url; FakeWs.last = this; }
  send(d: string) { this.sent.push(d); }
  close() { this.closed = true; }
}

test("подписка, цены, смена статуса и остановка", () => {
  const ticks: LiveTick[] = [];
  const statuses: LiveStatus[] = [];
  const feed = new OkxLive(FakeWs as never, "wss://test");
  feed.start(["BTCUSDT", "AAPL", "ETH/USDT"], (t) => ticks.push(t), (s) => statuses.push(s));
  const ws = FakeWs.last as FakeWs;
  assert.equal(ws.url, "wss://test");
  ws.onopen?.();
  const sub = JSON.parse(ws.sent[0]);
  assert.equal(sub.op, "subscribe");
  assert.deepEqual(sub.args.map((a: { instId: string }) => a.instId), ["BTC-USDT", "ETH-USDT"]); // не криптопара пропущена
  ws.onmessage?.({ data: msg("ETH-USDT", "2500", "2000") });
  ws.onmessage?.({ data: "pong" });
  ws.onmessage?.({ data: msg("DOGE-USDT", "1", "1") }); // чужая пара
  assert.deepEqual(ticks, [{ symbol: "ETHUSDT", last: 2500, change: 25 }]);
  assert.deepEqual(statuses, ["connecting", "live"]);
  feed.stop();
  assert.ok(ws.closed);
});

test("без WebSocket или без пар — статус offline", () => {
  const st: LiveStatus[] = [];
  const none = new OkxLive(); (none as unknown as { Ctor: undefined }).Ctor = undefined; none.start(["BTCUSDT"], () => {}, (s) => st.push(s));
  new OkxLive(FakeWs as never).start(["AAPL"], () => {}, (s) => st.push(s));
  assert.deepEqual(st, ["offline", "offline"]);
});

// Живые цены криптовалют прямо в браузере: публичный поток OKX (WebSocket). Сервер сайта в этом не участвует, поэтому нагрузки на него нет.
// Файл без зависимостей от интерфейса, чтобы его можно было тестировать.
import { normalizePair } from "./market-data.ts";

export const OKX_WS = "wss://ws.okx.com:8443/ws/v5/public";

export type LiveTick = { symbol: string; last: number; change: number };
export type LiveStatus = "connecting" | "live" | "offline";

/** BTCUSDT → BTC-USDT (формат OKX). Не криптопара → null. */
export function instIdOf(symbol: string): string | null {
  const p = normalizePair(symbol);
  return p ? `${p.base}-${p.quote}` : null;
}

/** Сообщение потока OKX → цена и изменение за 24 часа, %. Служебные сообщения и мусор → null. */
export function parseOkxTick(raw: unknown): { instId: string; last: number; change: number } | null {
  if (typeof raw !== "string" || raw.length > 20_000) return null;
  let body: { arg?: { channel?: string }; data?: { instId?: string; last?: string; open24h?: string }[] };
  try { body = JSON.parse(raw); } catch { return null; }
  if (body?.arg?.channel !== "tickers") return null;
  const d = body.data?.[0];
  const last = Number(d?.last);
  const open = Number(d?.open24h);
  if (!d?.instId || !Number.isFinite(last) || last <= 0 || !Number.isFinite(open) || open <= 0) return null;
  return { instId: d.instId, last, change: ((last - open) / open) * 100 };
}

type WsLike = { send(data: string): void; close(): void; onopen: (() => void) | null; onmessage: ((e: { data: unknown }) => void) | null; onclose: (() => void) | null; onerror: (() => void) | null };
type WsCtor = new (url: string) => WsLike;

/** Подписка на цены нескольких пар. Сама переподключается (паузы 1, 2, 4… до 15 секунд) и держит соединение живым. */
export class OkxLive {
  private ws: WsLike | null = null;
  private stopped = true;
  private retry = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private ping: ReturnType<typeof setInterval> | null = null;
  private bySymbol = new Map<string, string>();

  private Ctor: WsCtor | undefined;
  private url: string;

  constructor(Ctor?: WsCtor, url = OKX_WS) {
    this.Ctor = Ctor ?? (globalThis as { WebSocket?: WsCtor }).WebSocket;
    this.url = url;
  }

  start(symbols: string[], onTick: (t: LiveTick) => void, onStatus: (s: LiveStatus) => void) {
    this.stop();
    this.bySymbol = new Map();
    for (const s of symbols) { const id = instIdOf(s); if (id) this.bySymbol.set(id, s.toUpperCase().replace(/[^A-Z0-9]/g, "")); }
    if (!this.Ctor || this.bySymbol.size === 0) return onStatus("offline");
    this.stopped = false;
    const connect = () => {
      if (this.stopped || !this.Ctor) return;
      onStatus("connecting");
      let ws: WsLike;
      try { ws = new this.Ctor(this.url); } catch { return onStatus("offline"); }
      this.ws = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ op: "subscribe", args: [...this.bySymbol.keys()].map((instId) => ({ channel: "tickers", instId })) }));
        this.ping = setInterval(() => { try { ws.send("ping"); } catch { /* соединение уже закрыто */ } }, 20_000);
      };
      ws.onmessage = (e) => {
        const tick = parseOkxTick(e.data);
        const symbol = tick ? this.bySymbol.get(tick.instId) : undefined;
        if (!tick || !symbol) return;
        this.retry = 0;
        onStatus("live");
        onTick({ symbol, last: tick.last, change: tick.change });
      };
      const lost = () => {
        if (this.ping) clearInterval(this.ping);
        this.ping = null;
        if (this.stopped || this.ws !== ws) return;
        onStatus("offline");
        this.timers.push(setTimeout(connect, Math.min(15_000, 1000 * 2 ** this.retry++)));
      };
      ws.onclose = lost;
      ws.onerror = () => { try { ws.close(); } catch { /* уже закрыто */ } };
    };
    connect();
  }

  stop() {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.onerror = null; ws.onmessage = null; try { ws.close(); } catch { /* уже закрыто */ } }
  }
}

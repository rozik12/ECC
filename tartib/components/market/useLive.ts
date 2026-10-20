"use client";

import { useEffect, useState } from "react";
import { OkxLive, type LiveTick } from "@/lib/live-feed";

/** Как часто опрашиваются цены, которые идут через наш сервер (крипто идёт отдельным потоком, раз в секунду) */
export const POLL_MS = 30_000;
/** Если пользователь 10 минут ничего не трогал, опрос приостанавливается до первого действия */
const IDLE_MS = 10 * 60_000;
let lastActive = Date.now();
if (typeof window !== "undefined") {
  for (const ev of ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"]) window.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true });
}
const active = () => document.visibilityState === "visible" && Date.now() - lastActive < IDLE_MS;

export type LivePrice = { last: number; change: number; dir: -1 | 0 | 1 };
export type LiveMode = "connecting" | "ws" | "poll";

function merge(prev: Record<string, LivePrice>, updates: { symbol: string; last: number; change: number }[]): Record<string, LivePrice> {
  const next = { ...prev };
  for (const u of updates) {
    const old = prev[u.symbol];
    next[u.symbol] = { last: u.last, change: u.change, dir: !old || old.last === u.last ? 0 : u.last > old.last ? 1 : -1 };
  }
  return next;
}

const toLive = (initial: Record<string, { last: number; change: number }>) =>
  Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, { ...v, dir: 0 as const }]));

/**
 * Криптоцены в реальном времени: поток OKX прямо в браузере, экран обновляется раз в секунду.
 * Если поток не подключился за 6 секунд (например, закрыт у провайдера), цены берутся запросом раз в 15 секунд.
 */
export function useLiveCrypto(symbols: string[], initial: Record<string, { last: number; change: number }> = {}) {
  const key = symbols.join(",");
  const [prices, setPrices] = useState<Record<string, LivePrice>>(() => toLive(initial));
  const [mode, setMode] = useState<LiveMode>("connecting");

  useEffect(() => {
    if (!key) return;
    const list = key.split(",");
    const buffer = new Map<string, LiveTick>();
    let live = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    const ctrl = new AbortController();

    const loadPoll = () => {
      if (!active()) return;
      fetch(`/api/market/prices?symbols=${key}`, { signal: ctrl.signal })
        .then(async (r) => {
          if (!r.ok || live) return;
          const body = (await r.json()) as { prices: Record<string, { last: number; change: number }> };
          setPrices((p) => merge(p, Object.entries(body.prices).map(([symbol, v]) => ({ symbol, ...v }))));
        })
        .catch(() => {});
    };

    const feed = new OkxLive();
    feed.start(
      list,
      (t) => buffer.set(t.symbol, t),
      (s) => {
        if (s === "live") {
          live = true;
          setMode("ws");
          if (poll) { clearInterval(poll); poll = null; }
        }
      },
    );
    // Экран обновляется раз в секунду: тики накапливаются и показываются пачкой. В скрытой вкладке ничего не перерисовывается.
    const flush = setInterval(() => {
      if (buffer.size === 0 || document.visibilityState !== "visible") return;
      const updates = [...buffer.values()];
      buffer.clear();
      setPrices((p) => merge(p, updates));
    }, 1000);
    const fallback = setTimeout(() => {
      if (live) return;
      setMode("poll");
      loadPoll();
      poll = setInterval(loadPoll, POLL_MS);
    }, 6000);

    return () => {
      feed.stop();
      clearInterval(flush);
      clearTimeout(fallback);
      if (poll) clearInterval(poll);
      ctrl.abort();
    };
  }, [key]);

  return { prices, mode };
}

export type LiveQuote = { price: number; changePct: number; dir: -1 | 0 | 1 };

/** Котировки золота, индексов, валют и акций: запрос каждые 30 секунд, пока вкладка на экране и пользователь не бездействует дольше 10 минут. */
export function useLiveQuotes(symbols: string[], initial: Record<string, { price: number; changePct: number }> = {}, intervalMs = POLL_MS) {
  const key = symbols.join(",");
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, { ...v, dir: 0 as const }])));
  const [ok, setOk] = useState(true);

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    let busy = false;
    const load = () => {
      if (busy || !active()) return;
      busy = true;
      fetch(`/api/market/quotes?symbols=${encodeURIComponent(key)}`, { signal: ctrl.signal })
        .then(async (r) => {
          if (!r.ok) return setOk(false);
          const body = (await r.json()) as { quotes: { symbol: string; price: number; changePct: number }[] };
          setOk(true);
          setQuotes((prev) => {
            const next = { ...prev };
            for (const q of body.quotes) {
              const old = prev[q.symbol];
              next[q.symbol] = { price: q.price, changePct: q.changePct, dir: !old || old.price === q.price ? 0 : q.price > old.price ? 1 : -1 };
            }
            return next;
          });
        })
        .catch(() => {})
        .finally(() => { busy = false; });
    };
    load();
    const id = setInterval(load, intervalMs);
    const onVisible = () => load();
    document.addEventListener("visibilitychange", onVisible);
    return () => { ctrl.abort(); clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [key, intervalMs]);

  return { quotes, ok };
}

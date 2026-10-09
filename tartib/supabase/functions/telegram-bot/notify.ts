// Уведомления бота: какие события создают запись и как запись превращается в сообщение.
// Логика событий — копия lib/notifications.ts с сайта (совпадение проверяет tests/notifications.test.ts).
import { tr, type Lang } from "./text.ts";

export type Params = Record<string, string | number | string[]>;
export type Draft = { kind: "achievement" | "violation" | "goal" | "report" | "announcement" | "price_alert"; params: Params };

export type TradeNotifyInput = {
  achBefore: string[]; achAfter: string[]; goalBefore: boolean; goalAfter: boolean; goal: number; percent: number | null; instrument: string; violated: string[];
};

export function buildTradeNotifications(i: TradeNotifyInput): Draft[] {
  const out: Draft[] = [];
  for (const id of i.achAfter) if (!i.achBefore.includes(id)) out.push({ kind: "achievement", params: { id } });
  if (i.violated.length > 0) out.push({ kind: "violation", params: { instrument: i.instrument.slice(0, 30), count: i.violated.length, rules: i.violated.slice(0, 3).map((r) => r.slice(0, 60)) } });
  if (!i.goalBefore && i.goalAfter && i.percent !== null) out.push({ kind: "goal", params: { percent: i.percent, goal: i.goal } });
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "");
const ACH_IDS = ["first_trade", "trades_10", "trades_50", "trades_100", "streak_5", "streak_10", "streak_20", "clean_week"];

/** Сообщение для Telegram. Параметры приходят из базы, поэтому каждый проверяется, обрезается и экранируется. */
export function renderNotification(lang: Lang, kind: string, params: unknown): string | null {
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  switch (kind) {
    case "achievement": {
      const id = str(p.id, 30);
      return tr(lang, "nAchievement", { name: ACH_IDS.includes(id) ? tr(lang, `ach_${id}`) : "" });
    }
    case "violation": {
      const rules = Array.isArray(p.rules) ? p.rules.map((r) => str(r, 60)).filter(Boolean).join(", ") : "";
      return tr(lang, "nViolation", { count: Number(p.count) || 0, details: esc(`${str(p.instrument, 30)}${rules ? `: ${rules}` : ""}`) });
    }
    case "goal":
      return tr(lang, "nGoal", { percent: Number(p.percent) || 0, goal: Number(p.goal) || 0 });
    case "report":
      return tr(lang, "nReport");
    case "price_alert":
      return tr(lang, p.direction === "below" ? "nPriceBelow" : "nPriceAbove", { symbol: esc(str(p.symbol, 24)), price: esc(str(p.price, 24)), last: esc(str(p.last, 24)) });
    case "announcement":
      return `📣 <b>${esc(str(p.title, 80))}</b>\n${esc(str(p.body, 500))}`;
    default:
      return null;
  }
}

// Уведомления: какие события создают запись и как запись превращается в текст.
// Тексты не хранятся в базе: там вид события и параметры, поэтому уведомление читается на языке пользователя.

export const NOTIFICATION_KINDS = ["achievement", "violation", "goal", "report", "announcement", "price_alert"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type Params = Record<string, string | number | string[]>;
export type Draft = { kind: NotificationKind; params: Params };

export type TradeNotifyInput = {
  /** Открытые достижения до и после записи сделки */
  achBefore: string[];
  achAfter: string[];
  /** Была ли достигнута месячная цель по дисциплине до и после */
  goalBefore: boolean;
  goalAfter: boolean;
  goal: number;
  percent: number | null;
  instrument: string;
  /** Названия нарушенных правил в этой сделке */
  violated: string[];
};

/** События после записи новой сделки. Копия для бота: supabase/functions/telegram-bot/notify.ts (проверяет tests/notifications.test.ts). */
export function buildTradeNotifications(i: TradeNotifyInput): Draft[] {
  const out: Draft[] = [];
  for (const id of i.achAfter) if (!i.achBefore.includes(id)) out.push({ kind: "achievement", params: { id } });
  if (i.violated.length > 0) out.push({ kind: "violation", params: { instrument: i.instrument.slice(0, 30), count: i.violated.length, rules: i.violated.slice(0, 3).map((r) => r.slice(0, 60)) } });
  if (!i.goalBefore && i.goalAfter && i.percent !== null) out.push({ kind: "goal", params: { percent: i.percent, goal: i.goal } });
  return out;
}

export type Described = { title: string; body: string; href: string | null };
type T = (key: string, vars?: Record<string, string | number>) => string;

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "");
const ACH_IDS = ["first_trade", "trades_10", "trades_50", "trades_100", "streak_5", "streak_10", "streak_20", "clean_week"];

/** Текст уведомления. Параметры берутся из базы, поэтому каждый проверяется и обрезается. */
export function describeNotification(kind: string, params: unknown, t: T): Described | null {
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  switch (kind) {
    case "achievement": {
      const id = str(p.id, 30);
      return { title: t("notifications.kinds.achievement"), body: ACH_IDS.includes(id) ? t(`achievements.items.${id}.name`) : "", href: "/statistics" };
    }
    case "violation": {
      const rules = Array.isArray(p.rules) ? p.rules.map((r) => str(r, 60)).filter(Boolean).join(", ") : "";
      return { title: t("notifications.kinds.violation", { count: Number(p.count) || 0 }), body: `${str(p.instrument, 30)}${rules ? `: ${rules}` : ""}`, href: "/trades" };
    }
    case "goal":
      return { title: t("notifications.kinds.goal"), body: t("notifications.bodies.goal", { percent: Number(p.percent) || 0, goal: Number(p.goal) || 0 }), href: "/statistics" };
    case "report":
      return { title: t("notifications.kinds.report"), body: t("notifications.bodies.report"), href: "/statistics" };
    case "announcement":
      return { title: str(p.title, 80), body: str(p.body, 500), href: null };
    case "price_alert": {
      const symbol = str(p.symbol, 24);
      return {
        title: t("notifications.kinds.price_alert", { symbol }),
        body: t(p.direction === "below" ? "notifications.bodies.priceBelow" : "notifications.bodies.priceAbove", { price: str(p.price, 24), last: str(p.last, 24) }),
        href: `/charts?pair=${encodeURIComponent(symbol)}`,
      };
    }
    default:
      return null;
  }
}

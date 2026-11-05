import type { Metadata } from "next";
import { DeleteChallenge } from "@/components/prop/DeleteChallenge";
import { PropForm } from "@/components/prop/PropForm";
import { Badge, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { fetchStatTrades, getAccounts } from "@/lib/data";
import { formatMoney, formatNumber, pnlTone } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { propState, type Challenge } from "@/lib/prop";
import { localDay } from "@/lib/statistics";
import { safeTimeZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("prop.title") };
}

function Bar({ label, value, text, tone }: { label: string; value: number; text: string; tone: "primary" | "ok" | "warn" | "bad" }) {
  const color = tone === "bad" ? "bg-danger" : tone === "warn" ? "bg-warning" : tone === "ok" ? "bg-success" : "bg-primary";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-muted">{label}</span><span className="font-medium tabular-nums">{text}</span></div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, Math.max(0, value)))}>
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, Math.max(value > 0 ? 2 : 0, value))}%` }} />
      </div>
    </div>
  );
}

/** Проп-челлендж: прогресс к цели, дневной лимит убытка и общая просадка по вашему журналу. */
export default async function PropPage() {
  const { t, locale } = await getTranslator();
  const { supabase, profile } = await requireUser();
  const tz = safeTimeZone(profile?.timezone);
  const [accounts, trades, { data }] = await Promise.all([getAccounts(supabase), fetchStatTrades(supabase), supabase.from("prop_challenges").select("*").order("created_at", { ascending: false })]);
  const today = localDay(new Date().toISOString(), tz);
  const currency = accounts[0]?.currency ?? profile?.currency ?? "USD";
  const money = (v: number, signed = false) => formatMoney(v, currency, locale, signed);
  const pct = (v: number, d = 1) => `${formatNumber(v, locale, d)}%`;

  const list: Challenge[] = (data ?? []).map((r) => ({
    id: String(r.id), name: String(r.name), accountId: r.account_id ? String(r.account_id) : null, startBalance: Number(r.start_balance), profitTargetPct: Number(r.profit_target_pct),
    maxDailyLossPct: Number(r.max_daily_loss_pct), maxTotalLossPct: Number(r.max_total_loss_pct), trailing: !!r.trailing_dd, minTradingDays: Number(r.min_trading_days), startDate: String(r.start_date), endDate: r.end_date ? String(r.end_date) : null,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("prop.title")}</h1>
        <p className="mt-1 text-muted">{t("prop.subtitle")}</p>
      </div>

      {list.length === 0 && <Card><p className="text-sm text-muted">{t("prop.empty")}</p></Card>}

      {list.map((c) => {
        const s = propState(trades, c, tz, today);
        const statusTone = s.status === "passed" ? "success" : s.status === "breached" ? "danger" : "primary";
        return (
          <Card key={c.id} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{c.name}</h2>
                <p className="text-xs text-muted">{t("prop.rules", { bal: money(c.startBalance), t: c.profitTargetPct, d: c.maxDailyLossPct, l: c.maxTotalLossPct })}{c.trailing ? ` · ${t("prop.trailingShort")}` : ""}</p>
              </div>
              <div className="flex items-center gap-1">
                <Badge tone={statusTone}>{t(`prop.status.${s.status}`)}</Badge>
                <DeleteChallenge id={c.id} />
              </div>
            </div>
            {s.status === "breached" && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{t(s.breachReason === "daily" ? "prop.breachDaily" : "prop.breachTotal", { day: s.breachDay ?? "" })}</p>}
            {s.status === "passed" && <p className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success">{t("prop.passedText")}</p>}
            <div className="space-y-4">
              <Bar label={t("prop.barTarget")} value={s.targetProgress} text={`${pct(s.profitPct, 2)} / ${pct(c.profitTargetPct, 1)}`} tone={s.status === "passed" ? "ok" : "primary"} />
              <Bar label={t("prop.barDaily")} value={s.dailyUsedPct} text={`${money(Math.max(0, -s.todayPnl))} / ${money(s.dailyLimit)}`} tone={s.dailyUsedPct >= 100 ? "bad" : s.dailyUsedPct >= 70 ? "warn" : "primary"} />
              <Bar label={t("prop.barTotal")} value={s.totalUsedPct} text={t("prop.bufferText", { buffer: money(s.buffer) })} tone={s.totalUsedPct >= 100 ? "bad" : s.totalUsedPct >= 70 ? "warn" : "primary"} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-muted">{t("prop.equity")}</dt><dd className="font-semibold tabular-nums">{money(s.equity)}</dd></div>
              <div><dt className="text-muted">{t("prop.result")}</dt><dd className={cn("font-semibold tabular-nums", pnlTone(s.pnl))}>{money(s.pnl, true)}</dd></div>
              <div><dt className="text-muted">{t("prop.days")}</dt><dd className="font-semibold tabular-nums">{s.tradingDays}{c.minTradingDays > 0 ? ` / ${c.minTradingDays}` : ""}</dd></div>
              <div><dt className="text-muted">{t("prop.left")}</dt><dd className="font-semibold tabular-nums">{s.daysLeft === null ? "—" : t("prop.daysLeft", { n: s.daysLeft })}</dd></div>
            </dl>
          </Card>
        );
      })}

      <PropForm accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} today={today} />
      <p className="text-xs text-muted">{t("prop.note")} {t("common.disclaimer")}</p>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Pencil } from "lucide-react";
import { ScreenshotCard } from "@/components/trades/ScreenshotCard";
import { DeleteTradeButton } from "@/components/trades/DeleteTradeButton";
import { EmotionBadge } from "@/components/trades/EmotionBadge";
import { Badge, buttonStyles, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, formatNumber, pnlTone } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { safeTimeZone } from "@/lib/time";
import type { Trade } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.trades") };
}

type Detail = Trade & {
  account: { name: string; currency: string } | null;
  trade_rule_violations: { rule: { id: string; name: string } | null }[];
};

export default async function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { t, locale } = await getTranslator();
  const { supabase, profile } = await requireUser();

  const { data } = await supabase
    .from("trades")
    .select("*, account:trading_accounts(name, currency), trade_rule_violations(rule:rules(id, name))")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const trade = data as unknown as Detail;
  const signed = trade.screenshot_path
    ? await supabase.storage.from("trade-screenshots").createSignedUrl(trade.screenshot_path, 3600)
    : null;
  const screenshotUrl = signed?.data?.signedUrl ?? null;

  const cur = trade.account?.currency ?? profile?.currency ?? "USD";
  const money = (v: number | null, signed = false) => (v === null ? t("trades.detail.none") : formatMoney(Number(v), cur, locale, signed));
  const num = (v: number | null, d = 8) => (v === null ? t("trades.detail.none") : formatNumber(Number(v), locale, d));
  const pnl = Number(trade.pnl);
  const violations = trade.trade_rule_violations.map((v) => v.rule?.name).filter(Boolean) as string[];
  const rr =
    trade.potential_loss && Number(trade.potential_loss) > 0 && trade.potential_profit !== null
      ? Number(trade.potential_profit) / Number(trade.potential_loss)
      : null;

  const fact = (label: string, value: string) => (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
  const note = (label: string, text: string) =>
    text ? (
      <div>
        <h3 className="text-sm font-medium text-muted">{label}</h3>
        <p className="mt-1 whitespace-pre-wrap">{text}</p>
      </div>
    ) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/trades" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("trades.detail.back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold sm:text-3xl">{trade.instrument}</h1>
            <Badge tone={trade.direction === "long" ? "success" : "danger"}>{t(`directions.${trade.direction}`)}</Badge>
            <EmotionBadge emotion={trade.emotion} label={t(`emotions.${trade.emotion}`)} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {formatDateTime(trade.traded_at, locale, safeTimeZone(profile?.timezone))} · {t(`markets.${trade.market}`)}{trade.strategy ? ` · ${trade.strategy}` : ""}
            {trade.account ? ` · ${trade.account.name}` : ""}
          </p>
        </div>
        <p className={cn("text-3xl font-bold tabular-nums", pnlTone(pnl))}>{money(pnl, true)}</p>
      </div>

      <Card>
        <h2 className="font-semibold">{t("trades.detail.discipline")}</h2>
        {trade.rules_followed ? (
          <p className="mt-3 flex items-center gap-2 text-success">
            <CheckCircle2 className="h-5 w-5" aria-hidden /> ✓ {t("trades.detail.followed")}
          </p>
        ) : (
          <div className="mt-3">
            <p className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" aria-hidden /> ⚠ {t("trades.detail.violated")}
            </p>
            {violations.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-9 text-sm">
                {violations.map((name) => <li key={name}>{name}</li>)}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card>
        <dl className="divide-y divide-border">
          {fact(t("trades.form.entry"), num(trade.entry_price))}
          {fact(t("trades.form.exit"), num(trade.exit_price))}
          {fact(t("trades.form.stop"), num(trade.stop_loss))}
          {fact(t("trades.form.takeProfit"), num(trade.take_profit))}
          {fact(t("trades.form.size"), num(trade.position_size, 6))}
          {fact(t("trades.form.leverage"), num(trade.leverage, 2))}
          {fact(t("trades.detail.risk"), trade.risk_amount === null ? t("trades.detail.none") : `${money(trade.risk_amount)}${trade.risk_percent !== null ? ` (${num(trade.risk_percent, 2)}%)` : ""}`)}
          {fact(t("trades.detail.potentialLoss"), money(trade.potential_loss))}
          {fact(t("trades.detail.potentialProfit"), money(trade.potential_profit))}
          {fact(t("trades.detail.riskReward"), rr === null ? t("trades.detail.none") : `1 : ${formatNumber(rr, locale, 2)}`)}
        </dl>
      </Card>

      <ScreenshotCard tradeId={id} url={screenshotUrl} />

      {(trade.reason || trade.plan || trade.comment) && (
        <Card className="space-y-4">
          {note(t("trades.form.reason"), trade.reason)}
          {note(t("trades.form.plan"), trade.plan)}
          {note(t("trades.form.comment"), trade.comment)}
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href={`/trades/${id}/edit`} className={buttonStyles()}>
          <Pencil className="h-4 w-4" aria-hidden /> {t("common.edit")}
        </Link>
        <DeleteTradeButton tradeId={id} />
      </div>
    </div>
  );
}

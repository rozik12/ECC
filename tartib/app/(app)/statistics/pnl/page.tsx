import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonStyles, Card, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { fetchStatTrades, getAccounts, getTransactions } from "@/lib/data";
import { dateFormat, formatMoney, formatNumber, pnlTone } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { byDay, byMonth, byYear, feeCost, inPeriod, plusMinus, type PeriodKey } from "@/lib/plus-minus";
import { safeTimeZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pm.title") };
}

const PERIODS: PeriodKey[] = ["today", "week", "month", "all"];

/** «Плюс и минус»: сколько в плюсе, сколько в минусе и что в итоге, по периодам, дням и месяцам, плюс пополнения и выводы со счёта. */
export default async function PlusMinusPage() {
  const { t, locale } = await getTranslator();
  const { supabase, profile } = await requireUser();
  const tz = safeTimeZone(profile?.timezone);
  const [accounts, all, tx] = await Promise.all([getAccounts(supabase), fetchStatTrades(supabase), getTransactions(supabase)]);
  const currency = accounts[0]?.currency ?? profile?.currency ?? "USD";
  const money = (v: number, signed = false) => formatMoney(v, currency, locale, signed);
  const now = new Date();

  const deposits = tx.filter((x) => x.kind === "deposit").reduce((s, x) => s + x.amount, 0);
  const withdrawals = tx.filter((x) => x.kind === "withdrawal").reduce((s, x) => s + x.amount, 0);
  const balance = accounts.reduce((s, a) => s + a.balance, 0);
  const days = byDay(all, tz, 31);
  const months = byMonth(all, tz, 12);
  const years = byYear(all, tz);
  const fee = feeCost(inPeriod(all, "month", tz, now));
  const feeAll = feeCost(all);
  const dayName = (d: string) => dateFormat(locale, { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const monthName = (m: string) => dateFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

  const cols = (title: string) => (
    <THead>
      <Tr><Th>{title}</Th><Th>{t("pm.plus")}</Th><Th>{t("pm.minus")}</Th><Th>{t("pm.net")}</Th></Tr>
    </THead>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/statistics" className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("stats.title")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("pm.title")}</h1>
        <p className="mt-1 text-muted">{t("pm.subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PERIODS.map((p) => {
          const r = plusMinus(inPeriod(all, p, tz, now));
          return (
            <Card key={p} className="space-y-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{t(`pm.period.${p}`)}</h2>
              <p className={cn("text-3xl font-bold tabular-nums", pnlTone(r.net))}>{money(r.net, true)}</p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-muted">{t("pm.plus")}</dt><dd className="font-semibold tabular-nums text-success">{money(r.plus, true)}</dd><dd className="text-xs text-muted">{t("pm.trades", { n: r.wins })}</dd></div>
                <div><dt className="text-muted">{t("pm.minus")}</dt><dd className="font-semibold tabular-nums text-danger">{money(r.minus, true)}</dd><dd className="text-xs text-muted">{t("pm.trades", { n: r.losses })}</dd></div>
              </dl>
            </Card>
          );
        })}
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold">{t("pm.account")}</h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted">{t("pm.balance")}</dt><dd className="text-lg font-semibold tabular-nums">{money(balance)}</dd></div>
          <div><dt className="text-muted">{t("pm.deposited")}</dt><dd className="text-lg font-semibold tabular-nums">{money(deposits)}</dd></div>
          <div><dt className="text-muted">{t("pm.withdrawn")}</dt><dd className="text-lg font-semibold tabular-nums">{money(withdrawals)}</dd></div>
        </dl>
        <p className="text-xs text-muted">{t("pm.accountNote")}</p>
      </Card>

      {feeAll.count > 0 && (
        <Card className="space-y-3">
          <h2 className="font-semibold">{t("pm.feesTitle")}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-muted">{t("pm.feesMonth")}</dt><dd className="text-lg font-semibold tabular-nums">{money(fee.fees)}</dd></div>
            <div><dt className="text-muted">{t("pm.feesAll")}</dt><dd className="text-lg font-semibold tabular-nums">{money(feeAll.fees)}</dd></div>
            <div><dt className="text-muted">{t("pm.feesAvg")}</dt><dd className="text-lg font-semibold tabular-nums">{money(feeAll.avgPerTrade)}</dd></div>
            <div><dt className="text-muted">{t("pm.feesShare")}</dt><dd className="text-lg font-semibold tabular-nums">{feeAll.sharePct === null ? "—" : `${formatNumber(feeAll.sharePct, locale, 1)}%`}</dd></div>
          </dl>
          <p className="text-xs text-muted">{t("pm.feesNote", { gross: money(feeAll.gross, true), net: money(feeAll.net, true) })}</p>
        </Card>
      )}

      {all.length === 0 ? (
        <Card className="text-center"><p className="mb-4 text-muted">{t("trades.empty.title")}</p><Link href="/trades/new" className={buttonStyles()}>{t("trades.empty.cta")}</Link></Card>
      ) : (
        <>
          <Card className="space-y-3">
            <h2 className="font-semibold">{t("pm.byDay")}</h2>
            <Table>
              {cols(t("pm.day"))}
              <TBody>
                {days.map((d) => (
                  <Tr key={d.day}>
                    <Td label={t("pm.day")} className="font-medium">{dayName(d.day)}</Td>
                    <Td label={t("pm.plus")} className="tabular-nums text-success">{money(d.plus, true)}</Td>
                    <Td label={t("pm.minus")} className="tabular-nums text-danger">{money(d.minus, true)}</Td>
                    <Td label={t("pm.net")} className={cn("font-semibold tabular-nums", pnlTone(d.net))}>{money(d.net, true)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
          {years.length > 1 && (
            <Card className="space-y-3">
              <h2 className="font-semibold">{t("pm.byYear")}</h2>
              <Table>
                {cols(t("pm.year"))}
                <TBody>
                  {years.map((y) => (
                    <Tr key={y.year}>
                      <Td label={t("pm.year")} className="font-medium">{y.year}</Td>
                      <Td label={t("pm.plus")} className="tabular-nums text-success">{money(y.plus, true)}</Td>
                      <Td label={t("pm.minus")} className="tabular-nums text-danger">{money(y.minus, true)}</Td>
                      <Td label={t("pm.net")} className={cn("font-semibold tabular-nums", pnlTone(y.net))}>{money(y.net, true)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              <p className="text-xs text-muted">{t("pm.yearNote")}</p>
            </Card>
          )}
          <Card className="space-y-3">
            <h2 className="font-semibold">{t("pm.byMonth")}</h2>
            <Table>
              {cols(t("pm.month"))}
              <TBody>
                {months.map((m) => (
                  <Tr key={m.month}>
                    <Td label={t("pm.month")} className="font-medium">{monthName(m.month)}</Td>
                    <Td label={t("pm.plus")} className="tabular-nums text-success">{money(m.plus, true)}</Td>
                    <Td label={t("pm.minus")} className="tabular-nums text-danger">{money(m.minus, true)}</Td>
                    <Td label={t("pm.net")} className={cn("font-semibold tabular-nums", pnlTone(m.net))}>{money(m.net, true)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
        </>
      )}
      <p className="text-xs text-muted">{t("pm.note")} {t("common.disclaimer")}</p>
    </div>
  );
}

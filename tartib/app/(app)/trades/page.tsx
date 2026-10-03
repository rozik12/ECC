import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, Upload } from "lucide-react";
import { EmotionBadge } from "@/components/trades/EmotionBadge";
import { TradeFilters, type TradeFilterValues } from "@/components/trades/TradeFilters";
import { Badge, buttonStyles, Card, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, formatNumber, pnlTone } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { dateInputToStart, safeTimeZone } from "@/lib/time";
import { directions, emotions, type EmotionKey } from "@/lib/trading";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.trades") };
}

const PAGE_SIZE = 10;
type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim().slice(0, 40) : "");

type Row = {
  id: string; traded_at: string; instrument: string; direction: "long" | "short";
  entry_price: number; exit_price: number | null; position_size: number; pnl: number;
  emotion: EmotionKey; rules_followed: boolean; account: { currency: string } | null;
  trade_rule_violations: { rule: { name: string } | null }[];
};

export default async function TradesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { t, locale } = await getTranslator();
  const { supabase, profile } = await requireUser();
  const tz = safeTimeZone(profile?.timezone);

  const filters: TradeFilterValues = {
    from: one(sp.from), to: one(sp.to), instrument: one(sp.instrument),
    direction: (directions as readonly string[]).includes(one(sp.direction)) ? one(sp.direction) : "",
    result: ["profit", "loss"].includes(one(sp.result)) ? one(sp.result) : "",
    emotion: (emotions as readonly string[]).includes(one(sp.emotion)) ? one(sp.emotion) : "",
    rules: ["followed", "violated"].includes(one(sp.rules)) ? one(sp.rules) : "",
  };
  const hasFilters = Object.values(filters).some(Boolean);
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);

  let query = supabase
    .from("trades")
    .select(
      "id, traded_at, instrument, direction, entry_price, exit_price, position_size, pnl, emotion, rules_followed, account:trading_accounts(currency), trade_rule_violations(rule:rules(name))",
      { count: "exact" },
    )
    .order("traded_at", { ascending: false });

  const from = dateInputToStart(tz, filters.from);
  if (from) query = query.gte("traded_at", from.toISOString());
  const to = dateInputToStart(tz, filters.to);
  if (to) query = query.lt("traded_at", new Date(to.getTime() + 24 * 3600 * 1000).toISOString());
  if (filters.instrument) query = query.ilike("instrument", `%${filters.instrument.replace(/[%_,()]/g, "")}%`);
  if (filters.direction) query = query.eq("direction", filters.direction);
  if (filters.result === "profit") query = query.gt("pnl", 0);
  if (filters.result === "loss") query = query.lt("pnl", 0);
  if (filters.emotion) query = query.eq("emotion", filters.emotion);
  if (filters.rules) query = query.eq("rules_followed", filters.rules === "followed");

  const { data, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currencyOf = (r: Row) => r.account?.currency ?? profile?.currency ?? "USD";

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/trades?${qs}` : "/trades";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("trades.title")}</h1>
        <div className="flex flex-wrap gap-2">
          <a href="/api/trades/export" className={buttonStyles({ variant: "secondary" })}>
            <Download className="h-4 w-4" aria-hidden /> {t("trades.export")}
          </a>
          <Link href="/trades/import" className={buttonStyles({ variant: "secondary" })}>
            <Upload className="h-4 w-4" aria-hidden /> {t("trades.import")}
          </Link>
          <Link href="/trades/new" className={buttonStyles()}>
            <Plus className="h-4 w-4" aria-hidden /> {t("trades.add")}
          </Link>
        </div>
      </div>

      {total === 0 && !hasFilters ? (
        <Card className="flex flex-col items-center gap-5 py-12 text-center">
          <p className="max-w-md text-lg">{t("trades.empty.title")}</p>
          <Link href="/trades/new" className={buttonStyles({ size: "lg" })}>{t("trades.empty.cta")}</Link>
        </Card>
      ) : (
        <>
          <TradeFilters initial={filters} />
          {rows.length === 0 ? (
            <Card className="py-10 text-center text-muted">{t("trades.noResults")}</Card>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t("trades.cols.date")}</Th><Th>{t("trades.cols.instrument")}</Th><Th>{t("trades.cols.direction")}</Th>
                  <Th>{t("trades.cols.entry")}</Th><Th>{t("trades.cols.exit")}</Th><Th>{t("trades.cols.size")}</Th>
                  <Th>{t("trades.cols.pnl")}</Th><Th>{t("trades.cols.emotion")}</Th><Th>{t("trades.cols.rules")}</Th>
                </Tr>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const names = r.trade_rule_violations.map((v) => v.rule?.name).filter(Boolean) as string[];
                  return (
                    <Tr key={r.id}>
                      <Td label={t("trades.cols.date")} className="whitespace-nowrap text-muted">{formatDateTime(r.traded_at, locale, tz)}</Td>
                      <Td label={t("trades.cols.instrument")}>
                        <Link href={`/trades/${r.id}`} className="font-semibold text-primary hover:underline">{r.instrument}</Link>
                      </Td>
                      <Td label={t("trades.cols.direction")}>
                        <Badge tone={r.direction === "long" ? "success" : "danger"}>{t(`directions.${r.direction}`)}</Badge>
                      </Td>
                      <Td label={t("trades.cols.entry")} className="tabular-nums">{formatNumber(Number(r.entry_price), locale, 8)}</Td>
                      <Td label={t("trades.cols.exit")} className="tabular-nums">{r.exit_price === null ? "—" : formatNumber(Number(r.exit_price), locale, 8)}</Td>
                      <Td label={t("trades.cols.size")} className="tabular-nums">{formatNumber(Number(r.position_size), locale, 6)}</Td>
                      <Td label={t("trades.cols.pnl")} className={cn("font-semibold tabular-nums", pnlTone(Number(r.pnl)))}>
                        {formatMoney(Number(r.pnl), currencyOf(r), locale, true)}
                      </Td>
                      <Td label={t("trades.cols.emotion")}><EmotionBadge emotion={r.emotion} label={t(`emotions.${r.emotion}`)} /></Td>
                      <Td label={t("trades.cols.rules")}>
                        {r.rules_followed ? (
                          <Badge tone="success">✓ {t("trades.rulesFollowed")}</Badge>
                        ) : (
                          <span title={names.join(", ")}><Badge tone="warning">⚠ {t("trades.rulesViolated")}{names.length > 0 ? ` (${names.length})` : ""}</Badge></span>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}

          {pages > 1 && (
            <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
              {page > 1 ? <Link href={pageHref(page - 1)} className={buttonStyles({ variant: "secondary", size: "sm" })}>{t("trades.pagination.prev")}</Link> : <span />}
              <span className="text-sm text-muted">{t("trades.pagination.page", { page, total: pages })}</span>
              {page < pages ? <Link href={pageHref(page + 1)} className={buttonStyles({ variant: "secondary", size: "sm" })}>{t("trades.pagination.next")}</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
